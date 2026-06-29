const { pool } = require('../config/database');

async function checkColumn() {
    const [rows] = await pool.query("SHOW COLUMNS FROM tin_tuc WHERE Field = 'loai_tin'");
    console.log('Cấu trúc cột loai_tin:', rows[0]);
    
    const [rows2] = await pool.query("SHOW COLUMNS FROM tin_tuc WHERE Field = 'trang_thai'");
    console.log('Cấu trúc cột trang_thai:', rows2[0]);
    
    process.exit(0);
}

checkColumn();
