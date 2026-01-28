from __future__ import annotations

from backend.ollama_clients import get_llm
from backend.settings import Settings, get_settings

def classify_intent(query: str, *, settings: Settings | None = None) -> str:
    s = settings or get_settings()
    llm = get_llm(s)
    prompt = f"""
You are an enterprise AI router.

Classify the following user query into ONE category only:
- HR
- IT
- Finance
- General

User Query:
"{query}"

Reply with only one word.
"""

    response = llm.invoke(prompt).strip().upper()

    if response == "FINANCE":
        return "Finance"
    if response == "HR":
        return "HR"
    if response == "IT":
        return "IT"

    return "GENERAL"

