/**
 * Migration: bảng settings cửa hàng (key-value).
 *  - Thay vì nhiều bảng config rời, dùng 1 bảng key-value cho tiện.
 *  - Insert các default settings nếu chưa có.
 */
const { pool } = require('../config/database');

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].c > 0;
}

const DEFAULT_SETTINGS = [
  ['shop_name',          'QuangHưng Mobile',           'Tên cửa hàng'],
  ['shop_hotline',       '1900.xxxx',                  'Hotline'],
  ['shop_email',         'lienhe@quanghungmobile.com', 'Email liên hệ'],
  ['shop_address',       'TP HCM',                     'Địa chỉ trụ sở'],
  ['shop_zalo',          '',                           'Số/URL Zalo OA'],
  ['shop_facebook',      '',                           'URL Facebook'],
  ['deposit_threshold',  '20000000',                   'Tổng tiền đơn ≥ X → yêu cầu đặt cọc'],
  ['deposit_percent',    '50',                         '% đặt cọc bắt buộc'],
  ['cod_max_amount',     '50000000',                   'Tối đa cho COD; trên ngưỡng yêu cầu chuyển khoản'],
  ['free_ship_min',      '500000',                     'Miễn phí ship từ X'],
  ['hide_stock',         '0',                          'Ẩn số lượng tồn kho khỏi khách (0/1)'],
  ['allow_guest_review', '0',                          'Cho phép guest review (0/1)']
];

async function ensureSettingsTable() {
  if (!(await tableExists('cau_hinh_shop'))) {
    await pool.query(`
      CREATE TABLE cau_hinh_shop (
        \`key\` VARCHAR(80) NOT NULL,
        value TEXT NULL,
        mo_ta VARCHAR(255) NULL,
        ngay_cap_nhat DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Seed default
    for (const [k, v, d] of DEFAULT_SETTINGS) {
      await pool.query(
        `INSERT INTO cau_hinh_shop (\`key\`, value, mo_ta) VALUES (?, ?, ?)`,
        [k, v, d]
      );
    }
  } else {
    // Bảng đã tồn tại → chỉ insert keys còn thiếu (idempotent)
    for (const [k, v, d] of DEFAULT_SETTINGS) {
      await pool.query(
        `INSERT IGNORE INTO cau_hinh_shop (\`key\`, value, mo_ta) VALUES (?, ?, ?)`,
        [k, v, d]
      );
    }
  }
  return true;
}

async function run() {
  try {
    await ensureSettingsTable();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ cau_hinh_shop: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration create_shop_settings failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureSettingsTable };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
