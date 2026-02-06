from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from backend.service import RetrievedChunk, answer_query
from backend.settings import get_settings
from fastapi.middleware.cors import CORSMiddleware

from backend.chat_api import router as chat_router
from backend.db import close_mongo_client, ensure_indexes

app = FastAPI(
    title="AI Intranet Demo API",
    version="1.0.0",
    description="Routed retrieval + grounded answers over internal PDFs.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with your frontend URL
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    await ensure_indexes()


@app.on_event("shutdown")
async def _shutdown() -> None:
    close_mongo_client()



class QueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=5000)
    return_chunks: bool = False


class ChunkResponse(BaseModel):
    text: str
    score: float
    source: str | None = None
    department: str | None = None
    page: str | int | None = None


class QueryResponse(BaseModel):
    department: Literal["HR", "IT", "Finance", "GENERAL"]
    answer: str
    confidence: float
    sources: list[str]
    chunks: list[ChunkResponse] | None = None


app.include_router(chat_router)


@app.get("/health")
def health() -> dict:
    s = get_settings()
    return {
        "status": "ok",
        "ollama_base_url": s.ollama_base_url,
        "ollama_llm_model": s.ollama_llm_model,
        "ollama_embed_model": s.ollama_embed_model,
        "vector_db_path": str(s.resolved_vector_db_path()),
    }


@app.post("/query", response_model=QueryResponse)
async def query(req: QueryRequest) -> QueryResponse:
    s = get_settings()

    # Helpful message when ingestion hasn't been run yet.
    if not s.resolved_vector_db_path().exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "Vector DB not found. Run ingestion first: "
                "python -m backend.ingest"
            ),
        )

    payload = await run_in_threadpool(
        answer_query,
        req.query,
        settings=s,
        return_chunks=req.return_chunks,
    )

    chunks = None
    if req.return_chunks:
        chunks = [
            ChunkResponse(
                text=c.text,
                score=c.score,
                source=c.source,
                department=c.department,
                page=c.page,
            )
            for c in payload.get("chunks", [])
        ]

    return QueryResponse(
        department=payload["department"],
        answer=payload["answer"],
        confidence=float(payload["confidence"]),
        sources=list(payload["sources"]),
        chunks=chunks,
    )
