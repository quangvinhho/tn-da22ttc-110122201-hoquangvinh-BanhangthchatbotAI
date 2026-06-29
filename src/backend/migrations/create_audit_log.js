/**
 * Migration: audit log cho hành động admin/nhân viên.
 *  - Lưu ai, action, đối tượng, IP, user-agent, payload tóm tắt.
 */
const { pool } = require('../config/database');

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].c > 0;
}

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function ensureAuditTable() {
  if (!(await tableExists('lich_su_admin'))) {
    await pool.query(`
      CREATE TABLE lich_su_admin (
        ma_log BIGINT NOT NULL AUTO_INCREMENT,
        ma_admin INT NULL,
        ho_ten VARCHAR(100) NULL,
        vai_tro VARCHAR(30) NULL,
        action VARCHAR(80) NOT NULL,
        doi_tuong VARCHAR(50) NULL,
        doi_tuong_id VARCHAR(50) NULL,
        method VARCHAR(10) NULL,
        path VARCHAR(255) NULL,
        ip VARCHAR(64) NULL,
        user_agent VARCHAR(255) NULL,
        chi_tiet TEXT NULL,
        thoi_gian DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ma_log),
        KEY idx_la_admin (ma_admin),
        KEY idx_la_time (thoi_gian),
        KEY idx_la_action (action)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  // Track last login + IP cho nhan_vien / admin
  for (const tbl of ['nhan_vien', 'admin']) {
    try {
      const [exists] = await pool.query(
        `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tbl]
      );
      if (exists[0].c === 0) continue;
      if (!(await columnExists(tbl, 'last_login_at'))) {
        await pool.query(`ALTER TABLE \`${tbl}\` ADD COLUMN last_login_at DATETIME NULL`);
      }
      if (!(await columnExists(tbl, 'last_login_ip'))) {
        await pool.query(`ALTER TABLE \`${tbl}\` ADD COLUMN last_login_ip VARCHAR(64) NULL`);
      }
    } catch (_) { /* table không tồn tại trong dự án → bỏ qua */ }
  }

  return true;
}

async function run() {
  try {
    await ensureAuditTable();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ lich_su_admin + last_login columns: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration create_audit_log failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureAuditTable };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
