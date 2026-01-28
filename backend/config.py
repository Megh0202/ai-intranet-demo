"""Backward-compatible config constants.

Prefer importing Settings from backend.settings in new code.
"""

from __future__ import annotations

from backend.settings import get_settings

_settings = get_settings()

BASE_DIR = str(_settings.base_dir)
DOCS_PATH = str(_settings.resolved_docs_path())
VECTOR_DB_PATH = str(_settings.resolved_vector_db_path())

EMBED_MODEL = _settings.ollama_embed_model

