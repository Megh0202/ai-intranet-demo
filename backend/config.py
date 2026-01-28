import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DOCS_PATH = os.path.join(BASE_DIR, "demo_docs")
VECTOR_DB_PATH = os.path.join(BASE_DIR, "vectordb")

EMBED_MODEL = "nomic-embed-text"
