const { pool } = require('../config/database');

async function run() {
    try {
        console.log('🔄 Bắt đầu chạy cập nhật giá khuyến mãi (gia_giam) cho các sản phẩm...');

        // 1. Lấy toàn bộ sản phẩm
        const [products] = await pool.query(`
            SELECT sp.ma_sp, sp.ten_sp, sp.gia, hsx.ten_hang
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
        `);

        console.log(`ℹ️ Tổng số sản phẩm trong hệ thống: ${products.length}`);
        let updatedCount = 0;

        for (const p of products) {
            const price = parseFloat(p.gia);
            if (!price || price <= 0) continue;

            const nameLower = p.ten_sp.toLowerCase();
            const brandLower = (p.ten_hang || '').toLowerCase();

            // Xác định xem sản phẩm là phụ kiện hay điện thoại
            const isAccessory = nameLower.includes('ốp') || 
                                nameLower.includes('case') || 
                                nameLower.includes('cường lực') || 
                                nameLower.includes('cáp') || 
                                nameLower.includes('sạc') || 
                                nameLower.includes('dây') || 
                                nameLower.includes('sac') || 
                                nameLower.includes('cap') || 
                                nameLower.includes('op') ||
                                nameLower.includes('tai nghe') || 
                                nameLower.includes('chuột') || 
                                nameLower.includes('bàn phím') ||
                                nameLower.includes('hub') ||
                                nameLower.includes('đế') ||
                                nameLower.includes('giá đỡ') ||
                                nameLower.includes('pin dự phòng') ||
                                nameLower.includes('adapter');

            // Xác định phần trăm giảm giá hợp lý
            let discountPercent = 10; // Mặc định 10%
            if (isAccessory) {
                // Phụ kiện biên lợi nhuận cao hơn -> Giảm nhiều hơn
                if (price >= 1000000) discountPercent = 12; // e.g. AirPods
                else discountPercent = 15 + (p.ma_sp % 6); // 15% - 20%
            } else {
                // Điện thoại
                if (brandLower === 'apple' || nameLower.includes('iphone')) {
                    discountPercent = 5 + (p.ma_sp % 4); // 5% - 8% cho Apple
                } else if (brandLower === 'samsung') {
                    discountPercent = 8 + (p.ma_sp % 5); // 8% - 12% cho Samsung
                } else {
                    discountPercent = 10 + (p.ma_sp % 6); // 10% - 15% cho các hãng khác
                }
            }

            // Tính toán giá giảm và làm tròn tới 10,000 VND gần nhất
            let discountPrice = Math.round((price * (1 - discountPercent / 100)) / 10000) * 10000;
            
            // Đảm bảo giá giảm nhỏ hơn giá gốc
            if (discountPrice >= price) {
                discountPrice = price - 10000;
            }

            // Thực hiện cập nhật vào database
            await pool.query(
                'UPDATE san_pham SET gia_giam = ? WHERE ma_sp = ?',
                [discountPrice, p.ma_sp]
            );

            console.log(`   🏷️ SP #${p.ma_sp} "${p.ten_sp}": ${price.toLocaleString('vi-VN')}đ ➔ Giảm ${discountPercent}% ➔ ${discountPrice.toLocaleString('vi-VN')}đ`);
            updatedCount++;
        }

        console.log(`🎉 Thành công! Đã thiết lập giá khuyến mãi cho ${updatedCount} sản phẩm.`);
        return true;
    } catch (e) {
        console.error('❌ Lỗi chạy migration seed_product_discounts:', e && e.message);
        return false;
    }
}

module.exports = { run };

if (require.main === module) {
    run().then(ok => process.exit(ok ? 0 : 1));
}
