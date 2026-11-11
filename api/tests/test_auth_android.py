import json
from urllib.parse import parse_qs, urlsplit

URL = "/api/v1/auth/apple/callback-android"


def fragment(response):
    parts = urlsplit(response.headers["location"])
    assert f"{parts.scheme}://{parts.netloc}{parts.path}" == "https://diabeteasy.com/app/apple-callback"
    assert parts.query == ""
    return {k: v[0] for k, v in parse_qs(parts.fragment).items()}


def test_callback_redirects_fields_to_fixed_app_link_in_fragment(client):
    user = json.dumps({"name": {"firstName": "Ada", "lastName": "Lovelace"}, "email": "a@example.com"})
    r = client.post(URL, data={"code": "c1", "id_token": "tok.en.sig", "state": "abc-123", "user": user,
                               "redirect_uri": "https://evil.example"}, follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert fragment(r) == {"code": "c1", "id_token": "tok.en.sig", "state": "abc-123", "name": "Ada Lovelace"}


def test_missing_or_oversized_fields_give_invalid_response(client):
    for data in ({"code": "c", "state": "s"},
                 {"code": "c", "id_token": "x" * 4097, "state": "s"},
                 {"code": "c", "id_token": "t", "state": "bad state!"},
                 {}):
        r = client.post(URL, data=data, follow_redirects=False)
        assert r.status_code == 303
        assert fragment(r) == {"error": "invalid_response"}


def test_apple_error_is_passed_to_the_app(client):
    r = client.post(URL, data={"error": "user_cancelled_authorize", "state": "s"}, follow_redirects=False)
    assert fragment(r) == {"error": "user_cancelled_authorize"}


def test_auth_rate_limit_applies(client):
    statuses = [client.post(URL, data={}, follow_redirects=False).status_code for _ in range(40)]
    assert 429 in statuses
