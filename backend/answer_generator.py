from __future__ import annotations

from backend.ollama_clients import get_llm
from backend.settings import Settings, get_settings


def generate_answer(
    query,
    retrieved_docs,
    *,
    settings: Settings | None = None,
    compute_confidence: bool = True,
):
    s = settings or get_settings()
    llm = get_llm(s)
    if not retrieved_docs:
        return {
            "answer": "The requested information is not available in the internal documents.",
            "confidence": 0.20,
            "sources": []
        }

    context = ""
    sources = set()

    for doc, _ in retrieved_docs:
        context += doc.page_content + "\n\n"
        sources.add(doc.metadata.get("source", "Unknown Document"))

    # 1. Generate answer
    answer_prompt = f"""
    You are an Intranet AI assistant.

    Rules:
    - Answer ONLY using the information provided.
    - Do NOT use outside knowledge.
    - If the answer is NOT in the provided information, say:
      "The requested information is not available in the internal documents."
    - answer according to the questioner's tone.

    Question:
    {query}

    Internal Content:
    {context}

    Answer:
    """
    answer = llm.invoke(answer_prompt).strip()

    confidence = 0.0
    if compute_confidence:
        # 2. Self-evaluation for confidence
        confidence_prompt = f"""
            You are reviewing an answer generated from internal documents.

            Question:
            {query}

            Answer:
            {answer}

            Based ONLY on the provided content, rate how well the answer is supported.
            Return a number between 0 and 1.
            Return ONLY the number.
            """
        try:
            confidence = float(llm.invoke(confidence_prompt).strip())
            confidence = max(0.0, min(confidence, 1.0))
        except:
            confidence = 0.50

    return {
        "answer": answer,
        "confidence": round(confidence, 2),
        "sources": list(sources)
    }

