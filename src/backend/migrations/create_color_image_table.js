/**
 * Migration: bảng ảnh sản phẩm theo MÀU (mỗi màu có gallery riêng)
 * - Idempotent: CREATE TABLE IF NOT EXISTS.
 * - Khi không có ảnh theo màu, FE tự fallback ảnh đại diện sản phẩm.
 */
const { pool } = require('../config/database');

async function ensureColorImageTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hinh_anh_bien_the (
      ma_anh INT NOT NULL AUTO_INCREMENT,
      ma_sp INT NOT NULL,
      mau_sac VARCHAR(80) NOT NULL,
      duong_dan VARCHAR(255) NOT NULL,
      thu_tu INT DEFAULT 0,
      ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (ma_anh),
      KEY idx_habt_sp_mau (ma_sp, mau_sac),
      CONSTRAINT fk_habt_sp FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  return true;
}

async function run() {
  try {
    await ensureColorImageTable();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ hinh_anh_bien_the: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration create_color_image_table failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureColorImageTable };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
