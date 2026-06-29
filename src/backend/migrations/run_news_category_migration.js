/**
 * Migration: Thêm các cột mới cho bảng tin_tuc (loại tin, mô tả ngắn, thứ tự, lượt xem, trạng thái)
 * Chạy: node migrations/run_news_category_migration.js
 */

const { pool } = require('../config/database');

async function runMigration() {
    console.log('🚀 Bắt đầu migration thêm cột cho bảng tin_tuc...\n');
    
    const alterQueries = [
        {
            name: 'loai_tin',
            sql: "ALTER TABLE tin_tuc ADD COLUMN loai_tin ENUM('noi_bat', 'thuong', 'khuyen_mai', 'su_kien', 'huong_dan', 'danh_gia', 'meo_hay') DEFAULT 'thuong'",
            desc: 'Loại tin (nổi bật, thường, khuyến mãi, sự kiện, hướng dẫn, đánh giá, mẹo hay)'
        },
        {
            name: 'mo_ta_ngan',
            sql: "ALTER TABLE tin_tuc ADD COLUMN mo_ta_ngan VARCHAR(500) DEFAULT NULL",
            desc: 'Mô tả ngắn (tóm tắt)'
        },
        {
            name: 'thu_tu',
            sql: "ALTER TABLE tin_tuc ADD COLUMN thu_tu INT DEFAULT 0",
            desc: 'Thứ tự hiển thị (ưu tiên)'
        },
        {
            name: 'luot_xem',
            sql: "ALTER TABLE tin_tuc ADD COLUMN luot_xem INT DEFAULT 0",
            desc: 'Lượt xem'
        },
        {
            name: 'trang_thai',
            sql: "ALTER TABLE tin_tuc ADD COLUMN trang_thai ENUM('hien_thi', 'an', 'nhap') DEFAULT 'hien_thi'",
            desc: 'Trạng thái (hiển thị, ẩn, nháp)'
        }
    ];

    for (const query of alterQueries) {
        try {
            await pool.query(query.sql);
            console.log(`✅ Thêm cột "${query.name}" thành công: ${query.desc}`);
        } catch (error) {
            if (error.code === 'ER_DUP_FIELDNAME') {
                console.log(`ℹ️  Cột "${query.name}" đã tồn tại - bỏ qua`);
            } else {
                console.error(`❌ Lỗi thêm cột "${query.name}":`, error.message);
            }
        }
    }

    // Thêm index
    const indexQueries = [
        {
            name: 'idx_loai_tin',
            sql: "CREATE INDEX idx_loai_tin ON tin_tuc(loai_tin)"
        },
        {
            name: 'idx_trang_thai',
            sql: "CREATE INDEX idx_trang_thai ON tin_tuc(trang_thai)"
        }
    ];

    console.log('\n📊 Thêm index...');
    for (const idx of indexQueries) {
        try {
            await pool.query(idx.sql);
            console.log(`✅ Thêm index "${idx.name}" thành công`);
        } catch (error) {
            if (error.code === 'ER_DUP_KEYNAME') {
                console.log(`ℹ️  Index "${idx.name}" đã tồn tại - bỏ qua`);
            } else {
                console.error(`❌ Lỗi thêm index "${idx.name}":`, error.message);
            }
        }
    }

    // Cập nhật dữ liệu mẫu
    console.log('\n📝 Cập nhật dữ liệu mẫu...');
    try {
        await pool.query("UPDATE tin_tuc SET loai_tin = 'noi_bat', thu_tu = 1 WHERE ma_tintuc IN (1, 2)");
        await pool.query("UPDATE tin_tuc SET loai_tin = 'danh_gia' WHERE ma_tintuc IN (4, 5)");
        await pool.query("UPDATE tin_tuc SET loai_tin = 'thuong' WHERE loai_tin IS NULL");
        console.log('✅ Cập nhật dữ liệu mẫu thành công');
    } catch (error) {
        console.error('❌ Lỗi cập nhật dữ liệu mẫu:', error.message);
    }

    console.log('\n🎉 Migration hoàn tất!');
    process.exit(0);
}

runMigration().catch(err => {
    console.error('Lỗi migration:', err);
    process.exit(1);
});
