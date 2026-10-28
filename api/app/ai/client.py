"""Claude client wrapper. Tests replace it with a fake via set_ai_client()."""

from __future__ import annotations

import base64
from typing import Protocol

from app.config import get_settings


class AIUnavailable(Exception):
    """Claude is not configured, unreachable, slow (timeout) or overloaded."""


class AIClient(Protocol):
    def complete(self, system: str, prompt: str, images: list[tuple[str, bytes]]) -> str: ...


class ClaudeClient:
    def complete(self, system: str, prompt: str, images: list[tuple[str, bytes]]) -> str:
        s = get_settings()
        if not s.anthropic_api_key:
            raise AIUnavailable("ANTHROPIC_API_KEY is not configured")
        import anthropic

        client = anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=s.ai_timeout_seconds, max_retries=1)
        content: list[dict] = [
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": base64.b64encode(data).decode()},
            }
            for media_type, data in images
        ]
        content.append({"type": "text", "text": prompt})
        try:
            message = client.messages.create(
                model=s.anthropic_model,
                max_tokens=8192,
                system=system,
                messages=[{"role": "user", "content": content}],
            )
        except anthropic.APIError as exc:
            raise AIUnavailable(str(exc)) from exc
        return "".join(getattr(block, "text", "") for block in message.content)


_client: AIClient | None = None


def get_ai_client() -> AIClient:
    global _client
    if _client is None:
        _client = ClaudeClient()
    return _client


def set_ai_client(client: AIClient | None) -> None:
    global _client
    _client = client
