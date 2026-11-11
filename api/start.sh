#!/bin/sh
# Container entry point: apply database migrations, then serve the API on $PORT (default 8000).
# Set SKIP_MIGRATIONS=1 when migrations run as a separate one-off task before each release.
set -e
cd "$(dirname "$0")"
# Use a project virtualenv when present (api/.venv or ./.venv); otherwise the system Python.
PY=python3
for v in .venv ../.venv; do
  if [ -x "$v/bin/python" ]; then PY="$v/bin/python"; break; fi
done
command -v "$PY" >/dev/null 2>&1 || PY=python
# First run without installed dependencies: create api/.venv and install requirements once.
if ! "$PY" -c "import alembic.config, uvicorn, fastapi" >/dev/null 2>&1; then
  echo "Installing API dependencies into api/.venv (first start only)..."
  "$PY" -m venv .venv
  PY=.venv/bin/python
  "$PY" -m pip install -q --disable-pip-version-check -r requirements.txt
fi
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  "$PY" -m alembic upgrade head
fi
exec "$PY" -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips='*'
