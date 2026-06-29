/**
 * Migration: thêm cột `context_state` vào bảng `cuoc_hoi_thoai` để lưu trạng thái hội thoại.
 * - Idempotent.
 */
const { pool } = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function ensureContextStateColumn() {
  if (!(await columnExists('cuoc_hoi_thoai', 'context_state'))) {
    await pool.query(
      `ALTER TABLE cuoc_hoi_thoai
       ADD COLUMN context_state TEXT NULL COMMENT 'Lưu trữ JSON trạng thái hội thoại (ngân sách, hãng máy, sản phẩm giới thiệu...)'`
    );
  }
  return true;
}

async function run() {
  try {
    await ensureContextStateColumn();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ cuoc_hoi_thoai: context_state column ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration add_context_state_to_conversation failed:', e && e.message);
    return false;
  }
}

module.exports = { run };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
