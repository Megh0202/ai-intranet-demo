# AI Intranet Demo (FastAPI + Ollama)

This project is a small intranet RAG demo:

- PDFs are ingested into a local Chroma vector store.
- An LLM router classifies queries into `HR`, `IT`, `Finance`, or `GENERAL`.
- Retrieval is filtered by department.
- A reranker selects the most relevant chunks.
- Answers are generated **only** from retrieved internal content.

The API is implemented with **FastAPI** and uses **Ollama**.

This repo also includes a **React (Vite) chat UI** with a ChatGPT-inspired layout and a MongoDB-backed chat history.

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

### 3) MongoDB (for chat history)

Run MongoDB locally (example using Docker):

```bash
docker run --name intranet-mongo -p 27017:27017 -d mongo:7
```

## Quickstart

### One-command start (run.sh)

If you're using Git Bash (or any bash-compatible shell), you can start **backend + frontend + ticket API** with:

```bash
bash ./run.sh
```

This script will:

- Install Python deps from `requirements.txt`.
- Install `frontend/` and `Ticket/Backend/` Node deps if needed.
- Run ingestion if `vectordb/` is missing/empty.
- Start FastAPI (8000), Ticket API (5000), and Vite (5173).

It will stop the child processes when you press `Ctrl+C`.

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

### Step 3: Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://127.0.0.1:5173

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

### Chat API (MongoDB)

- `GET /chat/profile`
- `PUT /chat/profile`
- `GET /chat/conversations`
- `POST /chat/conversations`
- `GET /chat/conversations/{conversation_id}`
- `PATCH /chat/conversations/{conversation_id}`
- `DELETE /chat/conversations/{conversation_id}`
- `GET /chat/conversations/{conversation_id}/messages`
- `POST /chat/conversations/{conversation_id}/messages`
- `POST /chat/messages/{message_id}/feedback`

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

MongoDB variables:

- `AI_MONGODB_URI` (default: `mongodb://localhost:27017`)
- `AI_MONGODB_DB_NAME` (default: `ai_intranet_demo`)

Copy [.env.example](.env.example) to `.env` to override defaults.

## Notes

- `incorrect startxref pointer(1)` messages come from PDF parsing and are usually harmless.
- If you see Chroma telemetry warnings, ingestion will still work; this repo disables anonymized telemetry during ingestion.