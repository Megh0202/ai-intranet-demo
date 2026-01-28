# AI Intranet Demo (FastAPI + Ollama)

This project is a small intranet RAG demo:

- PDFs are ingested into a local Chroma vector store.
- An LLM router classifies queries into `HR`, `IT`, `Finance`, or `GENERAL`.
- Retrieval is filtered by department.
- A reranker selects the most relevant chunks.
- Answers are generated **only** from retrieved internal content.

The API is implemented with **FastAPI** and uses **Ollama**.

## Prerequisites

### 1) Install and run Ollama

Install Ollama: https://ollama.com

Make sure the daemon is running (default: `http://localhost:11434`).

Pull the models used by this project:

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

If you skip `nomic-embed-text`, ingestion will fail with a 404 “model not found”.

### 2) Python dependencies

```bash
pip install -r requirements.txt
```

## Quickstart

### Step 1: Ingest documents

The demo PDFs are under `demo_docs/`.

Run ingestion (creates a local Chroma DB under `vectordb/`):

```bash
python -m backend.ingest
```

### Step 2: Start the API

```bash
uvicorn backend.api:app --reload --port 8000
```

Open:

- Swagger UI: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

## API

### `GET /health`

Returns configured Ollama models and vector DB path.

### `POST /query`

Request:

```json
{
	"query": "How many casual leaves do employees get?",
	"return_chunks": true
}
```

Response (example):

```json
{
	"department": "HR",
	"answer": "...",
	"confidence": 0.78,
	"sources": ["SomePolicy.pdf"],
	"chunks": [
		{
			"text": "...",
			"score": 0.42,
			"source": "SomePolicy.pdf",
			"department": "HR",
			"page": 2
		}
	]
}
```

## Configuration

Settings are read from environment variables (or a `.env` file) with the prefix `AI_`.

Common variables:

- `AI_OLLAMA_BASE_URL` (default: `http://localhost:11434`)
- `AI_OLLAMA_LLM_MODEL` (default: `llama3.2`)
- `AI_OLLAMA_EMBED_MODEL` (default: `nomic-embed-text`)
- `AI_DOCS_PATH` (default: `./demo_docs`)
- `AI_VECTOR_DB_PATH` (default: `./vectordb`)

Copy [.env.example](.env.example) to `.env` to override defaults.

## Notes

- `incorrect startxref pointer(1)` messages come from PDF parsing and are usually harmless.
- If you see Chroma telemetry warnings, ingestion will still work; this repo disables anonymized telemetry during ingestion.