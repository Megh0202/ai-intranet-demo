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

    # 1. Generate answer with explicit supportiveness check
    answer_prompt = f"""
    You are an expert Intranet AI assistant. Your goal is to provide accurate, concise, and helpful answers based ONLY on the provided Internal Content.

    CRITICAL INSTRUCTIONS:
    1. Answer using ONLY the information provided in the "Internal Content" section below.
    2. If the provided Internal Content does NOT contain enough information to answer the question fully, you MUST start your response with the exact phrase: "INSUFFICIENT_INFORMATION:". Then, explain what is missing or answer what you can from the text.
    3. If the question is completely outside the scope of the provided content, say: "INSUFFICIENT_INFORMATION: The requested information is not available in the internal documents."
    4. Do NOT use any outside knowledge or assumptions.
    5. Maintain a professional tone that matches the questioner's.
    6. Cite your sources if possible.

    Question:
    {query}

    Internal Content:
    {context}

    Answer:
    """
    try:
        answer = llm.invoke(answer_prompt).strip()
    except Exception:
        # Fallback to a concise extractive response if LLM is unavailable.
        snippet = (retrieved_docs[0][0].page_content or "").strip()
        snippet = snippet[:800] + ("..." if len(snippet) > 800 else "")
        return {
            "answer": f"Based on internal documents, the most relevant excerpt is:\n\n{snippet}",
            "confidence": 0.25,
            "sources": list(sources),
        }

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

