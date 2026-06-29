const { pool } = require('../config/database');

/**
 * Sinh số IMEI ngẫu nhiên cho mục đích demo/phát triển
 * IMEI gồm 15 chữ số, thường bắt đầu bằng 35 hoặc 86
 */
function generateRandomIMEI() {
    let imei = '35' + Math.floor(100000000000 + Math.random() * 900000000000).toString();
    return imei.slice(0, 15);
}

/**
 * Sinh Số Serial ngẫu nhiên
 * Serial gồm 12 ký tự chữ và số
 */
function generateRandomSerial() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let serial = 'QH'; // QuangHưng Mobile prefix
    for (let i = 0; i < 10; i++) {
        serial += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return serial;
}

/**
 * Tự động tạo phiếu bảo hành điện tử cho toàn bộ sản phẩm trong đơn hàng khi hoàn thành
 * @param {number} orderId 
 */
async function createWarrantiesForOrder(orderId) {
    try {
        console.log(`[WarrantyService] Bắt đầu tạo phiếu bảo hành cho đơn hàng #${orderId}`);
        
        // 1. Kiểm tra xem đơn hàng đã được tạo phiếu bảo hành chưa (tránh trùng lặp)
        const [existing] = await pool.query(
            'SELECT COUNT(*) as count FROM phieu_bao_hanh WHERE ma_don = ?',
            [orderId]
        );
        if (existing[0].count > 0) {
            console.log(`[WarrantyService] Đơn hàng #${orderId} đã được tạo phiếu bảo hành từ trước. Bỏ qua.`);
            return;
        }

        // 2. Lấy thông tin đơn hàng
        const [orders] = await pool.query(
            'SELECT * FROM don_hang WHERE ma_don = ?',
            [orderId]
        );
        if (orders.length === 0) {
            console.error(`[WarrantyService] Không tìm thấy đơn hàng #${orderId}`);
            return;
        }
        const order = orders[0];

        // 3. Lấy chi tiết sản phẩm trong đơn hàng
        const [items] = await pool.query(
            'SELECT * FROM chi_tiet_don_hang WHERE ma_don = ?',
            [orderId]
        );

        const now = new Date();
        
        // 4. Tạo phiếu bảo hành cho từng sản phẩm
        for (const item of items) {
            const quantity = parseInt(item.so_luong) || 1;
            
            // Xác định thời hạn bảo hành dựa trên cấu hình sản phẩm hoặc mặc định 12 tháng
            let warrantyMonths = 12;
            try {
                const [bhRows] = await pool.query(
                    'SELECT thoi_gian_bh FROM bao_hanh_san_pham WHERE ma_sp = ?',
                    [item.ma_sp]
                );
                if (bhRows.length > 0 && bhRows[0].thoi_gian_bh !== null) {
                    warrantyMonths = parseInt(bhRows[0].thoi_gian_bh);
                }
            } catch (dbErr) {
                console.error(`[WarrantyService] Lỗi lấy thời hạn bảo hành cho sản phẩm #${item.ma_sp}:`, dbErr.message);
            }
            
            // Tính ngày hết hạn
            const expirationDate = new Date();
            expirationDate.setMonth(now.getMonth() + warrantyMonths);

            // Vì mỗi sản phẩm vật lý sẽ có 1 IMEI/Serial riêng biệt, chúng ta tạo phiếu bảo hành riêng cho từng cái
            for (let i = 0; i < quantity; i++) {
                const imei = generateRandomIMEI();
                const serial = generateRandomSerial();

                await pool.query(
                    `INSERT INTO phieu_bao_hanh (ma_don, ma_sp, ma_kh, so_serial, so_imei, ngay_mua, ngay_het_han, thoi_han_bh, trang_thai, ghi_chu)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
                    [
                        orderId,
                        item.ma_sp,
                        order.ma_kh, // Có thể null nếu khách vãng lai
                        serial,
                        imei,
                        now,
                        expirationDate,
                        warrantyMonths,
                        `[Hệ thống] Tự động kích hoạt bảo hành điện tử khi hoàn thành đơn hàng.`
                    ]
                );
                console.log(`   ✅ Kích hoạt bảo hành điện tử thành công: SP #${item.ma_sp}, IMEI: ${imei}, Serial: ${serial}`);
            }
        }

        console.log(`[WarrantyService] Đã kích hoạt toàn bộ bảo hành điện tử cho đơn hàng #${orderId}`);
        return true;
    } catch (error) {
        console.error(`[WarrantyService] Lỗi khi tạo phiếu bảo hành cho đơn hàng #${orderId}:`, error);
        return false;
    }
}

module.exports = {
    createWarrantiesForOrder
};
