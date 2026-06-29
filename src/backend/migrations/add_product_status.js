/**
 * Migration: thêm cột trang_thai (3 mức) vào san_pham
 *
 * - Idempotent.
 * - Giá trị: 'active' (Còn hàng — default), 'out_of_stock' (Hết hàng), 'discontinued' (Ngừng kinh doanh).
 * - Backward-compat: sản phẩm cũ sẽ có giá trị 'active'.
 */
const { pool } = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function ensureProductStatusColumn() {
  if (!(await columnExists('san_pham', 'trang_thai'))) {
    await pool.query(
      `ALTER TABLE san_pham ADD COLUMN trang_thai VARCHAR(30) DEFAULT 'active'`
    );
    // Đảm bảo dữ liệu cũ có giá trị default
    await pool.query(
      `UPDATE san_pham SET trang_thai = 'active' WHERE trang_thai IS NULL`
    );
  }
  return true;
}

async function run() {
  try {
    await ensureProductStatusColumn();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ san_pham.trang_thai: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration add_product_status failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureProductStatusColumn };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
