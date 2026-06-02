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
    console.log('🔄 Migration: email_log + khuyen_mai.ma_kh\n');

    // 1. Add ma_kh column to khuyen_mai (gán voucher tri ân cho 1 KH cụ thể)
    try {
      await pool.query(
        `ALTER TABLE khuyen_mai
         ADD COLUMN ma_kh INT NULL,
         ADD CONSTRAINT fk_khuyen_mai_ma_kh
           FOREIGN KEY (ma_kh) REFERENCES khach_hang(ma_kh) ON DELETE SET NULL`
      );
      console.log('✅ Added khuyen_mai.ma_kh column + FK');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || /Duplicate column/i.test(e.message)) {
        console.log('⚠️  khuyen_mai.ma_kh already exists');
      } else if (/Duplicate.*foreign key|errno 121/i.test(e.message)) {
        console.log('⚠️  FK fk_khuyen_mai_ma_kh already exists');
      } else {
        throw e;
      }
    }

    // 2. Create email_log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_log (
        ma_log INT AUTO_INCREMENT PRIMARY KEY,
        email_nhan VARCHAR(255) NOT NULL,
        loai_email ENUM('confirmation','status_update','marketing','voucher') NOT NULL,
        ma_kh INT NULL,
        ma_sp INT NULL,
        ma_don INT NULL,
        tieu_de VARCHAR(255) NOT NULL,
        trang_thai ENUM('sent','failed') DEFAULT 'sent',
        error_msg TEXT NULL,
        ngay_gui DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email_log_kh (ma_kh),
        INDEX idx_email_log_sp (ma_sp),
        INDEX idx_email_log_don (ma_don),
        INDEX idx_email_log_time (ngay_gui DESC),
        INDEX idx_email_log_loai (loai_email),
        CONSTRAINT fk_email_log_kh FOREIGN KEY (ma_kh) REFERENCES khach_hang(ma_kh) ON DELETE SET NULL,
        CONSTRAINT fk_email_log_sp FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE SET NULL,
        CONSTRAINT fk_email_log_don FOREIGN KEY (ma_don) REFERENCES don_hang(ma_don) ON DELETE SET NULL
      )
    `);
    console.log('✅ Created email_log table (or already exists)');

    console.log('\n✅ Migration completed successfully!\n');

    // Verify
    const [emailLogCols] = await pool.query('SHOW COLUMNS FROM email_log');
    console.log('📋 email_log columns:');
    emailLogCols.forEach(c => console.log(`   - ${c.Field} (${c.Type})`));

    const [kmCols] = await pool.query("SHOW COLUMNS FROM khuyen_mai LIKE 'ma_kh'");
    console.log('\n📋 khuyen_mai.ma_kh:', kmCols.length > 0 ? `${kmCols[0].Type} ${kmCols[0].Null === 'YES' ? '(nullable)' : '(NOT NULL)'}` : 'MISSING!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
