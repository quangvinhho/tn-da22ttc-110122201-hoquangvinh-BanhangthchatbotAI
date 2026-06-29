/**
 * Migration: gán đơn hàng cho nhân viên xử lý + ghi chú nội bộ.
 */
const { pool } = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function ensureAssignmentColumns() {
  if (!(await columnExists('don_hang', 'ma_nv_xu_ly'))) {
    await pool.query(`ALTER TABLE don_hang ADD COLUMN ma_nv_xu_ly INT NULL`);
  }
  if (!(await columnExists('don_hang', 'ngay_gan_nv'))) {
    await pool.query(`ALTER TABLE don_hang ADD COLUMN ngay_gan_nv DATETIME NULL`);
  }
  if (!(await columnExists('don_hang', 'ghi_chu_noi_bo'))) {
    await pool.query(`ALTER TABLE don_hang ADD COLUMN ghi_chu_noi_bo TEXT NULL`);
  }
  return true;
}

async function run() {
  try {
    await ensureAssignmentColumns();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ don_hang: assignment columns ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration add_order_assignment failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureAssignmentColumns };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
