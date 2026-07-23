import sys
import io

if sys.stdout is not None:
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='backslashreplace')
    except Exception:
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='backslashreplace')
        except Exception:
            pass

from recommend_flow import extract_flow_entities
from langchain_groq import ChatGroq
import os

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "your_groq_api_key_here")

def test():
    llm = ChatGroq(model_name="llama-3.3-70b-versatile", api_key=GROQ_API_KEY)
    
    flow_data = {
        "student_year": None,
        "need_long_term": None,
        "budget": None,
        "priority": None
    }
    
    last_question = ""
    user_msg = "mình là học sinh"
    
    print("Initial Flow Data:", flow_data)
    print("User Message:", user_msg)
    
    updated_data = extract_flow_entities("student", user_msg, flow_data, last_question, llm)
    
    print("\n--- UPDATED FLOW DATA ---")
    print(updated_data)

if __name__ == "__main__":
    test()
