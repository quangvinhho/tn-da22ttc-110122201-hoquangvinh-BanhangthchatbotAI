/**
 * Migration: bảng câu hỏi sản phẩm (Q&A trên trang chi tiết SP).
 *  - KH đăng câu hỏi → admin/NV trả lời.
 *  - Có thể xếp hạng theo "helpful".
 */
const { pool } = require('../config/database');

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].c > 0;
}

async function ensureQATable() {
  if (!(await tableExists('cau_hoi_san_pham'))) {
    await pool.query(`
      CREATE TABLE cau_hoi_san_pham (
        ma_ch INT NOT NULL AUTO_INCREMENT,
        ma_sp INT NOT NULL,
        ma_kh INT NULL,
        ten_nguoi_hoi VARCHAR(100) NULL,
        cau_hoi TEXT NOT NULL,
        cau_tra_loi TEXT NULL,
        ma_admin_tra_loi INT NULL,
        ngay_hoi DATETIME DEFAULT CURRENT_TIMESTAMP,
        ngay_tra_loi DATETIME NULL,
        is_hidden TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (ma_ch),
        KEY idx_qa_sp (ma_sp),
        KEY idx_qa_kh (ma_kh),
        CONSTRAINT fk_qa_sp FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
  return true;
}

async function run() {
  try {
    await ensureQATable();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ cau_hoi_san_pham: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration create_qa_table failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureQATable };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
