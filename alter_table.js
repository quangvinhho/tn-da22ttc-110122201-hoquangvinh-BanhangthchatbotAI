const { pool } = require('./backend/config/database');

async function alterTable() {
    try {
        await pool.query('ALTER TABLE nhan_vien ADD COLUMN so_dt VARCHAR(20)');
        await pool.query('ALTER TABLE nhan_vien ADD COLUMN luong_co_ban DECIMAL(15, 2) DEFAULT 0');
        await pool.query('ALTER TABLE nhan_vien ADD COLUMN quyen VARCHAR(20) DEFAULT "nhanvien"');
        console.log('Table altered successfully');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
alterTable();
