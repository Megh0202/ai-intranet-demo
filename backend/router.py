from __future__ import annotations

from backend.ollama_clients import get_llm
from backend.settings import Settings, get_settings

def classify_intent(query: str, *, settings: Settings | None = None) -> str:
    s = settings or get_settings()
    llm = get_llm(s)
    lowered = query.lower()
    # Keyword-first routing to reduce LLM misroutes for common finance topics.
    if any(k in lowered for k in ("audit", "audit policy", "audit process", "audit findings", "internal audit", "risk score", "risk rating")):
        if any(k in lowered for k in ("ticket", "security", "access", "laptop", "system")):
            pass
        else:
            return "Finance"
    if any(k in lowered for k in ("invoice", "ap", "ar", "general ledger", "gl", "treasury", "reimbursement", "expense", "finance", "payroll", "tax", "risk score", "risk rating")):
        return "Finance"
    if any(k in lowered for k in ("vpn", "laptop", "wifi", "network", "password", "access", "security", "it", "ticket", "system")):
        return "IT"
    if any(k in lowered for k in ("leave", "holiday", "attendance", "hr", "benefit", "code of conduct")):
        return "HR"
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

    try:
        response = llm.invoke(prompt).strip().upper()
    except Exception:
        lowered = query.lower()
        if any(k in lowered for k in ("payroll", "leave", "benefit", "holiday", "policy", "hr")):
            return "HR"
        if any(k in lowered for k in ("vpn", "laptop", "email", "network", "wifi", "it", "password", "access")):
            return "IT"
        if any(k in lowered for k in ("invoice", "expense", "reimbursement", "budget", "finance", "payment")):
            return "Finance"
        return "GENERAL"

    cleaned = "".join([c for c in response.split()[0] if c.isalpha()]).upper()

    if cleaned == "FINANCE":
        return "Finance"
    if cleaned == "HR":
        return "HR"
    if cleaned == "IT":
        return "IT"

    return "GENERAL"

