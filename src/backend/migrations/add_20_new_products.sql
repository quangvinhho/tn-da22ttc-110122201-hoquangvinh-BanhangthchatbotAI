-- =====================================================
-- THÊM 20 SẢN PHẨM ĐIỆN THOẠI MỚI TRÊN THỊ TRƯỜNG 2025-2026
-- Giá tầm trung (5 - 15 triệu VNĐ)
-- =====================================================

USE QHUNG;

-- Thêm thêm hãng sản xuất nếu chưa có
INSERT IGNORE INTO hang_san_xuat (ten_hang, ma_quoc_gia) VALUES
('Google', 2),          -- Mỹ
('Motorola', 2),        -- Mỹ  
('Tecno', 5),           -- Trung Quốc
('Infinix', 5),         -- Trung Quốc
('Honor', 5);           -- Trung Quốc

-- Lấy mã hãng sản xuất
SET @ma_apple = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Apple' LIMIT 1);
SET @ma_samsung = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Samsung' LIMIT 1);
SET @ma_xiaomi = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Xiaomi' LIMIT 1);
SET @ma_oppo = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Oppo' LIMIT 1);
SET @ma_vivo = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Vivo' LIMIT 1);
SET @ma_realme = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Realme' LIMIT 1);
SET @ma_google = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Google' LIMIT 1);
SET @ma_motorola = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Motorola' LIMIT 1);
SET @ma_tecno = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Tecno' LIMIT 1);
SET @ma_infinix = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Infinix' LIMIT 1);
SET @ma_honor = (SELECT ma_hang FROM hang_san_xuat WHERE ten_hang = 'Honor' LIMIT 1);

-- =====================================================
-- THÊM 20 SẢN PHẨM MỚI
-- =====================================================

INSERT INTO san_pham (ten_sp, ma_hang, gia, so_luong_ton, mo_ta, mau_sac, bo_nho, anh_dai_dien) VALUES
-- 1. Samsung Galaxy A36 5G
('Samsung Galaxy A36 5G', @ma_samsung, 8990000, 35, 
'Samsung Galaxy A36 5G - Smartphone tầm trung mạnh mẽ với chip Exynos 1380, màn hình Super AMOLED 120Hz, camera 50MP OIS. Thiết kế hiện đại với khung kim loại, chống nước IP67.',
'Xanh Navy', '128GB', 'samsung_galaxy_a36_5g.avif'),

-- 2. Samsung Galaxy A56 5G
('Samsung Galaxy A56 5G', @ma_samsung, 10990000, 28,
'Samsung Galaxy A56 5G - Flagship killer với Exynos 1480, màn hình Dynamic AMOLED 2X 120Hz, camera 50MP OIS, pin 5000mAh, sạc nhanh 45W. Thiết kế premium với kính cường lực.',
'Tím Lavender', '256GB', 'A56.avif'),

-- 3. Oppo Reno 13 5G
('Oppo Reno 13 5G', @ma_oppo, 12490000, 22,
'Oppo Reno 13 5G - Điện thoại AI thông minh với chip Dimensity 8350, camera Sony 50MP có AI Photo Enhancer. Thiết kế siêu mỏng, chống nước IP65, sạc siêu nhanh 80W.',
'Xanh Sapphire', '256GB', 'oppo_reno_13_f_4g_256gb.avif'),

-- 4. Oppo Reno 13F 4G
('Oppo Reno 13F 4G', @ma_oppo, 7990000, 40,
'Oppo Reno 13F 4G - Smartphone chụp ảnh đẹp với camera 64MP, màn hình AMOLED 120Hz, pin 5000mAh, sạc nhanh 45W. Thiết kế mỏng nhẹ thời trang.',
'Xanh Lá', '256GB', 'oppo-reno.avif'),

-- 5. Xiaomi Redmi Note 14 Pro 5G
('Xiaomi Redmi Note 14 Pro 5G', @ma_xiaomi, 8490000, 45,
'Xiaomi Redmi Note 14 Pro 5G - Hiệu năng vượt trội với Snapdragon 7s Gen 3, camera 200MP OIS, màn hình AMOLED 120Hz, pin 5500mAh, sạc 67W. Giá cực kỳ hợp lý.',
'Đen Midnight', '256GB', 'Xiaomi.avif'),

-- 6. Xiaomi Redmi Note 14 Pro+ 5G
('Xiaomi Redmi Note 14 Pro+ 5G', @ma_xiaomi, 10990000, 30,
'Xiaomi Redmi Note 14 Pro+ 5G - Flagship tầm trung với Dimensity 7300 Ultra, camera 200MP Light Fusion, màn hình 1.5K AMOLED, pin 5110mAh, sạc 120W siêu nhanh.',
'Xanh Aurora', '512GB', 'Xiaomi.avif'),

