// Migration: Thêm cột allowed_modules vào bảng nhan_vien để lưu phân quyền chi tiết
const { pool } = require('../config/database');

async function up() {
    try {
        console.log('🔄 Bắt đầu migration: Thêm cột allowed_modules vào bảng nhan_vien...');
        
        // Kiểm tra xem cột đã tồn tại chưa
        const [columns] = await pool.query(
            "SHOW COLUMNS FROM nhan_vien WHERE Field = 'allowed_modules'"
        );
        
        if (columns.length > 0) {
            console.log('✅ Cột allowed_modules đã tồn tại. Bỏ qua migration.');
            return;
        }
        
        // Thêm cột allowed_modules (JSON) vào bảng nhan_vien
        await pool.query(`
            ALTER TABLE nhan_vien 
            ADD COLUMN allowed_modules JSON DEFAULT NULL
            COMMENT 'Danh sách quyền chi tiết của nhân viên (JSON array)'
        `);
        
        console.log('✅ Đã thêm cột allowed_modules vào bảng nhan_vien');
        
        // Khởi tạo giá trị mặc định cho các nhân viên hiện có dựa trên vai trò
        const rolePermissions = {
            'superadmin': null, // SuperAdmin có full quyền, không cần giới hạn
            'banhang': JSON.stringify([
                'nav-dashboard', 'nav-orders', 'nav-products', 'nav-brands', 
                'nav-promotions', 'nav-shifts', 'nav-attendance', 'nav-warranties'
            ]),
            'kho': JSON.stringify([
                'nav-dashboard', 'nav-products', 'nav-inventory', 'nav-brands', 
                'nav-colors', 'nav-storages', 'nav-shifts', 'nav-attendance'
            ]),
            'ketoan': JSON.stringify([
                'nav-dashboard', 'nav-revenue-report', 'nav-profit-report', 
                'nav-expenses', 'nav-payroll', 'nav-email-logs'
            ]),
            'cskh': JSON.stringify([
                'nav-dashboard', 'nav-customers', 'nav-reviews', 'nav-notifications', 
                'nav-contacts', 'nav-chatbot-rag', 'nav-warranties', 'nav-news', 'nav-interests'
            ]),
            'nhanvien': JSON.stringify([
                'nav-dashboard', 'nav-shifts', 'nav-attendance'
            ])
        };
        
        // Cập nhật quyền mặc định cho từng vai trò
        for (const [role, permissions] of Object.entries(rolePermissions)) {
            if (permissions !== null) {
                await pool.query(
                    'UPDATE nhan_vien SET allowed_modules = ? WHERE quyen = ?',
                    [permissions, role]
                );
                console.log(`  ✓ Đã khởi tạo quyền cho vai trò: ${role}`);
            }
        }
        
        console.log('✅ Migration hoàn tất!');
        
    } catch (error) {
        console.error('❌ Lỗi migration:', error);
        throw error;
    }
}

async function down() {
    try {
        console.log('🔄 Rollback: Xóa cột allowed_modules...');
        
        await pool.query(`
            ALTER TABLE nhan_vien 
            DROP COLUMN IF EXISTS allowed_modules
        `);
        
        console.log('✅ Đã xóa cột allowed_modules');
        
    } catch (error) {
        console.error('❌ Lỗi rollback:', error);
        throw error;
    }
}

// Chạy migration
if (require.main === module) {
    up()
        .then(() => {
            console.log('✅ Migration thành công!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Migration thất bại:', error);
            process.exit(1);
        });
}

module.exports = { up, down };
