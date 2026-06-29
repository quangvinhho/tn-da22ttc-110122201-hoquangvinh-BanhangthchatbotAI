/**
 * Migration: Thêm các cột chi tiết cho nhân viên và cấu hình bảng face_embeddings
 */
const { pool } = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function run() {
  try {
    // 1. Thêm cột vào bảng nhan_vien
    const colsToAdd = [
      ['ngay_sinh', 'DATE NULL'],
      ['dia_chi', 'VARCHAR(255) NULL'],
      ['chuc_vu', 'VARCHAR(100) NULL'],
      ['ngay_vao_lam', 'DATE NULL'],
      ['cccd_truoc', 'LONGTEXT NULL'],
      ['cccd_sau', 'LONGTEXT NULL']
    ];

    for (const [col, type] of colsToAdd) {
      if (!(await columnExists('nhan_vien', col))) {
        await pool.query(`ALTER TABLE nhan_vien ADD COLUMN ${col} ${type}`);
        console.log(`   ✅ Thêm cột nhan_vien.${col}`);
      }
    }

    // 2. Tạo bảng face_embeddings nếu chưa tồn tại
    await pool.query(`
      CREATE TABLE IF NOT EXISTS face_embeddings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ma_tai_khoan INT NOT NULL UNIQUE,
        embedding MEDIUMBLOB NOT NULL,
        n_samples INT DEFAULT 1,
        ngay_cap_nhat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (ma_tai_khoan) REFERENCES nhan_vien(ma_nv) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Bảng face_embeddings đã liên kết thành công với nhan_vien(ma_nv)');

    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Migration add_employee_details: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration add_employee_details failed:', e && e.message);
    return false;
  }
}

module.exports = { run };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
