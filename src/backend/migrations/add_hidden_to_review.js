/**
 * Migration: thêm cột 'an' (ẩn/hiện) cho bảng danh_gia.
 * Cho phép admin ẩn đánh giá không phù hợp mà không cần xóa.
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
    if (!(await columnExists('danh_gia', 'an'))) {
      await pool.query(`ALTER TABLE danh_gia ADD COLUMN an TINYINT(1) DEFAULT 0`);
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ danh_gia.an column: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration add_hidden_to_review failed:', e && e.message);
    return false;
  }
}

module.exports = { run };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
