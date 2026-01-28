from __future__ import annotations

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

    response = generate_answer(query, results, settings=s)

    payload = {
        "department": department,
        "answer": response["answer"],
        "confidence": response["confidence"],
        "sources": response["sources"],
    }

    if return_chunks:
        payload["chunks"] = _serialize_chunks(results)

    return payload
