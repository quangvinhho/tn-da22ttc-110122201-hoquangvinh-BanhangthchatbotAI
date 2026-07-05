const { pool } = require('../config/database');

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].c > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.statistics 
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, indexName]
  );
  return rows[0].c > 0;
}

async function run() {
  try {
    console.log('🔄 Running migration: create_danh_sach_so_thich...');

    // 1. Create table danh_sach_so_thich
    if (!(await tableExists('danh_sach_so_thich'))) {
      await pool.query(`
        CREATE TABLE danh_sach_so_thich (
          ma_so_thich INT AUTO_INCREMENT PRIMARY KEY,
          ten_so_thich VARCHAR(100) NOT NULL,
          loai_so_thich VARCHAR(50) NOT NULL,
          icon_emoji VARCHAR(10) NULL,
          trang_thai TINYINT(1) DEFAULT 1,
          sap_xep INT DEFAULT 0,
          ngay_tao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ten_so_thich (ten_so_thich)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Created danh_sach_so_thich table');
    }

    // 2. Seed default preferences
    const [existingPrefs] = await pool.query('SELECT COUNT(*) AS c FROM danh_sach_so_thich');
    if (existingPrefs[0].c === 0) {
      const defaultPrefs = [
        ['Apple', 'Hãng', '🍎', 1, 0],
        ['Samsung', 'Hãng', '📱', 1, 1],
        ['Xiaomi', 'Hãng', '🔥', 1, 2],
        ['Oppo', 'Hãng', '✨', 1, 3],
        ['Vivo', 'Hãng', '📱', 1, 4],
        ['Chơi game', 'Nhu cầu', '🎮', 1, 5],
        ['Chụp ảnh', 'Nhu cầu', '📸', 1, 6],
        ['Pin trâu', 'Nhu cầu', '🔋', 1, 7],
        ['Dưới 10 triệu', 'Ngân sách', '💰', 1, 8]
      ];

      for (const pref of defaultPrefs) {
        await pool.query(
          `INSERT IGNORE INTO danh_sach_so_thich (ten_so_thich, loai_so_thich, icon_emoji, trang_thai, sap_xep)
           VALUES (?, ?, ?, ?, ?)`,
          pref
        );
      }
      console.log('✅ Seeded default preferences to danh_sach_so_thich');
    }

    // 3. Clean up duplicates in so_thich_khach_hang
    console.log('🔄 Cleaning up any duplicate user interests in so_thich_khach_hang...');
    await pool.query(`
      DELETE t1 FROM so_thich_khach_hang t1
      INNER JOIN so_thich_khach_hang t2 
        ON t1.ma_kh = t2.ma_kh 
        AND LOWER(t1.tu_khoa) = LOWER(t2.tu_khoa) 
        AND t1.ma_st_kh > t2.ma_st_kh
    `);
    console.log('✅ Cleaned up duplicates');

    // 4. Add UNIQUE index on (ma_kh, tu_khoa) in so_thich_khach_hang
    if (!(await indexExists('so_thich_khach_hang', 'uk_ma_kh_tu_khoa'))) {
      await pool.query(`
        ALTER TABLE so_thich_khach_hang 
        ADD UNIQUE KEY uk_ma_kh_tu_khoa (ma_kh, tu_khoa)
      `);
      console.log('✅ Added UNIQUE constraint uk_ma_kh_tu_khoa on so_thich_khach_hang');
    } else {
      console.log('⚠️  UNIQUE constraint uk_ma_kh_tu_khoa already exists');
    }

    console.log('✅ Migration create_danh_sach_so_thich completed successfully!');
    return true;
  } catch (e) {
    console.error('❌ Migration create_danh_sach_so_thich failed:', e && e.message);
    return false;
  }
}

module.exports = { run };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
