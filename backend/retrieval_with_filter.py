from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import OllamaEmbeddings
from config import VECTOR_DB_PATH, EMBED_MODEL
from router import classify_intent
from reranker import rerank_chunks


def retrieve(query):
    department = classify_intent(query)
    print(f"\n🧠 Routed to: {department}")

    if department == "GENERAL":
        return department, []

    embeddings = OllamaEmbeddings(model=EMBED_MODEL)
    db = Chroma(
        persist_directory=VECTOR_DB_PATH,
        embedding_function=embeddings
    )

    # Step 1: Broad retrieval
    initial_results = db.similarity_search_with_score(
        query,
        k=15,
        filter={"department": department}
    )

    # Step 2: LLM-based re-ranking
    reranked_results = rerank_chunks(query, initial_results, top_k=3)

    return department, reranked_results
