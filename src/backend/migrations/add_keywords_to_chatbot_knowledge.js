/**
 * Migration: thêm cột `keywords` vào chatbot_knowledge để tách trigger words khỏi title.
 * - Idempotent.
 * - Backfill: nếu cột mới rỗng, gán title làm keywords mặc định.
 * - Mục đích: admin có thể nhập danh sách từ khoá kích hoạt (vd "bảo hành, hết hạn, sửa chữa")
 *   tách biệt với title hiển thị, giúp matching trong chatbot.js chính xác hơn.
 */
const { pool } = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function ensureKeywordsColumn() {
  if (!(await columnExists('chatbot_knowledge', 'keywords'))) {
    await pool.query(
      `ALTER TABLE chatbot_knowledge
       ADD COLUMN keywords TEXT NULL COMMENT 'Danh sách từ khoá kích hoạt, phân cách bởi dấu phẩy'`
    );
    // Backfill từ title cho các bản ghi đã có
    await pool.query(
      `UPDATE chatbot_knowledge SET keywords = title WHERE keywords IS NULL OR keywords = ''`
    );
  }
  return true;
}

async function run() {
  try {
    await ensureKeywordsColumn();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ chatbot_knowledge: keywords column ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration add_keywords_to_chatbot_knowledge failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureKeywordsColumn };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
