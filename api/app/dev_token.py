"""Local testing helper: create (or find) a user and print an access token for curl.

    python -m app.dev_token alice@example.com

It talks to the database directly, so it only works where you already have
database access; it is refused when APP_ENV=production. Real clients sign in
with Apple or Google through /api/v1/auth/{apple|google}.
"""

from __future__ import annotations

import sys

from sqlalchemy import select

from app.auth.tokens import issue_access_token
from app.config import get_settings
from app.db import new_session
from app.models import User


def main() -> int:
    if get_settings().is_production:
        print("dev_token is disabled when APP_ENV=production.", file=sys.stderr)
        return 1
    if len(sys.argv) != 2 or "@" not in sys.argv[1]:
        print("Usage: python -m app.dev_token you@example.com", file=sys.stderr)
        return 2
    email = sys.argv[1].strip().lower()
    with new_session() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email)
            db.add(user)
            db.commit()
        print(issue_access_token(user))
    return 0


if __name__ == "__main__":
    sys.exit(main())
