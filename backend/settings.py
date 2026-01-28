from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_base_dir() -> Path:
    # backend/settings.py -> repo root
    return Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="AI_",
        extra="ignore",
    )

    base_dir: Path = Field(default_factory=_default_base_dir)

    # Data paths
    docs_path: Path | None = None
    vector_db_path: Path | None = None

    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_llm_model: str = "llama3.2"
    ollama_embed_model: str = "nomic-embed-text"
    ollama_timeout_seconds: int = 120

    # Retrieval/reranking
    retrieval_k: int = 15
    rerank_top_k: int = 3

    def resolved_docs_path(self) -> Path:
        return (self.docs_path or (self.base_dir / "demo_docs")).resolve()

    def resolved_vector_db_path(self) -> Path:
        return (self.vector_db_path or (self.base_dir / "vectordb")).resolve()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
