"""The iPhone app (ios/) calls the API through the paths in Endpoints.swift and writes the typed columns listed
in EntityStore.swift. These checks fail the API tests when a server change would break the app."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
IOS_API = ROOT / "ios" / "Sources" / "Core" / "API"

pytestmark = pytest.mark.skipif(not IOS_API.exists(), reason="ios/ is not part of this checkout")


def _openapi_paths() -> dict:
    return json.loads((ROOT / "api" / "openapi.json").read_text())["paths"]


def _swift_paths() -> list[str]:
    source = (IOS_API / "Endpoints.swift").read_text()
    literals = re.findall(r'"(/(?:api|healthz)[^"]*)"', source)
    return [re.sub(r"\\\([^)]*\)", "{}", lit) for lit in literals]


def _swift_entities() -> dict[str, list[str]]:
    source = (IOS_API / "EntityStore.swift").read_text()
    raw = dict(re.findall(r'case (\w+) = "(\w+)"', source))
    fields = {}
    for case, body in re.findall(r"case \.(\w+):\s*return \[(.*?)\]", source, re.S):
        fields[raw[case]] = re.findall(r'"(\w+)"', body)
    return fields


def test_every_ios_path_exists_in_openapi():
    paths = _openapi_paths()
    templates = _swift_paths()
    assert len(templates) >= 10
    for template in templates:
        pattern = "^" + re.escape(template).replace(r"\{\}", "[^/]+") + "$"
        assert any(re.match(pattern, path) for path in paths), f"{template} is not in api/openapi.json"


def test_ios_entities_match_the_api_and_the_web_field_list():
    paths = _openapi_paths()
    ios = _swift_entities()
    web = json.loads((ROOT / "src" / "api" / "entity-fields.json").read_text())
    assert set(ios) == set(web)
    for name, fields in ios.items():
        assert f"/api/v1/entities/{name}" in paths
        assert f"/api/v1/entities/{name}/{{row_id}}" in paths
        assert sorted(fields) == sorted(web[name]), name
        create = json.loads((ROOT / "api" / "openapi.json").read_text())["components"]["schemas"][f"{name}Create"]
        assert set(fields) <= set(create["properties"]), name


def test_glucose_import_body_matches_what_the_app_sends():
    schemas = json.loads((ROOT / "api" / "openapi.json").read_text())["components"]["schemas"]
    sample = schemas["GlucoseSample"]
    assert set(sample["properties"]) == {"external_id", "reading_mg_dl", "date_time", "source_app"}
    swift = (ROOT / "ios" / "Sources" / "Core" / "Logic" / "GlucoseImport.swift").read_text()
    for key in sample["properties"]:
        assert f'"{key}"' in swift
