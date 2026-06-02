const cron = require('node-cron');
const { pool } = require('../config/database');
const { sendPendingPaymentReminder } = require('./emailService');

// Quét đơn 'pending' chưa thanh toán > 24h, chưa gửi nhắc -> gửi nhắc + voucher
async function scanPendingOrders() {
    try {
        const [rows] = await pool.query(
            `SELECT ma_don, ma_kh, thoi_gian
             FROM don_hang
             WHERE trang_thai = 'pending'
               AND reminder_sent_at IS NULL
               AND ma_kh IS NOT NULL
               AND thoi_gian IS NOT NULL
               AND thoi_gian < DATE_SUB(NOW(), INTERVAL 24 HOUR)
             LIMIT 50`
        );

        if (rows.length === 0) {
            console.log('[Cron] Pending reminder: không có đơn cần nhắc');
            return;
        }

        console.log(`[Cron] Pending reminder: tìm thấy ${rows.length} đơn cần nhắc`);
        let sent = 0;
        for (const o of rows) {
            const r = await sendPendingPaymentReminder(o.ma_don);
            if (r.sent) sent++;
            // 200ms giữa mỗi email để tránh Gmail rate-limit
            await new Promise(res => setTimeout(res, 200));
        }
        console.log(`[Cron] Pending reminder: đã gửi ${sent}/${rows.length}`);
    } catch (e) {
        console.error('[Cron] scanPendingOrders error:', e.message);
    }
}

// Start cron — chạy mỗi giờ tại phút 7 (tránh đụng job khác hay chạy đầu giờ)
function start() {
    // '7 * * * *' = phút 7 mỗi giờ
    const job = cron.schedule('7 * * * *', scanPendingOrders, {
        timezone: 'Asia/Ho_Chi_Minh'
    });
    console.log('[Cron] Pending payment reminder scheduled (hourly at :07, Asia/Ho_Chi_Minh)');
    return job;
}

module.exports = { start, scanPendingOrders };