-- 7. Vivo V40 5G
('Vivo V40 5G', @ma_vivo, 12990000, 20,
'Vivo V40 5G - Chuyên gia chân dung với camera ZEISS 50MP, Aura Light Portrait. Màn hình AMOLED cong 120Hz, chip Snapdragon 7 Gen 3, pin 5500mAh.',
'Tím Phantom', '256GB', 'v25.jpg'),

-- 8. Vivo V40 Lite 5G
('Vivo V40 Lite 5G', @ma_vivo, 8990000, 32,
'Vivo V40 Lite 5G - Selfie đỉnh cao với camera trước 50MP, AI Beauty Mode. Màn hình AMOLED 120Hz, chip Snapdragon 6 Gen 1, thiết kế siêu mỏng.',
'Vàng Champagne', '256GB', 'v25.jpg'),

-- 9. Realme 13 Pro+ 5G
('Realme 13 Pro+ 5G', @ma_realme, 11990000, 25,
'Realme 13 Pro+ 5G - Camera flagship với cảm biến Sony LYT-701 50MP, zoom quang 3x. Snapdragon 7s Gen 2, màn hình ProXDR 120Hz, sạc 80W.',
'Xanh Monet', '256GB', 'rn13.jpg'),

-- 10. Realme 13 5G
('Realme 13 5G', @ma_realme, 6990000, 50,
'Realme 13 5G - Hiệu năng gaming với Dimensity 6300, màn hình 120Hz, camera 108MP, pin 5000mAh. Thiết kế trẻ trung năng động.',
'Xám Speed', '128GB', 'rn13.jpg'),

-- 11. Google Pixel 8a
('Google Pixel 8a', @ma_google, 11990000, 18,
'Google Pixel 8a - Trải nghiệm AI thuần túy với chip Tensor G3, camera Pixel 64MP Magic Eraser, 7 năm cập nhật Android. Thiết kế đặc trưng Google.',
'Bay Blue', '128GB', 'pixel-9-pro.avif'),

-- 12. Honor 200 5G
('Honor 200 5G', @ma_honor, 10990000, 24,
'Honor 200 5G - Chân dung điện ảnh với camera Portrait Mode AI, chip Snapdragon 7 Gen 3, màn hình OLED 120Hz, thiết kế siêu mỏng 7.7mm.',
'Xanh Emerald', '256GB', 'pixel-9-pro.avif'),

-- 13. Honor Magic6 Lite 5G
('Honor Magic6 Lite 5G', @ma_honor, 8490000, 30,
'Honor Magic6 Lite 5G - Pin khủng 5300mAh, màn hình AMOLED 120Hz chống rung mắt, camera 108MP, chip Snapdragon 6 Gen 1. Thiết kế nhẹ nhàng.',
'Đen Titanium', '256GB', 'pixel-9-pro.avif'),

-- 14. Tecno Spark 30 Pro 5G
('Tecno Spark 30 Pro 5G', @ma_tecno, 5990000, 55,
'Tecno Spark 30 Pro 5G - Gaming entry với Dimensity 6300, màn hình 120Hz, camera 108MP, pin 5000mAh, sạc 33W. Giá cực kỳ phải chăng.',
'Đen Orbit', '256GB', 'TECNO.avif'),

-- 15. Tecno Camon 30 Pro 5G
('Tecno Camon 30 Pro 5G', @ma_tecno, 8990000, 28,
'Tecno Camon 30 Pro 5G - Camera 50MP Sony IMX890, quay video 4K, màn hình AMOLED 120Hz, chip Dimensity 7020, thiết kế cao cấp kính 2 mặt.',
'Xanh Azure', '256GB', 'TECNO.avif'),

-- 16. Infinix Note 40 Pro 5G
('Infinix Note 40 Pro 5G', @ma_infinix, 6490000, 42,
'Infinix Note 40 Pro 5G - Sạc không dây 20W, sạc nhanh 100W, màn hình 3D curved AMOLED, camera 108MP, chip Dimensity 7020. Tính năng flagship giá rẻ.',
'Titan Gold', '256GB', 'TECNO.avif'),

-- 17. Motorola Edge 50 Fusion
('Motorola Edge 50 Fusion', @ma_motorola, 9990000, 20,
'Motorola Edge 50 Fusion - Màn hình pOLED 144Hz, camera 50MP OIS, chip Snapdragon 7s Gen 2, thiết kế siêu mỏng, Android gần stock.',
'Xanh Forest', '256GB', 'pixel-9-pro.avif'),

