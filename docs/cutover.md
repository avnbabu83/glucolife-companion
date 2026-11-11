# Phase 2b – Cutover runbook (Base44 → DiabetEasy API)

These steps are run by the customer (or with the customer) on the cutover day. Nothing here runs automatically.
Pick a Tuesday, Wednesday or Thursday so no user gets two weekly emails in one ISO week.

## Go / no-go (all required)

- [ ] `migrate_base44 apply` tests pass (`cd api && python -m pytest -q tests/test_migrate_base44.py`)
- [ ] staging rehearsal signed off by the customer
- [ ] SES production sending access granted
- [ ] production smoke tests passed on the `*.cloudfront.net` domain, production web build deployed there (`web` workflow, manual dispatch)
- [ ] DNS TTL for apex and www lowered to 300 s at least 48 h earlier; old records saved in `infra/dns-records.md`
- [ ] apex ALIAS available (or zone moved to Route 53)
- [ ] privacy policy updated for Anthropic processing; user notice sent (mention: Fitbit must be reconnected once)

## Runbook

1. **Write freeze**: put Base44 into read-only/maintenance mode and turn **off** the Base44 weekly insights schedule and functions in the Base44 dashboard.
2. **Final export**: export every Base44 entity (plus the User list) and upload to
   `s3://diabeteasy-production-ops/imports/base44/YYYYMMDD/`.
3. **Snapshot**: `aws rds create-db-snapshot --db-instance-identifier diabeteasy-production --db-snapshot-identifier diabeteasy-production-pre-cutover`
4. **Plan** (read-only), as the `migrate-base44` ECS task:
   `python -m app.jobs.migrate_base44 plan --source s3://diabeteasy-production-ops/imports/base44/YYYYMMDD/ --report-dir /tmp/reports`
   The customer reviews `migration_report.json` and `unmatched_emails.csv`.
5. **Apply**: `APP_ENV=production python -m app.jobs.migrate_base44 apply --source s3://… --report-dir /tmp/reports --allow-production`
   (apply refuses production without `--allow-production`). The built apply always copies Libre passwords, encrypted
   with the production `CREDENTIALS_KEY`, so no separate `--include-credentials` flag exists.
   It must reconcile (`counts_match=True`) for every table.
6. **Apply again**: the same command must report 0 inserted.
7. **Purge the export** (it holds plaintext Libre passwords): `python -m app.jobs.migrate_base44 purge --source s3://… --confirm`, then take a second snapshot.
8. Attach `diabeteasy.com` and `www.diabeteasy.com` to the production CloudFront distribution.
9. Change the apex and www records to alias the production distribution.
10. **Smoke test** https://diabeteasy.com: `/healthz`, Apple and Google sign-in, the customer's own account with copied data,
    a photo upload, one AI card, Libre sync for a copied Libre user, and `https://www.diabeteasy.com/x?y=1` → 301 to the apex.
11. **Switch the weekly job**: set `diabeteasy-production-weekly-insights` to ENABLED
    (`aws scheduler update-schedule --name diabeteasy-production-weekly-insights --state ENABLED …` with the schedule's
    existing target and cron) – only after step 1 is confirmed. The job is `python -m app.jobs.weekly_insights`.
12. Monitor alarms for 72 hours; check that the first Monday run exits 0 with sent equal to eligible.

## Rollback

- **Before step 9**: abort, lift the Base44 freeze, re-enable the Base44 schedule. Production rows may stay (later copies upsert by `base44_id`).
- **Within 24 h after step 9**: restore the saved apex/www records, re-enable Base44 and its schedule, set the new schedule to DISABLED,
  and list rows with `created_at` after the switch for manual reconciliation.
- **After 24 h**: roll forward only.

## Retirement (after 7 stable days)

Open a pull request (customer approval required) that deletes `base44/functions/`. The web app already has no Base44 code:
`node scripts/check-no-base44.mjs` fails the build if `@base44` or `base44Client` reappears. Keep Base44 read-only until the
retention date (30 days proposed), then delete the Base44 app data (it still holds plaintext Libre passwords) and revoke its keys.
