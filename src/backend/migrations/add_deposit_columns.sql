-- =====================================================
-- MIGRATION: Thêm cột hỗ trợ đặt cọc 50% cho đơn hàng lớn
-- Ngày: 2026-01-10
-- Mô tả: Thêm các cột để quản lý đơn hàng đặt cọc
-- =====================================================

USE QHUNG;

-- Kiểm tra và thêm cột loai_don (loại đơn: normal/deposit)
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'QHUNG' AND TABLE_NAME = 'don_hang' AND COLUMN_NAME = 'loai_don'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE don_hang ADD COLUMN loai_don ENUM(''normal'', ''deposit'') DEFAULT ''normal'' AFTER trang_thai',
  'SELECT ''Column loai_don already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Kiểm tra và thêm cột tien_dat_coc (số tiền đặt cọc)
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'QHUNG' AND TABLE_NAME = 'don_hang' AND COLUMN_NAME = 'tien_dat_coc'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE don_hang ADD COLUMN tien_dat_coc DECIMAL(14,2) DEFAULT 0 AFTER loai_don',
  'SELECT ''Column tien_dat_coc already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Kiểm tra và thêm cột tien_con_lai (số tiền còn lại cần thanh toán)
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'QHUNG' AND TABLE_NAME = 'don_hang' AND COLUMN_NAME = 'tien_con_lai'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE don_hang ADD COLUMN tien_con_lai DECIMAL(14,2) DEFAULT 0 AFTER tien_dat_coc',
  'SELECT ''Column tien_con_lai already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Kiểm tra và thêm cột trang_thai_coc (trạng thái đặt cọc)
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'QHUNG' AND TABLE_NAME = 'don_hang' AND COLUMN_NAME = 'trang_thai_coc'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE don_hang ADD COLUMN trang_thai_coc ENUM(''pending'', ''confirmed'', ''refunded'') DEFAULT NULL AFTER tien_con_lai',
  'SELECT ''Column trang_thai_coc already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Kiểm tra và thêm cột thoi_gian_xac_nhan_coc
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'QHUNG' AND TABLE_NAME = 'don_hang' AND COLUMN_NAME = 'thoi_gian_xac_nhan_coc'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE don_hang ADD COLUMN thoi_gian_xac_nhan_coc DATETIME DEFAULT NULL AFTER trang_thai_coc',
  'SELECT ''Column thoi_gian_xac_nhan_coc already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Kiểm tra và thêm cột ly_do_huy (lý do hủy đơn)
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'QHUNG' AND TABLE_NAME = 'don_hang' AND COLUMN_NAME = 'ly_do_huy'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE don_hang ADD COLUMN ly_do_huy TEXT DEFAULT NULL AFTER thoi_gian_xac_nhan_coc',
  'SELECT ''Column ly_do_huy already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Kiểm tra và thêm cột tien_hoan_lai (số tiền hoàn lại khi hủy)
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'QHUNG' AND TABLE_NAME = 'don_hang' AND COLUMN_NAME = 'tien_hoan_lai'
);
SET @sql = IF(@column_exists = 0, 
  'ALTER TABLE don_hang ADD COLUMN tien_hoan_lai DECIMAL(14,2) DEFAULT 0 AFTER ly_do_huy',
  'SELECT ''Column tien_hoan_lai already exists'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =====================================================
-- VERIFICATION: Kiểm tra các cột đã được thêm
-- =====================================================
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'QHUNG' AND TABLE_NAME = 'don_hang' 
AND COLUMN_NAME IN ('loai_don', 'tien_dat_coc', 'tien_con_lai', 'trang_thai_coc', 'thoi_gian_xac_nhan_coc', 'ly_do_huy', 'tien_hoan_lai')
ORDER BY ORDINAL_POSITION;

-- =====================================================
-- NOTE: Chạy migration này bằng lệnh:
-- mysql -u root -p QHUNG < migrations/add_deposit_columns.sql
-- =====================================================
