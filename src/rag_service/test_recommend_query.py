import sys
sys.stdout.reconfigure(encoding='utf-8')
from recommend_flow import parse_budget_range, get_target_budget
import mysql.connector

db_config = {
    'host': '127.0.0.1',
    'port': 3306,
    'user': 'root',
    'password': 'Vinh123456789@',
    'database': 'QHUNG'
}

def test_query(budget_input):
    print(f"\nInput budget: '{budget_input}'")
    min_price, max_price = parse_budget_range(budget_input)
    print(f"  Parsed range: min={min_price}, max={max_price}")
    
    where_conds = ["sp.so_luong_ton > 0"]
    params = []
    
    if budget_input:
        if min_price is not None:
            where_conds.append("sp.gia >= %s")
            params.append(min_price)
        if max_price is not None:
            where_conds.append("sp.gia <= %s")
            params.append(int(max_price * 1.1))
            
    sql_query = f"""
        SELECT sp.ma_sp, sp.ten_sp, sp.gia, hsx.ten_hang
        FROM san_pham sp
        JOIN thương_hiệu hsx ON sp.ma_thuong_hieu = hsx.ma_thuong_hieu
        WHERE {" AND ".join(where_conds)}
        LIMIT 5
    """
    
    # Let's adjust table name if needed
    try:
        conn = mysql.connector.connect(**db_config)
        cursor = conn.cursor(dictionary=True)
        # Check table names for thương hiệu
        cursor.execute("SHOW TABLES")
        tables = [list(t.values())[0] for t in cursor.fetchall()]
        th_table = 'thuong_hieu' if 'thuong_hieu' in tables else 'thuonghieu'
        
        sql_query = f"""
            SELECT sp.ma_sp, sp.ten_sp, sp.gia, hsx.ten_thuong_hieu as ten_hang
            FROM san_pham sp
            JOIN {th_table} hsx ON sp.ma_thuong_hieu = hsx.ma_thuong_hieu
            WHERE {" AND ".join(where_conds)}
            LIMIT 5
        """
        
        cursor.execute(sql_query, params)
        rows = cursor.fetchall()
        print("  Suggested Products:")
        for r in rows:
            print(f"  - {r['ten_sp']} | Price: {r['gia']:.0f} VND | Brand: {r['ten_hang']}")
            
        cursor.close()
        conn.close()
    except Exception as e:
        print(f"  Error: {e}")

test_query("trên 5 triệu")
test_query("5000000")
test_query(5000000)
test_query("dưới 5 triệu")
