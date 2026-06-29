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

// Quét đơn hàng hoàn thành để gửi chuỗi email CSKH tự động (sau 3 ngày và 15 ngày)
async function scanPostPurchaseOrders() {
    try {
        console.log('[Cron] Bắt đầu quét đơn hàng hoàn tất để gửi email CSKH...');
        const { sendPostPurchaseFollowUp3Days, sendPostPurchaseFollowUp15Days } = require('./emailService');

        // 1. Quét đơn hàng cần gửi email 3 ngày (hoàn thành từ 3 đến 10 ngày trước, chưa từng gửi email [CSKH 3 Ngày])
        const [orders3Days] = await pool.query(
            `SELECT dh.ma_don, dh.ma_kh
             FROM don_hang dh
             WHERE dh.trang_thai IN ('completed', 'delivered')
               AND dh.ma_kh IS NOT NULL
               AND dh.thoi_gian <= DATE_SUB(NOW(), INTERVAL 3 DAY)
               AND dh.thoi_gian >= DATE_SUB(NOW(), INTERVAL 10 DAY)
               AND NOT EXISTS (
                   SELECT 1 FROM email_log el 
                   WHERE el.ma_don = dh.ma_don 
                     AND el.loai_email = 'marketing' 
                     AND el.tieu_de LIKE '[CSKH 3 Ngày]%'
                     AND el.trang_thai = 'sent'
               )
             LIMIT 50`
        );

        console.log(`[Cron] Quét CSKH 3 ngày: tìm thấy ${orders3Days.length} đơn hàng.`);
        let sent3Days = 0;
        for (const o of orders3Days) {
            const r = await sendPostPurchaseFollowUp3Days(o.ma_don);
            if (r.sent) sent3Days++;
            await new Promise(res => setTimeout(res, 200));
        }
        if (orders3Days.length > 0) {
            console.log(`[Cron] Đã gửi ${sent3Days}/${orders3Days.length} email CSKH 3 ngày.`);
        }

        // 2. Quét đơn hàng cần gửi email 15 ngày (hoàn thành từ 15 đến 30 ngày trước, chưa từng gửi email [CSKH 15 Ngày])
        const [orders15Days] = await pool.query(
            `SELECT dh.ma_don, dh.ma_kh
             FROM don_hang dh
             WHERE dh.trang_thai IN ('completed', 'delivered')
               AND dh.ma_kh IS NOT NULL
               AND dh.thoi_gian <= DATE_SUB(NOW(), INTERVAL 15 DAY)
               AND dh.thoi_gian >= DATE_SUB(NOW(), INTERVAL 30 DAY)
               AND NOT EXISTS (
                   SELECT 1 FROM email_log el 
                   WHERE el.ma_don = dh.ma_don 
                     AND el.loai_email = 'marketing' 
                     AND el.tieu_de LIKE '[CSKH 15 Ngày]%'
                     AND el.trang_thai = 'sent'
               )
             LIMIT 50`
        );

        console.log(`[Cron] Quét CSKH 15 ngày: tìm thấy ${orders15Days.length} đơn hàng.`);
        let sent15Days = 0;
        for (const o of orders15Days) {
            const r = await sendPostPurchaseFollowUp15Days(o.ma_don);
            if (r.sent) sent15Days++;
            await new Promise(res => setTimeout(res, 200));
        }
        if (orders15Days.length > 0) {
            console.log(`[Cron] Đã gửi ${sent15Days}/${orders15Days.length} email CSKH 15 ngày.`);
        }

    } catch (e) {
        console.error('[Cron] scanPostPurchaseOrders error:', e.message);
    }
}

// Start cron — chạy các job định kỳ
function start() {
    // '7 * * * *' = phút 7 mỗi giờ (scan pending orders)
    const jobPending = cron.schedule('7 * * * *', scanPendingOrders, {
        timezone: 'Asia/Ho_Chi_Minh'
    });
    console.log('[Cron] Pending payment reminder scheduled (hourly at :07, Asia/Ho_Chi_Minh)');

    // '30 8 * * *' = 8:30 sáng hàng ngày (scan CSKH email sequence)
    const jobPostPurchase = cron.schedule('30 8 * * *', scanPostPurchaseOrders, {
        timezone: 'Asia/Ho_Chi_Minh'
    });
    console.log('[Cron] Post-purchase CSKH email sequence scheduled (daily at 08:30, Asia/Ho_Chi_Minh)');

    return { jobPending, jobPostPurchase };
}

module.exports = { start, scanPendingOrders, scanPostPurchaseOrders };
