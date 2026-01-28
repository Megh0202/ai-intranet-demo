from retrieval_with_filter import retrieve
from answer_generator import generate_answer

queries = [
    "How many casual leaves do employees get?",
    "My laptop is running very slow",
    "What are the audit findings severity levels?"
]

for q in queries:
    print("\n" + "="*80)
    print("USER QUERY:", q)

    department, results = retrieve(q)

    if department == "GENERAL":
        print("Answer: This question is outside internal knowledge scope.")
        continue

    response = generate_answer(q, results)

    print("\nANSWER:")
    print(response["answer"])

    print("\nCONFIDENCE SCORE:")
    print(response["confidence"])

    print("\nREFERENCED DOCUMENTS:")
    for src in response["sources"]:
        print("-", src)
