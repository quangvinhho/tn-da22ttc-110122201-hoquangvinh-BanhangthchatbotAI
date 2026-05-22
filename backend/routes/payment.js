/**
 * MoMo Payment Gateway Integration
 * QuangHưng Mobile - E-commerce 2025
 * 
 * API Documentation: https://developers.momo.vn/v3/docs/payment/api/wallet/onetime
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../config/database');

// MoMo Configuration từ .env
const MOMO_CONFIG = {
  partnerCode: process.env.MOMO_PARTNER_CODE || 'MOMO',
  accessKey: process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85',
  secretKey: process.env.MOMO_SECRET_KEY || 'K951B6PE1waDMi640xX08PD3vg6EkVlz',
  endpoint: process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api',
  redirectUrl: process.env.MOMO_REDIRECT_URL || 'http://localhost:3000/order-success.html',
  ipnUrl: process.env.MOMO_IPN_URL || 'http://localhost:3000/api/payment/momo/ipn'
};

/**
 * Tạo chữ ký HMAC SHA256 cho MoMo
 */
function createMoMoSignature(rawSignature) {
  return crypto
    .createHmac('sha256', MOMO_CONFIG.secretKey)
    .update(rawSignature)
    .digest('hex');
}

/**
 * MoMo Request Types:
 * - captureWallet: QR Code + Ví MoMo
 * - payWithATM: Thẻ ATM nội địa
 * - payWithCC: Thẻ tín dụng quốc tế (Visa/Master/JCB)
 */
const MOMO_REQUEST_TYPES = {
  qr: 'captureWallet',      // QR Code + Ví MoMo
  wallet: 'captureWallet',  // Ví MoMo
  atm: 'payWithATM',        // Thẻ ATM nội địa
  credit: 'payWithCC'       // Thẻ tín dụng quốc tế
};

/**
 * POST /api/payment/momo/create
 * Tạo thanh toán MoMo - Hỗ trợ đa phương thức
 * @param {string} paymentType - Loại thanh toán: qr, wallet, atm, credit
 */
router.post('/momo/create', async (req, res) => {
  try {
    const { orderId, amount, orderInfo, items, paymentType = 'qr' } = req.body;

    // Validate input
    if (!orderId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin đơn hàng (orderId, amount)'
      });
    }

    // Xác định requestType dựa trên paymentType
    const requestType = MOMO_REQUEST_TYPES[paymentType] || 'captureWallet';

    // Tạo requestId unique
    const requestId = `${MOMO_CONFIG.partnerCode}_${Date.now()}`;
    
    // Thông tin đơn hàng
    const orderInfoText = orderInfo || `Thanh toán đơn hàng ${orderId} - QuangHưng Mobile`;
    const extraData = Buffer.from(JSON.stringify({ 
      orderId, 
      items: items || [],
      paymentType: paymentType
    })).toString('base64');

    // Tạo raw signature theo format MoMo yêu cầu
    const rawSignature = [
      `accessKey=${MOMO_CONFIG.accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `ipnUrl=${MOMO_CONFIG.ipnUrl}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfoText}`,
      `partnerCode=${MOMO_CONFIG.partnerCode}`,
      `redirectUrl=${MOMO_CONFIG.redirectUrl}?orderId=${orderId}`,
      `requestId=${requestId}`,
      `requestType=${requestType}`
    ].join('&');

    const signature = createMoMoSignature(rawSignature);

    // Request body gửi đến MoMo
    const requestBody = {
      partnerCode: MOMO_CONFIG.partnerCode,
      partnerName: 'QuangHưng Mobile',
      storeId: 'QuangHungMobile',
      requestId: requestId,
      amount: parseInt(amount),
      orderId: orderId,
      orderInfo: orderInfoText,
      redirectUrl: `${MOMO_CONFIG.redirectUrl}?orderId=${orderId}`,
      ipnUrl: MOMO_CONFIG.ipnUrl,
      lang: 'vi',
      requestType: requestType,
      autoCapture: true,
      extraData: extraData,
      signature: signature
    };

    // MoMo request sent

    // Gọi API MoMo
    const response = await fetch(`${MOMO_CONFIG.endpoint}/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(requestBody))
      },
      body: JSON.stringify(requestBody)
    });

    const momoResponse = await response.json();
    // MoMo response received

    if (momoResponse.resultCode === 0) {
      // Thành công - trả về URL thanh toán
      res.json({
        success: true,
        data: {
          orderId: orderId,
          requestId: requestId,
          amount: amount,
          paymentType: paymentType,
          requestType: requestType,
          payUrl: momoResponse.payUrl,       // URL redirect đến MoMo
          qrCodeUrl: momoResponse.qrCodeUrl, // URL hình QR code (chỉ có với captureWallet)
          deeplink: momoResponse.deeplink,   // Deeplink mở app MoMo
          deeplinkMiniApp: momoResponse.deeplinkMiniApp,
          shortLink: momoResponse.shortLink  // Link rút gọn
        }
      });
    } else {
      // Lỗi từ MoMo
      res.status(400).json({
        success: false,
        message: momoResponse.message || 'Không thể tạo thanh toán MoMo',
        resultCode: momoResponse.resultCode
      });
    }

  } catch (error) {
    console.error('MoMo Create Payment Error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi tạo thanh toán MoMo',
      error: error.message
    });
  }
});

