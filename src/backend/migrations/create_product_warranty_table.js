const { pool } = require('../config/database');

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].c > 0;
}

async function ensureProductWarrantyTable() {
  if (!(await tableExists('bao_hanh_san_pham'))) {
    console.log('📦 Đang tạo bảng bao_hanh_san_pham...');
    await pool.query(`
      CREATE TABLE bao_hanh_san_pham (
        ma_sp INT NOT NULL PRIMARY KEY,
        thoi_gian_bh INT NOT NULL DEFAULT 12 COMMENT 'Số tháng bảo hành',
        dieu_kien TEXT NULL COMMENT 'Điều kiện bảo hành',
        CONSTRAINT fk_warranty_product FOREIGN KEY (ma_sp) REFERENCES san_pham(ma_sp) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('✅ Bảng bao_hanh_san_pham đã được tạo.');
  }

  // Tự động thiết lập bảo hành cho tất cả các sản phẩm hiện có
  console.log('🌱 Đang đồng bộ và thiết lập bảo hành mặc định cho các sản phẩm hiện có...');
  const [products] = await pool.query('SELECT ma_sp, ten_sp FROM san_pham');
  
  for (const product of products) {
    // Kiểm tra xem sản phẩm đã có cấu hình bảo hành chưa
    const [existing] = await pool.query('SELECT ma_sp FROM bao_hanh_san_pham WHERE ma_sp = ?', [product.ma_sp]);
    if (existing.length === 0) {
      const nameLower = product.ten_sp.toLowerCase();
      let thoiGianBh = 12; // Mặc định 12 tháng
      let dieuKien = 'Bảo hành chính hãng 12 tháng tại trung tâm bảo hành hãng. Hỗ trợ lỗi 1 đổi 1 trong 30 ngày đầu tiên đối với lỗi phần cứng từ nhà sản xuất.';

      // Logic phân loại bảo hành theo tên sản phẩm
      const isAccessory = nameLower.includes('ốp') || 
                          nameLower.includes('case') || 
                          nameLower.includes('cường lực') || 
                          nameLower.includes('cáp') || 
                          nameLower.includes('sạc') || 
                          nameLower.includes('dây') || 
                          nameLower.includes('sac') || 
                          nameLower.includes('cap') || 
                          nameLower.includes('op');

      const isAudio = nameLower.includes('tai nghe') || 
                      nameLower.includes('airpods') || 
                      nameLower.includes('buds') || 
                      nameLower.includes('headphone');

      if (isAccessory) {
        thoiGianBh = 6; // Phụ kiện thường bảo hành 6 tháng hoặc ít hơn
        dieuKien = 'Bảo hành cửa hàng 6 tháng. Không áp dụng cho các trường hợp đứt gãy, rơi vỡ, vào nước hoặc hao mòn ngoại quan do quá trình sử dụng.';
      } else if (isAudio) {
        thoiGianBh = 12; // Tai nghe cao cấp bảo hành 12 tháng
        dieuKien = 'Bảo hành chính hãng 12 tháng. Không áp dụng cho lỗi vào nước, đứt dây ngầm, hoặc bể móp do tác động của ngoại lực bên ngoài.';
      } else if (nameLower.includes('laptop') || nameLower.includes('dell') || nameLower.includes('hp') || nameLower.includes('macbook')) {
        thoiGianBh = 12; // Laptop bảo hành 12 tháng
        dieuKien = 'Bảo hành chính hãng 12 tháng tại trung tâm bảo hành ủy quyền của hãng. Hỗ trợ thay thế linh kiện phần cứng lỗi do NSX hoàn toàn miễn phí.';
      }

      await pool.query(
        'INSERT INTO bao_hanh_san_pham (ma_sp, thoi_gian_bh, dieu_kien) VALUES (?, ?, ?)',
        [product.ma_sp, thoiGianBh, dieuKien]
      );
      console.log(`   ✅ Thiết lập bảo hành mặc định cho: "${product.ten_sp}" (${thoiGianBh} tháng)`);
    }
  }
  console.log('🎉 Đồng bộ thiết lập bảo hành mặc định hoàn tất.');
  return true;
}

async function run() {
  try {
    await ensureProductWarrantyTable();
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ bao_hanh_san_pham: ready');
    }
    return true;
  } catch (e) {
    console.error('❌ Migration create_product_warranty_table failed:', e && e.message);
    return false;
  }
}

module.exports = { run, ensureProductWarrantyTable };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
