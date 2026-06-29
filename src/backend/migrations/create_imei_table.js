const { pool } = require('../config/database');

async function run() {
    try {
        console.log('🔄 Creating imei_san_pham table...');
        
        const sql = `
            CREATE TABLE IF NOT EXISTS imei_san_pham (
              ma_imei INT AUTO_INCREMENT PRIMARY KEY,
              ma_sp INT NOT NULL,
              ma_bt INT NULL,
              imei VARCHAR(50) UNIQUE NOT NULL,
              trang_thai ENUM('in_stock', 'sold', 'reserved', 'returned') DEFAULT 'in_stock',
              ma_ct_don INT NULL,
              ngay_nhap TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              ngay_ban TIMESTAMP NULL,
              FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE CASCADE,
              FOREIGN KEY (ma_bt) REFERENCES bien_the_san_pham(ma_bt) ON DELETE SET NULL,
              FOREIGN KEY (ma_ct_don) REFERENCES chi_tiet_don_hang(ma_ct_don) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;
        await pool.query(sql);
        console.log('✅ Bảng imei_san_pham đã sẵn sàng.');

        // Seeding some dummy IMEIs for existing variants in the database
        const [variants] = await pool.query('SELECT ma_sp, ma_bt, mau_sac, dung_luong FROM bien_the_san_pham LIMIT 10');
        if (variants.length > 0) {
            console.log('📦 Seeding some test IMEIs for existing variants...');
            for (let i = 0; i < variants.length; i++) {
                const v = variants[i];
                for (let j = 1; j <= 5; j++) {
                    const imeiNum = `356789123${v.ma_sp}${v.ma_bt || 0}${j}`.padEnd(15, '0');
                    try {
                        await pool.query(
                            'INSERT INTO imei_san_pham (ma_sp, ma_bt, imei, trang_thai) VALUES (?, ?, ?, "in_stock")',
                            [v.ma_sp, v.ma_bt, imeiNum]
                        );
                    } catch (e) {
                        // Ignore duplicate entries
                        if (e.code !== 'ER_DUP_ENTRY') {
                            console.error('Error seeding IMEI:', e.message);
                        }
                    }
                }
            }
            console.log('✅ Seeding completed.');
        }

        return true;
    } catch (e) {
        console.error('❌ Migration create_imei_table failed:', e.message);
        return false;
    }
}

module.exports = { run };

if (require.main === module) {
    run().then(ok => process.exit(ok ? 0 : 1));
}