/**
 * POST /api/payment/momo/ipn
 * IPN (Instant Payment Notification) - MoMo gọi khi thanh toán hoàn tất
 */
router.post('/momo/ipn', async (req, res) => {
  try {
    // MoMo IPN received

    const {
      partnerCode,
      orderId,
      requestId,
      amount,
      orderInfo,
      orderType,
      transId,
      resultCode,
      message,
      payType,
      responseTime,
      extraData,
      signature
    } = req.body;

    // Verify signature
    const rawSignature = [
      `accessKey=${MOMO_CONFIG.accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `message=${message}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `orderType=${orderType}`,
      `partnerCode=${partnerCode}`,
      `payType=${payType}`,
      `requestId=${requestId}`,
      `responseTime=${responseTime}`,
      `resultCode=${resultCode}`,
      `transId=${transId}`
    ].join('&');

    const expectedSignature = createMoMoSignature(rawSignature);

    if (signature !== expectedSignature) {
      console.error('MoMo IPN: Invalid signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    // Xử lý kết quả thanh toán
    if (resultCode === 0) {
      // Thanh toán thành công
      console.log(`✅ Đơn hàng ${orderId} thanh toán thành công qua MoMo`);
      
      // Cập nhật trạng thái đơn hàng và thanh toán
      await pool.query(
        `UPDATE thanh_toan SET trang_thai = 'success', thoi_gian = NOW() WHERE ma_don = ? AND phuong_thuc = ?`,
        [orderId, 'MOMO']
      );
      await pool.query(
        `UPDATE don_hang SET trang_thai = 'confirmed' WHERE ma_don = ?`,
        [orderId]
      );
      
    } else {
      // Thanh toán thất bại
      console.log(`❌ Đơn hàng ${orderId} thanh toán thất bại: ${message}`);
      
      // Cập nhật trạng thái thanh toán
      await pool.query(
        `UPDATE thanh_toan SET trang_thai = 'failed', thoi_gian = NOW() WHERE ma_don = ? AND phuong_thuc = ?`,
        [orderId, 'MOMO']
      );
    }

    // Phản hồi MoMo (bắt buộc)
    res.status(200).json({
      success: true,
      message: 'IPN received'
    });

  } catch (error) {
    console.error('MoMo IPN Error:', error);
    res.status(500).json({
      success: false,
      message: 'IPN processing error'
    });
  }
});

/**
 * POST /api/payment/momo/check-status
 * Kiểm tra trạng thái thanh toán
 */
router.post('/momo/check-status', async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu orderId'
      });
    }

    const requestId = `${MOMO_CONFIG.partnerCode}_check_${Date.now()}`;

    // Tạo signature
    const rawSignature = [
      `accessKey=${MOMO_CONFIG.accessKey}`,
      `orderId=${orderId}`,
      `partnerCode=${MOMO_CONFIG.partnerCode}`,
      `requestId=${requestId}`
    ].join('&');

    const signature = createMoMoSignature(rawSignature);

    const requestBody = {
      partnerCode: MOMO_CONFIG.partnerCode,
      requestId: requestId,
      orderId: orderId,
      signature: signature,
      lang: 'vi'
    };

    // Gọi API kiểm tra trạng thái
    const response = await fetch(`${MOMO_CONFIG.endpoint}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const momoResponse = await response.json();
    // MoMo status checked

    res.json({
      success: true,
      data: {
        orderId: momoResponse.orderId,
        resultCode: momoResponse.resultCode,
        message: momoResponse.message,
        transId: momoResponse.transId,
        amount: momoResponse.amount,
        payType: momoResponse.payType,
        responseTime: momoResponse.responseTime
      }
    });

  } catch (error) {
    console.error('MoMo Check Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi kiểm tra trạng thái thanh toán'
    });
  }
});

module.exports = router;
