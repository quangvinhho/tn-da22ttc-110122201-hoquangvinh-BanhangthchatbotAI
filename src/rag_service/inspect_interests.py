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
    
    # Let's inspect the tables related to customer preferences/interests
    cursor.execute("SHOW TABLES")
    tables = [t[0] for t in cursor.fetchall()]
    print("Tables in DB:", tables)
    
    pref_table = None
    for t in ['so_thich_khach_hang', 'so_thich_kh', 'khach_hang_so_thich']:
        if t in tables:
            pref_table = t
            break
            
    if not pref_table:
        print("No preference/interest table found in database.")
        sys.exit(0)
        
    print(f"\nUsing preference table: {pref_table}")
    
    # Get all customers who do not have any records in the preference table
    query = f"""
        SELECT kh.ma_kh, kh.ho_ten, kh.email 
        FROM khach_hang kh
        LEFT JOIN {pref_table} pref ON kh.ma_kh = pref.ma_kh
        WHERE pref.ma_kh IS NULL
    """
    cursor.execute(query)
    no_pref_customers = cursor.fetchall()
    
    print(f"\nCustomers without preference history (Total: {len(no_pref_customers)}):")
    for cust in no_pref_customers:
        print(f"  ID: {cust[0]} | Name: {cust[1]} | Email: {cust[2]}")
        
    # Also show some details about the preference table schema
    cursor.execute(f"DESCRIBE {pref_table}")
    print(f"\nSchema of {pref_table}:")
    for col in cursor.fetchall():
        print(f"  {col[0]}: {col[1]}")
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Error:", e)
