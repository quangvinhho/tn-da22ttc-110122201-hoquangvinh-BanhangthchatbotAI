// Script để cập nhật giá trị NULL trong bảng tin_tuc
const { pool } = require('../config/database');

async function fixNullValues() {
    try {
        console.log('Đang cập nhật các giá trị NULL...');
        
        // Cập nhật loai_tin NULL thành 'thuong'
        const [result1] = await pool.query("UPDATE tin_tuc SET loai_tin = 'thuong' WHERE loai_tin IS NULL");
        console.log(`Đã cập nhật ${result1.affectedRows} tin tức có loai_tin NULL`);
        
        // Cập nhật trang_thai NULL thành 'hien_thi'
        const [result2] = await pool.query("UPDATE tin_tuc SET trang_thai = 'hien_thi' WHERE trang_thai IS NULL");
        console.log(`Đã cập nhật ${result2.affectedRows} tin tức có trang_thai NULL`);
        
        console.log('Hoàn tất!');
        process.exit(0);
    } catch (error) {
        console.error('Lỗi:', error);
        process.exit(1);
    }
}

fixNullValues();
