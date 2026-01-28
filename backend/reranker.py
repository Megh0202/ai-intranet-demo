from __future__ import annotations

import json

from backend.ollama_clients import get_llm
from backend.settings import Settings, get_settings

def rerank_chunks(
    query,
    retrieved_docs,
    top_k=3,
    *,
    settings: Settings | None = None,
):
    s = settings or get_settings()
    llm = get_llm(s)
    if not retrieved_docs:
        return []

    excerpts = []
    for idx, (doc, _) in enumerate(retrieved_docs):
        excerpts.append({
            "id": idx,
            "text": doc.page_content[:400]
        })

    prompt = f"""
You are an AI system that selects the most relevant document excerpts.

User question:
"{query}"

Below is a JSON list of document excerpts.
Return a JSON array of EXACTLY {top_k} excerpt IDs
that BEST answer the question.
Return ONLY valid JSON. No explanation.

Excerpts:
{json.dumps(excerpts, indent=2)}
"""

    response = llm.invoke(prompt).strip()

    try:
        ids = json.loads(response)
        return [retrieved_docs[i] for i in ids if i < len(retrieved_docs)]
    except Exception:
        # Absolute fallback
        return retrieved_docs[:top_k]

