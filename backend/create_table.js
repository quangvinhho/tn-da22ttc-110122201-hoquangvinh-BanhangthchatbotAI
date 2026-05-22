const { pool } = require('./config/database');

async function createTable() {
    try {
        const query = `
            CREATE TABLE IF NOT EXISTS nhan_vien (
                ma_nv INT AUTO_INCREMENT PRIMARY KEY,
                tai_khoan VARCHAR(50) UNIQUE NOT NULL,
                mat_khau VARCHAR(255) NOT NULL,
                ho_ten VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                so_dt VARCHAR(20),
                luong_co_ban DECIMAL(15, 2) DEFAULT 0,
                trang_thai VARCHAR(20) DEFAULT 'hoat_dong',
                quyen VARCHAR(20) DEFAULT 'nhanvien',
                ngay_tao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;
        await pool.query(query);
        console.log('Table nhan_vien created successfully');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

createTable();
