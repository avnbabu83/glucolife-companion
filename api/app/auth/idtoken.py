"""Verification of Sign in with Apple and Google ID tokens.

Checks signature (provider JWKS, cached for 6 hours), issuer, audience,
expiry and, for Apple, the nonce. If the key endpoint is unreachable the
cached keys keep sign-in working; with no cache sign-in returns 503.
"""

from __future__ import annotations

import hashlib
import threading
import time
from dataclasses import dataclass
from typing import Callable

import jwt

from app import http

JWKS_TTL_SECONDS = 6 * 3600
MIN_REFRESH_INTERVAL = 60

PROVIDERS = {
    "apple": {
        "jwks_url": "https://appleid.apple.com/auth/keys",
        "issuers": ("https://appleid.apple.com",),
    },
    "google": {
        "jwks_url": "https://www.googleapis.com/oauth2/v3/certs",
        "issuers": ("https://accounts.google.com", "accounts.google.com"),
    },
}


class InvalidIdToken(Exception):
    pass


class ProviderUnavailable(Exception):
    pass


@dataclass
class Identity:
    provider: str
    sub: str
    email: str | None
    email_verified: bool
    name: str | None
    audience: str = ""


def _fetch_jwks(url: str) -> dict:
    with http.client(timeout=10) as c:
        resp = c.get(url)
        resp.raise_for_status()
        return resp.json()


class JWKSCache:
    def __init__(self, url: str, fetcher: Callable[[str], dict] | None = None) -> None:
        self.url = url
        self.fetcher = fetcher or _fetch_jwks
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = 0.0
        self._lock = threading.Lock()

    def _refresh(self) -> None:
        data = self.fetcher(self.url)
        keys = {}
        for jwk in data.get("keys", []):
            if jwk.get("kid"):
                keys[jwk["kid"]] = jwt.PyJWK(jwk)
        self._keys = keys
        self._fetched_at = time.monotonic()

    def get_key(self, kid: str | None) -> jwt.PyJWK:
        with self._lock:
            age = time.monotonic() - self._fetched_at
            stale = not self._keys or age > JWKS_TTL_SECONDS
            missing = kid not in self._keys and age > MIN_REFRESH_INTERVAL
            if stale or missing:
                try:
                    self._refresh()
                except Exception as exc:  # network error or bad JSON
                    if not self._keys:
                        raise ProviderUnavailable("Sign-in provider keys are unreachable") from exc
            if kid not in self._keys:
                raise InvalidIdToken("Unknown signing key")
            return self._keys[kid]


_caches: dict[str, JWKSCache] = {}


def get_cache(provider: str) -> JWKSCache:
    if provider not in _caches:
        _caches[provider] = JWKSCache(PROVIDERS[provider]["jwks_url"])
    return _caches[provider]


def reset_caches() -> None:
    _caches.clear()


def _nonce_matches(claim: str, raw_nonce: str | None) -> bool:
    if not raw_nonce:
        return False
    return claim == raw_nonce or claim == hashlib.sha256(raw_nonce.encode()).hexdigest()


def verify_id_token(provider: str, token: str, audiences: list[str], nonce: str | None = None) -> Identity:
    if provider not in PROVIDERS:
        raise InvalidIdToken("Unsupported provider")
    if not audiences:
        raise ProviderUnavailable(f"Sign in with {provider.title()} is not configured on this server")
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise InvalidIdToken("Malformed ID token") from exc
    if header.get("alg") != "RS256":
        raise InvalidIdToken("Unexpected signing algorithm")
    key = get_cache(provider).get_key(header.get("kid"))
    try:
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            audience=audiences,
            options={"require": ["exp", "iat", "iss", "sub", "aud"]},
            leeway=30,
        )
    except jwt.PyJWTError as exc:
        raise InvalidIdToken(str(exc)) from exc
    if claims.get("iss") not in PROVIDERS[provider]["issuers"]:
        raise InvalidIdToken("Invalid issuer")
    if "nonce" in claims and not _nonce_matches(str(claims["nonce"]), nonce):
        raise InvalidIdToken("Nonce mismatch")
    email = claims.get("email")
    aud = claims.get("aud")
    return Identity(
        audience=aud if isinstance(aud, str) else next((a for a in aud if a in audiences), ""),
        provider=provider,
        sub=str(claims["sub"]),
        email=email.strip().lower() if isinstance(email, str) else None,
        email_verified=claims.get("email_verified") in (True, "true"),
        name=claims.get("name"),
    )
