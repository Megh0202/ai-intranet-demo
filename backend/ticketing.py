from __future__ import annotations

import json
from typing import Any

import httpx

from backend.ollama_clients import get_llm
from backend.settings import Settings, get_settings


def generate_ticket_title_description(
    user_text: str,
    assistant_text: str,
    *,
    settings: Settings | None = None,
) -> tuple[str, str]:
    s = settings or get_settings()
    llm = get_llm(s)

    prompt = f"""
You generate support tickets.

Return ONLY valid JSON with keys:
- "title": short summary (max 80 chars)
- "description": concise, actionable details (3-8 bullet points)

User message:
{user_text}

Assistant response:
{assistant_text}
""".strip()

    raw = (llm.invoke(prompt) or "").strip()
    try:
        data = json.loads(raw)
        title = str(data.get("title", "")).strip()[:80] or "Support request"
        description = str(data.get("description", "")).strip()
        if not description:
            description = f"User: {user_text}\n\nAssistant: {assistant_text}"
        return title, description
    except Exception:
        title = (user_text or "Support request").strip()[:80] or "Support request"
        description = f"User: {user_text}\n\nAssistant: {assistant_text}"
        return title, description


async def create_ticket_via_api(
    *,
    title: str,
    description: str,
    settings: Settings | None = None,
) -> dict[str, Any]:
    s = settings or get_settings()
    url = s.ticket_api_base_url.rstrip("/") + "/ticket/create"

    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(url, json={"title": title, "description": description})

    content_type = (res.headers.get("content-type") or "").lower()
    if "application/json" in content_type:
        return {"status_code": res.status_code, "json": res.json()}

    return {"status_code": res.status_code, "text": res.text}