from __future__ import annotations

import os

from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.ollama_clients import get_embeddings
from backend.settings import Settings, get_settings


def load_all_documents(*, settings: Settings | None = None):
    s = settings or get_settings()
    all_docs = []

    for department in ["HR", "IT", "Finance"]:
        folder = os.path.join(str(s.resolved_docs_path()), department)

        for filename in os.listdir(folder):
            if filename.endswith(".pdf"):
                path = os.path.join(folder, filename)
                loader = PyPDFLoader(path)
                pages = loader.load()

                for page in pages:
                    page.metadata["department"] = department
                    page.metadata["source"] = filename
                    page.metadata["page"] = page.metadata.get("page", "unknown")
                    all_docs.append(page)

    return all_docs


def ingest_documents(*, settings: Settings | None = None):
    s = settings or get_settings()

    # Reduce noisy/non-critical telemetry failures from Chroma/posthog.
    # This also keeps ingestion logs clean for local demos.
    os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

    print("🔹 Loading documents...")
    documents = load_all_documents(settings=s)
    print(f"🔹 Loaded {len(documents)} pages")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100,
        separators=["\n\n", "\n", ".", " "],
    )


    chunks = splitter.split_documents(documents)
    print(f"🔹 Created {len(chunks)} chunks")

    embeddings = get_embeddings(s)

    try:
        vectorstore = Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            persist_directory=str(s.resolved_vector_db_path()),
        )
    except ValueError as exc:
        # Common local setup issue: embedding model not pulled in Ollama.
        msg = str(exc)
        if "nomic-embed-text" in msg and "not found" in msg:
            raise RuntimeError(
                "Ollama embedding model not found. Run: ollama pull nomic-embed-text"
            ) from exc
        raise

    vectorstore.persist()
    print("✅ ChromaDB vector store created successfully")
    



if __name__ == "__main__":
    ingest_documents()
