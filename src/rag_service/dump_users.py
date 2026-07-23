import mysql.connector
import sys

# Reconfigure stdout to UTF-8
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
    print("ALL TABLES IN DATABASE")
    print("==================================================")
    cursor.execute("SHOW TABLES")
    tables = cursor.fetchall()
    table_names = [list(t.values())[0] for t in tables]
    print(", ".join(table_names))
    print("==================================================")
    
    # 1. Query Admin table
    print("\n[ADMIN ACCOUNTS]")
    admin_table = 'admin' if 'admin' in table_names else ('quantrivien' if 'quantrivien' in table_names else None)
    if admin_table:
        try:
            cursor.execute(f"SELECT * FROM {admin_table}")
            admins = cursor.fetchall()
            for a in admins:
                # print all columns dynamically
                cols = ", ".join([f"{k}: {v}" for k, v in a.items() if k != 'mat_khau' and k != 'anh_dai_dien'])
                print(f"- {cols} | Password: [Encrypted bcrypt]")
        except Exception as e:
            print(f"Error querying {admin_table}: {e}")
    else:
        print("No Admin table found.")

    # 2. Query Employee table
    print("\n[EMPLOYEE ACCOUNTS]")
    emp_table = 'nhan_vien' if 'nhan_vien' in table_names else ('nhanvien' if 'nhanvien' in table_names else None)
    if emp_table:
        try:
            cursor.execute(f"SELECT * FROM {emp_table}")
            employees = cursor.fetchall()
            for emp in employees:
                cols = ", ".join([f"{k}: {v}" for k, v in emp.items() if k != 'mat_khau' and k != 'mat_khau_hash' and k != 'anh_dai_dien' and k != 'face_embedding'])
                print(f"- {cols} | Password: [Encrypted bcrypt]")
        except Exception as e:
            print(f"Error querying {emp_table}: {e}")
    else:
        print("No Employee table found.")

    # 3. Query Customer table
    print("\n[CUSTOMER ACCOUNTS]")
    cust_table = 'khach_hang' if 'khach_hang' in table_names else ('khachhang' if 'khachhang' in table_names else None)
    if cust_table:
        try:
            cursor.execute(f"SELECT * FROM {cust_table} LIMIT 10")
            customers = cursor.fetchall()
            for cust in customers:
                cols = ", ".join([f"{k}: {v}" for k, v in cust.items() if k != 'mat_khau' and k != 'anh_dai_dien'])
                # If plaintext password exists
                pw = cust.get('mat_khau') or ''
                pw_desc = "[Encrypted bcrypt]" if pw.startswith('$2') else pw
                print(f"- {cols} | Password: {pw_desc}")
        except Exception as e:
            print(f"Error querying {cust_table}: {e}")
    else:
        print("No Customer table found.")

    cursor.close()
    conn.close()
    print("\n==================================================")

except Exception as conn_err:
    print(f"Database connection error: {conn_err}")
    sys.exit(1)
