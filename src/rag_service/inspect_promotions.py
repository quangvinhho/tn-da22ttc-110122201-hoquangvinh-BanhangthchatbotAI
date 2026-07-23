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
    
    # Describe the table khuyen_mai
    cursor.execute("DESCRIBE khuyen_mai")
    print("Schema of khuyen_mai:")
    for col in cursor.fetchall():
        print(f"  {col[0]}: {col[1]}")
        
    # Query all rows
    cursor.execute("SELECT ma_km, ma_code, loai_km, loai_giam, gia_tri_giam, don_toi_thieu, giam_toi_da, trang_thai FROM khuyen_mai")
    rows = cursor.fetchall()
    
    print("\nCurrent Promotions:")
    for r in rows:
        print(f"  ID: {r[0]} | Code: {r[1]} | Type: {r[2]} | DiscountType: {r[3]} | Value: {r[4]} | MinOrder: {r[5]} | MaxDiscount: {r[6]} | Status: {r[7]}")
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Error:", e)
