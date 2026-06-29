import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    'host':     os.getenv('DB_HOST', 'localhost'),
    'user':     os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': os.getenv('DB_NAME', 'quanghungmobile'),
    'charset':  'utf8mb4'
}

print("Trying DB Connection with config:", {k: v if k != 'password' else '***' for k, v in DB_CONFIG.items()})

try:
    conn = mysql.connector.connect(**DB_CONFIG)
    cursor = conn.cursor()
    cursor.execute("SHOW TABLES")
    tables = cursor.fetchall()
    print("Connection successful! Tables in DB:")
    for t in tables:
        print("-", t[0])
    
    cursor.execute("SELECT COUNT(*) FROM face_embeddings")
    count = cursor.fetchone()[0]
    print(f"Number of rows in face_embeddings: {count}")
    
    cursor.close()
    conn.close()
except Exception as e:
    print("Connection failed:", e)
