const nodemailer = require('nodemailer');
const { pool } = require('../config/database');

// Khởi tạo transporter cho nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your_email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your_gmail_app_password'
    }
});

// Hàm format tiền tệ VNĐ
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

// Ghi log mỗi lần gửi email (success/failed) vào bảng email_log
async function logEmail({ email_nhan, loai_email, ma_kh = null, ma_sp = null, ma_don = null, tieu_de, trang_thai = 'sent', error_msg = null }) {
    try {
        await pool.query(
            `INSERT INTO email_log (email_nhan, loai_email, ma_kh, ma_sp, ma_don, tieu_de, trang_thai, error_msg)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [email_nhan, loai_email, ma_kh, ma_sp, ma_don, tieu_de, trang_thai, error_msg]
        );
    } catch (logErr) {
        console.error('[EmailService] Không ghi được email_log:', logErr.message);
    }
}

// Định nghĩa các nhãn trạng thái tiếng Việt
const statusLabels = {
    'pending': '⏳ Chờ xác nhận',
    'confirmed': '📦 Đã xác nhận & Đang chuẩn bị hàng',
    'shipping': '🚚 Đang giao hàng',
    'completed': '✅ Giao hàng thành công',
    'cancelled': '❌ Đã hủy'
};

/**
 * Gửi email xác nhận đặt hàng thành công
 * @param {number} orderId 
 */
async function sendOrderConfirmation(orderId) {
    try {
        console.log(`[EmailService] Bắt đầu chuẩn bị email xác nhận cho đơn hàng #${orderId}`);
        
        // 1. Truy vấn thông tin đơn hàng và khách hàng
        const [orders] = await pool.query(
            `SELECT dh.*, kh.email as kh_email, kh.ho_ten as kh_name
             FROM don_hang dh
             LEFT JOIN khach_hang kh ON dh.ma_kh = kh.ma_kh
             WHERE dh.ma_don = ?`,
            [orderId]
        );

        if (orders.length === 0) {
            console.error(`[EmailService] Không tìm thấy đơn hàng #${orderId}`);
            return;
        }

        const order = orders[0];
        
        // Lấy email khách hàng: Ưu tiên email tài khoản khach_hang, nếu không có thì không gửi
        const recipientEmail = order.kh_email;
        if (!recipientEmail) {
            console.log(`[EmailService] Đơn hàng #${orderId} là của khách vãng lai hoặc không có email. Bỏ qua gửi email.`);
            return;
        }

        // 2. Truy vấn chi tiết sản phẩm trong đơn hàng
        const [items] = await pool.query(
            `SELECT ctdh.*, sp.ten_sp, sp.anh_dai_dien
             FROM chi_tiet_don_hang ctdh
             JOIN san_pham sp ON ctdh.ma_sp = sp.ma_sp
             WHERE ctdh.ma_don = ?`,
            [orderId]
        );

        // 3. Xây dựng danh sách sản phẩm HTML
        let itemsHtml = '';
        items.forEach(item => {
            const price = parseFloat(item.gia);
            const quantity = parseInt(item.so_luong);
            const subtotal = price * quantity;
            
            // Xử lý ảnh đại diện nếu có
            const imgUrl = item.anh_dai_dien ? item.anh_dai_dien : 'https://placehold.co/100x100?text=Product';

            itemsHtml += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 12px 8px; text-align: left;">
                        <img src="${imgUrl}" alt="${item.ten_sp}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; vertical-align: middle; margin-right: 10px;"/>
                        <span style="font-weight: 600; color: #333; font-size: 14px; vertical-align: middle;">${item.ten_sp}</span>
                    </td>
                    <td style="padding: 12px 8px; text-align: center; color: #666; font-size: 14px;">x${quantity}</td>
                    <td style="padding: 12px 8px; text-align: right; font-weight: 600; color: #e41e26; font-size: 14px;">${formatCurrency(price)}</td>
                </tr>
            `;
        });

        // 4. Xử lý phần hiển thị thông tin đặt cọc (nếu có)
        let depositHtml = '';
        if (order.loai_don === 'deposit') {
            depositHtml = `
                <div style="background-color: #fff8f8; border-left: 4px solid #e41e26; padding: 15px; margin: 20px 0; border-radius: 4px;">
                    <h3 style="color: #e41e26; margin: 0 0 10px 0; font-size: 16px;">💳 Thông tin Đặt cọc (Pre-order)</h3>
                    <table style="width: 100%; font-size: 14px;">
                        <tr>
                            <td style="padding: 4px 0; color: #666;">Số tiền đặt cọc trước:</td>
                            <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #e41e26;">${formatCurrency(order.tien_dat_coc)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666;">Số tiền còn lại khi nhận hàng:</td>
                            <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #333;">${formatCurrency(order.tien_con_lai)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #666;">Trạng thái cọc:</td>
                            <td style="padding: 4px 0; text-align: right; font-weight: bold; color: #f39c12;">${order.trang_thai_coc === 'confirmed' ? '✅ Đã nhận cọc' : '⏳ Chờ thanh toán cọc'}</td>
                        </tr>
                    </table>
                </div>
            `;
        }

        // 5. Soạn thảo email
        const mailOptions = {
            from: `"QuangHưng Mobile" <${process.env.EMAIL_USER || 'noreply@quanghungmobile.com'}>`,
            to: recipientEmail,
            subject: `🎉 Đặt hàng thành công! Đơn hàng #${orderId} - QuangHưng Mobile`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f4f6f8;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 35px 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px;">QuangHưng Mobile</h1>
                        <p style="color: #ffcdd2; margin: 10px 0 0; font-size: 16px;">Cảm ơn bạn đã tin tưởng mua sắm!</p>
                    </div>
                    
                    <!-- Content Body -->
                    <div style="background: #ffffff; padding: 30px 25px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                        <p style="font-size: 16px; color: #333; margin-top: 0;">Xin chào <strong>${order.ten_nguoi_nhan || order.kh_name || 'Quý khách'}</strong>,</p>
                        <p style="font-size: 15px; color: #555; line-height: 1.6;">
                            Đơn hàng của bạn đã được tiếp nhận thành công và đang chờ xử lý. Chúng tôi sẽ nhanh chóng chuẩn bị sản phẩm và giao đến bạn trong thời gian sớm nhất.
                        </p>
                        
                        <!-- Order Status Info Card -->
                        <div style="background-color: #f9f9f9; border-radius: 6px; padding: 15px 20px; margin: 20px 0; border: 1px solid #eee;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #555;">
                                <tr>
                                    <td style="padding: 5px 0; font-weight: 600; width: 130px;">Mã đơn hàng:</td>
                                    <td style="padding: 5px 0; color: #333; font-weight: 700;">#${orderId}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 5px 0; font-weight: 600;">Ngày đặt hàng:</td>
                                    <td style="padding: 5px 0; color: #333;">${new Date(order.ngay_dat || Date.now()).toLocaleString('vi-VN')}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 5px 0; font-weight: 600;">Trạng thái:</td>
                                    <td style="padding: 5px 0; color: #e41e26; font-weight: bold;">${statusLabels[order.trang_thai] || order.trang_thai}</td>
                                </tr>
                            </table>
                        </div>

                        ${depositHtml}

                        <!-- Customer & Delivery Info -->
                        <h3 style="color: #333; border-bottom: 2px solid #eee; padding-bottom: 8px; margin-top: 25px; font-size: 16px;">📍 Thông tin giao nhận hàng</h3>
                        <table style="width: 100%; font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;">
                            <tr>
                                <td style="font-weight: 600; width: 130px;">Người nhận:</td>
                                <td>${order.ten_nguoi_nhan}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600;">Số điện thoại:</td>
                                <td>${order.so_dt}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600;">Địa chỉ nhận:</td>
                                <td>${order.dia_chi_nhan}</td>
                            </tr>
                        </table>

                        <!-- Order Items Table -->
                        <h3 style="color: #333; border-bottom: 2px solid #eee; padding-bottom: 8px; margin-top: 25px; font-size: 16px;">🛍️ Danh sách sản phẩm</h3>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <thead>
                                <tr style="background-color: #f9f9f9; border-bottom: 2px solid #eee;">
                                    <th style="padding: 10px 8px; text-align: left; font-size: 13px; color: #666; font-weight: 600;">Sản phẩm</th>
                                    <th style="padding: 10px 8px; text-align: center; font-size: 13px; color: #666; font-weight: 600; width: 60px;">SL</th>
                                    <th style="padding: 10px 8px; text-align: right; font-size: 13px; color: #666; font-weight: 600; width: 110px;">Thành tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="2" style="padding: 12px 8px 4px 8px; text-align: right; font-size: 14px; color: #666;">Tổng giá trị sản phẩm:</td>
                                    <td style="padding: 12px 8px 4px 8px; text-align: right; font-size: 14px; font-weight: 600; color: #333;">${formatCurrency(parseFloat(order.tong_tien))}</td>
                                </tr>
                                <tr>
                                    <td colspan="2" style="padding: 4px 8px; text-align: right; font-size: 14px; color: #666;">Phí vận chuyển:</td>
                                    <td style="padding: 4px 8px; text-align: right; font-size: 14px; font-weight: 600; color: #333;">Miễn phí</td>
                                </tr>
                                <tr style="border-top: 1px double #eee;">
                                    <td colspan="2" style="padding: 12px 8px; text-align: right; font-size: 16px; font-weight: 700; color: #333;">Tổng thanh toán:</td>
                                    <td style="padding: 12px 8px; text-align: right; font-size: 18px; font-weight: 700; color: #e41e26;">${formatCurrency(parseFloat(order.tong_tien))}</td>
                                </tr>
                            </tfoot>
                        </table>

                        <!-- Action Button -->
                        <div style="text-align: center; margin: 35px 0 20px 0;">
                            <a href="http://localhost:3000/orders" style="background-color: #e41e26; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 6px rgba(228,30,38,0.2); display: inline-block;">
                                🔍 Theo dõi đơn hàng
                            </a>
                        </div>
                        
                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0 20px 0;">
                        
                        <!-- Footer -->
                        <div style="font-size: 12px; color: #999; text-align: center; line-height: 1.6;">
                            <p style="margin: 5px 0;">Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ hotline <strong>1900 1234</strong> hoặc trả lời email này.</p>
                            <p style="margin: 5px 0;">📍 Địa chỉ cửa hàng: 123 Đường Cầu Giấy, Quận Cầu Giấy, Hà Nội</p>
                            <p style="margin: 15px 0 0 0; color: #bbb;">© 2026 QuangHưng Mobile - Uy tín - Chất lượng - Giá tốt</p>
                        </div>
                    </div>
                </div>
            `
        };

        // In-app notification: luôn insert (KHÔNG phụ thuộc email gửi thành công/thất bại)
        if (order.ma_kh) {
            await createInAppNotification({
                ma_kh: order.ma_kh,
                tieu_de: `🎉 Đặt hàng thành công #${orderId}`,
                noi_dung: `Đơn hàng tổng ${formatCurrency(parseFloat(order.tong_tien) || 0)} đã được tiếp nhận. Chúng tôi sẽ liên hệ giao hàng sớm nhất.`,
                loai: 'order_update',
                lien_ket: '/profile.html#orders'
            });
        }

        // Gửi email (có thể fail nếu Gmail xuống — in-app vẫn được giữ)
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`[EmailService] Email xác nhận đơn hàng #${orderId} đã được gửi thành công: ${info.messageId}`);
            await logEmail({ email_nhan: recipientEmail, loai_email: 'confirmation', ma_kh: order.ma_kh || null, ma_don: orderId, tieu_de: mailOptions.subject, trang_thai: 'sent' });
            return true;
        } catch (sendErr) {
            await logEmail({ email_nhan: recipientEmail, loai_email: 'confirmation', ma_kh: order.ma_kh || null, ma_don: orderId, tieu_de: mailOptions.subject, trang_thai: 'failed', error_msg: sendErr.message });
            throw sendErr;
        }
    } catch (error) {
        console.error(`[EmailService] Lỗi khi gửi email xác nhận đơn hàng #${orderId}:`, error);
        return false;
    }
}

