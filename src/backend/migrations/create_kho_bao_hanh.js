const { pool } = require('../config/database');

async function ensureKhoBaoHanhTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS kho_bao_hanh (
      ma_kbh INT AUTO_INCREMENT PRIMARY KEY,
      ma_sp INT NOT NULL,
      ma_bt INT NULL,
      imei VARCHAR(50) NULL,
      nguon_goc ENUM('warranty', 'return', 'manual') NOT NULL,
      ma_nguon INT NULL COMMENT 'ID của yeu_cau_bao_hanh hoặc yeu_cau_doi_tra',
      trang_thai ENUM('cho_xu_ly', 'gui_hang', 'ra_linh_kien', 'luu_kho', 'da_tra_khach') DEFAULT 'cho_xu_ly',
      ngay_nhap DATETIME DEFAULT CURRENT_TIMESTAMP,
      ngay_cap_nhat DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      ghi_chu TEXT,
      CONSTRAINT fk_kbh_sanpham FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE CASCADE,
      CONSTRAINT fk_kbh_variant FOREIGN KEY (ma_bt) REFERENCES bien_the_san_pham(ma_bt) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await pool.query(sql);
  return true;
}

async function run() {
  try {
    await ensureKhoBaoHanhTable();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ kho_bao_hanh: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration kho_bao_hanh failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureKhoBaoHanhTable };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