-- 18. Motorola Moto G85 5G
('Motorola Moto G85 5G', @ma_motorola, 7490000, 35,
'Motorola Moto G85 5G - Màn hình pOLED 120Hz không viền cong, Snapdragon 6s Gen 3, camera 50MP OIS, loa stereo Dolby Atmos.',
'Xám Urban', '256GB', 'pixel-9-pro.avif'),

-- 19. Samsung Galaxy M55 5G
('Samsung Galaxy M55 5G', @ma_samsung, 9490000, 30,
'Samsung Galaxy M55 5G - Hiệu năng gaming với Snapdragon 7 Gen 1, màn hình Super AMOLED 120Hz, camera 50MP OIS, pin 5000mAh, sạc 45W.',
'Xanh Mint', '256GB', 'samsung_galaxy_s24_fe_5g.avif'),

-- 20. Samsung Galaxy S24 FE 5G
('Samsung Galaxy S24 FE 5G', @ma_samsung, 14990000, 22,
'Samsung Galaxy S24 FE 5G - Flagship Fan Edition với Exynos 2400e, camera 50MP 3x zoom, màn hình Dynamic AMOLED 2X 120Hz, Galaxy AI, One UI 6.1.',
'Xanh Graphite', '256GB', 'samsung_galaxy_s24_fe_5g.avif');

-- =====================================================
-- LẤY MÃ SẢN PHẨM VỪA THÊM VÀ THÊM CẤU HÌNH
-- =====================================================

-- Lấy ID sản phẩm đầu tiên trong 20 sản phẩm mới
SET @start_id = (SELECT ma_sp FROM san_pham WHERE ten_sp = 'Samsung Galaxy A36 5G' LIMIT 1);

-- Thêm cấu hình cho 20 sản phẩm
INSERT INTO cau_hinh (ma_sp, ram, chip, pin, man_hinh, camera, he_dieu_hanh) VALUES
-- 1. Samsung Galaxy A36 5G
(@start_id, '8GB', 'Exynos 1380', '5000mAh', '6.6" Super AMOLED 120Hz', '50MP OIS + 8MP + 5MP', 'Android 15 One UI 7'),
-- 2. Samsung Galaxy A56 5G
(@start_id + 1, '8GB', 'Exynos 1480', '5000mAh', '6.7" Dynamic AMOLED 2X 120Hz', '50MP OIS + 12MP + 5MP', 'Android 15 One UI 7'),
-- 3. Oppo Reno 13 5G  
(@start_id + 2, '12GB', 'Dimensity 8350', '5600mAh', '6.59" AMOLED 120Hz', '50MP Sony + 8MP', 'Android 15 ColorOS 15'),
-- 4. Oppo Reno 13F 4G
(@start_id + 3, '8GB', 'MediaTek Helio G100', '5000mAh', '6.67" AMOLED 120Hz', '64MP + 8MP + 2MP', 'Android 14 ColorOS 14'),
-- 5. Xiaomi Redmi Note 14 Pro 5G
(@start_id + 4, '8GB', 'Snapdragon 7s Gen 3', '5500mAh', '6.67" AMOLED 120Hz', '200MP OIS + 8MP + 2MP', 'Android 14 HyperOS 2'),
-- 6. Xiaomi Redmi Note 14 Pro+ 5G
(@start_id + 5, '12GB', 'Dimensity 7300 Ultra', '5110mAh', '6.67" 1.5K AMOLED 120Hz', '200MP Light Fusion + 8MP + 2MP', 'Android 14 HyperOS 2'),
-- 7. Vivo V40 5G
(@start_id + 6, '12GB', 'Snapdragon 7 Gen 3', '5500mAh', '6.78" AMOLED Curved 120Hz', '50MP ZEISS OIS + 50MP', 'Android 14 Funtouch OS 14'),
-- 8. Vivo V40 Lite 5G
(@start_id + 7, '8GB', 'Snapdragon 6 Gen 1', '5000mAh', '6.67" AMOLED 120Hz', '50MP + 8MP', 'Android 14 Funtouch OS 14'),
-- 9. Realme 13 Pro+ 5G
(@start_id + 8, '12GB', 'Snapdragon 7s Gen 2', '5200mAh', '6.7" ProXDR AMOLED 120Hz', '50MP Sony LYT-701 OIS + 8MP + 50MP Tele', 'Android 14 Realme UI 5'),
-- 10. Realme 13 5G
(@start_id + 9, '8GB', 'Dimensity 6300', '5000mAh', '6.72" IPS LCD 120Hz', '108MP + 2MP', 'Android 14 Realme UI 5'),
-- 11. Google Pixel 8a
(@start_id + 10, '8GB', 'Google Tensor G3', '4492mAh', '6.1" OLED 120Hz', '64MP OIS + 13MP', 'Android 14 Stock'),
-- 12. Honor 200 5G
(@start_id + 11, '12GB', 'Snapdragon 7 Gen 3', '5200mAh', '6.7" OLED Curved 120Hz', '50MP OIS + 50MP + 12MP', 'Android 14 MagicOS 8'),
-- 13. Honor Magic6 Lite 5G
(@start_id + 12, '8GB', 'Snapdragon 6 Gen 1', '5300mAh', '6.78" AMOLED 120Hz', '108MP + 5MP + 2MP', 'Android 14 MagicOS 8'),
-- 14. Tecno Spark 30 Pro 5G
(@start_id + 13, '8GB', 'Dimensity 6300', '5000mAh', '6.78" IPS LCD 120Hz', '108MP + 2MP', 'Android 14 HiOS 14'),
-- 15. Tecno Camon 30 Pro 5G
(@start_id + 14, '12GB', 'Dimensity 7020', '5000mAh', '6.78" AMOLED 120Hz', '50MP Sony IMX890 OIS + 50MP', 'Android 14 HiOS 14'),
-- 16. Infinix Note 40 Pro 5G
(@start_id + 15, '8GB', 'Dimensity 7020', '4600mAh', '6.78" 3D Curved AMOLED 120Hz', '108MP + 2MP', 'Android 14 XOS 14'),
-- 17. Motorola Edge 50 Fusion
(@start_id + 16, '12GB', 'Snapdragon 7s Gen 2', '5000mAh', '6.7" pOLED 144Hz', '50MP OIS + 13MP', 'Android 14'),
-- 18. Motorola Moto G85 5G
(@start_id + 17, '12GB', 'Snapdragon 6s Gen 3', '5000mAh', '6.67" pOLED 120Hz', '50MP OIS + 8MP', 'Android 14'),
-- 19. Samsung Galaxy M55 5G
(@start_id + 18, '8GB', 'Snapdragon 7 Gen 1', '5000mAh', '6.7" Super AMOLED 120Hz', '50MP OIS + 8MP + 2MP', 'Android 14 One UI 6'),
-- 20. Samsung Galaxy S24 FE 5G
(@start_id + 19, '8GB', 'Exynos 2400e', '4700mAh', '6.7" Dynamic AMOLED 2X 120Hz', '50MP OIS 3x Zoom + 12MP + 8MP', 'Android 14 One UI 6.1');

