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
    console.log('🔄 Migration: ma_sp + reminder_sent_at + san_pham_yeu_thich\n');

    // 1. khuyen_mai.ma_sp (gán KM cho 1 SP cụ thể)
    try {
      await pool.query(
        `ALTER TABLE khuyen_mai
         ADD COLUMN ma_sp INT NULL,
         ADD CONSTRAINT fk_khuyen_mai_ma_sp
           FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE SET NULL`
      );
      console.log('✅ Added khuyen_mai.ma_sp column + FK');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || /Duplicate column/i.test(e.message)) {
        console.log('⚠️  khuyen_mai.ma_sp already exists');
      } else if (/Duplicate.*foreign key|errno 121/i.test(e.message)) {
        console.log('⚠️  FK fk_khuyen_mai_ma_sp already exists');
      } else {
        throw e;
      }
    }

    // 2. don_hang.reminder_sent_at (tránh gửi nhắc thanh toán nhiều lần)
    try {
      await pool.query(`ALTER TABLE don_hang ADD COLUMN reminder_sent_at DATETIME NULL`);
      console.log('✅ Added don_hang.reminder_sent_at column');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || /Duplicate column/i.test(e.message)) {
        console.log('⚠️  don_hang.reminder_sent_at already exists');
      } else {
        throw e;
      }
    }

    // 3. san_pham_yeu_thich table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS san_pham_yeu_thich (
        ma_yeu_thich INT AUTO_INCREMENT PRIMARY KEY,
        ma_kh INT NOT NULL,
        ma_sp INT NOT NULL,
        ngay_them DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_kh_sp (ma_kh, ma_sp),
        INDEX idx_yeuthich_sp (ma_sp),
        CONSTRAINT fk_yeuthich_kh FOREIGN KEY (ma_kh) REFERENCES khach_hang(ma_kh) ON DELETE CASCADE,
        CONSTRAINT fk_yeuthich_sp FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE CASCADE
      )
    `);
    console.log('✅ Created san_pham_yeu_thich table (or already exists)');

    console.log('\n✅ Migration completed successfully!\n');

    // Verify
    const [maspCol] = await pool.query("SHOW COLUMNS FROM khuyen_mai LIKE 'ma_sp'");
    console.log('📋 khuyen_mai.ma_sp:', maspCol.length > 0 ? `${maspCol[0].Type} (nullable=${maspCol[0].Null})` : 'MISSING!');

    const [remCol] = await pool.query("SHOW COLUMNS FROM don_hang LIKE 'reminder_sent_at'");
    console.log('📋 don_hang.reminder_sent_at:', remCol.length > 0 ? `${remCol[0].Type}` : 'MISSING!');

    const [ytCols] = await pool.query('SHOW COLUMNS FROM san_pham_yeu_thich');
    console.log('📋 san_pham_yeu_thich columns:');
    ytCols.forEach(c => console.log(`   - ${c.Field} (${c.Type})`));

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
