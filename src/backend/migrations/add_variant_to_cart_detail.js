/**
 * Migration: thêm cột biến thể vào chi_tiet_gio_hang
 *
 * - Idempotent: chỉ thêm cột nếu chưa tồn tại (dùng SHOW COLUMNS).
 * - Backward-compat: ma_bt mặc định NULL → cart line cũ vẫn hợp lệ.
 *   Code mới đọc ma_bt để phân biệt biến thể; nếu NULL coi như sản phẩm
 *   không có biến thể (legacy path).
 */
const { pool } = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await pool.query(
    `SHOW INDEX FROM \`${table}\` WHERE Key_name = ?`,
    [indexName]
  );
  return rows.length > 0;
}

async function ensureCartVariantColumns() {
  if (!(await columnExists('chi_tiet_gio_hang', 'ma_bt'))) {
    await pool.query(
      `ALTER TABLE chi_tiet_gio_hang ADD COLUMN ma_bt INT NULL AFTER ma_sp`
    );
  }
  if (!(await columnExists('chi_tiet_gio_hang', 'mau_sac_chon'))) {
    await pool.query(
      `ALTER TABLE chi_tiet_gio_hang ADD COLUMN mau_sac_chon VARCHAR(80) NULL AFTER ma_bt`
    );
  }
  if (!(await columnExists('chi_tiet_gio_hang', 'dung_luong_chon'))) {
    await pool.query(
      `ALTER TABLE chi_tiet_gio_hang ADD COLUMN dung_luong_chon VARCHAR(40) NULL AFTER mau_sac_chon`
    );
  }
  if (!(await indexExists('chi_tiet_gio_hang', 'idx_ctgh_ma_bt'))) {
    await pool.query(
      `ALTER TABLE chi_tiet_gio_hang ADD INDEX idx_ctgh_ma_bt (ma_bt)`
    );
  }
  return true;
}

async function ensureOrderDetailVariantColumns() {
  if (!(await columnExists('chi_tiet_don_hang', 'ma_bt'))) {
    await pool.query(
      `ALTER TABLE chi_tiet_don_hang ADD COLUMN ma_bt INT NULL AFTER ma_sp`
    );
  }
  if (!(await columnExists('chi_tiet_don_hang', 'mau_sac_chon'))) {
    await pool.query(
      `ALTER TABLE chi_tiet_don_hang ADD COLUMN mau_sac_chon VARCHAR(80) NULL AFTER ma_bt`
    );
  }
  if (!(await columnExists('chi_tiet_don_hang', 'dung_luong_chon'))) {
    await pool.query(
      `ALTER TABLE chi_tiet_don_hang ADD COLUMN dung_luong_chon VARCHAR(40) NULL AFTER mau_sac_chon`
    );
  }
  if (!(await indexExists('chi_tiet_don_hang', 'idx_ctdh_ma_bt'))) {
    await pool.query(
      `ALTER TABLE chi_tiet_don_hang ADD INDEX idx_ctdh_ma_bt (ma_bt)`
    );
  }
  return true;
}

async function run() {
  try {
    await ensureCartVariantColumns();
    await ensureOrderDetailVariantColumns();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ chi_tiet_gio_hang + chi_tiet_don_hang: variant columns ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration add_variant_to_cart_detail failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureCartVariantColumns, ensureOrderDetailVariantColumns };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
