-- MySQL dump 10.13  Distrib 8.0.41, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: cuahangdienthoai
-- ------------------------------------------------------
-- Server version	8.0.41

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `chatroom`
--

DROP TABLE IF EXISTS `chatroom`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chatroom` (
  `MaRoom` int NOT NULL AUTO_INCREMENT,
  `MaKH` int NOT NULL,
  `MaQTV` int DEFAULT NULL,
  `NgayTao` datetime DEFAULT CURRENT_TIMESTAMP,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`MaRoom`),
  KEY `MaKH` (`MaKH`),
  KEY `MaQTV` (`MaQTV`),
  CONSTRAINT `chatroom_ibfk_1` FOREIGN KEY (`MaKH`) REFERENCES `khachhang` (`MaKH`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chatroom_ibfk_2` FOREIGN KEY (`MaQTV`) REFERENCES `quantrivien` (`MaQTV`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chatroom`
--

LOCK TABLES `chatroom` WRITE;
/*!40000 ALTER TABLE `chatroom` DISABLE KEYS */;
INSERT INTO `chatroom` VALUES (1,1,1,'2025-10-02 15:15:09','Mở'),(2,2,NULL,'2025-10-02 15:15:09','Mở');
/*!40000 ALTER TABLE `chatroom` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chitietdonhang`
--

DROP TABLE IF EXISTS `chitietdonhang`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chitietdonhang` (
  `MaCTDH` int NOT NULL AUTO_INCREMENT,
  `MaDH` int DEFAULT NULL,
  `MaSP` int DEFAULT NULL,
  `SoLuong` int NOT NULL,
  `Gia` decimal(12,2) NOT NULL,
  PRIMARY KEY (`MaCTDH`),
  KEY `MaDH` (`MaDH`),
  KEY `MaSP` (`MaSP`),
  CONSTRAINT `chitietdonhang_ibfk_1` FOREIGN KEY (`MaDH`) REFERENCES `donhang` (`MaDH`) ON DELETE CASCADE,
  CONSTRAINT `chitietdonhang_ibfk_2` FOREIGN KEY (`MaSP`) REFERENCES `sanpham` (`MaSP`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chitietdonhang`
--

LOCK TABLES `chitietdonhang` WRITE;
/*!40000 ALTER TABLE `chitietdonhang` DISABLE KEYS */;
INSERT INTO `chitietdonhang` VALUES (1,1,1,1,25000000.00),(2,2,2,1,20000000.00),(3,3,3,1,15000000.00),(4,4,4,1,35000000.00),(5,5,5,1,18000000.00);
/*!40000 ALTER TABLE `chitietdonhang` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chitietgiohang`
--

DROP TABLE IF EXISTS `chitietgiohang`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chitietgiohang` (
  `MaCTGH` int NOT NULL AUTO_INCREMENT,
  `MaGH` int NOT NULL,
  `MaSP` int NOT NULL,
  `SoLuong` int NOT NULL DEFAULT '1',
  `NgayThem` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`MaCTGH`),
  UNIQUE KEY `MaGH` (`MaGH`,`MaSP`),
  KEY `MaSP` (`MaSP`),
  CONSTRAINT `chitietgiohang_ibfk_1` FOREIGN KEY (`MaGH`) REFERENCES `giohang` (`MaGH`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chitietgiohang_ibfk_2` FOREIGN KEY (`MaSP`) REFERENCES `sanpham` (`MaSP`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chitietgiohang`
--

LOCK TABLES `chitietgiohang` WRITE;
/*!40000 ALTER TABLE `chitietgiohang` DISABLE KEYS */;
INSERT INTO `chitietgiohang` VALUES (1,1,3,1,'2025-10-02 15:15:08'),(2,2,1,2,'2025-10-02 15:15:08');
/*!40000 ALTER TABLE `chitietgiohang` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chitietsanpham`
--

DROP TABLE IF EXISTS `chitietsanpham`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chitietsanpham` (
  `MaCTSP` int NOT NULL AUTO_INCREMENT,
  `MaSP` int DEFAULT NULL,
  `ManHinh` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `HeDieuHanh` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Camera` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ChipXuLy` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `RAM` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ROM` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Pin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MauSac` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `TrongLuong` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`MaCTSP`),
  UNIQUE KEY `MaSP` (`MaSP`),
  CONSTRAINT `chitietsanpham_ibfk_1` FOREIGN KEY (`MaSP`) REFERENCES `sanpham` (`MaSP`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chitietsanpham`
--

LOCK TABLES `chitietsanpham` WRITE;
/*!40000 ALTER TABLE `chitietsanpham` DISABLE KEYS */;
INSERT INTO `chitietsanpham` VALUES (1,1,'6.1 inch','iOS 16','12MP','A15 Bionic','6GB','128GB','3279mAh','Đen','174g'),(2,2,'6.2 inch','Android 13','50MP','Snapdragon 8 Gen 2','8GB','256GB','3900mAh','Trắng','168g'),(3,3,'6.36 inch','Android 13','50MP','Snapdragon 8+','8GB','256GB','4500mAh','Đỏ','200g'),(4,4,'13.3 inch','Windows 11','Không','Intel i7','16GB','512GB','Li-ion','Bạc','1.2kg'),(5,5,'15.6 inch','Windows 11','Không','Intel i5','8GB','256GB','Li-ion','Đen','1.8kg');
/*!40000 ALTER TABLE `chitietsanpham` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `danhgia`
--

DROP TABLE IF EXISTS `danhgia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `danhgia` (
  `MaDG` int NOT NULL AUTO_INCREMENT,
  `MaKH` int DEFAULT NULL,
  `MaSP` int DEFAULT NULL,
  `NoiDung` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SoSao` tinyint DEFAULT NULL,
  `NgayDG` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`MaDG`),
  KEY `MaKH` (`MaKH`),
  KEY `MaSP` (`MaSP`),
  CONSTRAINT `danhgia_ibfk_1` FOREIGN KEY (`MaKH`) REFERENCES `khachhang` (`MaKH`) ON DELETE SET NULL,
  CONSTRAINT `danhgia_ibfk_2` FOREIGN KEY (`MaSP`) REFERENCES `sanpham` (`MaSP`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `danhgia`
--

LOCK TABLES `danhgia` WRITE;
/*!40000 ALTER TABLE `danhgia` DISABLE KEYS */;
INSERT INTO `danhgia` VALUES (1,1,1,'Rất tốt',5,'2025-10-10 09:44:55'),(2,2,2,'Hài lòng',4,'2025-10-10 09:44:55'),(3,3,3,'Tạm ổn',3,'2025-10-10 09:44:55'),(4,4,4,'Tuyệt vời',5,'2025-10-10 09:44:55'),(5,5,5,'Bình thường',3,'2025-10-10 09:44:55');
/*!40000 ALTER TABLE `danhgia` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `danhmuc`
--

DROP TABLE IF EXISTS `danhmuc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `danhmuc` (
  `MaDM` int NOT NULL AUTO_INCREMENT,
  `TenDM` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`MaDM`),
  UNIQUE KEY `TenDM` (`TenDM`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `danhmuc`
--

LOCK TABLES `danhmuc` WRITE;
/*!40000 ALTER TABLE `danhmuc` DISABLE KEYS */;
INSERT INTO `danhmuc` VALUES (1,'Điện thoại'),(2,'Laptop'),(4,'Phụ kiện'),(5,'Smartwatch'),(3,'Tablet');
/*!40000 ALTER TABLE `danhmuc` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `donhang`
--

DROP TABLE IF EXISTS `donhang`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `donhang` (
  `MaDH` int NOT NULL AUTO_INCREMENT,
  `MaKH` int DEFAULT NULL,
  `NgayDat` datetime DEFAULT CURRENT_TIMESTAMP,
  `TongTien` decimal(12,2) DEFAULT NULL,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Moi',
  `DiaChiGiaoHang` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `PhuongThucGiaoHang` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`MaDH`),
  KEY `MaKH` (`MaKH`),
  CONSTRAINT `donhang_ibfk_1` FOREIGN KEY (`MaKH`) REFERENCES `khachhang` (`MaKH`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `donhang`
--

LOCK TABLES `donhang` WRITE;
/*!40000 ALTER TABLE `donhang` DISABLE KEYS */;
INSERT INTO `donhang` VALUES (1,1,'2025-10-10 09:44:17',25000000.00,'Moi','Hà Nội','Giao hàng nhanh'),(2,2,'2025-10-10 09:44:17',20000000.00,'Moi','Hồ Chí Minh','Giao hàng tiêu chuẩn'),(3,3,'2025-10-10 09:44:17',15000000.00,'Moi','Đà Nẵng','Giao hàng nhanh'),(4,4,'2025-10-10 09:44:17',35000000.00,'Moi','Hải Phòng','Giao hàng tiêu chuẩn'),(5,5,'2025-10-10 09:44:17',18000000.00,'Moi','Cần Thơ','Giao hàng nhanh');
/*!40000 ALTER TABLE `donhang` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `giohang`
--

DROP TABLE IF EXISTS `giohang`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `giohang` (
  `MaGH` int NOT NULL AUTO_INCREMENT,
  `MaKH` int DEFAULT NULL,
  `MaSP` int DEFAULT NULL,
  `SoLuong` int NOT NULL,
  PRIMARY KEY (`MaGH`),
  KEY `MaKH` (`MaKH`),
  KEY `MaSP` (`MaSP`),
  CONSTRAINT `giohang_ibfk_1` FOREIGN KEY (`MaKH`) REFERENCES `khachhang` (`MaKH`) ON DELETE CASCADE,
  CONSTRAINT `giohang_ibfk_2` FOREIGN KEY (`MaSP`) REFERENCES `sanpham` (`MaSP`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `giohang`
--

LOCK TABLES `giohang` WRITE;
/*!40000 ALTER TABLE `giohang` DISABLE KEYS */;
INSERT INTO `giohang` VALUES (1,1,2,1),(2,2,3,2),(3,3,4,1),(4,4,5,1),(5,5,1,1);
/*!40000 ALTER TABLE `giohang` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hinhanhsanpham`
--

DROP TABLE IF EXISTS `hinhanhsanpham`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hinhanhsanpham` (
  `MaHA` int NOT NULL AUTO_INCREMENT,
  `MaSP` int DEFAULT NULL,
  `Url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`MaHA`),
  KEY `MaSP` (`MaSP`),
  CONSTRAINT `hinhanhsanpham_ibfk_1` FOREIGN KEY (`MaSP`) REFERENCES `sanpham` (`MaSP`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hinhanhsanpham`
--

LOCK TABLES `hinhanhsanpham` WRITE;
/*!40000 ALTER TABLE `hinhanhsanpham` DISABLE KEYS */;
INSERT INTO `hinhanhsanpham` VALUES (1,1,'iphone14_1.jpg'),(2,1,'iphone14_2.jpg'),(3,2,'galaxy_s23_1.jpg'),(4,2,'galaxy_s23_2.jpg'),(5,3,'xiaomi13_1.jpg');
/*!40000 ALTER TABLE `hinhanhsanpham` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hotro`
--

DROP TABLE IF EXISTS `hotro`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hotro` (
  `MaHT` int NOT NULL AUTO_INCREMENT,
  `MaKH` int DEFAULT NULL,
  `MaQTV` int DEFAULT NULL,
  `HoTen` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `Email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SDT` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ChuDe` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `NoiDung` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `PhanHoi` text COLLATE utf8mb4_unicode_ci,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Chua phan hoi',
  `KieuHoTro` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'LienHe',
  `NgayGui` datetime DEFAULT CURRENT_TIMESTAMP,
  `NgayPhanHoi` datetime DEFAULT NULL,
  PRIMARY KEY (`MaHT`),
  KEY `MaKH` (`MaKH`),
  KEY `MaQTV` (`MaQTV`),
  CONSTRAINT `hotro_ibfk_1` FOREIGN KEY (`MaKH`) REFERENCES `khachhang` (`MaKH`) ON DELETE SET NULL,
  CONSTRAINT `hotro_ibfk_2` FOREIGN KEY (`MaQTV`) REFERENCES `quantrivien` (`MaQTV`) ON DELETE SET NULL,
  CONSTRAINT `hotro_chk_1` CHECK ((`KieuHoTro` in (_utf8mb4'LienHe',_utf8mb4'Chat'))),
  CONSTRAINT `hotro_chk_2` CHECK (((`KieuHoTro` <> _utf8mb4'LienHe') or (`HoTen` is not null) or (`Email` is not null) or (`SDT` is not null)))
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hotro`
--

LOCK TABLES `hotro` WRITE;
/*!40000 ALTER TABLE `hotro` DISABLE KEYS */;
INSERT INTO `hotro` VALUES (1,1,NULL,'Nguyen Van A','a@gmail.com','0901000001','Hỏi về sản phẩm','Sản phẩm còn hàng không?',NULL,'Chua phan hoi','LienHe','2025-10-10 09:45:09',NULL),(2,2,NULL,'Tran Thi B','b@gmail.com','0901000002','Hỏi về đơn hàng','Khi nào giao hàng?',NULL,'Chua phan hoi','LienHe','2025-10-10 09:45:09',NULL),(3,3,NULL,'Le Van C','c@gmail.com','0901000003','Hỏi bảo hành','Bảo hành như thế nào?',NULL,'Chua phan hoi','LienHe','2025-10-10 09:45:09',NULL),(4,4,NULL,'Pham Thi D','d@gmail.com','0901000004','Hỏi thanh toán','Thanh toán bằng cách nào?',NULL,'Chua phan hoi','LienHe','2025-10-10 09:45:09',NULL),(5,5,NULL,'Hoang Van E','e@gmail.com','0901000005','Hỏi về khuyến mãi','Có khuyến mãi không?',NULL,'Chua phan hoi','LienHe','2025-10-10 09:45:09',NULL);
/*!40000 ALTER TABLE `hotro` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `khachhang`
--

DROP TABLE IF EXISTS `khachhang`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `khachhang` (
  `MaKH` int NOT NULL AUTO_INCREMENT,
  `HoTen` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `Email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `SDT` varchar(15) COLLATE utf8mb4_unicode_ci NOT NULL,
  `AnhDaiDien` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MatKhau` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `NgayDangKy` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`MaKH`),
  UNIQUE KEY `Email` (`Email`),
  UNIQUE KEY `SDT` (`SDT`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `khachhang`
--

LOCK TABLES `khachhang` WRITE;
/*!40000 ALTER TABLE `khachhang` DISABLE KEYS */;
INSERT INTO `khachhang` VALUES (1,'Nguyen Van A','a@gmail.com','0901000001','avatar1.jpg','123456','2025-10-10 09:43:27'),(2,'Tran Thi B','b@gmail.com','0901000002','avatar2.jpg','123456','2025-10-10 09:43:27'),(3,'Le Van C','c@gmail.com','0901000003','avatar3.jpg','123456','2025-10-10 09:43:27'),(4,'Pham Thi D','d@gmail.com','0901000004','avatar4.jpg','123456','2025-10-10 09:43:27'),(5,'Hoang Van E','e@gmail.com','0901000005','avatar5.jpg','123456','2025-10-10 09:43:27');
/*!40000 ALTER TABLE `khachhang` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `khoiphucmatkhau`
--

DROP TABLE IF EXISTS `khoiphucmatkhau`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `khoiphucmatkhau` (
  `MaKhoiPhuc` int NOT NULL AUTO_INCREMENT,
  `MaKH` int NOT NULL,
  `TokenKhoiPhuc` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `NgayTao` datetime DEFAULT CURRENT_TIMESTAMP,
  `NgayHetHan` datetime DEFAULT NULL,
  PRIMARY KEY (`MaKhoiPhuc`),
  UNIQUE KEY `TokenKhoiPhuc` (`TokenKhoiPhuc`),
  KEY `MaKH` (`MaKH`),
  CONSTRAINT `khoiphucmatkhau_ibfk_1` FOREIGN KEY (`MaKH`) REFERENCES `khachhang` (`MaKH`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `khoiphucmatkhau`
--

LOCK TABLES `khoiphucmatkhau` WRITE;
/*!40000 ALTER TABLE `khoiphucmatkhau` DISABLE KEYS */;
/*!40000 ALTER TABLE `khoiphucmatkhau` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `khuyenmai`
--

DROP TABLE IF EXISTS `khuyenmai`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `khuyenmai` (
  `MaKM` int NOT NULL AUTO_INCREMENT,
  `TieuDe` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `NoiDung` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `PhanTramGiam` int DEFAULT NULL,
  `NgayBatDau` datetime DEFAULT NULL,
  `NgayKetThuc` datetime DEFAULT NULL,
  `MaSP` int DEFAULT NULL,
  `MaQTV` int DEFAULT NULL,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Con hieu luc',
  PRIMARY KEY (`MaKM`),
  KEY `MaSP` (`MaSP`),
  KEY `MaQTV` (`MaQTV`),
  CONSTRAINT `khuyenmai_ibfk_1` FOREIGN KEY (`MaSP`) REFERENCES `sanpham` (`MaSP`) ON DELETE SET NULL,
  CONSTRAINT `khuyenmai_ibfk_2` FOREIGN KEY (`MaQTV`) REFERENCES `quantrivien` (`MaQTV`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `khuyenmai`
--

LOCK TABLES `khuyenmai` WRITE;
/*!40000 ALTER TABLE `khuyenmai` DISABLE KEYS */;
INSERT INTO `khuyenmai` VALUES (1,'Giảm giá iPhone','Giảm 5% iPhone 14',5,'2025-10-10 00:00:00','2025-10-20 00:00:00',1,1,'Con hieu luc'),(2,'Giảm giá Samsung','Giảm 7% Galaxy S23',7,'2025-10-05 00:00:00','2025-10-25 00:00:00',2,2,'Con hieu luc'),(3,'Giảm giá Xiaomi','Giảm 10% Xiaomi 13',10,'2025-10-01 00:00:00','2025-10-31 00:00:00',3,3,'Con hieu luc'),(4,'Giảm giá Dell','Giảm 8% Dell XPS',8,'2025-10-10 00:00:00','2025-10-30 00:00:00',4,4,'Con hieu luc'),(5,'Giảm giá HP','Giảm 6% HP Pavilion',6,'2025-10-12 00:00:00','2025-10-22 00:00:00',5,5,'Con hieu luc');
/*!40000 ALTER TABLE `khuyenmai` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `lichsuchat`
--

DROP TABLE IF EXISTS `lichsuchat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lichsuchat` (
  `MaChat` int NOT NULL AUTO_INCREMENT,
  `MaHT` int NOT NULL,
  `NguoiGui` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `NoiDung` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `ThoiGian` datetime DEFAULT CURRENT_TIMESTAMP,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Da gui',
  PRIMARY KEY (`MaChat`),
  KEY `MaHT` (`MaHT`),
  CONSTRAINT `lichsuchat_ibfk_1` FOREIGN KEY (`MaHT`) REFERENCES `hotro` (`MaHT`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lichsuchat`
--

LOCK TABLES `lichsuchat` WRITE;
/*!40000 ALTER TABLE `lichsuchat` DISABLE KEYS */;
INSERT INTO `lichsuchat` VALUES (1,1,'KhachHang','Xin chào, sản phẩm còn không?','2025-10-10 09:45:17','Da gui'),(2,1,'QuanTriVien','Vẫn còn hàng ạ!','2025-10-10 09:45:17','Da gui'),(3,2,'KhachHang','Khi nào giao hàng?','2025-10-10 09:45:17','Da gui'),(4,2,'QuanTriVien','Ngày mai sẽ giao','2025-10-10 09:45:17','Da gui'),(5,3,'KhachHang','Bảo hành sản phẩm như thế nào?','2025-10-10 09:45:17','Da gui');
/*!40000 ALTER TABLE `lichsuchat` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quangcao`
--

DROP TABLE IF EXISTS `quangcao`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quangcao` (
  `MaQC` int NOT NULL AUTO_INCREMENT,
  `TieuDe` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `NoiDung` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `HinhAnh` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `LienKet` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ViTri` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `UuTien` int DEFAULT '0',
  `NgayBatDau` datetime DEFAULT NULL,
  `NgayKetThuc` datetime DEFAULT NULL,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Hien thi',
  `MaQTV` int DEFAULT NULL,
  `MaSP` int DEFAULT NULL,
  `MaKM` int DEFAULT NULL,
  `MaHT` int DEFAULT NULL,
  `SoLanHienThi` int DEFAULT '0',
  `SoLanClick` int DEFAULT '0',
  PRIMARY KEY (`MaQC`),
  KEY `MaQTV` (`MaQTV`),
  KEY `MaSP` (`MaSP`),
  KEY `MaKM` (`MaKM`),
  KEY `MaHT` (`MaHT`),
  CONSTRAINT `quangcao_ibfk_1` FOREIGN KEY (`MaQTV`) REFERENCES `quantrivien` (`MaQTV`) ON DELETE SET NULL,
  CONSTRAINT `quangcao_ibfk_2` FOREIGN KEY (`MaSP`) REFERENCES `sanpham` (`MaSP`) ON DELETE SET NULL,
  CONSTRAINT `quangcao_ibfk_3` FOREIGN KEY (`MaKM`) REFERENCES `khuyenmai` (`MaKM`) ON DELETE SET NULL,
  CONSTRAINT `quangcao_ibfk_4` FOREIGN KEY (`MaHT`) REFERENCES `hotro` (`MaHT`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quangcao`
--

LOCK TABLES `quangcao` WRITE;
/*!40000 ALTER TABLE `quangcao` DISABLE KEYS */;
INSERT INTO `quangcao` VALUES (1,'Quảng cáo iPhone','iPhone giảm giá','qc1.jpg','/iphone','Trang chủ',0,NULL,NULL,'Hien thi',1,1,1,NULL,0,0),(2,'Quảng cáo Samsung','Galaxy S23 ưu đãi','qc2.jpg','/samsung','Trang chủ',0,NULL,NULL,'Hien thi',2,2,2,NULL,0,0),(3,'Quảng cáo Xiaomi','Xiaomi sale','qc3.jpg','/xiaomi','Trang chủ',0,NULL,NULL,'Hien thi',3,3,3,NULL,0,0),(4,'Quảng cáo Dell','Dell XPS mới','qc4.jpg','/dell','Trang chủ',0,NULL,NULL,'Hien thi',4,4,4,NULL,0,0),(5,'Quảng cáo HP','HP Pavilion sale','qc5.jpg','/hp','Trang chủ',0,NULL,NULL,'Hien thi',5,5,5,NULL,0,0);
/*!40000 ALTER TABLE `quangcao` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `quantrivien`
--

DROP TABLE IF EXISTS `quantrivien`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quantrivien` (
  `MaQTV` int NOT NULL AUTO_INCREMENT,
  `HoTen` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MatKhau` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `AnhDaiDien` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `NgayTao` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`MaQTV`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `quantrivien`
--

LOCK TABLES `quantrivien` WRITE;
/*!40000 ALTER TABLE `quantrivien` DISABLE KEYS */;
INSERT INTO `quantrivien` VALUES (1,'Admin A','admin123','admin1.jpg','2025-10-10 09:43:35'),(2,'Admin B','admin123','admin2.jpg','2025-10-10 09:43:35'),(3,'Admin C','admin123','admin3.jpg','2025-10-10 09:43:35'),(4,'Admin D','admin123','admin4.jpg','2025-10-10 09:43:35'),(5,'Admin E','admin123','admin5.jpg','2025-10-10 09:43:35');
/*!40000 ALTER TABLE `quantrivien` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sanpham`
--

DROP TABLE IF EXISTS `sanpham`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sanpham` (
  `MaSP` int NOT NULL AUTO_INCREMENT,
  `TenSP` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `Gia` decimal(12,2) NOT NULL,
  `SoLuong` int NOT NULL DEFAULT '0',
  `MoTa` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Con ban',
  `MaDM` int DEFAULT NULL,
  `MaTH` int DEFAULT NULL,
  PRIMARY KEY (`MaSP`),
  KEY `MaDM` (`MaDM`),
  KEY `MaTH` (`MaTH`),
  CONSTRAINT `sanpham_ibfk_1` FOREIGN KEY (`MaDM`) REFERENCES `danhmuc` (`MaDM`) ON DELETE SET NULL,
  CONSTRAINT `sanpham_ibfk_2` FOREIGN KEY (`MaTH`) REFERENCES `thuonghieu` (`MaTH`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sanpham`
--

LOCK TABLES `sanpham` WRITE;
/*!40000 ALTER TABLE `sanpham` DISABLE KEYS */;
INSERT INTO `sanpham` VALUES (1,'iPhone 14',25000000.00,10,'Smartphone cao cấp','Con ban',1,1),(2,'Galaxy S23',20000000.00,15,'Smartphone Android','Con ban',1,2),(3,'Xiaomi 13',15000000.00,20,'Điện thoại giá tốt','Con ban',1,3),(4,'Dell XPS 13',35000000.00,5,'Laptop siêu mỏng','Con ban',2,4),(5,'HP Pavilion',18000000.00,8,'Laptop phổ thông','Con ban',2,5);
/*!40000 ALTER TABLE `sanpham` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thanhtoan`
--

DROP TABLE IF EXISTS `thanhtoan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `thanhtoan` (
  `MaTT` int NOT NULL AUTO_INCREMENT,
  `MaDH` int DEFAULT NULL,
  `PhuongThuc` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `SoTien` decimal(12,2) DEFAULT NULL,
  `NgayThanhToan` datetime DEFAULT CURRENT_TIMESTAMP,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Da thanh toan',
  PRIMARY KEY (`MaTT`),
  KEY `MaDH` (`MaDH`),
  CONSTRAINT `thanhtoan_ibfk_1` FOREIGN KEY (`MaDH`) REFERENCES `donhang` (`MaDH`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thanhtoan`
--

LOCK TABLES `thanhtoan` WRITE;
/*!40000 ALTER TABLE `thanhtoan` DISABLE KEYS */;
INSERT INTO `thanhtoan` VALUES (1,1,'Tiền mặt',25000000.00,'2025-10-10 09:44:33','Da thanh toan'),(2,2,'Chuyển khoản',20000000.00,'2025-10-10 09:44:33','Da thanh toan'),(3,3,'Tiền mặt',15000000.00,'2025-10-10 09:44:33','Da thanh toan'),(4,4,'Chuyển khoản',35000000.00,'2025-10-10 09:44:33','Da thanh toan'),(5,5,'Tiền mặt',18000000.00,'2025-10-10 09:44:33','Da thanh toan');
/*!40000 ALTER TABLE `thanhtoan` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thanhtoantamthoi`
--

DROP TABLE IF EXISTS `thanhtoantamthoi`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `thanhtoantamthoi` (
  `MaTTTam` int NOT NULL AUTO_INCREMENT,
  `MaKH` int DEFAULT NULL,
  `MaDH` int DEFAULT NULL,
  `SoTien` decimal(12,2) DEFAULT NULL,
  `PhuongThuc` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `NgayTao` datetime DEFAULT CURRENT_TIMESTAMP,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Cho xac nhan',
  PRIMARY KEY (`MaTTTam`),
  KEY `MaKH` (`MaKH`),
  KEY `MaDH` (`MaDH`),
  CONSTRAINT `thanhtoantamthoi_ibfk_1` FOREIGN KEY (`MaKH`) REFERENCES `khachhang` (`MaKH`) ON DELETE SET NULL,
  CONSTRAINT `thanhtoantamthoi_ibfk_2` FOREIGN KEY (`MaDH`) REFERENCES `donhang` (`MaDH`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thanhtoantamthoi`
--

LOCK TABLES `thanhtoantamthoi` WRITE;
/*!40000 ALTER TABLE `thanhtoantamthoi` DISABLE KEYS */;
INSERT INTO `thanhtoantamthoi` VALUES (1,1,NULL,25000000.00,'Tiền mặt','2025-10-10 09:44:42','Cho xac nhan'),(2,2,NULL,20000000.00,'Chuyển khoản','2025-10-10 09:44:42','Cho xac nhan'),(3,3,NULL,15000000.00,'Tiền mặt','2025-10-10 09:44:42','Cho xac nhan'),(4,4,NULL,35000000.00,'Chuyển khoản','2025-10-10 09:44:42','Cho xac nhan'),(5,5,NULL,18000000.00,'Tiền mặt','2025-10-10 09:44:42','Cho xac nhan');
/*!40000 ALTER TABLE `thanhtoantamthoi` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thongke`
--

DROP TABLE IF EXISTS `thongke`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `thongke` (
  `MaTK` int NOT NULL AUTO_INCREMENT,
  `NgayTK` date DEFAULT NULL,
  `TongDoanhThu` decimal(14,2) DEFAULT NULL,
  `TongDonHang` int DEFAULT NULL,
  `MaQTV` int DEFAULT NULL,
  PRIMARY KEY (`MaTK`),
  KEY `MaQTV` (`MaQTV`),
  CONSTRAINT `thongke_ibfk_1` FOREIGN KEY (`MaQTV`) REFERENCES `quantrivien` (`MaQTV`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thongke`
--

LOCK TABLES `thongke` WRITE;
/*!40000 ALTER TABLE `thongke` DISABLE KEYS */;
INSERT INTO `thongke` VALUES (1,'2025-10-10',113000000.00,5,1),(2,'2025-10-09',50000000.00,2,2),(3,'2025-10-08',35000000.00,1,3),(4,'2025-10-07',70000000.00,2,4),(5,'2025-10-06',18000000.00,1,5);
/*!40000 ALTER TABLE `thongke` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `thuonghieu`
--

DROP TABLE IF EXISTS `thuonghieu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `thuonghieu` (
  `MaTH` int NOT NULL AUTO_INCREMENT,
  `TenTH` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`MaTH`),
  UNIQUE KEY `TenTH` (`TenTH`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `thuonghieu`
--

LOCK TABLES `thuonghieu` WRITE;
/*!40000 ALTER TABLE `thuonghieu` DISABLE KEYS */;
INSERT INTO `thuonghieu` VALUES (1,'Apple'),(4,'Dell'),(5,'HP'),(2,'Samsung'),(3,'Xiaomi');
/*!40000 ALTER TABLE `thuonghieu` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tinnhan`
--

DROP TABLE IF EXISTS `tinnhan`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tinnhan` (
  `MaTN` int NOT NULL AUTO_INCREMENT,
  `MaRoom` int NOT NULL,
  `NguoiGui` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `NoiDung` text COLLATE utf8mb4_unicode_ci,
  `ThoiGian` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`MaTN`),
  KEY `MaRoom` (`MaRoom`),
  CONSTRAINT `tinnhan_ibfk_1` FOREIGN KEY (`MaRoom`) REFERENCES `chatroom` (`MaRoom`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tinnhan`
--

LOCK TABLES `tinnhan` WRITE;
/*!40000 ALTER TABLE `tinnhan` DISABLE KEYS */;
INSERT INTO `tinnhan` VALUES (1,1,'KH','Xin chào, tôi muốn hỏi về iPhone 15 Pro','2025-10-02 15:15:09'),(2,1,'QTV','Chào bạn, sản phẩm này đang có hàng.','2025-10-02 15:15:09');
/*!40000 ALTER TABLE `tinnhan` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tintuc`
--

DROP TABLE IF EXISTS `tintuc`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tintuc` (
  `MaTTuc` int NOT NULL AUTO_INCREMENT,
  `TieuDe` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `NoiDung` text COLLATE utf8mb4_unicode_ci,
  `AnhDaiDien` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `NgayDang` datetime DEFAULT CURRENT_TIMESTAMP,
  `TacGia` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MaQTV` int DEFAULT NULL,
  `TrangThai` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'Hien thi',
  PRIMARY KEY (`MaTTuc`),
  KEY `MaQTV` (`MaQTV`),
  CONSTRAINT `tintuc_ibfk_1` FOREIGN KEY (`MaQTV`) REFERENCES `quantrivien` (`MaQTV`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tintuc`
--

LOCK TABLES `tintuc` WRITE;
/*!40000 ALTER TABLE `tintuc` DISABLE KEYS */;
INSERT INTO `tintuc` VALUES (1,'Khuyến mãi tháng 10','Giảm giá 10% tất cả sản phẩm',NULL,'2025-10-10 09:45:26','Admin A',1,'Hien thi'),(2,'Mở bán iPhone 15','Apple ra mắt iPhone 15',NULL,'2025-10-10 09:45:26','Admin B',2,'Hien thi'),(3,'Sản phẩm mới Samsung','Galaxy S23 series',NULL,'2025-10-10 09:45:26','Admin C',3,'Hien thi'),(4,'Laptop Dell mới','Dell XPS 13 2025',NULL,'2025-10-10 09:45:26','Admin D',4,'Hien thi'),(5,'Khuyến mãi cuối năm','Giảm giá 20%',NULL,'2025-10-10 09:45:26','Admin E',5,'Hien thi');
/*!40000 ALTER TABLE `tintuc` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

--
-- Table structure for table `bao_hanh_san_pham`
--

DROP TABLE IF EXISTS `bao_hanh_san_pham`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bao_hanh_san_pham` (
  `ma_sp` int NOT NULL,
  `thoi_gian_bh` int NOT NULL DEFAULT '12',
  `dieu_kien` text,
  PRIMARY KEY (`ma_sp`),
  CONSTRAINT `fk_warranty_product_init` FOREIGN KEY (`ma_sp`) REFERENCES `sanpham` (`MaSP`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bao_hanh_san_pham`
--

LOCK TABLES `bao_hanh_san_pham` WRITE;
/*!40000 ALTER TABLE `bao_hanh_san_pham` DISABLE KEYS */;
INSERT INTO `bao_hanh_san_pham` VALUES 
(1,12,'Bảo hành chính hãng 12 tháng tại trung tâm bảo hành hãng. Hỗ trợ lỗi 1 đổi 1 trong 30 ngày đầu tiên đối với lỗi phần cứng từ nhà sản xuất.'),
(2,12,'Bảo hành chính hãng 12 tháng tại trung tâm bảo hành hãng. Hỗ trợ lỗi 1 đổi 1 trong 30 ngày đầu tiên đối với lỗi phần cứng từ nhà sản xuất.'),
(3,12,'Bảo hành chính hãng 12 tháng tại trung tâm bảo hành hãng. Hỗ trợ lỗi 1 đổi 1 trong 30 ngày đầu tiên đối với lỗi phần cứng từ nhà sản xuất.'),
(4,12,'Bảo hành chính hãng 12 tháng tại trung tâm bảo hành ủy quyền của hãng. Hỗ trợ thay thế linh kiện phần cứng lỗi do NSX hoàn toàn miễn phí.'),
(5,12,'Bảo hành chính hãng 12 tháng tại trung tâm bảo hành ủy quyền của hãng. Hỗ trợ thay thế linh kiện phần cứng lỗi do NSX hoàn toàn miễn phí.');
/*!40000 ALTER TABLE `bao_hanh_san_pham` ENABLE KEYS */;
UNLOCK TABLES;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-22 11:27:21
