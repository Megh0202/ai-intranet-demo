from __future__ import annotations

import math
from dataclasses import dataclass

from backend.answer_generator import generate_answer
from backend.retrieval_with_filter import retrieve
from backend.settings import Settings, get_settings


@dataclass(frozen=True)
class RetrievedChunk:
    text: str
    score: float
    source: str | None
    department: str | None
    page: str | int | None


def _serialize_chunks(results, *, max_chars: int = 600) -> list[RetrievedChunk]:
    chunks: list[RetrievedChunk] = []
    for doc, score in results:
        meta = doc.metadata or {}
        chunks.append(
            RetrievedChunk(
                text=(doc.page_content or "")[:max_chars],
                score=float(score),
                source=meta.get("source"),
                department=meta.get("department"),
                page=meta.get("page"),
            )
        )
    return chunks


def _confidence_from_chroma_scores(results) -> float:
    """Convert Chroma distance scores (lower is better) to a [0,1] confidence.

    LangChain's Chroma `similarity_search_with_score` typically returns a distance-like score.
    We map distance to confidence via exp(-distance).
    """

    if not results:
        return 0.0

    scores = [float(score) for _, score in results if score is not None]
    if not scores:
        return 0.0

    best = min(scores)
    conf = math.exp(-best)
    return max(0.0, min(float(conf), 1.0))


def answer_query(
    query: str,
    *,
    settings: Settings | None = None,
    return_chunks: bool = False,
) -> dict:
    s = settings or get_settings()
    department, results = retrieve(query, settings=s)

    if department == "GENERAL":
        payload = {
            "department": "GENERAL",
            "answer": "This question is outside the internal knowledge scope.",
            "confidence": 0.0,
            "sources": [],
        }
        if return_chunks:
            payload["chunks"] = []
        return payload

    response = generate_answer(query, results, settings=s, compute_confidence=False)
    chroma_confidence = _confidence_from_chroma_scores(results)

    payload = {
        "department": department,
        "answer": response["answer"],
        "confidence": chroma_confidence,
        "sources": response["sources"],
    }

    if return_chunks:
        payload["chunks"] = _serialize_chunks(results)

    return payload
