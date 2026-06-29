/**
 * Migration: thêm cột phản hồi của shop cho mỗi review.
 * - Idempotent.
 * - Backward-compat: NULL nếu shop chưa trả lời → frontend chỉ hiện khi có.
 */
const { pool } = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function ensureReplyColumns() {
  if (!(await columnExists('danh_gia', 'phan_hoi_shop'))) {
    await pool.query(`ALTER TABLE danh_gia ADD COLUMN phan_hoi_shop TEXT NULL`);
  }
  if (!(await columnExists('danh_gia', 'ngay_phan_hoi'))) {
    await pool.query(`ALTER TABLE danh_gia ADD COLUMN ngay_phan_hoi DATETIME NULL`);
  }
  return true;
}

async function run() {
  try {
    await ensureReplyColumns();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ danh_gia: shop reply columns ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration add_shop_reply_to_review failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureReplyColumns };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
