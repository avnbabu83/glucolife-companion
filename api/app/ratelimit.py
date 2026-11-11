"""Rate limits.

* Per-IP sliding window for /auth (in process memory; each API task limits independently).
* Per-user daily counter for /ai, stored on the users row so it holds across API tasks.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import User


class SlidingWindow:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > window:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


auth_limiter = SlidingWindow()


def _strip_port(value: str) -> str:
    """'198.51.100.7:4431' -> '198.51.100.7'; '2001:db8::1:4431' or '[2001:db8::1]:4431' -> '2001:db8::1'."""
    value = value.strip()
    if value.startswith("["):
        return value[1:].split("]", 1)[0]
    if value.count(":") >= 1 and value.rsplit(":", 1)[1].isdigit():
        return value.rsplit(":", 1)[0]
    return value


def client_ip(request: Request) -> str:
    trusted = get_settings().client_ip_header
    if trusted:
        # Behind CloudFront only the header CloudFront sets itself is trusted;
        # a client-supplied X-Forwarded-For is ignored so it cannot reset the limit.
        value = request.headers.get(trusted)
        if value:
            return _strip_port(value)
        return request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_auth_rate(request: Request) -> None:
    if not auth_limiter.allow(client_ip(request), get_settings().auth_rate_limit_per_minute):
        raise HTTPException(status_code=429, detail="Too many sign-in attempts, try again in a minute")


def seconds_until_utc_midnight() -> int:
    now = datetime.now(timezone.utc)
    midnight = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=1)
    return max(1, int((midnight - now).total_seconds()))


def consume_ai_quota(db: Session, user: User) -> None:
    """Count one AI task for today; raise 429 when the daily limit is reached."""
    today = datetime.now(timezone.utc).date()
    if user.ai_calls_date != today:
        user.ai_calls_date = today
        user.ai_calls_count = 0
    limit = get_settings().ai_daily_limit
    if user.ai_calls_count >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily AI limit of {limit} requests reached, try again tomorrow",
            headers={"Retry-After": str(seconds_until_utc_midnight())},
        )
    user.ai_calls_count += 1
    db.commit()