/**
 * Gửi email cập nhật trạng thái đơn hàng
 * @param {number} orderId 
 * @param {string} status Trạng thái mới
 */
async function sendOrderStatusUpdate(orderId, status) {
    try {
        console.log(`[EmailService] Bắt đầu chuẩn bị email cập nhật trạng thái cho đơn hàng #${orderId} -> ${status}`);
        
        // 1. Truy vấn thông tin đơn hàng và khách hàng
        const [orders] = await pool.query(
            `SELECT dh.*, kh.email as kh_email, kh.ho_ten as kh_name
             FROM don_hang dh
             LEFT JOIN khach_hang kh ON dh.ma_kh = kh.ma_kh
             WHERE dh.ma_don = ?`,
            [orderId]
        );

        if (orders.length === 0) {
            console.error(`[EmailService] Không tìm thấy đơn hàng #${orderId}`);
            return;
        }

        const order = orders[0];
        const recipientEmail = order.kh_email;
        if (!recipientEmail) {
            console.log(`[EmailService] Đơn hàng #${orderId} là của khách vãng lai hoặc không có email. Bỏ qua gửi email cập nhật.`);
            return;
        }

        const statusLabel = statusLabels[status] || status;
        let statusDescription = 'Đơn hàng của bạn đã có cập nhật mới về trạng thái vận chuyển.';
        let customGraphic = '📦';

        if (status === 'confirmed') {
            statusDescription = 'Cửa hàng đã xác nhận đơn hàng và đang chuẩn bị đóng gói sản phẩm để giao cho đơn vị vận chuyển.';
            customGraphic = '📦';
        } else if (status === 'shipping') {
            statusDescription = 'Đơn hàng đã được bàn giao cho đơn vị vận chuyển và đang trên đường tới địa chỉ của bạn. Hãy chú ý điện thoại để nhận hàng nhé!';
            customGraphic = '🚚';
        } else if (status === 'completed') {
            statusDescription = 'Hệ thống ghi nhận bạn đã nhận được hàng đầy đủ và thanh toán thành công. Cảm ơn bạn rất nhiều vì đã tin dùng sản phẩm của QuangHưng Mobile!';
            customGraphic = '🎉';
        } else if (status === 'cancelled') {
            statusDescription = 'Đơn hàng của bạn đã bị hủy trên hệ thống. Nếu có bất kỳ thắc mắc nào, vui lòng liên hệ ngay với bộ phận CSKH của chúng tôi.';
            customGraphic = '❌';
        }

        // 2. Soạn email
        const mailOptions = {
            from: `"QuangHưng Mobile" <${process.env.EMAIL_USER || 'noreply@quanghungmobile.com'}>`,
            to: recipientEmail,
            subject: `🔔 Cập nhật trạng thái Đơn hàng #${orderId} - ${statusLabel}`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background-color: #f4f6f8;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 35px 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px;">QuangHưng Mobile</h1>
                        <p style="color: #ffcdd2; margin: 10px 0 0; font-size: 16px;">Thông báo cập nhật đơn hàng</p>
                    </div>
                    
                    <!-- Content Body -->
                    <div style="background: #ffffff; padding: 30px 25px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                        <p style="font-size: 16px; color: #333; margin-top: 0;">Xin chào <strong>${order.ten_nguoi_nhan || order.kh_name || 'Quý khách'}</strong>,</p>
                        
                        <div style="text-align: center; padding: 20px 0; background-color: #fffcfc; border: 1px dashed #e41e26; border-radius: 6px; margin: 20px 0;">
                            <span style="font-size: 48px;">${customGraphic}</span>
                            <h2 style="color: #e41e26; margin: 10px 0 5px 0; font-size: 20px;">${statusLabel}</h2>
                            <p style="font-size: 14px; color: #666; margin: 0; padding: 0 15px;">${statusDescription}</p>
                        </div>
                        
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #555; line-height: 1.8; margin-bottom: 25px;">
                            <tr>
                                <td style="font-weight: 600; width: 130px;">Mã đơn hàng:</td>
                                <td style="color: #333; font-weight: 700;">#${orderId}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600;">Tổng thanh toán:</td>
                                <td style="color: #e41e26; font-weight: bold;">${formatCurrency(parseFloat(order.tong_tien))}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600;">Người nhận:</td>
                                <td>${order.ten_nguoi_nhan}</td>
                            </tr>
                            <tr>
                                <td style="font-weight: 600;">Địa chỉ nhận:</td>
                                <td>${order.dia_chi_nhan}</td>
                            </tr>
                        </table>

                        ${status === 'completed' ? `
                        <!-- Lời cảm ơn đặc biệt và gợi ý đánh giá sau mua -->
                        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <h4 style="color: #16a34a; margin: 0 0 5px 0; font-size: 15px; font-weight: bold;">🎁 Món quà tri ân khách hàng thân thiết!</h4>
                            <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.5;">
                                Hãy bớt chút thời gian đánh giá 5 sao cho sản phẩm để nhận ngay **50 Điểm Thưởng** vào tài khoản mua sắm của bạn. Đồng thời, chúng tôi vừa gửi tặng bạn 1 Voucher tri ân giảm **10%** cho lần mua hàng kế tiếp!
                            </p>
                        </div>
                        ` : ''}

                        <!-- Action Button -->
                        <div style="text-align: center; margin: 35px 0 20px 0;">
                            <a href="http://localhost:3000/orders" style="background-color: #e41e26; color: white; padding: 12px 25px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 6px rgba(228,30,38,0.2); display: inline-block;">
                                🔍 Xem chi tiết đơn hàng
                            </a>
                        </div>
                        
                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0 20px 0;">
                        
                        <!-- Footer -->
                        <div style="font-size: 12px; color: #999; text-align: center; line-height: 1.6;">
                            <p style="margin: 5px 0;">Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ hotline <strong>1900 1234</strong> hoặc trả lời email này.</p>
                            <p style="margin: 15px 0 0 0; color: #bbb;">© 2026 QuangHưng Mobile - Uy tín - Chất lượng - Giá tốt</p>
                        </div>
                    </div>
                </div>
            `
        };

        // In-app notification: luôn insert song song với email
        if (order.ma_kh) {
            await createInAppNotification({
                ma_kh: order.ma_kh,
                tieu_de: `${customGraphic} Đơn #${orderId}: ${statusLabel}`,
                noi_dung: statusDescription,
                loai: 'order_update',
                lien_ket: '/profile.html#orders'
            });
        }

        // Gửi email
        try {
            const info = await transporter.sendMail(mailOptions);
            console.log(`[EmailService] Email cập nhật trạng thái đơn hàng #${orderId} đã được gửi thành công: ${info.messageId}`);
            await logEmail({ email_nhan: recipientEmail, loai_email: 'status_update', ma_kh: order.ma_kh || null, ma_don: orderId, tieu_de: mailOptions.subject, trang_thai: 'sent' });
            return true;
        } catch (sendErr) {
            await logEmail({ email_nhan: recipientEmail, loai_email: 'status_update', ma_kh: order.ma_kh || null, ma_don: orderId, tieu_de: mailOptions.subject, trang_thai: 'failed', error_msg: sendErr.message });
            throw sendErr;
        }
    } catch (error) {
        console.error(`[EmailService] Lỗi khi gửi email cập nhật trạng thái đơn hàng #${orderId}:`, error);
        return false;
    }
}

