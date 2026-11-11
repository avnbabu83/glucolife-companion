# DiabetEasy API (phase 1 backend)

This is DiabetEasy's own backend, replacing Base44 (design v6, phase 1). It is built with FastAPI, SQLAlchemy 2 and Alembic,
and runs on PostgreSQL 16 in production or a local SQLite file for development. The web app (phase 2) and the
SwiftUI iPhone app (phase 3) will both call this API.

| Base44 today | Replacement here |
| --- | --- |
| Base44 login, `base44.auth.me()` | `POST /api/v1/auth/{apple,google,refresh,logout}`, `GET /api/v1/me` |
| `base44.entities.<Name>.list/filter/create/update/delete` | `/api/v1/entities/{entity}` (10 allow-listed tables, scoped to the signed-in user) |
| `Core.UploadFile` | `POST /api/v1/uploads` (private S3, 1-hour signed URLs) |
| `generateSmartMealPlan`, `generateSmartExercisePlan`, QuickFoodLog photo analysis | `POST /api/v1/ai/{meal-plan,exercise-plan,food-photo}` |
| `generateWeeklyInsights` (scheduled) | `python -m app.jobs.weekly_insights` + `app/templates/email/weekly_insights.txt.j2`, and `POST /api/v1/ai/weekly-insights` on demand |
| `connectLibre`, `syncLibreData`, `syncFitbitData` | `POST /api/v1/integrations/{libre,fitbit}/{connect,sync,disconnect}` |
| `deleteAccount` | `DELETE /api/v1/me` |
| (no equivalent) | `python -m app.jobs.migrate_base44`: a one-time, re-runnable copy of the Base44 data |

## Run it locally

You need Python 3.12; 3.11 also works. The commands are run from the repository root.

```bash
python3 -m venv .venv
.venv/bin/pip install -r api/requirements.txt -r api/requirements-dev.txt
cd api
../.venv/bin/alembic upgrade head                      # creates api/.data/diabeteasy.db (SQLite)
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Open http://localhost:8000/ for the status page or http://localhost:8000/docs for the interactive API docs.
Without any configuration the app starts with SQLite, a local upload folder, and console email (emails are written to the log).
Secrets for local runs are generated once in `api/.data/dev-secrets.json`. Copy `.env.example` to see every setting
(export the variables or use your process manager; the app reads only environment variables).

### Try it with curl

Real clients sign in with Apple or Google. For local testing you can mint a token straight from the database:

```bash
cd api
TOKEN=$(../.venv/bin/python -m app.dev_token alice@example.com)   # refused when APP_ENV=production
H="Authorization: Bearer $TOKEN"

curl -s localhost:8000/api/v1/me -H "$H"
curl -s -X POST localhost:8000/api/v1/entities/UserProfile -H "$H" -H 'content-type: application/json' \
     -d '{"diabetes_type":"type2","target_glucose_min":70,"target_glucose_max":140,"wake_time":"07:00"}'
curl -s -X POST localhost:8000/api/v1/entities/GlucoseReading -H "$H" -H 'content-type: application/json' \
     -d '{"reading":128,"date":"2025-01-15","reading_time":"08:05","context":"fasting"}'
curl -s "localhost:8000/api/v1/entities/GlucoseReading?sort=-date&limit=20" -H "$H"
curl -s "localhost:8000/api/v1/entities/MealPlan?is_completed=true&since=2025-01-01" -H "$H"
curl -s -X POST localhost:8000/api/v1/uploads -H "$H" -F "file=@meal.jpg"
curl -s -X POST localhost:8000/api/v1/ai/meal-plan -H "$H" -H 'content-type: application/json' -d '{"days":3,"targetCalories":1800}'
curl -s -X POST localhost:8000/api/v1/integrations/libre/connect -H "$H" -H 'content-type: application/json' \
     -d '{"email":"you@example.com","password":"your-librelinkup-password"}'
curl -s -X DELETE localhost:8000/api/v1/me -H "$H" -i
```

## Tests

```bash
cd api && ../.venv/bin/python -m pytest -q          # add --cov=app for coverage
../.venv/bin/ruff check .
```

The tests use mocked Apple/Google keys, a fake Claude client and recorded LibreLinkUp/Fitbit responses, so they need no
network or credentials. They cover sign-in (expired, wrong audience, wrong issuer and bad-signature tokens; logout revokes
refresh tokens), user isolation on all 10 entities, credential fields never being returned, upload limits (413/415),
AI schema validation (502), the daily limit (429) and Claude being down (503), the weekly email snapshot,
send-once-per-week and email consent, account deletion across all 11 tables and storage, Libre/Fitbit sync without
duplicates, the Base44 copy (dry run, counts, unmatched emails, re-runs) and the Alembic migration.
To run the same suite on PostgreSQL, set `TEST_DATABASE_URL=postgresql+psycopg://user:pass@host/db`.
CI does this in `.github/workflows/api.yml`.

