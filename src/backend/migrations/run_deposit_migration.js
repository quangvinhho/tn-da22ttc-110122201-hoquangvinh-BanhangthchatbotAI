const mysql = require('mysql2/promise');

async function migrate() {
  const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'Vinh123456789@',
    database: 'QHUNG'
  });

  try {
    console.log('🔄 Adding deposit columns to don_hang table...\n');

    const columns = [
      ['loai_don', "ENUM('normal', 'deposit') DEFAULT 'normal'"],
      ['tien_dat_coc', 'DECIMAL(14,2) DEFAULT 0'],
      ['tien_con_lai', 'DECIMAL(14,2) DEFAULT 0'],
      ['trang_thai_coc', "ENUM('pending', 'confirmed', 'refunded') DEFAULT NULL"],
      ['thoi_gian_xac_nhan_coc', 'DATETIME DEFAULT NULL'],
      ['ly_do_huy', 'TEXT DEFAULT NULL'],
      ['tien_hoan_lai', 'DECIMAL(14,2) DEFAULT 0']
    ];

    for (const [col, type] of columns) {
      try {
        await pool.query(`ALTER TABLE don_hang ADD COLUMN ${col} ${type}`);
        console.log(`✅ Added: ${col}`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`⚠️ Already exists: ${col}`);
        } else {
          throw e;
        }
      }
    }

    console.log('\n✅ Migration completed successfully!\n');

    // Verify columns
    const [cols] = await pool.query('SHOW COLUMNS FROM don_hang');
    console.log('📋 Current columns in don_hang:');
    cols.forEach(c => console.log(`   - ${c.Field} (${c.Type})`));

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
