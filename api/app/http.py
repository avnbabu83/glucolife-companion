"""Shared outbound HTTP client factory. Tests swap the transport for recorded fixtures."""

from __future__ import annotations

import httpx

_transport: httpx.BaseTransport | None = None


def set_transport(transport: httpx.BaseTransport | None) -> None:
    global _transport
    _transport = transport


def client(timeout: float = 30.0) -> httpx.Client:
    return httpx.Client(timeout=timeout, transport=_transport)
