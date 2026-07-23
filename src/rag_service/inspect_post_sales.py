import mysql.connector
import sys
sys.stdout.reconfigure(encoding='utf-8')

db_config = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'root',
    'password': 'Vinh123456789@',
    'database': 'QHUNG'
}

try:
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()
    cursor.execute("SHOW TABLES")
    tables = [t[0] for t in cursor.fetchall()]
    
    for table in ['phieu_bao_hanh', 'yeu_cau_bao_hanh', 'yeu_cau_doi_tra', 'lien_he']:
        if table in tables:
            print(f"\nSchema of {table}:")
            cursor.execute(f"DESCRIBE {table}")
            for col in cursor.fetchall():
                print(f"  {col[0]}: {col[1]}")
                
    cursor.close()
    conn.close()
except Exception as e:
    print("Error:", e)
