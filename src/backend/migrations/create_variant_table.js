/**
 * Migration: bảng biến thể sản phẩm (màu × dung lượng × tồn kho riêng)
 *
 * - Idempotent: CREATE TABLE IF NOT EXISTS, không destructive.
 * - Backward-compat: san_pham.so_luong_ton vẫn giữ. Khi sản phẩm có ít nhất
 *   1 variant active, so_luong_ton được coi là "tổng" — code sẽ dùng
 *   bien_the_san_pham để giảm tồn kho theo từng variant.
 * - Sản phẩm CŨ chưa có variant: hoạt động y như cũ (fallback so_luong_ton).
 */
const { pool } = require('../config/database');

async function ensureVariantTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS bien_the_san_pham (
      ma_bt INT NOT NULL AUTO_INCREMENT,
      ma_sp INT NOT NULL,
      mau_sac VARCHAR(80) NOT NULL,
      mau_hex VARCHAR(20) DEFAULT NULL,
      dung_luong VARCHAR(40) NOT NULL,
      so_luong INT NOT NULL DEFAULT 0,
      gia_chenh DECIMAL(12,2) DEFAULT 0,
      sku VARCHAR(80) DEFAULT NULL,
      trang_thai VARCHAR(20) DEFAULT 'active',
      ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
      ngay_cap_nhat DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (ma_bt),
      UNIQUE KEY uniq_variant (ma_sp, mau_sac, dung_luong),
      KEY idx_ma_sp (ma_sp),
      CONSTRAINT fk_bt_sanpham FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `;
  await pool.query(sql);
  return true;
}

async function run() {
  try {
    await ensureVariantTable();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ bien_the_san_pham: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration bien_the_san_pham failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureVariantTable };

// Cho phép chạy trực tiếp: `node migrations/create_variant_table.js`
if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
