CREATE TABLE IF NOT EXISTS `chatbot_knowledge` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `question` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Câu hỏi hoặc từ khóa',
  `answer` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Câu trả lời của chatbot',
  `type` enum('store_info','faq','policy') COLLATE utf8mb4_unicode_ci DEFAULT 'faq' COMMENT 'Loại thông tin',
  `is_active` tinyint(1) DEFAULT 1 COMMENT 'Trạng thái hiển thị',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `chatbot_knowledge` (`question`, `answer`, `type`) VALUES 
('Địa chỉ cửa hàng', 'Cửa hàng QuangHung Mobile nằm tại số 123 Đường ABC, Quận XYZ, TP.HCM.', 'store_info'),
('Giờ làm việc', 'Chúng tôi mở cửa từ 8:00 sáng đến 22:00 tối các ngày trong tuần, kể cả Thứ Bảy và Chủ Nhật.', 'store_info'),
('Chính sách bảo hành', 'Các sản phẩm điện thoại đều được bảo hành chính hãng 12 tháng. Phụ kiện bảo hành 6 tháng 1 đổi 1.', 'policy');
