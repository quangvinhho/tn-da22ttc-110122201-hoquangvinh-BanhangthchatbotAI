const { pool } = require('./backend/config/database');

async function createTable() {
    try {
        console.log('Creating table lich_su_xem_san_pham...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS lich_su_xem_san_pham (
                ma_kh INT NOT NULL,
                ma_sp INT NOT NULL,
                so_lan_xem INT DEFAULT 1,
                ngay_cap_nhat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (ma_kh, ma_sp),
                CONSTRAINT fk_xem_khachhang FOREIGN KEY (ma_kh) REFERENCES khach_hang (ma_kh) ON DELETE CASCADE,
                CONSTRAINT fk_xem_sanpham FOREIGN KEY (ma_sp) REFERENCES san_pham (ma_sp) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ Table lich_su_xem_san_pham created successfully!');
    } catch (e) {
        console.error('❌ Error creating table:', e);
    } finally {
        process.exit(0);
    }
}
createTable();