## How it works

**Sign-in.** The client sends an Apple or Google ID token to `/api/v1/auth/apple` or `/api/v1/auth/google`, in the body
`{ id_token, authorization_code?, full_name?, nonce?, client: "web" | "ios" }`. The API checks the token's signature
against the provider's keys (cached for 6 hours), plus its issuer, audience (`APPLE_CLIENT_IDS` / `GOOGLE_CLIENT_IDS`),
expiry and Apple nonce. It then finds the user by provider subject, or else by *verified* email (which links users
copied from Base44), or creates a new user.
The response contains a 15-minute access token. The 30-day refresh token goes into the body for iOS, or into an httpOnly,
SameSite=Strict cookie scoped to `/api/v1/auth` for the web. Logout and account deletion bump `token_version`, which
invalidates every token issued before.

**Entities.** The allow-listed entities are `UserProfile, GlucoseReading, MealPlan, ExercisePlan, ExerciseLog, SleepLog,
ActivityData, StressLog, PrivacyConsent, Medication`. Each one has its own generated schemas (see `/docs`).
`user_id` always comes from the token. Unknown body fields return 422, and Base44 fields that have no column yet go into
`extra`. Supported query parameters: `sort` (e.g. `-date`; `-created_date` also works, as in Base44), `limit`
(default 50, max 500), `since` (a date) and equality filters on the entity's scalar fields.
Encrypted columns (`*_enc`) never appear in any schema. Instead, `UserProfile` returns `libre_connected` and
`fitbit_connected`.

**AI tasks.** AI is only used where the existing app already used it: free-text meal and exercise plans, photo-based
food estimates and narrative weekly insights can't be produced by fixed rules. Each task has a prompt template in
`app/ai/prompts/` and a JSON output schema. Clients can't send their own prompts, so your Claude key can't be used
as an open proxy. An invalid reply gets one retry and then returns 502. If Claude is slow (over 60 s) or down, the
answer is 503 `{ retryable: true }`. Each user gets `AI_DAILY_LIMIT` calls per day (default 20) and then 429 with `Retry-After` until 00:00 UTC.

**Phase 1c.** Set `CLIENT_IP_HEADER=CloudFront-Viewer-Address` behind CloudFront. The sign-in rate limit then counts only that header (port removed) and ignores any `X-Forwarded-For` the client sends. When it is unset, behaviour is unchanged.
Base44 copy dry-run (read-only): `python -m app.jobs.migrate_base44 plan --source ./export --report-dir ./reports` (`--source` also accepts `s3://bucket/prefix/`). It writes `migration_report.json` and `unmatched_emails.csv`, and stdout shows counts only.
Copy: `python -m app.jobs.migrate_base44 apply --source ./export --report-dir ./reports` (add `--dry-run` to roll the copy back); re-runnable, rows are matched by `base44_id`, writes `apply_report.json`, exit code 1 if counts do not reconcile.
Purge the export (it holds plaintext Libre passwords) after a verified apply: `python -m app.jobs.migrate_base44 purge --source ./export --confirm` (for `s3://` it deletes every object version under the prefix).
**Cost:** every call is billed to your Anthropic key, at a few cents per plan and about 1 cent per weekly insight.
Set a monthly spend alert in the Anthropic console.

**Libre and Fitbit.** Libre uses the same unofficial LibreLinkUp login, regional redirect and mmol/L → mg/dL conversion
as `syncLibreData`. The password is now stored with AES-GCM encryption (`CREDENTIALS_KEY`), and readings are
de-duplicated by `(user_id, source_device, external_id)`. Phase 3: the iPhone app sends Apple Health readings to `POST /api/v1/glucose/import` (up to 500 samples per request, needs `PrivacyConsent.wearables = true`, otherwise 403 `consent_required`). Readings outside 20-600 mg/dL or more than 10 minutes in the future count as `rejected`. A re-sent HealthKit UUID counts as a `duplicate`. Rows are stored with `source_device = "apple_health"` and reach AI prompts and the weekly email only when `PrivacyConsent.extra.ai_processing` is `true`. For production, add the iOS bundle ID to `APPLE_CLIENT_IDS`, the iOS Google client ID to `GOOGLE_CLIENT_IDS` and `<bundle id>:/fitbit/callback` to `FITBIT_REDIRECT_URIS`. Fitbit now uses per-user OAuth: the client finishes OAuth at
`FITBIT_REDIRECT_URI` and posts `{ code }` to `/fitbit/connect`. Expired tokens are refreshed automatically. If the
refresh fails, the tokens are cleared and the client gets `{ needsAuth: true }`.

