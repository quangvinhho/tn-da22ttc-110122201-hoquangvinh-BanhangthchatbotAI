-- Thêm cột hinh_anh vào bảng lien_he để lưu ảnh đính kèm từ form liên hệ
-- Chạy lệnh này trong MySQL để cập nhật database

ALTER TABLE lien_he 
ADD COLUMN hinh_anh TEXT NULL COMMENT 'JSON array chứa đường dẫn các ảnh đính kèm' 
AFTER noi_dung;