-- =====================================================
-- THÊM ẢNH PHỤ CHO SẢN PHẨM
-- =====================================================

INSERT INTO anh_san_pham (ma_sp, duong_dan) VALUES
(@start_id, 'samsung_galaxy_a36_5g.avif'),
(@start_id, 'samsung_galaxy_a36_5g_2.avif'),
(@start_id + 1, 'A56.avif'),
(@start_id + 1, 'A56_2.avif'),
(@start_id + 2, 'oppo_reno_13_f_4g_256gb.avif'),
(@start_id + 2, 'oppo-reno.avif'),
(@start_id + 3, 'oppo-reno.avif'),
(@start_id + 3, 'reno-xanh.avif'),
(@start_id + 4, 'Xiaomi.avif'),
(@start_id + 4, 'Xiaomi_2.avif'),
(@start_id + 5, 'Xiaomi.avif'),
(@start_id + 6, 'v25.jpg'),
(@start_id + 7, 'v25.jpg'),
(@start_id + 8, 'rn13.jpg'),
(@start_id + 9, 'rn13.jpg'),
(@start_id + 10, 'pixel-9-pro.avif'),
(@start_id + 11, 'pixel-9-pro.avif'),
(@start_id + 12, 'pixel-9-pro.avif'),
(@start_id + 13, 'TECNO.avif'),
(@start_id + 14, 'TECNO.avif'),
(@start_id + 15, 'TECNO.avif'),
(@start_id + 16, 'pixel-9-pro.avif'),
(@start_id + 17, 'pixel-9-pro.avif'),
(@start_id + 18, 'samsung_galaxy_s24_fe_5g.avif'),
(@start_id + 19, 'samsung_galaxy_s24_fe_5g.avif');

-- =====================================================
-- KIỂM TRA KẾT QUẢ
-- =====================================================
SELECT 'Đã thêm thành công 20 sản phẩm mới!' AS ket_qua;
SELECT ma_sp, ten_sp, gia, mau_sac, bo_nho FROM san_pham ORDER BY ma_sp DESC LIMIT 20;
