import base64
import os
import tempfile
import time
import uuid

TMP = tempfile.mkdtemp(prefix="diabeteasy-tests-")
os.environ.update({
    "APP_ENV": "test",
    # CI sets TEST_DATABASE_URL to run the same suite against PostgreSQL 16.
    "DATABASE_URL": os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{TMP}/test.db",
    "JWT_SECRET": "test-only-secret-" + "x" * 32,
    "CREDENTIALS_KEY": base64.b64encode(b"k" * 32).decode(),
    "GOOGLE_CLIENT_IDS": "google-web-client.apps.googleusercontent.com",
    "APPLE_CLIENT_IDS": "com.diabeteasy.web,com.diabeteasy.ios",
    "LOCAL_STORAGE_DIR": f"{TMP}/uploads",
    "STORAGE_BACKEND": "local",
    "EMAIL_BACKEND": "console",
    "AI_DAILY_LIMIT": "5",
    "COOKIE_SECURE": "false",
    "FITBIT_CLIENT_ID": "fitbit-client",
    "FITBIT_CLIENT_SECRET": "fitbit-secret-placeholder",
    "ANTHROPIC_API_KEY": "",
})

import jwt  # noqa: E402
import pytest  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import http  # noqa: E402
from app.ai.client import set_ai_client  # noqa: E402
from app.auth import idtoken  # noqa: E402
from app.auth.tokens import issue_access_token  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import get_engine, new_session, reset_engine  # noqa: E402
from app.email import ConsoleEmail, set_email_sender  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base, User  # noqa: E402
from app.ratelimit import auth_limiter  # noqa: E402
from app.storage import set_storage  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_state():
    get_settings.cache_clear()
    reset_engine()
    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    set_storage(None)
    set_email_sender(ConsoleEmail())
    set_ai_client(None)
    http.set_transport(None)
    auth_limiter.reset()
    idtoken.reset_caches()
    yield
    http.set_transport(None)
    set_ai_client(None)


@pytest.fixture
def client():
    return TestClient(app)


def make_user(email: str = "alice@example.com", **kwargs) -> User:
    with new_session() as db:
        user = User(email=email, **kwargs)
        db.add(user)
        db.commit()
        return user


def headers_for(user: User) -> dict:
    return {"Authorization": f"Bearer {issue_access_token(user)}"}


@pytest.fixture
def alice() -> User:
    return make_user("alice@example.com", full_name="Alice")


@pytest.fixture
def bob() -> User:
    return make_user("bob@example.com", full_name="Bob")


class FakeAI:
    """Stands in for Claude: returns queued replies (str) or raises queued exceptions."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls = []

    def complete(self, system, prompt, images):
        self.calls.append({"system": system, "prompt": prompt, "images": images})
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return reply


@pytest.fixture
def fake_ai():
    def install(*replies):
        fake = FakeAI(*replies)
        set_ai_client(fake)
        return fake
    return install


class IdTokenFactory:
    """Signs ID tokens with a test RSA key and serves the matching JWKS."""

    def __init__(self):
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        jwk = jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key(), as_dict=True)
        jwk.update({"kid": "test-kid", "alg": "RS256", "use": "sig"})
        self.jwks = {"keys": [jwk]}
        for provider in ("apple", "google"):
            idtoken._caches[provider] = idtoken.JWKSCache("https://test/jwks", fetcher=lambda _url: self.jwks)

    def token(self, provider="google", sign_with=None, **overrides) -> str:
        now = int(time.time())
        claims = {
            "iss": "https://accounts.google.com" if provider == "google" else "https://appleid.apple.com",
            "aud": "google-web-client.apps.googleusercontent.com" if provider == "google" else "com.diabeteasy.ios",
            "sub": f"{provider}-{uuid.uuid4().hex[:8]}",
            "email": "alice@example.com",
            "email_verified": True if provider == "google" else "true",
            "iat": now,
            "exp": now + 600,
        }
        claims.update(overrides)
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, sign_with or self.key, algorithm="RS256", headers={"kid": "test-kid"})


@pytest.fixture
def id_tokens() -> IdTokenFactory:
    return IdTokenFactory()
