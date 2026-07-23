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
    print("Tables:", tables)
    
    for table in ['san_pham', 'thuonghieu', 'thuong_hieu', 'hang_san_xuat', 'hang_sx', 'sanpham']:
        if table in tables:
            print(f"\nSchema of {table}:")
            cursor.execute(f"DESCRIBE {table}")
            for col in cursor.fetchall():
                print(f"  {col[0]}: {col[1]}")
                
    cursor.close()
    conn.conn = None
except Exception as e:
    print("Error:", e)
