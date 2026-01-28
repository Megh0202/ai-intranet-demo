from retrieval_with_filter import retrieve

queries = [
    "How many casual leaves do employees get?",
    "My laptop is running very slow",
    "Explain GAAP revenue recognition",
    "What is the capital of France?"
]

for q in queries:
    print("\n" + "="*80)
    print("QUERY:", q)
    dept, results = retrieve(q)

    if dept == "GENERAL":
        print("⚠️ Outside internal knowledge scope")
        continue

    for doc, score in results:
        print(f"\n📄 {doc.metadata['source']} | {doc.metadata['department']}")
        print(f"Distance: {round(score, 2)}")
        print(doc.page_content[:300])