/**
 * Gửi email Marketing / Newsletter khi có sản phẩm mới hoặc ưu đãi
 * @param {string} email Email người nhận
 * @param {string} subject Tiêu đề email
 * @param {string} content Nội dung HTML tùy chỉnh
 * @param {object} meta Optional: { ma_kh, ma_sp, loai_email='marketing' } để ghi log
 */
async function sendMarketingEmail(email, subject, content, meta = {}) {
    const loai_email = meta.loai_email || 'marketing';
    try {
        const mailOptions = {
            from: `"QuangHưng Mobile" <${process.env.EMAIL_USER || 'noreply@quanghungmobile.com'}>`,
            to: email,
            subject: subject,
            html: content
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Gửi email ${loai_email} tới ${email} thành công: ${info.messageId}`);
        await logEmail({ email_nhan: email, loai_email, ma_kh: meta.ma_kh || null, ma_sp: meta.ma_sp || null, tieu_de: subject, trang_thai: 'sent' });
        return true;
    } catch (error) {
        console.error(`[EmailService] Lỗi gửi email ${loai_email} tới ${email}:`, error.message);
        await logEmail({ email_nhan: email, loai_email, ma_kh: meta.ma_kh || null, ma_sp: meta.ma_sp || null, tieu_de: subject, trang_thai: 'failed', error_msg: error.message });
        return false;
    }
}

/**
 * Tìm tối đa N khách hàng phù hợp với 1 sản phẩm mới — scoring theo:
 *   +3 sở thích match hãng/keyword, +2 từng mua cùng hãng, +1 từng mua trong khoảng giá ±30%.
 * @param {number} productId
 * @param {object} opts { limit?: number }
 * @returns Array<{ma_kh, email, ho_ten, score, ten_sp, ten_hang, gia, anh_dai_dien}>
 */
async function findMatchingCustomers(productId, opts = {}) {
    const limit = Math.max(1, Math.min(parseInt(opts.limit) || 50, 200));

    // 1) Lấy thông tin sản phẩm
    const [prodRows] = await pool.query(
        `SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.ma_hang,
                hsx.ten_hang
         FROM san_pham sp
         LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
         WHERE sp.ma_sp = ?`,
        [productId]
    );
    if (prodRows.length === 0) {
        return { product: null, customers: [] };
    }
    const product = prodRows[0];
    const ten_hang = (product.ten_hang || '').toString();
    const gia = parseFloat(product.gia) || 0;
    const priceMin = Math.max(0, gia * 0.7);
    const priceMax = gia * 1.3;

    // 2) Scoring query: SUM-based aggregation
    // Mỗi customer được tính tổng điểm từ 3 nguồn (interests/orders-brand/orders-price), GROUP BY ma_kh.
    const scoringSql = `
        SELECT kh.ma_kh, kh.email, kh.ho_ten,
               SUM(score) AS score
        FROM (
            SELECT st.ma_kh, 3 AS score
            FROM so_thich_khach_hang st
            WHERE ? <> '' AND LOWER(st.tu_khoa) LIKE LOWER(CONCAT('%', ?, '%'))

            UNION ALL

            SELECT dh.ma_kh, 2 AS score
            FROM don_hang dh
            JOIN chi_tiet_don_hang ctdh ON ctdh.ma_don = dh.ma_don
            JOIN san_pham sp2 ON ctdh.ma_sp = sp2.ma_sp
            WHERE dh.ma_kh IS NOT NULL
              AND sp2.ma_hang = ?
              AND sp2.ma_sp <> ?

            UNION ALL

            SELECT dh.ma_kh, 1 AS score
            FROM don_hang dh
            JOIN chi_tiet_don_hang ctdh ON ctdh.ma_don = dh.ma_don
            JOIN san_pham sp3 ON ctdh.ma_sp = sp3.ma_sp
            WHERE dh.ma_kh IS NOT NULL
              AND sp3.gia BETWEEN ? AND ?
              AND sp3.ma_sp <> ?

            UNION ALL

            -- +1 điểm cold-start: KH mới đăng ký < 30 ngày
            SELECT ma_kh, 1 AS score
            FROM khach_hang
            WHERE ngay_tao >= DATE_SUB(NOW(), INTERVAL 30 DAY)
              AND email IS NOT NULL AND email <> ''
        ) AS scoring
        JOIN khach_hang kh ON kh.ma_kh = scoring.ma_kh
        WHERE kh.email IS NOT NULL AND kh.email <> ''
        GROUP BY kh.ma_kh, kh.email, kh.ho_ten
        ORDER BY score DESC, kh.ma_kh DESC
        LIMIT ?
    `;
    const [rows] = await pool.query(scoringSql, [
        ten_hang, ten_hang,                  // +3 interests LIKE %ten_hang%
        product.ma_hang, productId,          // +2 cùng hãng
        priceMin, priceMax, productId,       // +1 cùng khoảng giá
        limit
    ]);

    return {
        product: {
            ma_sp: product.ma_sp,
            ten_sp: product.ten_sp,
            gia: gia,
            anh_dai_dien: product.anh_dai_dien,
            ten_hang
        },
        customers: rows.map(r => ({
            ma_kh: r.ma_kh,
            email: r.email,
            ho_ten: r.ho_ten,
            score: Number(r.score) || 0
        }))
    };
}

/**
 * Build template HTML cho email "Sản phẩm mới" gửi cho khách
 */
function buildNewProductEmailHtml(product, customerName) {
    const formatVND = (n) => formatCurrency(parseFloat(n) || 0);
    const imgUrl = product.anh_dai_dien || 'https://placehold.co/300x300?text=Product';
    return `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f4f6f8;">
            <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 700;">QuangHưng Mobile</h1>
                <p style="color: #ffcdd2; margin: 8px 0 0; font-size: 15px;">🎁 Có sản phẩm mới phù hợp với bạn!</p>
            </div>
            <div style="background: #fff; padding: 28px 24px; border-radius: 0 0 8px 8px;">
                <p style="font-size: 15px; color: #333;">Xin chào <strong>${customerName || 'Quý khách'}</strong>,</p>
                <p style="font-size: 14px; color: #555; line-height: 1.6;">
                    Dựa trên sở thích và lịch sử mua sắm của bạn, chúng tôi vừa nhập về một mẫu mới mà chúng tôi tin bạn sẽ thích:
                </p>
                <div style="border: 1px solid #eee; border-radius: 8px; padding: 16px; margin: 20px 0; display: flex; gap: 16px; align-items: center;">
                    <img src="${imgUrl}" alt="${product.ten_sp}" style="width: 120px; height: 120px; object-fit: contain; border-radius: 6px;" />
                    <div style="flex: 1;">
                        <h3 style="margin: 0 0 8px 0; color: #333; font-size: 17px;">${product.ten_sp}</h3>
                        <p style="margin: 0 0 6px 0; color: #666; font-size: 13px;">Hãng: <strong>${product.ten_hang || 'N/A'}</strong></p>
                        <p style="margin: 0; color: #e41e26; font-size: 20px; font-weight: bold;">${formatVND(product.gia)}</p>
                    </div>
                </div>
                <div style="text-align: center; margin: 28px 0 10px;">
                    <a href="http://localhost:3000/product-detail.html?id=${product.ma_sp}"
                       style="background-color: #e41e26; color: white; padding: 12px 28px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 14px; display: inline-block;">
                       🔍 Xem chi tiết sản phẩm
                    </a>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 28px 0 16px;">
                <p style="font-size: 11px; color: #999; text-align: center; line-height: 1.6;">
                    Email được gửi đến bạn vì bạn đã đăng ký tài khoản tại QuangHưng Mobile. <br>
                    © 2026 QuangHưng Mobile
                </p>
            </div>
        </div>
    `;
}

/**
 * Gửi email "sản phẩm mới phù hợp" cho danh sách KH match
 * @param {number} productId
 * @param {object} opts { limit?: number, sendImmediate?: boolean }
 * @returns { matched, sent, failed, customers? }
 */
async function notifyMatchingCustomers(productId, opts = {}) {
    const limit = parseInt(opts.limit) || 50;
    const sendImmediate = opts.sendImmediate !== false; // default true

    const { product, customers } = await findMatchingCustomers(productId, { limit });

    if (!product) {
        console.log(`[EmailService] notifyMatchingCustomers: sản phẩm #${productId} không tồn tại`);
        return { matched: 0, sent: 0, failed: 0, customers: [] };
    }

    if (!sendImmediate) {
        // Preview mode (dry run)
        return { matched: customers.length, sent: 0, failed: 0, customers };
    }

    const subject = `🎁 ${product.ten_sp} vừa về - giá ${formatCurrency(parseFloat(product.gia) || 0)}`;
    let sent = 0, failed = 0;

    // Loop tuần tự với delay 100ms để tránh Gmail rate-limit
    for (const c of customers) {
        // In-app notification: gửi trước (luôn thành công ngay cả khi email fail)
        await createInAppNotification({
            ma_kh: c.ma_kh,
            tieu_de: `🎁 ${product.ten_sp} vừa về!`,
            noi_dung: `Sản phẩm phù hợp với bạn vừa được nhập về - giá ${formatCurrency(parseFloat(product.gia) || 0)}. Xem chi tiết ngay!`,
            loai: 'marketing',
            lien_ket: `/product-detail.html?id=${productId}`
        });
        const html = buildNewProductEmailHtml(product, c.ho_ten);
        const ok = await sendMarketingEmail(c.email, subject, html, { ma_kh: c.ma_kh, ma_sp: productId, loai_email: 'marketing' });
        if (ok) sent++; else failed++;
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`[EmailService] notifyMatchingCustomers product=${productId}: matched=${customers.length} sent=${sent} failed=${failed}`);
    return { matched: customers.length, sent, failed };
}

// ============================================================
// AUTO TRIGGERS — Promotion / Back-in-Stock / Pending Reminder
// ============================================================

// Helper: insert vào thong_bao (in-app notification) — có dedupe chống spam
async function createInAppNotification({ ma_kh, tieu_de, noi_dung, loai = 'system', lien_ket = null }) {
    try {
        // Dedupe: nếu trong 60s gần đây đã có notification giống hệt cho cùng user → bỏ qua
        const [recent] = await pool.query(
            `SELECT ma_tb FROM thong_bao
             WHERE ma_kh = ? AND loai = ? AND tieu_de = ? AND noi_dung = ?
               AND ngay_tao >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
             LIMIT 1`,
            [ma_kh, loai, tieu_de, noi_dung]
        );
        if (recent.length > 0) {
            return true; // coi như thành công, đã có notification gần đây
        }
        await pool.query(
            `INSERT INTO thong_bao (ma_kh, tieu_de, noi_dung, loai, lien_ket, da_doc, ngay_tao)
             VALUES (?, ?, ?, ?, ?, 0, NOW())`,
            [ma_kh, tieu_de, noi_dung, loai, lien_ket]
        );
        return true;
    } catch (e) {
        console.error('[createInAppNotification] Lỗi:', e && e.message);
        return false;
    }
}

// Tìm KH "có liên quan" SP — UNION nhiều nguồn, group SUM điểm
async function findCustomersInterestedInProduct(productId, limit = 50) {
    const sql = `
        SELECT kh.ma_kh, kh.email, kh.ho_ten, SUM(score) AS score
        FROM (
            -- +5: KH yêu thích SP
            SELECT ma_kh, 5 AS score FROM san_pham_yeu_thich WHERE ma_sp = ?
            UNION ALL
            -- +3: SP đang trong giỏ hàng của KH
            SELECT gh.ma_kh, 3 AS score
            FROM gio_hang gh
            JOIN chi_tiet_gio_hang ctgh ON ctgh.ma_gio_hang = gh.ma_gio_hang
            WHERE ctgh.ma_sp = ?
            UNION ALL
            -- +2: KH từng mua SP cùng hãng
            SELECT dh.ma_kh, 2 AS score
            FROM don_hang dh
            JOIN chi_tiet_don_hang ctdh ON ctdh.ma_don = dh.ma_don
            JOIN san_pham sp2 ON ctdh.ma_sp = sp2.ma_sp
            JOIN san_pham sp_target ON sp_target.ma_sp = ?
            WHERE dh.ma_kh IS NOT NULL AND sp2.ma_hang = sp_target.ma_hang AND sp2.ma_sp <> ?
        ) AS scoring
        JOIN khach_hang kh ON kh.ma_kh = scoring.ma_kh
        WHERE kh.email IS NOT NULL AND kh.email <> ''
        GROUP BY kh.ma_kh, kh.email, kh.ho_ten
        ORDER BY score DESC, kh.ma_kh DESC
        LIMIT ?
    `;
    try {
        const [rows] = await pool.query(sql, [productId, productId, productId, productId, limit]);
        return rows.map(r => ({ ma_kh: r.ma_kh, email: r.email, ho_ten: r.ho_ten, score: Number(r.score) || 0 }));
    } catch (e) {
        // Bảng gio_hang có thể tên khác, fallback chỉ dùng wishlist + don_hang
        console.warn('[findCustomersInterestedInProduct] fallback (no cart join):', e.message);
        const fallback = `
            SELECT kh.ma_kh, kh.email, kh.ho_ten, SUM(score) AS score
            FROM (
                SELECT ma_kh, 5 AS score FROM san_pham_yeu_thich WHERE ma_sp = ?
                UNION ALL
                SELECT dh.ma_kh, 2 AS score
                FROM don_hang dh
                JOIN chi_tiet_don_hang ctdh ON ctdh.ma_don = dh.ma_don
                JOIN san_pham sp2 ON ctdh.ma_sp = sp2.ma_sp
                JOIN san_pham sp_target ON sp_target.ma_sp = ?
                WHERE dh.ma_kh IS NOT NULL AND sp2.ma_hang = sp_target.ma_hang AND sp2.ma_sp <> ?
            ) AS scoring
            JOIN khach_hang kh ON kh.ma_kh = scoring.ma_kh
            WHERE kh.email IS NOT NULL AND kh.email <> ''
            GROUP BY kh.ma_kh, kh.email, kh.ho_ten
            ORDER BY score DESC LIMIT ?
        `;
        const [rows] = await pool.query(fallback, [productId, productId, productId, limit]);
        return rows.map(r => ({ ma_kh: r.ma_kh, email: r.email, ho_ten: r.ho_ten, score: Number(r.score) || 0 }));
    }
}

// Notify KH về khuyến mãi/flash sale (gọi khi admin tạo khuyến mãi)
async function notifyPromotionToCustomers(promotionId) {
    try {
        const [kmRows] = await pool.query(
            `SELECT km.*, sp.ten_sp, sp.anh_dai_dien, sp.gia, sp.gia_giam
             FROM khuyen_mai km
             LEFT JOIN san_pham sp ON km.ma_sp = sp.ma_sp
             WHERE km.ma_km = ?`,
            [promotionId]
        );
        if (kmRows.length === 0) return { matched: 0, sent: 0, failed: 0 };
        const km = kmRows[0];

        let customers = [];
        if (km.ma_sp) {
            customers = await findCustomersInterestedInProduct(km.ma_sp, 50);
        } else {
            // Broadcast: lấy top 50 KH gần đây nhất (có đặt đơn) — tránh spam KH cũ
            const [rows] = await pool.query(
                `SELECT DISTINCT kh.ma_kh, kh.email, kh.ho_ten
                 FROM khach_hang kh
                 LEFT JOIN don_hang dh ON dh.ma_kh = kh.ma_kh
                 WHERE kh.email IS NOT NULL AND kh.email <> ''
                 ORDER BY dh.ngay_dat DESC, kh.ma_kh DESC
                 LIMIT 50`
            );
            customers = rows.map(r => ({ ma_kh: r.ma_kh, email: r.email, ho_ten: r.ho_ten }));
        }

        let sent = 0, failed = 0;
        const tieu_de = km.ma_sp
            ? `🔥 ${km.ten_sp || 'Sản phẩm bạn quan tâm'} đang giảm ${km.gia_tri}${km.loai === 'percent' ? '%' : 'đ'}!`
            : `🎁 Mã giảm giá mới: ${km.code} — giảm ${km.gia_tri}${km.loai === 'percent' ? '%' : 'đ'}`;
        const noi_dung_short = km.ma_sp
            ? `Sản phẩm "${km.ten_sp}" đang có mã ${km.code}. Áp dụng ngay!`
            : `Mã ${km.code} có thể dùng cho toàn cửa hàng. Hết hạn: ${new Date(km.ngay_ket_thuc).toLocaleDateString('vi-VN')}.`;
        const lien_ket = km.ma_sp ? `/product-detail.html?id=${km.ma_sp}` : '/promotions.html';

        for (const c of customers) {
            // In-app notification (luôn gửi)
            await createInAppNotification({
                ma_kh: c.ma_kh,
                tieu_de,
                noi_dung: noi_dung_short,
                loai: 'promotion',
                lien_ket
            });
            // Email (best-effort)
            const html = `
                <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="color: white; margin: 0;">🔥 Khuyến mãi đặc biệt!</h1>
                    </div>
                    <div style="background: #fff; padding: 28px 24px; border-radius: 0 0 8px 8px;">
                        <p>Xin chào <strong>${c.ho_ten || 'Quý khách'}</strong>,</p>
                        <h2 style="color: #e41e26;">${tieu_de}</h2>
                        <p>${noi_dung_short}</p>
                        <div style="background: #fff3cd; border: 2px dashed #f59e0b; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
                            <div style="font-size: 12px; color: #92400e;">MÃ GIẢM GIÁ</div>
                            <div style="font-size: 24px; font-weight: bold; color: #b45309; font-family: monospace;">${km.code}</div>
                        </div>
                        <div style="text-align: center; margin: 20px 0;">
                            <a href="http://localhost:3000${lien_ket}" style="background-color: #e41e26; color: white; padding: 12px 28px; text-decoration: none; border-radius: 25px; font-weight: bold;">Mua ngay</a>
                        </div>
                        <p style="font-size: 12px; color: #999; text-align: center;">Hết hạn: ${new Date(km.ngay_ket_thuc).toLocaleDateString('vi-VN')}</p>
                    </div>
                </div>
            `;
            const ok = await sendMarketingEmail(c.email, tieu_de, html, { ma_kh: c.ma_kh, ma_sp: km.ma_sp || null, loai_email: 'marketing' });
            if (ok) sent++; else failed++;
            await new Promise(r => setTimeout(r, 100));
        }
        console.log(`[Promotion notify] km=${promotionId} matched=${customers.length} sent=${sent} failed=${failed}`);
        return { matched: customers.length, sent, failed };
    } catch (e) {
        console.error('[notifyPromotionToCustomers] error:', e.message);
        return { matched: 0, sent: 0, failed: 0, error: e.message };
    }
}

// Notify KH yêu thích SP khi SP về lại hàng
async function notifyBackInStock(productId) {
    try {
        const [rows] = await pool.query(
            `SELECT kh.ma_kh, kh.email, kh.ho_ten, sp.ten_sp, sp.anh_dai_dien, sp.gia
             FROM san_pham_yeu_thich yt
             JOIN khach_hang kh ON kh.ma_kh = yt.ma_kh
             JOIN san_pham sp ON sp.ma_sp = yt.ma_sp
             WHERE yt.ma_sp = ? AND kh.email IS NOT NULL AND kh.email <> ''`,
            [productId]
        );
        if (rows.length === 0) {
            console.log(`[Back-in-stock] product=${productId} no subscribers`);
            return { matched: 0, sent: 0, failed: 0 };
        }
        const product = { ten_sp: rows[0].ten_sp, anh_dai_dien: rows[0].anh_dai_dien, gia: rows[0].gia };
        const tieu_de = `✅ ${product.ten_sp} đã có hàng trở lại!`;
        const lien_ket = `/product-detail.html?id=${productId}`;
        let sent = 0, failed = 0;
        for (const c of rows) {
            await createInAppNotification({
                ma_kh: c.ma_kh,
                tieu_de,
                noi_dung: `Sản phẩm bạn yêu thích đã có hàng trở lại. Đặt ngay kẻo hết!`,
                loai: 'back_in_stock',
                lien_ket
            });
            const html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #16a34a, #15803d); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="color: white; margin: 0;">✅ SP yêu thích đã có hàng!</h1>
                    </div>
                    <div style="background: #fff; padding: 28px;">
                        <p>Xin chào <strong>${c.ho_ten || 'Quý khách'}</strong>,</p>
                        <p>Sản phẩm bạn từng yêu thích vừa được nhập về:</p>
                        <div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; display: flex; gap: 16px;">
                            <img src="${product.anh_dai_dien || ''}" style="width: 120px; height: 120px; object-fit: contain;" />
                            <div>
                                <h3 style="margin: 0 0 8px;">${product.ten_sp}</h3>
                                <p style="color: #e41e26; font-size: 20px; font-weight: bold; margin: 0;">${formatCurrency(parseFloat(product.gia) || 0)}</p>
                            </div>
                        </div>
                        <div style="text-align: center; margin: 28px 0;">
                            <a href="http://localhost:3000${lien_ket}" style="background-color: #16a34a; color: white; padding: 12px 28px; text-decoration: none; border-radius: 25px; font-weight: bold;">Mua ngay</a>
                        </div>
                    </div>
                </div>
            `;
            const ok = await sendMarketingEmail(c.email, tieu_de, html, { ma_kh: c.ma_kh, ma_sp: productId, loai_email: 'marketing' });
            if (ok) sent++; else failed++;
            await new Promise(r => setTimeout(r, 100));
        }
        console.log(`[Back-in-stock] product=${productId} matched=${rows.length} sent=${sent} failed=${failed}`);
        return { matched: rows.length, sent, failed };
    } catch (e) {
        console.error('[notifyBackInStock] error:', e.message);
        return { matched: 0, sent: 0, failed: 0, error: e.message };
    }
}

// Email nhắc đơn pending + voucher 5% — dùng bởi cron
async function sendPendingPaymentReminder(orderId) {
    try {
        const [orders] = await pool.query(
            `SELECT dh.*, kh.email AS kh_email, kh.ho_ten AS kh_name
             FROM don_hang dh
             LEFT JOIN khach_hang kh ON dh.ma_kh = kh.ma_kh
             WHERE dh.ma_don = ?`,
            [orderId]
        );
        if (orders.length === 0) return { sent: false, reason: 'order not found' };
        const order = orders[0];
        if (!order.kh_email) return { sent: false, reason: 'no email' };

        // Sinh voucher REMIND
        const crypto = require('crypto');
        const code = `REMIND-${orderId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        try {
            await pool.query(
                `INSERT INTO khuyen_mai
                   (code, loai, loai_km, gia_tri, mo_ta, dieu_kien_toi_thieu,
                    ngay_bat_dau, ngay_ket_thuc, so_luong, so_luong_da_dung,
                    trang_thai, ngay_tao, ma_kh)
                 VALUES (?, 'percent', 'discount', 5, ?, 0,
                         NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY), 1, 0,
                         'active', NOW(), ?)`,
                [code, `Nhắc thanh toán đơn #${orderId} - giảm 5%`, order.ma_kh]
            );
        } catch (e) {
            console.warn('[Reminder voucher insert]', e.message);
        }

        const subject = `⏰ Đơn #${orderId} đang chờ thanh toán - Tặng bạn mã giảm 5%`;
        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: white; margin: 0;">⏰ Đơn hàng đang chờ thanh toán</h1>
                </div>
                <div style="background: #fff; padding: 28px;">
                    <p>Xin chào <strong>${order.kh_name || 'Quý khách'}</strong>,</p>
                    <p>Đơn hàng <strong>#${orderId}</strong> tổng giá trị <strong>${formatCurrency(parseFloat(order.tong_tien) || 0)}</strong> của bạn vẫn đang chờ thanh toán. Chúng tôi tặng bạn mã giảm 5% nếu hoàn tất trong 7 ngày tới:</p>
                    <div style="background: #fff3cd; border: 2px dashed #f59e0b; padding: 18px; text-align: center; border-radius: 8px; margin: 20px 0;">
                        <div style="font-size: 13px; color: #92400e;">MÃ TRI ÂN -5%</div>
                        <div style="font-size: 22px; font-weight: bold; color: #b45309; font-family: monospace;">${code}</div>
                    </div>
                    <div style="text-align: center; margin: 28px 0;">
                        <a href="http://localhost:3000/profile.html#orders" style="background-color: #f59e0b; color: white; padding: 12px 28px; text-decoration: none; border-radius: 25px; font-weight: bold;">Hoàn tất thanh toán</a>
                    </div>
                </div>
            </div>
        `;
        const ok = await sendMarketingEmail(order.kh_email, subject, html, { ma_kh: order.ma_kh, ma_don: orderId, loai_email: 'voucher' });

        if (ok) {
            await pool.query(`UPDATE don_hang SET reminder_sent_at = NOW() WHERE ma_don = ?`, [orderId]);
            await createInAppNotification({
                ma_kh: order.ma_kh,
                tieu_de: `Đơn #${orderId} chờ thanh toán`,
                noi_dung: `Đơn của bạn vẫn chờ thanh toán. Dùng mã ${code} để giảm 5% trong 7 ngày tới.`,
                loai: 'voucher',
                lien_ket: '/profile.html#orders'
            });
        }
        return { sent: ok, code };
    } catch (e) {
        console.error('[sendPendingPaymentReminder]', e.message);
        return { sent: false, error: e.message };
    }
}

