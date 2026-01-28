from langchain_community.llms import Ollama

llm = Ollama(model="llama3")

def generate_answer(query, retrieved_docs):
    if not retrieved_docs:
        return {
            "answer": "The requested information is not available in the internal documents.",
            "confidence": 0.20,
            "sources": []
        }

    context = ""
    sources = set()

    for doc, _ in retrieved_docs:
        context += doc.page_content + "\n\n"
        sources.add(doc.metadata.get("source", "Unknown Document"))

    # 1. Generate answer
    answer_prompt = f"""
You are an internal enterprise AI assistant.

Rules:
- Answer ONLY using the information provided.
- Do NOT use outside knowledge.
- Do NOT guess.

Question:
{query}

Internal Content:
{context}

Answer:
"""
    answer = llm.invoke(answer_prompt).strip()

    # 2. Self-evaluation for confidence
    confidence_prompt = f"""
You are reviewing an answer generated from internal documents.

Question:
{query}

Answer:
{answer}

Based ONLY on the provided content, rate how well the answer is supported.
Return a number between 0 and 1.
Return ONLY the number.
"""
    try:
        confidence = float(llm.invoke(confidence_prompt).strip())
        confidence = max(0.0, min(confidence, 1.0))
    except:
        confidence = 0.50

    return {
        "answer": answer,
        "confidence": round(confidence, 2),
        "sources": list(sources)
    }
