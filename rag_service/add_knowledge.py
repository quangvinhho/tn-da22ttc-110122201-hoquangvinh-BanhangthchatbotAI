import mysql.connector
import requests
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path="../backend/.env")

conn = mysql.connector.connect(
    host=os.getenv("DB_HOST", "localhost"),
    user=os.getenv("DB_USER", "root"),
    password=os.getenv("DB_PASS", "Vinh123456789@"),
    database=os.getenv("DB_NAME", "QHUNG")
)
cursor = conn.cursor()

question = "Sự khác biệt giữa Gợi ý sản phẩm và Tư vấn sản phẩm là gì? Hoặc phân biệt gợi ý và tư vấn"
answer = "Gợi ý sản phẩm (Recommendation) là hệ thống tự động hiển thị sản phẩm (VD: Có thể bạn sẽ thích) dựa trên thuật toán Máy học (KNN, Apriori) để tăng bán chéo mà khách không cần hỏi. Còn Tư vấn sản phẩm (Consultation) là chức năng AI Chatbot (sử dụng kiến trúc RAG) tương tác trực tiếp hai chiều, trả lời câu hỏi cụ thể của bạn giống như nhân viên sale thật."
type_faq = "faq"

# Kiểm tra xem đã có chưa
cursor.execute("SELECT id FROM chatbot_knowledge WHERE question = %s", (question,))
if not cursor.fetchone():
    cursor.execute("INSERT INTO chatbot_knowledge (question, answer, type, is_active) VALUES (%s, %s, %s, %s)", (question, answer, type_faq, 1))
    conn.commit()
    print(f"Inserted ID: {cursor.lastrowid}")
else:
    print("Knowledge already exists.")

cursor.close()
conn.close()

# Trigger reload
try:
    res = requests.post("http://127.0.0.1:8000/api/reload-vectorstore")
    print("Reload successful:", res.json())
except Exception as e:
    print("Error reloading:", e)
