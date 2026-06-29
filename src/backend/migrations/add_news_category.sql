-- Migration: Thêm các cột mới cho bảng tin_tuc
-- Chạy file này trong MySQL để cập nhật cấu trúc bảng

-- Kiểm tra và thêm cột loại tin (tin nổi bật, tin thường, tin khuyến mãi, v.v.)
ALTER TABLE tin_tuc 
ADD COLUMN IF NOT EXISTS loai_tin ENUM('noi_bat', 'thuong', 'khuyen_mai', 'su_kien', 'huong_dan', 'danh_gia') DEFAULT 'thuong';

-- Thêm cột mô tả ngắn (tóm tắt)
ALTER TABLE tin_tuc 
ADD COLUMN IF NOT EXISTS mo_ta_ngan VARCHAR(500) DEFAULT NULL;

-- Thêm cột thứ tự hiển thị (ưu tiên)
ALTER TABLE tin_tuc 
ADD COLUMN IF NOT EXISTS thu_tu INT DEFAULT 0;

-- Thêm cột lượt xem
ALTER TABLE tin_tuc 
ADD COLUMN IF NOT EXISTS luot_xem INT DEFAULT 0;

-- Thêm cột trạng thái (ẩn/hiện)
ALTER TABLE tin_tuc 
ADD COLUMN IF NOT EXISTS trang_thai ENUM('hien_thi', 'an', 'nhap') DEFAULT 'hien_thi';

-- Nếu MySQL không hỗ trợ IF NOT EXISTS cho ALTER, dùng các lệnh riêng lẻ:
-- Chạy từng lệnh và bỏ qua lỗi nếu cột đã tồn tại

/*
ALTER TABLE tin_tuc ADD COLUMN loai_tin ENUM('noi_bat', 'thuong', 'khuyen_mai', 'su_kien', 'huong_dan', 'danh_gia') DEFAULT 'thuong';
ALTER TABLE tin_tuc ADD COLUMN mo_ta_ngan VARCHAR(500) DEFAULT NULL;
ALTER TABLE tin_tuc ADD COLUMN thu_tu INT DEFAULT 0;
ALTER TABLE tin_tuc ADD COLUMN luot_xem INT DEFAULT 0;
ALTER TABLE tin_tuc ADD COLUMN trang_thai ENUM('hien_thi', 'an', 'nhap') DEFAULT 'hien_thi';
*/

-- Thêm index cho loại tin để tìm kiếm nhanh hơn
CREATE INDEX IF NOT EXISTS idx_loai_tin ON tin_tuc(loai_tin);
CREATE INDEX IF NOT EXISTS idx_trang_thai ON tin_tuc(trang_thai);

-- Cập nhật một số tin tức mẫu thành tin nổi bật
UPDATE tin_tuc SET loai_tin = 'noi_bat', thu_tu = 1 WHERE ma_tintuc IN (1, 2);
UPDATE tin_tuc SET loai_tin = 'khuyen_mai' WHERE ma_tintuc = 5;
