from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from langchain_community.vectorstores import Chroma
from backend.ollama_clients import get_embeddings
from backend.router import classify_intent
from backend.reranker import rerank_chunks
from backend.settings import Settings, get_settings


@lru_cache(maxsize=1)
def _get_vectorstore(persist_directory: str) -> Chroma:
    embeddings = get_embeddings()
    return Chroma(persist_directory=persist_directory, embedding_function=embeddings)


def retrieve(query: str, *, settings: Settings | None = None):
    s = settings or get_settings()

    department = classify_intent(query, settings=s)
    print(f"\n🧠 Routed to: {department}")

    if department == "GENERAL":
        return department, []

    persist_dir = str(s.resolved_vector_db_path())
    db = _get_vectorstore(persist_dir)

    # Step 1: Broad retrieval
    initial_results = db.similarity_search_with_score(
        query,
        k=s.retrieval_k,
        filter={"department": department}
    )

    # Step 2: LLM-based re-ranking
    reranked_results = rerank_chunks(query, initial_results, top_k=s.rerank_top_k, settings=s)

    return department, reranked_results

