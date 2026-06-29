/**
 * Migration: bảng report review (báo cáo spam / vi phạm).
 */
const { pool } = require('../config/database');

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].c > 0;
}

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function ensureReportTable() {
  if (!(await tableExists('review_reports'))) {
    await pool.query(`
      CREATE TABLE review_reports (
        ma_rp INT NOT NULL AUTO_INCREMENT,
        ma_dg INT NOT NULL,
        ma_kh INT NOT NULL,
        ly_do VARCHAR(50) NOT NULL,
        mo_ta TEXT NULL,
        trang_thai VARCHAR(20) NOT NULL DEFAULT 'pending',
        ngay_bao_cao DATETIME DEFAULT CURRENT_TIMESTAMP,
        ngay_xu_ly DATETIME NULL,
        ma_admin_xu_ly INT NULL,
        PRIMARY KEY (ma_rp),
        KEY idx_rp_ma_dg (ma_dg),
        KEY idx_rp_status (trang_thai),
        CONSTRAINT fk_rp_review FOREIGN KEY (ma_dg) REFERENCES danh_gia(ma_dg) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
  // Cờ ẩn review (admin xử lý)
  if (!(await columnExists('danh_gia', 'is_hidden'))) {
    await pool.query(`ALTER TABLE danh_gia ADD COLUMN is_hidden TINYINT(1) NOT NULL DEFAULT 0`);
  }
  return true;
}

async function run() {
  try {
    await ensureReportTable();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ review_reports + danh_gia.is_hidden: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration create_review_reports failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureReportTable };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
