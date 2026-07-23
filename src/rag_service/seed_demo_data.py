import mysql.connector
import sys
import datetime

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
    
    print("==================================================")
    print("CLEANING & SEEDING DEMO AFTER-SALES DATA")
    print("==================================================")
    
    # Disable foreign key checks to make deletion clean
    cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    
    # 1. Clear old data from targets
    cursor.execute("TRUNCATE TABLE yeu_cau_bao_hanh")
    cursor.execute("TRUNCATE TABLE yeu_cau_doi_tra")
    cursor.execute("TRUNCATE TABLE phieu_bao_hanh")
    cursor.execute("TRUNCATE TABLE lien_he")
    print("✓ Old warranty and return records cleared.")
    
    # 2. Insert Phieu Bao Hanh
    # Nguyen Van A (ma_kh = 1) purchased iPhone 14 (ma_sp = 1) under Order 1
    # Purchase date: 2026-01-10
    now = datetime.datetime.now()
    purchase_date_1 = datetime.datetime(2026, 1, 10, 10, 30, 0)
    expiry_date_1 = purchase_date_1 + datetime.timedelta(days=365) # 12 months warranty
    
    # Tran Thi B (ma_kh = 2) purchased Galaxy S23 (ma_sp = 2) under Order 2
    purchase_date_2 = datetime.datetime(2025, 12, 15, 14, 15, 0)
    expiry_date_2 = purchase_date_2 + datetime.timedelta(days=365)
    
    pbh_query = """
        INSERT INTO phieu_bao_hanh (ma_pbh, ma_don, ma_sp, ma_kh, so_serial, so_imei, ngay_mua, ngay_het_han, thoi_han_bh, trang_thai, ghi_chu)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    cursor.execute(pbh_query, (
        1, 1, 1, 1, 'SER123456789', '123456789012345', 
        purchase_date_1, expiry_date_1, 12, 'active', 'Hàng new fullbox chính hãng'
    ))
    
    cursor.execute(pbh_query, (
        2, 2, 2, 2, 'SER987654321', '987654321098765', 
        purchase_date_2, expiry_date_2, 12, 'active', 'Hàng nguyên seal bảo hành hãng'
    ))
    
    print("✓ Seeded 2 Active Warranties.")
    
    # 3. Insert Yeu Cau Bao Hanh (Repair Requests)
    ycbh_query = """
        INSERT INTO yeu_cau_bao_hanh (ma_ycbh, ma_pbh, ma_kh, mo_ta_loi, hinh_anh, trang_thai, ket_qua, ngay_tao, ngay_hoan_thanh, nhan_vien_xu_ly)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    # Claim 1: Under Repair for Nguyen Van A
    cursor.execute(ycbh_query, (
        1, 1, 1, 'Màn hình bị sọc xanh dọc màn hình và có hiện tượng giật rung màn hình sau khi sạc qua đêm', 
        'images/claims/soc_man_hinh.jpg', 'repairing', '', 
        now - datetime.timedelta(days=2), None, 1
    ))
    
    # Claim 2: Completed for Tran Thi B
    cursor.execute(ycbh_query, (
        2, 2, 2, 'Loa ngoài rè và âm lượng nghe rất nhỏ khi phát nhạc', 
        'images/claims/loa_re.jpg', 'completed', 'Đã tiến hành vệ sinh bụi màng loa và thay thế màng loa chống nước mới. Đã test âm thanh đạt tiêu chuẩn ban đầu.', 
        now - datetime.timedelta(days=7), now - datetime.timedelta(days=5), 1
    ))
    
    print("✓ Seeded 2 Warranty Repair Claims (1 Under Repair, 1 Completed).")
    
    # 4. Insert Yeu Cau Doi Tra (Exchange/Return Requests)
    ycdt_query = """
        INSERT INTO yeu_cau_doi_tra (ma_ycdt, ma_don, ma_kh, ma_sp, ly_do, loai, hinh_anh, trang_thai, so_tien_hoan, ghi_chu_admin, ngay_tao, ngay_xu_ly)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    # Exchange Claim 1: Pending for Nguyen Van A (iPhone 14)
    cursor.execute(ycdt_query, (
        1, 1, 1, 1, 'Khui hộp kiểm tra phát hiện mặt kính camera sau bị trầy xước sâu một đường dài ảnh hưởng tới chất lượng ảnh chụp', 
        'doi', 'images/returns/xuoc_camera.jpg', 'pending', 0.00, '', 
        now - datetime.timedelta(days=1), None
    ))
    
    # Exchange Claim 2: Approved for Tran Thi B (Galaxy S23)
    cursor.execute(ycdt_query, (
        2, 2, 2, 2, 'Lỗi loa thoại trong nghe rè, chập chờn lúc nghe được lúc không', 
        'doi', 'images/returns/loi_loa_thoai.jpg', 'approved', 0.00, 'Đã xác nhận lỗi phần cứng của NSX. Đồng ý đổi máy mới cùng model màu đen.', 
        now - datetime.timedelta(days=3), now - datetime.timedelta(days=2)
    ))
    
    print("✓ Seeded 2 Return/Exchange Requests (1 Pending, 1 Approved).")
    
    # 5. Insert Lien He (Support Contacts)
    lh_query = """
        INSERT INTO lien_he (ma_lien_he, ho_ten, email, so_dien_thoai, tieu_de, noi_dung, hinh_anh, ngay_gui, trang_thai, ma_kh, ma_admin, noi_dung_phan_hoi, ngay_phan_hoi)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    # Contact 1: New
    cursor.execute(lh_query, (
        1, 'Nguyễn Văn A', 'a@gmail.com', '0911111111', 'Tư vấn củ sạc nhanh Anker', 
        'Dạ cho em hỏi bên shop mình có bán củ sạc nhanh Anker 30W chính hãng tương thích với iPhone 14 mới mua không ạ? Nếu có ship cho em luôn.', 
        'null', now - datetime.timedelta(hours=5), 'new', 1, None, '', None
    ))
    
    # Contact 2: Replied
    cursor.execute(lh_query, (
        2, 'Trần Thị B', 'b@gmail.com', '0922222222', 'Hỏi thời gian hoàn thành sửa chữa', 
        'Cho mình hỏi máy Galaxy S23 gửi bảo hành loa rè ngày hôm kia đã sửa xong chưa ạ? Khi nào có thể nhận lại máy?', 
        'null', now - datetime.timedelta(days=2), 'replied', 2, 1, 
        'Dạ máy của chị đã được kiểm tra kỹ và thay thế màng loa chống nước thành công vào hôm qua. Hiện tại nhân viên đã bàn giao và đóng gói gửi đi, dự kiến chiều nay shipper sẽ liên hệ giao lại máy cho chị ạ.', 
        now - datetime.timedelta(days=1)
    ))
    
    print("✓ Seeded 2 Customer Support Contacts (1 New, 1 Replied).")
    
    # Re-enable foreign key checks
    cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.commit()
    
    cursor.close()
    conn.close()
    
    print("\n==================================================")
    print("✓ DATABASE SEEDING COMPLETED SUCCESSFULLY!")
    print("==================================================")

except Exception as e:
    print(f"Error seeding database: {e}")
    sys.exit(1)
