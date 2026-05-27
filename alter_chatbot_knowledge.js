const { pool } = require('./backend/config/database');

async function alterTable() {
    try {
        console.log('Bắt đầu cập nhật cấu trúc bảng chatbot_knowledge...');

        // 1. Kiểm tra cấu trúc hiện tại của bảng
        const [columns] = await pool.query('DESCRIBE chatbot_knowledge');
        const columnNames = columns.map(col => col.Field);
        
        console.log('Các cột hiện tại:', columnNames);

        // 2. Thực hiện đổi tên question thành title nếu chưa đổi
        if (columnNames.includes('question') && !columnNames.includes('title')) {
            console.log('Đang đổi tên cột question thành title...');
            await pool.query('ALTER TABLE chatbot_knowledge CHANGE COLUMN question title VARCHAR(255) NOT NULL');
            console.log('Đã đổi thành công!');
        } else {
            console.log('Cột question đã được đổi tên hoặc không tồn tại.');
        }

        // 3. Thực hiện đổi tên answer thành content nếu chưa đổi
        if (columnNames.includes('answer') && !columnNames.includes('content')) {
            console.log('Đang đổi tên cột answer thành content...');
            await pool.query('ALTER TABLE chatbot_knowledge CHANGE COLUMN answer content TEXT NOT NULL');
            console.log('Đã đổi thành công!');
        } else {
            console.log('Cột answer đã được đổi tên hoặc không tồn tại.');
        }

        // 4. Thêm cột updated_at nếu chưa tồn tại
        if (!columnNames.includes('updated_at')) {
            console.log('Đang thêm cột updated_at...');
            await pool.query('ALTER TABLE chatbot_knowledge ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
            console.log('Đã thêm thành công!');
        } else {
            console.log('Cột updated_at đã tồn tại.');
        }

        console.log('=> Cập nhật cấu trúc bảng chatbot_knowledge hoàn tất thành công!');
    } catch (e) {
        console.error('Lỗi khi cập nhật bảng:', e);
    } finally {
        process.exit(0);
    }
}

alterTable();
