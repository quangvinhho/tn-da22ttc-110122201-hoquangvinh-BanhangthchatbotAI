import mysql.connector
import bcrypt
import sys

sys.stdout.reconfigure(encoding='utf-8')

db_config = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'root',
    'password': 'Vinh123456789@',
    'database': 'QHUNG'
}

candidates = [
    '123', '123456', 'admin123', 'nhanvien123', 'Vinh123456789@', 
    'admin', 'nhanvien', 'nhanvientest', 'admin1', 'Nhanvien1', '1'
]

def find_password(pw_hash):
    if not pw_hash:
        return "[Empty]"
    # Ensure it's bytes
    if isinstance(pw_hash, str):
        pw_hash = pw_hash.encode('utf-8')
    for cand in candidates:
        try:
            if bcrypt.checkpw(cand.encode('utf-8'), pw_hash):
                return cand
        except Exception:
            pass
    return "[Unknown/Bcrypt Hash]"

try:
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor(dictionary=True)
    
    print("==================================================")
    print("DEMO ACCOUNTS PASSWORD DECRYPTION")
    print("==================================================")
    
    # 1. Check admins
    print("\n[ADMIN ACCOUNTS]")
    try:
        cursor.execute("SELECT ma_admin, tai_khoan, email, mat_khau FROM admin")
        for a in cursor.fetchall():
            decrypted = find_password(a['mat_khau'])
            print(f"- ID: {a['ma_admin']} | Username/Email: {a['tai_khoan']} | Password: {decrypted}")
    except Exception as e:
        print(f"Error checking admin: {e}")

    # 2. Check employees
    print("\n[EMPLOYEE ACCOUNTS]")
    try:
        cursor.execute("SELECT ma_nv, tai_khoan, ho_ten, mat_khau FROM nhan_vien")
        for emp in cursor.fetchall():
            decrypted = find_password(emp['mat_khau'])
            print(f"- ID: {emp['ma_nv']} | Username: {emp['tai_khoan']} | Name: {emp['ho_ten']} | Password: {decrypted}")
    except Exception as e:
        print(f"Error checking nhan_vien: {e}")

    # 3. Check customers
    print("\n[CUSTOMER ACCOUNTS]")
    try:
        cursor.execute("SELECT ma_kh, email, ho_ten, mat_khau FROM khach_hang LIMIT 5")
        for cust in cursor.fetchall():
            pw = cust['mat_khau']
            decrypted = find_password(pw) if pw.startswith('$2') else pw
            print(f"- ID: {cust['ma_kh']} | Email: {cust['email']} | Name: {cust['ho_ten']} | Password: {decrypted}")
    except Exception as e:
        print(f"Error checking khach_hang: {e}")

    cursor.close()
    conn.close()
    print("\n==================================================")

except Exception as conn_err:
    print(f"Database connection error: {conn_err}")
    sys.exit(1)
