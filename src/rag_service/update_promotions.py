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
    
    # 1. Fetch current promotions
    cursor.execute("SELECT ma_km, code, loai, loai_km, gia_tri, dieu_kien_toi_thieu, dieu_kien_toi_da, mo_ta FROM khuyen_mai")
    rows = cursor.fetchall()
    
    print("=== BEFORE UPDATE ===")
    for r in rows:
        print(f"  ID: {r[0]} | Code: {r[1]} | Type: {r[2]} | Category: {r[3]} | Val: {r[4]} | MinOrder: {r[5]} | MaxDiscount: {r[6]} | Desc: {r[7]}")
        
    # 2. Let's perform smart updates to make them look like a real business:
    # We will set realistic minimum order criteria:
    # - If loai is 'percent' (e.g. 10% discount): MinOrder = 200,000 or 500,000 VND
    # - If loai is 'fixed' (e.g. 50,000 VND discount): MinOrder = 500,000 VND
    # - If code is like 'FREESHIP': MinOrder = 150,000 VND
    # Let's write the query updates based on the code/ID:
    
    for r in rows:
        ma_km = r[0]
        code = r[1]
        loai = r[2]
        loai_km = r[3]
        gia_tri = float(r[4])
        
        new_min_order = 0.00
        new_value = gia_tri
        new_max_discount = r[6]
        new_desc = r[7]
        
        if loai_km == 'freeship':
            new_min_order = 200000.00
            new_value = 30000.00 # 30k freeship
            new_desc = "Miễn phí vận chuyển cho đơn hàng từ 200k"
        elif loai == 'percent':
            # e.g., if value was 0.1 (decimal format) or 10
            # Let's check: if value < 1, it's probably a fraction, let's keep it as 10 or 15 for percent (e.g. 10%)
            if new_value < 1.0:
                new_value = new_value * 100
            
            # Make sure it's a realistic percentage like 5%, 10%, 15%
            if new_value > 50:
                new_value = 10.0 # 10%
                
            new_min_order = 500000.00 # đơn hàng tối thiểu 500k
            new_max_discount = 100000.00 # Giảm tối đa 100k
            new_desc = f"Giảm giá {int(new_value)}% cho đơn hàng từ 500k (tối đa 100k)"
        elif loai == 'fixed':
            # e.g., if value is 50, 100 etc, let's scale to VND: 50,000đ, 100,000đ
            if new_value < 1000:
                new_value = new_value * 10000 # e.g. 5 -> 50,000
                if new_value < 10000:
                    new_value = 50000.00
            
            new_min_order = 1000000.00 # đơn hàng tối thiểu 1 triệu
            new_desc = f"Giảm ngay {int(new_value):,}đ cho đơn hàng từ 1 triệu".replace(",", ".")
            
        # Update row
        update_query = """
            UPDATE khuyen_mai 
            SET gia_tri = %s, dieu_kien_toi_thieu = %s, dieu_kien_toi_da = %s, mo_ta = %s 
            WHERE ma_km = %s
        """
        cursor.execute(update_query, (new_value, new_min_order, new_max_discount, new_desc, ma_km))
        
    conn.commit()
    print("\n✓ Database updated successfully.")
    
    # 3. Fetch again to verify
    cursor.execute("SELECT ma_km, code, loai, loai_km, gia_tri, dieu_kien_toi_thieu, dieu_kien_toi_da, mo_ta FROM khuyen_mai")
    rows_after = cursor.fetchall()
    
    print("\n=== AFTER UPDATE ===")
    for r in rows_after:
        print(f"  ID: {r[0]} | Code: {r[1]} | Type: {r[2]} | Category: {r[3]} | Val: {r[4]} | MinOrder: {r[5]} | MaxDiscount: {r[6]} | Desc: {r[7]}")
        
    cursor.close()
    conn.close()
except Exception as e:
    print("Error:", e)
