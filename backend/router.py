from langchain_community.llms import Ollama

llm = Ollama(model="llama3")

def classify_intent(query: str) -> str:
    prompt = f"""
You are an enterprise AI router.

Classify the following user query into ONE category only:
- HR
- IT
- Finance
- General

User Query:
"{query}"

Reply with only one word.
"""

    response = llm.invoke(prompt).strip().upper()

    if response == "FINANCE":
        return "Finance"
    if response == "HR":
        return "HR"
    if response == "IT":
        return "IT"

    return "GENERAL"
