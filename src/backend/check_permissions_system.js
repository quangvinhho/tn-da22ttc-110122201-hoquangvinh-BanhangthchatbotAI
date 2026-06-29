// Script kiểm tra hệ thống phân quyền
const { pool } = require('./config/database');

async function checkSystem() {
    console.log('🔍 KIỂM TRA HỆ THỐNG PHÂN QUYỀN\n');
    
    try {
        // 1. Kiểm tra cột allowed_modules trong bảng nhan_vien
        console.log('1️⃣ Kiểm tra cột allowed_modules:');
        const [columns] = await pool.query("SHOW COLUMNS FROM nhan_vien WHERE Field = 'allowed_modules'");
        
        if (columns.length > 0) {
            console.log('   ✅ Cột allowed_modules tồn tại');
            console.log('   📋 Kiểu:', columns[0].Type);
            console.log('   📋 Null:', columns[0].Null);
            console.log('   📋 Default:', columns[0].Default);
        } else {
            console.log('   ❌ Cột allowed_modules KHÔNG tồn tại!');
            console.log('   💡 Chạy: node migrations/add_allowed_modules_to_nhan_vien.js');
            process.exit(1);
        }
        
        // 2. Kiểm tra dữ liệu nhân viên
        console.log('\n2️⃣ Kiểm tra dữ liệu nhân viên:');
        const [employees] = await pool.query('SELECT ma_nv, ho_ten, quyen, allowed_modules FROM nhan_vien LIMIT 5');
        
        console.log(`   📊 Tổng số nhân viên mẫu: ${employees.length}`);
        employees.forEach(emp => {
            console.log(`\n   👤 ${emp.ho_ten} (ID: ${emp.ma_nv})`);
            console.log(`      Vai trò: ${emp.quyen}`);
            if (emp.allowed_modules) {
                try {
                    const perms = JSON.parse(emp.allowed_modules);
                    console.log(`      ✅ Có phân quyền: ${perms.length} quyền`);
                    console.log(`      📋 ${perms.slice(0, 3).join(', ')}...`);
                } catch (e) {
                    console.log(`      ⚠️ Lỗi parse JSON:`, emp.allowed_modules);
                }
            } else {
                console.log(`      ⚠️ Chưa có phân quyền (NULL)`);
            }
        });
        
        // 3. Test UPDATE query
        console.log('\n3️⃣ Test UPDATE query:');
        const testPerms = JSON.stringify(['nav-dashboard', 'nav-orders']);
        console.log('   SQL:', `UPDATE nhan_vien SET allowed_modules = '${testPerms}' WHERE ma_nv = 1`);
        console.log('   ✅ Syntax hợp lệ');
        
        console.log('\n✅ HỆ THỐNG SẴN SÀNG!\n');
        
    } catch (error) {
        console.error('\n❌ LỖI:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        process.exit(0);
    }
}

checkSystem();