/**
 * Gửi email cập nhật tiến trình yêu cầu Đổi - Trả - Hoàn tiền
 */
async function sendReturnStatusUpdate(claimId, status, details) {
    try {
        const { email, customerName, productName, type, orderId, refundAmount, note } = details;
        
        let typeLabel = 'Đổi trả hàng';
        if (type === 'doi') typeLabel = 'Đổi sản phẩm mới';
        else if (type === 'tra') typeLabel = 'Trả hàng';
        else if (type === 'hoan_tien') typeLabel = 'Hoàn tiền';

        let statusLabel = 'Đang xử lý';
        let statusText = 'Yêu cầu đổi trả của bạn đang được xử lý.';
        let customGraphic = '🔄';

        if (status === 'approved') {
            statusLabel = 'Yêu cầu đã được phê duyệt';
            statusText = 'Yêu cầu đổi trả đã được chấp thuận. Vui lòng gửi/mang thiết bị tới cửa hàng để chúng tôi tiến hành đánh giá chi tiết.';
            customGraphic = '✅';
        } else if (status === 'processing') {
            statusLabel = 'Đang tiến hành xử lý đổi/trả';
            statusText = 'Bộ phận kỹ thuật đang kiểm tra tình trạng máy của bạn để thực hiện đổi sản phẩm mới hoặc xử lý hoàn tiền.';
            customGraphic = '⚙️';
        } else if (status === 'completed') {
            statusLabel = 'Đã hoàn thành đổi trả';
            statusText = `Yêu cầu đổi trả của bạn đã được hoàn tất thành công. ${type === 'doi' ? 'Sản phẩm đổi mới đã được bàn giao/gửi đi.' : `Số tiền **${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(refundAmount)}** đã được hoàn lại.`}`;
            customGraphic = '🎉';
        } else if (status === 'rejected') {
            statusLabel = 'Từ chối đổi trả';
            statusText = `Yêu cầu đổi trả bị từ chối. Lý do từ chối: **${note || 'Sản phẩm không đáp ứng đủ điều kiện chính sách đổi trả của hãng (va đập, hư hại do người dùng, quá thời hạn...)'}**.`;
            customGraphic = '❌';
        }

        const subject = `${customGraphic} Cập nhật yêu cầu Đổi trả #${claimId} - QuangHưng Mobile`;
        const mailOptions = {
            from: `"QuangHưng Mobile" <${process.env.EMAIL_USER || 'noreply@quanghungmobile.com'}>`,
            to: email,
            subject,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 30px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 24px;">${customGraphic} Cập Nhật Tiến Độ Đổi Trả</h1>
                        <p style="margin: 5px 0 0 0; opacity: 0.8;">QuangHưng Mobile Support</p>
                    </div>
                    <div style="padding: 25px; background: #ffffff;">
                        <p>Xin chào <strong>${customerName || 'Quý khách'}</strong>,</p>
                        <p>Chúng tôi xin thông báo yêu cầu đổi trả mã số <strong>#${claimId}</strong> cho đơn hàng <strong>#${orderId}</strong> đã có cập nhật mới:</p>
                        
                        <div style="background: #f9f9f9; padding: 20px; border-left: 4px solid #e41e26; margin: 20px 0; border-radius: 4px;">
                            <h3 style="margin: 0 0 8px 0; color: #e41e26; font-size: 18px;">Trạng thái: ${statusLabel}</h3>
                            <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.5;">${statusText}</p>
                        </div>

                        <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 15px;">
                            <tr>
                                <td style="padding: 6px 0; color: #666; font-weight: bold; width: 140px;">Sản phẩm:</td>
                                <td style="padding: 6px 0; color: #333;">${productName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 6px 0; color: #666; font-weight: bold;">Loại yêu cầu:</td>
                                <td style="padding: 6px 0; color: #333; font-weight: bold;">${typeLabel}</td>
                            </tr>
                            ${refundAmount > 0 ? `
                            <tr>
                                <td style="padding: 6px 0; color: #666; font-weight: bold;">Số tiền hoàn:</td>
                                <td style="padding: 6px 0; color: #e41e26; font-weight: bold; font-size: 16px;">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(refundAmount)}</td>
                            </tr>
                            ` : ''}
                            ${note ? `
                            <tr>
                                <td style="padding: 6px 0; color: #666; font-weight: bold;">Ghi chú từ cửa hàng:</td>
                                <td style="padding: 6px 0; color: #555; font-style: italic;">"${note}"</td>
                            </tr>
                            ` : ''}
                        </table>

                        <div style="text-align: center; margin: 30px 0 10px 0;">
                            <a href="http://localhost:3000/tra-cuu-doi-tra.html?query=${claimId}" style="background-color: #e41e26; color: white; padding: 12px 24px; text-decoration: none; border-radius: 20px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px rgba(228,30,38,0.2); display: inline-block;">
                                🔍 Tra cứu tiến độ chi tiết
                            </a>
                        </div>

                        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0 15px 0;">
                        <div style="font-size: 12px; color: #999; text-align: center; line-height: 1.6;">
                            <p style="margin: 5px 0;">Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ Zalo/Hotline <strong>0355745120</strong>.</p>
                            <p style="margin: 10px 0 0 0; color: #bbb;">© 2026 QuangHưng Mobile</p>
                        </div>
                    </div>
                </div>
            `
        };

        // Gửi email
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Email cập nhật đổi trả #${claimId} đã được gửi thành công: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error(`[EmailService] Lỗi khi gửi email cập nhật đổi trả #${claimId}:`, error);
        return false;
    }
}

/**
 * Gửi email chăm sóc khách hàng sau 3 ngày nhận hàng
 */
async function sendPostPurchaseFollowUp3Days(orderId) {
    try {
        console.log(`[EmailService] Bắt đầu chuẩn bị email CSKH 3 ngày cho đơn hàng #${orderId}`);
        
        // 1. Truy vấn đơn hàng
        const [orders] = await pool.query(
            `SELECT dh.*, kh.email as kh_email, kh.ho_ten as kh_name
             FROM don_hang dh
             LEFT JOIN khach_hang kh ON dh.ma_kh = kh.ma_kh
             WHERE dh.ma_don = ?`,
            [orderId]
        );

        if (orders.length === 0) return { sent: false, reason: 'order not found' };
        const order = orders[0];
        if (!order.kh_email) return { sent: false, reason: 'no email' };

        // 2. Lấy danh sách sản phẩm trong đơn hàng
        const [items] = await pool.query(
            `SELECT ctdh.*, sp.ten_sp
             FROM chi_tiet_don_hang ctdh
             JOIN san_pham sp ON ctdh.ma_sp = sp.ma_sp
             WHERE ctdh.ma_don = ?`,
            [orderId]
        );

        const productNames = items.map(item => item.ten_sp).join(', ');

        const subject = `💝 QuangHưng Mobile - Khảo sát trải nghiệm sau 3 ngày sử dụng`;
        const mailOptions = {
            from: `"QuangHưng Mobile" <${process.env.EMAIL_USER || 'noreply@quanghungmobile.com'}>`,
            to: order.kh_email,
            subject,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 30px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 24px;">💝 Cảm Ơn Bạn Đã Tin Tưởng</h1>
                        <p style="margin: 5px 0 0 0; opacity: 0.8;">QuangHưng Mobile Customer Care</p>
                    </div>
                    <div style="padding: 25px; background: #ffffff;">
                        <p>Xin chào <strong>${order.kh_name || 'Quý khách'}</strong>,</p>
                        <p>Sản phẩm <strong>${productNames}</strong> trong đơn hàng <strong>#${orderId}</strong> đã đồng hành cùng bạn được 3 ngày. Chúng tôi rất hy vọng thiết bị đang hoạt động hoàn hảo và mang lại trải nghiệm tuyệt vời cho bạn.</p>
                        
                        <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; border-radius: 4px;">
                            <h4 style="color: #16a34a; margin: 0 0 5px 0; font-size: 15px; font-weight: bold;">🎁 Món quà tri ân - Tặng 50 Điểm Thưởng!</h4>
                            <p style="margin: 0; font-size: 13px; color: #166534; line-height: 1.5;">
                                Hãy bớt chút thời gian đánh giá 5 sao cho sản phẩm để giúp chúng tôi cải thiện chất lượng phục vụ và nhận ngay **50 Điểm Thưởng** tích lũy vào tài khoản thành viên của bạn.
                            </p>
                        </div>

                        <div style="text-align: center; margin: 30px 0 20px 0;">
                            <a href="http://localhost:3000/profile.html#orders" style="background-color: #e41e26; color: white; padding: 12px 24px; text-decoration: none; border-radius: 20px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px rgba(228,30,38,0.2); display: inline-block;">
                                ✍️ Đánh giá sản phẩm ngay
                            </a>
                        </div>

                        <p style="font-size: 14px; color: #555; line-height: 1.6;">
                            Chúng tôi xin nhắc lại thông tin bảo hành điện tử của sản phẩm đã được tự động kích hoạt. Bạn có thể tra cứu thông tin bảo hành, kiểm tra thời hạn hoặc gửi yêu cầu hỗ trợ sửa chữa online bất cứ lúc nào tại:
                        </p>

                        <div style="text-align: center; margin: 15px 0;">
                            <a href="http://localhost:3000/tra-cuu-bao-hanh.html" style="color: #e41e26; font-weight: bold; text-decoration: underline; font-size: 14px;">
                                🔍 Trang tra cứu bảo hành điện tử
                            </a>
                        </div>

                        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0 15px 0;">
                        <div style="font-size: 12px; color: #999; text-align: center; line-height: 1.6;">
                            <p style="margin: 5px 0;">Nếu bạn cần bất kỳ hỗ trợ nào về kỹ thuật, vui lòng liên hệ tổng đài <strong>0355745120</strong>.</p>
                            <p style="margin: 10px 0 0 0; color: #bbb;">© 2026 QuangHưng Mobile - Uy tín làm nên thương hiệu</p>
                        </div>
                    </div>
                </div>
            `
        };

        // Gửi email
        const ok = await transporter.sendMail(mailOptions);
        if (ok) {
            await logEmail({
                email_nhan: order.kh_email,
                loai_email: 'marketing',
                ma_kh: order.ma_kh,
                ma_don: orderId,
                tieu_de: `[CSKH 3 Ngày] Khảo sát trải nghiệm sản phẩm`,
                trang_thai: 'sent'
            });
            return { sent: true };
        }
        return { sent: false };
    } catch (error) {
        console.error(`[EmailService] Lỗi gửi email CSKH 3 ngày cho đơn #${orderId}:`, error);
        return { sent: false, error: error.message };
    }
}

/**
 * Gửi email chăm sóc khách hàng sau 15 ngày nhận hàng kèm cẩm nang và mã giảm giá
 */
async function sendPostPurchaseFollowUp15Days(orderId) {
    try {
        console.log(`[EmailService] Bắt đầu chuẩn bị email CSKH 15 ngày cho đơn hàng #${orderId}`);
        
        // 1. Truy vấn đơn hàng
        const [orders] = await pool.query(
            `SELECT dh.*, kh.email as kh_email, kh.ho_ten as kh_name
             FROM don_hang dh
             LEFT JOIN khach_hang kh ON dh.ma_kh = kh.ma_kh
             WHERE dh.ma_don = ?`,
            [orderId]
        );

        if (orders.length === 0) return { sent: false, reason: 'order not found' };
        const order = orders[0];
        if (!order.kh_email) return { sent: false, reason: 'no email' };

        // 2. Tạo mã voucher giảm giá 10%
        const crypto = require('crypto');
        const voucherCode = `CSKH15-${orderId}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        
        try {
            await pool.query(
                `INSERT INTO khuyen_mai
                   (code, loai, loai_km, gia_tri, mo_ta, dieu_kien_toi_thieu,
                    ngay_bat_dau, ngay_ket_thuc, so_luong, so_luong_da_dung,
                    trang_thai, ngay_tao, ma_kh)
                 VALUES (?, 'percent', 'discount', 10, ?, 0,
                         NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 1, 0,
                         'active', NOW(), ?)`,
                [voucherCode, `Voucher CSKH 15 ngày sau mua đơn #${orderId} - giảm 10% phụ kiện`, order.ma_kh]
            );
        } catch (e) {
            console.warn('[CSKH 15 days voucher insert error]', e.message);
        }

        const subject = `📘 QuangHưng Mobile - Cẩm nang bảo dưỡng thiết bị & Quà tặng tri ân`;
        const mailOptions = {
            from: `"QuangHưng Mobile" <${process.env.EMAIL_USER || 'noreply@quanghungmobile.com'}>`,
            to: order.kh_email,
            subject,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 30px; text-align: center; color: white;">
                        <h1 style="margin: 0; font-size: 24px;">📘 Cẩm Nang Sử Dụng Điện Thoại</h1>
                        <p style="margin: 5px 0 0 0; opacity: 0.8;">Bảo dưỡng thiết bị bền bỉ cùng QuangHưng Mobile</p>
                    </div>
                    <div style="padding: 25px; background: #ffffff;">
                        <p>Xin chào <strong>${order.kh_name || 'Quý khách'}</strong>,</p>
                        <p>Đã 15 ngày trôi qua kể từ khi bạn nhận được sản phẩm từ QuangHưng Mobile. Để giúp điện thoại của bạn hoạt động bền bỉ, mượt mà và tối ưu pin nhất, chúng tôi xin chia sẻ cẩm nang bảo dưỡng hữu ích:</p>
                        
                        <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; font-size: 14px; color: #334155; line-height: 1.6;">
                            <h4 style="margin: 0 0 8px 0; color: #1e3a8a; font-weight: bold;">🔋 Hướng dẫn sạc pin khoa học:</h4>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li>Duy trì pin trong khoảng từ <strong>20% đến 80%</strong> để tối ưu tuổi thọ Cell pin.</li>
                                <li>Tránh sạc qua đêm quá thường xuyên hoặc sử dụng củ sạc không rõ nguồn gốc.</li>
                                <li>Không vừa sạc vừa chơi game nặng làm tăng nhiệt độ pin quá mức.</li>
                            </ul>
                            
                            <h4 style="margin: 15px 0 8px 0; color: #1e3a8a; font-weight: bold;">🧼 Vệ sinh & Bảo quản:</h4>
                            <ul style="margin: 0; padding-left: 20px;">
                                <li>Dùng khăn sợi mịn và dung dịch cồn chuyên dụng lau nhẹ bề mặt kính.</li>
                                <li>Tránh để thiết bị tiếp xúc trực tiếp với ánh nắng gắt hoặc nơi ẩm ướt.</li>
                            </ul>
                        </div>

                        <div style="border: 2px dashed #e41e26; background-color: #fff8f8; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
                            <h3 style="color: #e41e26; margin: 0 0 10px 0; font-size: 18px;">🎁 Mã Giảm Giá Tri Ân 10%</h3>
                            <p style="margin: 0 0 15px 0; font-size: 14px; color: #555;">Chúng tôi tặng bạn voucher giảm <strong>10%</strong> khi mua sắm Phụ kiện (Sạc dự phòng, Cáp sạc, Tai nghe, Ốp lưng) tại cửa hàng hoặc online:</p>
                            <span style="font-family: monospace; font-size: 20px; font-weight: bold; background-color: #fff; padding: 8px 16px; border: 1px solid #ffccd0; border-radius: 4px; color: #e41e26; letter-spacing: 1px; display: inline-block;">
                                ${voucherCode}
                            </span>
                            <p style="margin: 10px 0 0 0; font-size: 11px; color: #888;">*Thời hạn sử dụng: 30 ngày kể từ ngày nhận email này. Áp dụng cho tài khoản của bạn.</p>
                        </div>

                        <div style="text-align: center; margin: 25px 0 10px 0;">
                            <a href="http://localhost:3000/promotions.html" style="background-color: #e41e26; color: white; padding: 12px 24px; text-decoration: none; border-radius: 20px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px rgba(228,30,38,0.2); display: inline-block;">
                                🛒 Sử dụng mã ngay
                            </a>
                        </div>

                        <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0 15px 0;">
                        <div style="font-size: 12px; color: #999; text-align: center; line-height: 1.6;">
                            <p style="margin: 5px 0;">Cảm ơn bạn đã đồng hành cùng QuangHưng Mobile.</p>
                            <p style="margin: 10px 0 0 0; color: #bbb;">© 2026 QuangHưng Mobile</p>
                        </div>
                    </div>
                </div>
            `
        };

        // Gửi email
        const ok = await transporter.sendMail(mailOptions);
        if (ok) {
            await logEmail({
                email_nhan: order.kh_email,
                loai_email: 'marketing',
                ma_kh: order.ma_kh,
                ma_don: orderId,
                tieu_de: `[CSKH 15 Ngày] Cẩm nang sử dụng & Quà tặng tri ân`,
                trang_thai: 'sent'
            });
            return { sent: true };
        }
        return { sent: false };
    } catch (error) {
        console.error(`[EmailService] Lỗi gửi email CSKH 15 ngày cho đơn #${orderId}:`, error);
        return { sent: false, error: error.message };
    }
}

module.exports = {
    sendOrderConfirmation,
    sendOrderStatusUpdate,
    sendMarketingEmail,
    findMatchingCustomers,
    notifyMatchingCustomers,
    logEmail,
    createInAppNotification,
    findCustomersInterestedInProduct,
    notifyPromotionToCustomers,
    notifyBackInStock,
    sendPendingPaymentReminder,
    sendReturnStatusUpdate,
    sendPostPurchaseFollowUp3Days,
    sendPostPurchaseFollowUp15Days
};
