/**
 * Migration: tính năng "Đánh giá này hữu ích?" (helpful votes) cho mỗi review.
 *
 * - Bảng review_votes: mỗi user vote 1 lần / review (UNIQUE).
 * - Cột helpful_count trong danh_gia: cache count tổng (sync khi vote).
 * - Idempotent.
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

async function ensureReviewVotesTable() {
  if (!(await tableExists('review_votes'))) {
    await pool.query(`
      CREATE TABLE review_votes (
        ma_vote INT NOT NULL AUTO_INCREMENT,
        ma_dg INT NOT NULL,
        ma_kh INT NOT NULL,
        is_helpful TINYINT(1) NOT NULL DEFAULT 1,
        ngay_vote DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ma_vote),
        UNIQUE KEY uniq_vote (ma_dg, ma_kh),
        KEY idx_rv_ma_dg (ma_dg),
        CONSTRAINT fk_rv_review FOREIGN KEY (ma_dg) REFERENCES danh_gia(ma_dg) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
  if (!(await columnExists('danh_gia', 'helpful_count'))) {
    await pool.query(`ALTER TABLE danh_gia ADD COLUMN helpful_count INT NOT NULL DEFAULT 0`);
  }
  return true;
}

async function run() {
  try {
    await ensureReviewVotesTable();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ review_votes + danh_gia.helpful_count: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration create_review_votes failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureReviewVotesTable };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
