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
    
    # Get all customers who signed in via Google (google_id is not null)
    query = """
        SELECT kh.ma_kh, kh.ho_ten, kh.email, kh.google_id,
               IF(pref.ma_kh IS NULL, 'No', 'Yes') as has_preferences
        FROM khach_hang kh
        LEFT JOIN so_thich_khach_hang pref ON kh.ma_kh = pref.ma_kh
        WHERE kh.google_id IS NOT NULL AND kh.google_id <> ''
    """
    cursor.execute(query)
    google_users = cursor.fetchall()
    
    print("Google Accounts in system:")
    for u in google_users:
        print(f"  ID: {u[0]} | Name: {u[1]} | Email: {u[2]} | GoogleID: {u[3]} | Has Prefs: {u[4]}")
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Error:", e)
