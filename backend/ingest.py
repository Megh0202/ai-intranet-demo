import os
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
from config import DOCS_PATH, VECTOR_DB_PATH, EMBED_MODEL


def load_all_documents():
    all_docs = []

    for department in ["HR", "IT", "Finance"]:
        folder = os.path.join(DOCS_PATH, department)

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


def ingest_documents():
    print("🔹 Loading documents...")
    documents = load_all_documents()
    print(f"🔹 Loaded {len(documents)} pages")

    splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=100,
    separators=["\n\n", "\n", ".", " "]
)


    chunks = splitter.split_documents(documents)
    print(f"🔹 Created {len(chunks)} chunks")

    embeddings = OllamaEmbeddings(model=EMBED_MODEL)

    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=VECTOR_DB_PATH
    )

    vectorstore.persist()
    print("✅ ChromaDB vector store created successfully")
    



if __name__ == "__main__":
    ingest_documents()
