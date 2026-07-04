const { pool } = require('../config/database');

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SHOW COLUMNS FROM \`${table}\` WHERE Field = ?`,
    [column]
  );
  return rows.length > 0;
}

async function ensureOrderCodeColumn() {
  if (!(await columnExists('don_hang', 'order_code'))) {
    await pool.query(`ALTER TABLE don_hang ADD COLUMN order_code VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE don_hang ADD INDEX idx_order_code (order_code)`);
  }
  return true;
}

async function run() {
  try {
    await ensureOrderCodeColumn();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ don_hang: order_code column ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration add_order_code_column failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureOrderCodeColumn };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
