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
    cursor = conn.cursor(dictionary=True)
    
    print("==================================================")
    print("CHECKING CUSTOMER INTERESTS")
    print("==================================================")
    
    # Get all customers
    cursor.execute("SELECT ma_kh, email, ho_ten FROM khach_hang")
    customers = cursor.fetchall()
    
    # Get all customers with interests
    cursor.execute("SELECT DISTINCT ma_kh FROM so_thich_khach_hang")
    interested_uids = set([row['ma_kh'] for row in cursor.fetchall()])
    
    print("Accounts WITH interests:")
    has_interests = False
    for c in customers:
        if c['ma_kh'] in interested_uids:
            print(f"- ID: {c['ma_kh']} | Email: {c['email']} | Name: {c['ho_ten']}")
            has_interests = True
    if not has_interests:
        print("[None]")
        
    print("\nAccounts WITHOUT interests (Ready for onboarding demo):")
    no_interests = False
    for c in customers:
        if c['ma_kh'] not in interested_uids:
            print(f"- ID: {c['ma_kh']} | Email: {c['email']} | Name: {c['ho_ten']} | Password: 123")
            no_interests = True
    if not no_interests:
        print("[None - All accounts have interests]")
        
    cursor.close()
    conn.close()
    print("==================================================")

except Exception as conn_err:
    print(f"Database connection error: {conn_err}")
    sys.exit(1)
