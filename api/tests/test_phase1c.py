import csv
import dataclasses
import json

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import app.ratelimit as rl
from app.jobs import migrate_base44 as mb


def _request(headers: dict, host: str = "10.0.0.5") -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "headers": raw, "client": (host, 1234)})


@pytest.fixture
def trusted_header(monkeypatch):
    settings = dataclasses.replace(rl.get_settings(), client_ip_header="cloudfront-viewer-address",
                                   auth_rate_limit_per_minute=20)
    monkeypatch.setattr(rl, "get_settings", lambda: settings)
    rl.auth_limiter.reset()
    yield
    rl.auth_limiter.reset()


def test_spoofed_forwarded_for_cannot_bypass_auth_limit(trusted_header):
    for i in range(20):
        rl.check_auth_rate(_request({"CloudFront-Viewer-Address": "198.51.100.7:4431", "X-Forwarded-For": f"1.1.1.{i}"}))
    with pytest.raises(HTTPException) as exc:
        rl.check_auth_rate(_request({"CloudFront-Viewer-Address": "198.51.100.7:5000", "X-Forwarded-For": "9.9.9.9"}))
    assert exc.value.status_code == 429
    rl.check_auth_rate(_request({"CloudFront-Viewer-Address": "2001:db8::1:443"}))  # other viewer not limited


def test_port_stripping():
    assert rl._strip_port("198.51.100.7:4431") == "198.51.100.7"
    assert rl._strip_port("[2001:db8::1]:443") == "2001:db8::1"
    assert rl._strip_port("2001:db8::1:443") == "2001:db8::1"


EXPORT = {
    "User": [
        {"id": "u1", "email": "Ann@Example.com", "created_date": "2024-01-01"},
        {"id": "u2", "email": "ann@example.com", "created_date": "2024-02-01"},
        {"id": "u3", "email": "x1@privaterelay.appleid.com", "created_date": "2024-01-02"},
        {"id": "u4", "email": "", "created_date": "2024-01-03"},
    ],
    "UserProfile": [
        {"id": "p1", "created_by": "ann@example.com", "consent_given_at": "2024-01-05", "libre_password": "secret"},
        {"id": "p3", "created_by": "x1@privaterelay.appleid.com"},
    ],
    "StressLog": [{"id": "s1", "created_by": "gone@example.com", "stress_level": 7}],
    "GlucoseReading": [{"id": "g1", "created_by": "ANN@example.com", "reading": 123}],
    "MedicationLog": [{"id": "m1", "created_by": "ann@example.com"}],
}


def test_consent_mapping_rules():
    full = {"id": "p", "consent_location": True, "consent_cgm": True, "consent_wearables": False,
            "consent_email": False, "consent_given_at": "2024-01-05"}
    row, defaulted = mb.map_consent(full)
    assert (row["location"], row["cgm"], row["wearables"], row["email"]) == (True, True, False, False)
    assert defaulted == [] and row["base44_id"] == "p:consent"
    row, defaulted = mb.map_consent({"id": "p", "consent_given_at": "2024-01-05"})
    assert (row["location"], row["cgm"], row["wearables"], row["email"]) == (False, False, False, True)
    assert mb.map_consent({"id": "p"}) == (None, [])


def test_plan_reports_owners_orphans_and_unmatched(tmp_path, capsys):
    src = tmp_path / "export"
    src.mkdir()
    for name, rows in EXPORT.items():
        (src / f"{name}.json").write_text(json.dumps(rows))
    assert mb.main(["plan", "--source", str(src), "--report-dir", str(tmp_path / "out")]) == 0
    report = json.loads((tmp_path / "out" / "migration_report.json").read_text())
    assert report["users"] == {"created": 2, "duplicate_case": 1, "missing_email": 1}
    assert report["tables"]["stress_log"]["skipped"] == {"orphan_created_by": 1}
    assert report["tables"]["glucose_reading"]["would_copy"] == 1
    assert report["consent"] == {"mapped": 1, "defaulted_location": 1, "defaulted_cgm": 1,
                                 "defaulted_wearables": 1, "defaulted_email": 1, "no_consent_recorded": 1}
    assert report["libre_credentials"] == {"present": 1, "excluded": 1}
    assert report["not_copied"] == {"MedicationLog": 1}
    with (tmp_path / "out" / "unmatched_emails.csv").open() as fh:
        categories = sorted(r["category"] for r in csv.DictReader(fh))
    assert categories == ["apple_relay", "duplicate_case", "missing_email", "orphan_created_by"]
    out = capsys.readouterr().out
    assert "@" not in out and "123" not in out


def test_missing_user_file_stops_run():
    with pytest.raises(SystemExit):
        mb.plan({"GlucoseReading": []})