**Weekly email (template-driven).** `python -m app.jobs.weekly_insights [--dry-run] [--week 2025-W03]` emails every user
whose latest PrivacyConsent does not have `email: false`. It uses the last 7 days of data and the `weekly-insights` task.
The email body is rendered from **`app/templates/email/weekly_insights.txt.j2`**. Edit that file to change the wording;
the variables are `name, summary, achievements, improvements, action_items`. The sections are the same as the current
Base44 email.
The ISO week sent is stored per user, so re-runs never send twice. A failing user is retried 3 times, then logged and
skipped. Set `EMAIL_BACKEND=ses` (Amazon SES) or `smtp`.

**Account deletion.** `DELETE /api/v1/me` revokes the Fitbit token and the Apple token (Apple revocation needs
`APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY`). It then deletes every object and version under
`users/{id}/` in storage, and deletes the user row, which cascades to all 10 tables.

**Base44 copy.** Put one JSON file per entity (`User.json`, `UserProfile.json`, ...) in a folder, then run
`python -m app.jobs.migrate_base44 --source ./export --dry-run`. This writes `migration_report.json` with per-table
source, inserted, updated, unmatched and duplicate counts, plus the list of unmatched emails. Run it again without
`--dry-run` for the real copy, adding `--copy-files` to copy `*_url` photos into storage. Re-runs upsert by `base44_id`.
Libre passwords are copied encrypted, and Libre session tokens are not copied.

## Docker and deployment

```bash
docker build -t diabeteasy-api api
docker run -p 8000:8000 -e PORT=8000 diabeteasy-api                       # API (runs migrations first)
docker run --env-file api/.env diabeteasy-api python -m app.jobs.weekly_insights
```

On AWS the plan is to run the image on ECS Fargate behind an ALB (health check `GET /healthz`), with RDS PostgreSQL 16,
a private versioned S3 bucket (`STORAGE_BACKEND=s3`), SES, and EventBridge Scheduler running the weekly job (for example
Mondays 08:00 UTC). Secrets (`JWT_SECRET`, `CREDENTIALS_KEY`, `ANTHROPIC_API_KEY`, the database password) come from
Secrets Manager. With `APP_ENV=production` the app refuses to start without `JWT_SECRET` and `CREDENTIALS_KEY`.
Set `SKIP_MIGRATIONS=1` if migrations run as a separate one-off task. The same image runs on Cloud Run or any Docker host
with any S3-compatible storage (`S3_ENDPOINT_URL`) and any SMTP server.

`python -m app.scripts.export_openapi openapi.json` (run in `api/`) writes the OpenAPI document for the web and iOS clients.
The file `api/openapi.json` is committed as the client contract; `tests/test_phase1a.py` fails when it differs from the
generated document, so regenerate it after every API change.

### Phase 1a backend-core rules

- `GET /healthz` runs `SELECT 1` with a 2-second budget: `200 {"status":"ok"}` or `503 {"status":"unavailable"}`, never error details.
- Settings: `JWT_SECRET` must be at least 32 bytes (startup fails otherwise); `ENCRYPTION_KEY` is accepted as an alias of
  `CREDENTIALS_KEY` (32 bytes, base64). In `APP_ENV=production` both are required. `DOCS_ENABLED=false` switches off
  `/docs` and `/redoc`; `/openapi.json` stays available.
- Web refresh with the httpOnly cookie must send `X-Requested-With: XMLHttpRequest`, otherwise it returns 403:
  `curl -X POST -b cookies.txt -H 'X-Requested-With: XMLHttpRequest' http://localhost:8000/api/v1/auth/refresh`
- `limit` on entity lists defaults to 50 and is capped at 500 (larger values are accepted and capped).
- `tests/test_phase1a.py` checks these rules plus `alembic upgrade head` / `alembic check` / `alembic downgrade base`,
  per-entity isolation for all 10 entities, and account deletion emptying all 11 tables even when Apple revocation fails.
