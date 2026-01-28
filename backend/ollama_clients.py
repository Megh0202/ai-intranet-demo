from __future__ import annotations

from functools import lru_cache

from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.llms import Ollama

from backend.settings import Settings, get_settings


@lru_cache(maxsize=8)
def _cached_llm(
    base_url: str,
    model: str,
    timeout: int,
    temperature: float,
) -> Ollama:
    return Ollama(
        base_url=base_url,
        model=model,
        timeout=timeout,
        temperature=temperature,
    )


def get_llm(settings: Settings | None = None) -> Ollama:
    """Return a cached Ollama LLM client.

    NOTE: We cache by primitive values (base_url/model/timeout/temperature)
    so callers can safely pass a Settings object (which is not hashable).
    """

    s = settings or get_settings()
    return _cached_llm(
        s.ollama_base_url,
        s.ollama_llm_model,
        s.ollama_timeout_seconds,
        0.0,
    )


@lru_cache(maxsize=8)
def _cached_embeddings(base_url: str, model: str) -> OllamaEmbeddings:
    return OllamaEmbeddings(base_url=base_url, model=model)


def get_embeddings(settings: Settings | None = None) -> OllamaEmbeddings:
    """Return a cached Ollama embeddings client.

    Cached by primitive values (base_url/model) so Settings can be passed.
    """

    s = settings or get_settings()
    return _cached_embeddings(s.ollama_base_url, s.ollama_embed_model)
