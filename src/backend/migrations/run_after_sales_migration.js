const mysql = require('mysql2/promise');

async function migrate() {
  const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'Vinh123456789@',
    database: 'QHUNG'
  });

  try {
    console.log('🔄 Bắt đầu chạy migrations cho hệ thống CRM & Hậu mãi...\n');

    // 1. Tạo bảng phieu_bao_hanh
    console.log('📦 Đang tạo bảng phieu_bao_hanh...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS phieu_bao_hanh (
        ma_pbh INT AUTO_INCREMENT PRIMARY KEY,
        ma_don INT NOT NULL,
        ma_sp INT NOT NULL,
        ma_kh INT,
        so_serial VARCHAR(100) NULL,
        so_imei VARCHAR(50) NULL,
        ngay_mua DATETIME NOT NULL,
        ngay_het_han DATETIME NOT NULL,
        thoi_han_bh INT DEFAULT 12 COMMENT 'Số tháng bảo hành',
        trang_thai ENUM('active', 'expired', 'voided') DEFAULT 'active',
        ghi_chu TEXT,
        FOREIGN KEY (ma_don) REFERENCES don_hang(ma_don) ON DELETE CASCADE,
        FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE RESTRICT,
        FOREIGN KEY (ma_kh) REFERENCES khach_hang(ma_kh) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Bảng phieu_bao_hanh đã sẵn sàng.');

    // 2. Tạo bảng yeu_cau_bao_hanh
    console.log('📦 Đang tạo bảng yeu_cau_bao_hanh...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS yeu_cau_bao_hanh (
        ma_ycbh INT AUTO_INCREMENT PRIMARY KEY,
        ma_pbh INT NOT NULL,
        ma_kh INT,
        mo_ta_loi TEXT NOT NULL,
        hinh_anh TEXT COMMENT 'JSON array URLs hoặc chuỗi phân cách',
        trang_thai ENUM('pending', 'received', 'diagnosing', 'repairing', 'completed', 'rejected') DEFAULT 'pending',
        ket_qua TEXT,
        ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
        ngay_hoan_thanh DATETIME NULL,
        nhan_vien_xu_ly INT NULL,
        FOREIGN KEY (ma_pbh) REFERENCES phieu_bao_hanh(ma_pbh) ON DELETE CASCADE,
        FOREIGN KEY (ma_kh) REFERENCES khach_hang(ma_kh) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Bảng yeu_cau_bao_hanh đã sẵn sàng.');

    // 3. Nâng cấp bảng khach_hang (Module 4)
    console.log('📦 Cập nhật bảng khach_hang để tích hợp tích điểm và hạng thành viên...');
    const customerColumns = [
      ['tong_diem', 'INT DEFAULT 0'],
      ['hang_thanh_vien', "ENUM('dong', 'bac', 'vang', 'kim_cuong') DEFAULT 'dong'"],
      ['tong_chi_tieu', 'DECIMAL(14,2) DEFAULT 0']
    ];
    for (const [col, type] of customerColumns) {
      try {
        await pool.query(`ALTER TABLE khach_hang ADD COLUMN ${col} ${type}`);
        console.log(`   ✅ Thêm cột khach_hang.${col}`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`   ⚠️ Cột khach_hang.${col} đã tồn tại.`);
        } else {
          throw e;
        }
      }
    }

    // 4. Tạo bảng diem_thuong (Module 4)
    console.log('📦 Đang tạo bảng diem_thuong...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS diem_thuong (
        ma_dt INT AUTO_INCREMENT PRIMARY KEY,
        ma_kh INT NOT NULL,
        so_diem INT NOT NULL,
        loai ENUM('earn', 'redeem', 'expire', 'bonus') NOT NULL,
        mo_ta VARCHAR(200),
        ma_don INT NULL,
        ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ma_kh) REFERENCES khach_hang(ma_kh) ON DELETE CASCADE,
        FOREIGN KEY (ma_don) REFERENCES don_hang(ma_don) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Bảng diem_thuong đã sẵn sàng.');

    // 5. Tạo bảng dang_ky_nhan_tin (Module 2)
    console.log('📦 Đang tạo bảng dang_ky_nhan_tin...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dang_ky_nhan_tin (
        ma_dknt INT AUTO_INCREMENT PRIMARY KEY,
        ma_kh INT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        ho_ten VARCHAR(100) NULL,
        trang_thai ENUM('active', 'unsubscribed') DEFAULT 'active',
        ngay_dang_ky DATETIME DEFAULT CURRENT_TIMESTAMP,
        ngay_huy DATETIME NULL,
        FOREIGN KEY (ma_kh) REFERENCES khach_hang(ma_kh) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Bảng dang_ky_nhan_tin đã sẵn sàng.');

    // 6. Tạo bảng chien_dich_email (Module 2)
    console.log('📦 Đang tạo bảng chien_dich_email...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chien_dich_email (
        ma_cd INT AUTO_INCREMENT PRIMARY KEY,
        tieu_de VARCHAR(200) NOT NULL,
        noi_dung TEXT NOT NULL,
        loai ENUM('san_pham_moi', 'khuyen_mai', 'thong_bao', 'cam_on') DEFAULT 'thong_bao',
        trang_thai ENUM('draft', 'sending', 'sent', 'failed') DEFAULT 'draft',
        so_nguoi_nhan INT DEFAULT 0,
        so_gui_thanh_cong INT DEFAULT 0,
        ma_admin INT NULL,
        ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
        ngay_gui DATETIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Bảng chien_dich_email đã sẵn sàng.');

    // 7. Tạo bảng yeu_cau_doi_tra (Module 6)
    console.log('📦 Đang tạo bảng yeu_cau_doi_tra...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS yeu_cau_doi_tra (
        ma_ycdt INT AUTO_INCREMENT PRIMARY KEY,
        ma_don INT NOT NULL,
        ma_kh INT,
        ma_sp INT NOT NULL,
        ly_do TEXT NOT NULL,
        loai ENUM('doi', 'tra', 'hoan_tien') NOT NULL,
        hinh_anh TEXT COMMENT 'JSON array URLs',
        trang_thai ENUM('pending', 'approved', 'processing', 'completed', 'rejected') DEFAULT 'pending',
        so_tien_hoan DECIMAL(12,2) DEFAULT 0,
        ghi_chu_admin TEXT,
        ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
        ngay_xu_ly DATETIME NULL,
        FOREIGN KEY (ma_don) REFERENCES don_hang(ma_don) ON DELETE CASCADE,
        FOREIGN KEY (ma_kh) REFERENCES khach_hang(ma_kh) ON DELETE SET NULL,
        FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Bảng yeu_cau_doi_tra đã sẵn sàng.');

    console.log('\n🚀 TẤT CẢ MIGRATIONS CRM & HẬU MÃI ĐÃ HOÀN THÀNH THÀNH CÔNG!\n');

  } catch (err) {
    console.error('❌ Lỗi chạy migration:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
