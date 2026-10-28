"""FastAPI application: phase 1 DiabetEasy API for the web app and the iPhone app."""

from __future__ import annotations

import logging
import os
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.db import get_engine
from app.routers import ai, auth, auth_android, entities, glucose, integrations, me, uploads
from app.routers.uploads import MAX_UPLOAD_BYTES
from app.schemas import SPECS

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

# DOCS_ENABLED=false switches off /docs and /redoc in production; /openapi.json stays available.
_DOCS = os.environ.get("DOCS_ENABLED", "true").strip().lower() not in ("0", "false", "no", "off")

app = FastAPI(
    docs_url="/docs" if _DOCS else None,
    redoc_url="/redoc" if _DOCS else None,
    title="DiabetEasy API",
    version="1.0.0",
    description=(
        "Phase 1 backend replacing Base44: Sign in with Apple/Google, user-scoped health data, "
        "photo uploads, Claude AI tasks, FreeStyle Libre and Fitbit sync, account deletion. "
        "AI output supports, and never replaces, medical advice."
    ),
)


@app.middleware("http")
async def reject_oversized_uploads(request: Request, call_next):
    """Refuse uploads whose declared size is clearly over 10 MB before the body is parsed."""
    if request.url.path == "/api/v1/uploads":
        length = request.headers.get("content-length", "")
        if length.isdigit() and int(length) > MAX_UPLOAD_BYTES + 64 * 1024:
            return JSONResponse(status_code=413, content={"detail": "File is larger than 10 MB"})
    return await call_next(request)


@app.exception_handler(OperationalError)
async def database_unavailable(_request: Request, _exc: OperationalError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": "Database unavailable, try again shortly"})


for module in (auth_android, auth, me, entities, uploads, ai, integrations, glucose):
    app.include_router(module.router)


@app.get("/healthz", tags=["status"])
def healthz() -> JSONResponse:
    """Load balancer health check: 200 when the database answers."""
    def ping() -> None:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))

    pool = ThreadPoolExecutor(max_workers=1)
    try:
        pool.submit(ping).result(timeout=2)  # SELECT 1 with a 2-second budget
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return JSONResponse(content={"status": "ok"})


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def index() -> str:
    entity_list = ", ".join(SPECS)
    rows = [
        ("POST", "/api/v1/auth/{apple|google|refresh|logout}", "Sign in with an Apple/Google ID token, refresh, log out"),
        ("POST", "/api/v1/auth/apple/callback-android", "Apple form_post return URL for Android (redirects to the app)"),
        ("GET / DELETE", "/api/v1/me", "The signed-in user / delete the account and all data"),
        ("GET / POST", "/api/v1/entities/{entity}", f"List or create rows. Entities: {entity_list}"),
        ("GET / PATCH / DELETE", "/api/v1/entities/{entity}/{id}", "Read, update or delete one of your rows"),
        ("POST", "/api/v1/uploads", "Upload a photo (jpeg, png, webp, heic; 10 MB max)"),
        ("POST", "/api/v1/ai/{task}", "AI tasks: meal-plan, exercise-plan, weekly-insights, food-photo"),
        ("POST", "/api/v1/integrations/{libre|fitbit|dexcom}/{connect|sync|disconnect}", "Device connections"),
        ("GET", "/healthz", "Health check"),
    ]
    items = "".join(f"<tr><td><code>{m}</code></td><td><code>{p}</code></td><td>{d}</td></tr>" for m, p, d in rows)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>DiabetEasy API</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{{font-family:system-ui,sans-serif;max-width:960px;margin:2rem auto;padding:0 1rem;color:#1e293b}}
table{{border-collapse:collapse;width:100%}}td{{border-bottom:1px solid #e2e8f0;padding:.5rem;vertical-align:top}}
code{{font-size:.85rem}}a{{color:#059669}}</style></head><body>
<h1>DiabetEasy API</h1>
<p>Status: running. All data endpoints need <code>Authorization: Bearer &lt;access token&gt;</code>,
obtained from <code>/api/v1/auth/apple</code> or <code>/api/v1/auth/google</code>.</p>
<p>Interactive documentation: <a href="/docs">/docs</a> &middot; OpenAPI document: <a href="/openapi.json">/openapi.json</a></p>
<table>{items}</table>
</body></html>"""
