const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Helper: chuyển orderId dạng DH... hoặc ma_don dạng số về ma_don thực tế trong DB
async function resolveOrderId(orderIdOrCode) {
  if (!orderIdOrCode) return orderIdOrCode;
  try {
    const [rows] = await pool.query(
      'SELECT ma_don FROM don_hang WHERE ma_don = ? OR order_code = ? LIMIT 1', 
      [orderIdOrCode, orderIdOrCode]
    );
    if (rows.length > 0) {
      return rows[0].ma_don;
    }
  } catch (err) {
    console.error('[resolveOrderId] Error:', err.message);
  }
  return orderIdOrCode;
}

// Middleware kiểm tra quyền admin cho các route nhạy cảm
const checkAdmin = (req, res, next) => {
  if (!req.session || !req.session.user || req.session.user.vai_tro !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Bạn không có quyền thực hiện thao tác này.',
      code: 'ADMIN_REQUIRED'
    });
  }
  next();
};

// POST /api/orders - Tạo đơn hàng mới
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      customerId,
      customerName,
      phone,
      address,
      items,
      subtotal,
      shippingFee,
      discount,
      total,
      paymentMethod,
      voucherCode,
      // Hỗ trợ nhiều mã khuyến mãi
      freeshipVoucher,
      discountVoucher,
      // Thông tin đặt cọc
      depositAmount,      // Số tiền đặt cọc
      depositPercent,     // Phần trăm đặt cọc (10%, 30%, 50%)
      remainingAmount,    // Số tiền còn lại cần thanh toán
      isDeposit,          // Có phải đơn đặt cọc không
      orderId: customOrderId // Mã đơn hàng tùy chỉnh từ frontend
    } = req.body;

    // Xử lý voucher - hỗ trợ cả cách cũ (voucherCode) và cách mới (freeshipVoucher, discountVoucher)
    let maKmFreeship = null;
    let maKmDiscount = null;
    const usedVouchers = [];

    // Helper: claim voucher với SELECT FOR UPDATE để chống race condition
    // Trả về ma_km nếu claim thành công, null nếu voucher không tồn tại / hết / hết hạn
    async function claimVoucher(code) {
      const [vouchers] = await connection.query(
        `SELECT ma_km, so_luong, so_luong_da_dung
         FROM khuyen_mai
         WHERE code = ?
           AND trang_thai = 'active'
           AND ngay_bat_dau <= NOW()
           AND ngay_ket_thuc >= NOW()
         FOR UPDATE`,
        [code]
      );
      if (vouchers.length === 0) return null;
      const v = vouchers[0];
      if (v.so_luong != null && v.so_luong_da_dung >= v.so_luong) return null;
      const [upd] = await connection.query(
        `UPDATE khuyen_mai
         SET so_luong_da_dung = so_luong_da_dung + 1
         WHERE ma_km = ?
           AND (so_luong IS NULL OR so_luong_da_dung < so_luong)`,
        [v.ma_km]
      );
      if (upd.affectedRows !== 1) return null;
      return v.ma_km;
    }

    if (freeshipVoucher && freeshipVoucher.code) {
      maKmFreeship = await claimVoucher(freeshipVoucher.code);
      if (maKmFreeship) {
        usedVouchers.push({ code: freeshipVoucher.code, type: 'freeship', maKm: maKmFreeship });
      }
    }

    if (discountVoucher && discountVoucher.code) {
      maKmDiscount = await claimVoucher(discountVoucher.code);
      if (maKmDiscount) {
        usedVouchers.push({ code: discountVoucher.code, type: 'discount', maKm: maKmDiscount });
      }
    }

    // Fallback: xử lý voucherCode cũ (tương thích ngược)
    let maKm = maKmDiscount || maKmFreeship; // Ưu tiên mã giảm giá
    if (!maKm && voucherCode) {
      maKm = await claimVoucher(voucherCode);
      if (maKm) {
        usedVouchers.push({ code: voucherCode, type: 'legacy', maKm: maKm });
      }
    }

    // Lưu discount amount để ghi lịch sử sau
    const discountAmount = discount || 0;

    // Xác định loại đơn hàng (normal/deposit)
    const orderType = isDeposit ? 'deposit' : 'normal';
    const depositStatus = isDeposit ? 'pending' : null;
    const actualDepositAmount = isDeposit ? (depositAmount || 0) : 0;
    const actualRemainingAmount = isDeposit ? (remainingAmount || 0) : 0;

    // Tạo đơn hàng với thông tin đặt cọc và order_code
    const [orderResult] = await connection.query(
      `INSERT INTO don_hang (ma_kh, ten_nguoi_nhan, so_dt, dia_chi_nhan, tong_tien, trang_thai, ma_km, loai_don, tien_dat_coc, tien_con_lai, trang_thai_coc, order_code)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      [customerId || null, customerName, phone, address, total, maKm, orderType, actualDepositAmount, actualRemainingAmount, depositStatus, customOrderId || null]
    );
    
    const orderId = orderResult.insertId;
    
    console.log(`Order ${orderId} created: type=${orderType}, deposit=${actualDepositAmount}, remaining=${actualRemainingAmount}`);

    // Thêm chi tiết đơn hàng + giảm tồn kho atomically (chống oversell)
    // Hỗ trợ biến thể: item.variantId (tuỳ chọn) → giảm bien_the_san_pham; nếu không có → giảm san_pham.so_luong_ton
    for (const item of items) {
      let importPrice = 0;
      if (item.variantId) {
        const [[variant]] = await connection.query('SELECT gia_nhap FROM bien_the_san_pham WHERE ma_bt = ?', [item.variantId]);
        if (variant && variant.gia_nhap != null && parseFloat(variant.gia_nhap) > 0) {
          importPrice = parseFloat(variant.gia_nhap);
        }
      }
      if (importPrice === 0) {
        const [[product]] = await connection.query('SELECT gia_nhap FROM san_pham WHERE ma_sp = ?', [item.id]);
        importPrice = product && product.gia_nhap ? parseFloat(product.gia_nhap) : 0;
      }

      if (item.variantId) {
        // Giảm tồn kho biến thể atomic
        const [vUpd] = await connection.query(
          `UPDATE bien_the_san_pham SET so_luong = so_luong - ?
           WHERE ma_bt = ? AND ma_sp = ? AND so_luong >= ? AND trang_thai = 'active'`,
          [item.quantity, item.variantId, item.id, item.quantity]
        );
        if (vUpd.affectedRows !== 1) {
          const err = new Error(`Biến thể "${item.name || item.id} (${item.color || ''} ${item.storage || ''})" không đủ tồn kho.`);
          err.code = 'OUT_OF_STOCK';
          err.statusCode = 409;
          throw err;
        }
        // Sync tổng tồn kho ở san_pham (đồng bộ với variant)
        await connection.query(
          `UPDATE san_pham sp
           SET so_luong_ton = (
             SELECT COALESCE(SUM(so_luong), 0)
             FROM bien_the_san_pham
             WHERE ma_sp = sp.ma_sp AND trang_thai = 'active'
           )
           WHERE sp.ma_sp = ?`,
          [item.id]
        );
      } else {
        // Backward-compat: không có variantId → giảm tồn kho tổng như cũ
        const [stockUpd] = await connection.query(
          'UPDATE san_pham SET so_luong_ton = so_luong_ton - ? WHERE ma_sp = ? AND so_luong_ton >= ?',
          [item.quantity, item.id, item.quantity]
        );
        if (stockUpd.affectedRows !== 1) {
          const err = new Error(`Sản phẩm "${item.name || item.id}" không đủ tồn kho.`);
          err.code = 'OUT_OF_STOCK';
          err.statusCode = 409;
          throw err;
        }
      }

      await connection.query(
        `INSERT INTO chi_tiet_don_hang
           (ma_don, ma_sp, ma_bt, mau_sac_chon, dung_luong_chon, so_luong, gia, gia_nhap)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId, item.id,
          item.variantId || null,
          item.color || null,
          item.storage || null,
          item.quantity, item.price, importPrice
        ]
      );
    }

    // Tạo bản ghi thanh toán
    const paymentStatus = paymentMethod === 'cod' ? 'pending' : 'pending';
    
    // Xử lý đặt cọc
    if (isDeposit && depositAmount > 0) {
      // Tạo bản ghi thanh toán cho tiền đặt cọc
      await connection.query(
        `INSERT INTO thanh_toan (ma_don, so_tien, phuong_thuc, trang_thai)
         VALUES (?, ?, ?, ?)`,
        [orderId, depositAmount, paymentMethod.toUpperCase() + '_DEPOSIT', 'pending']
      );
      
      // Tạo bản ghi cho số tiền còn lại (sẽ thanh toán khi nhận hàng)
      if (remainingAmount > 0) {
        await connection.query(
          `INSERT INTO thanh_toan (ma_don, so_tien, phuong_thuc, trang_thai)
           VALUES (?, ?, ?, ?)`,
          [orderId, remainingAmount, 'COD_REMAINING', 'pending']
        );
      }
      
      console.log(`Deposit order created: deposit=${depositAmount} (${depositPercent}%), remaining=${remainingAmount}`);
    } else {
      // Thanh toán thông thường (toàn bộ)
      await connection.query(
        `INSERT INTO thanh_toan (ma_don, so_tien, phuong_thuc, trang_thai)
         VALUES (?, ?, ?, ?)`,
        [orderId, total, paymentMethod.toUpperCase(), paymentStatus]
      );
    }

    // Ghi lịch sử sử dụng voucher nếu có
    for (const usedVoucher of usedVouchers) {
      try {
        const voucherDiscount = usedVoucher.type === 'freeship' 
          ? (freeshipVoucher?.discountValue || 0)
          : (discountVoucher?.discountValue || discountAmount);
          
        await connection.query(
          `INSERT INTO lich_su_voucher (ma_km, ma_kh, ma_don, so_tien_giam)
           VALUES (?, ?, ?, ?)`,
          [usedVoucher.maKm, customerId || null, orderId, voucherDiscount]
        );
        console.log(`Voucher history recorded: code=${usedVoucher.code}, type=${usedVoucher.type}, ma_don=${orderId}, discount=${voucherDiscount}`);
      } catch (historyError) {
        // Không fail nếu bảng lich_su_voucher chưa tồn tại
        console.log('Could not record voucher history:', historyError.message);
      }
    }

    await connection.commit();

    // [MỚI] Sinh voucher tri ân cho lần mua sau (chỉ áp dụng cho KH đã login)
    let thankYouVoucher = null;
    if (customerId) {
      try {
        const crypto = require('crypto');
        const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
        const voucherCode = `THANKYOU-${orderId}-${randomPart}`;
        const expiryDays = 30;
        await pool.query(
          `INSERT INTO khuyen_mai
             (code, loai, loai_km, gia_tri, mo_ta, dieu_kien_toi_thieu,
              ngay_bat_dau, ngay_ket_thuc, so_luong, so_luong_da_dung,
              trang_thai, ngay_tao, ma_kh)
           VALUES (?, 'percent', 'discount', 10, ?, 0,
                   NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 1, 0,
                   'active', NOW(), ?)`,
          [voucherCode, `Tri ân khách hàng - giảm 10% cho đơn #${orderId}`, expiryDays, customerId]
        );
        thankYouVoucher = {
          code: voucherCode,
          percent: 10,
          expiryDays,
          message: 'Cảm ơn bạn đã mua sắm! Áp dụng mã này cho lần mua tiếp theo trong 30 ngày.'
        };

        // [MỚI] In-app notification cho voucher tri ân
        try {
          const { createInAppNotification } = require('../services/emailService');
          await createInAppNotification({
            ma_kh: customerId,
            tieu_de: `🎁 Voucher tri ân -10% từ đơn #${orderId}`,
            noi_dung: `Cảm ơn bạn đã mua sắm! Dùng mã ${voucherCode} để giảm 10% lần mua tiếp theo (hết hạn sau ${expiryDays} ngày).`,
            loai: 'voucher',
            lien_ket: '/promotions.html'
          });
        } catch (e) { /* silent — không phá order flow */ }
      } catch (voucherErr) {
        console.error('[Order] Không sinh được voucher tri ân:', voucherErr.message);
      }
    }

    // [MỚI] Gọi RAG service để lấy gợi ý sản phẩm liên quan (fail-silent)
    let recommendedProducts = [];
    try {
      const cartItemIds = (items || []).map(i => String(i.id));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const ragResponse = await fetch('http://127.0.0.1:8000/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: customerId ? String(customerId) : null, cartItems: cartItemIds }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (ragResponse.ok) {
        const ragData = await ragResponse.json();
        const recIds = (ragData.recommendations || []).slice(0, 4);
        if (recIds.length > 0) {
          const placeholders = recIds.map(() => '?').join(',');
          const [recRows] = await pool.query(
            `SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.gia_giam, sp.anh_dai_dien,
                    hsx.ten_hang
             FROM san_pham sp
             LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
             WHERE sp.ma_sp IN (${placeholders})
             LIMIT 4`,
            recIds
          );
          recommendedProducts = recRows;
        }
      }
    } catch (recErr) {
      console.log('[Order] RAG /recommend không khả dụng:', recErr.message);
    }

    // Dự kiến giao hàng: 2-3 ngày làm việc kể từ hôm nay
    const today = new Date();
    const estDelivery = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
    const estimatedDelivery = estDelivery.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    res.json({
      success: true,
      data: {
        orderId: orderId,
        message: isDeposit ? 'Đặt cọc thành công' : 'Đặt hàng thành công',
        isDeposit: isDeposit || false,
        depositAmount: depositAmount || 0,
        remainingAmount: remainingAmount || 0,
        thankYouVoucher,
        estimatedDelivery: `2-3 ngày làm việc (dự kiến ${estimatedDelivery})`,
        recommendedProducts
      }
    });

    // Gửi email cảm ơn & xác nhận đơn hàng tự động (không block response)
    try {
      const { sendOrderConfirmation } = require('../services/emailService');
      sendOrderConfirmation(orderId).catch(err => console.error('[Email] sendOrderConfirmation error:', err));
    } catch (e) {
      console.error('[Email] Lỗi require emailService:', e);
    }

  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error('Create order error:', error && error.message);
    const statusCode = error && error.statusCode ? error.statusCode : 500;
    // Trả message nghiệp vụ cho lỗi 4xx, nuốt detail cho 5xx
    const message = statusCode >= 400 && statusCode < 500
      ? (error.message || 'Yêu cầu không hợp lệ')
      : 'Lỗi tạo đơn hàng, vui lòng thử lại.';
    res.status(statusCode).json({
      success: false,
      code: error && error.code,
      message
    });
  } finally {
    connection.release();
  }
});

// PUT /api/orders/:orderId/payment - Cập nhật trạng thái thanh toán
router.put('/:orderId/payment', async (req, res) => {
  try {
    const rawOrderId = req.params.orderId;
    const orderId = await resolveOrderId(rawOrderId);
    const { status, transactionId, paymentType } = req.body;

    // Gia cố bảo mật: kiểm tra đơn hàng tồn tại và phân quyền sở hữu
    const [orders] = await pool.query('SELECT ma_kh, trang_thai FROM don_hang WHERE ma_don = ?', [orderId]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }
    
    const order = orders[0];
    if (order.ma_kh !== null) {
      const sessionUser = req.session ? req.session.user : null;
      const isAdmin = sessionUser && sessionUser.vai_tro === 'admin';
      const sessionUserId = sessionUser ? sessionUser.ma_kh : null;
      
      if (!isAdmin && order.ma_kh != sessionUserId) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật thanh toán cho đơn hàng này.' });
      }
    }

    // Nếu là thanh toán đặt cọc, chỉ cập nhật bản ghi deposit
    if (paymentType === 'deposit') {
      await pool.query(
        `UPDATE thanh_toan SET trang_thai = ?, thoi_gian = NOW() 
         WHERE ma_don = ? AND phuong_thuc LIKE '%_DEPOSIT'`,
        [status, orderId]
      );
      
      // Nếu đặt cọc thành công, cập nhật trạng thái đơn hàng và trạng thái cọc
      if (status === 'success') {
        await pool.query(
          `UPDATE don_hang SET trang_thai = 'confirmed', trang_thai_coc = 'confirmed', thoi_gian_xac_nhan_coc = NOW() WHERE ma_don = ?`,
          [orderId]
        );
        console.log(`Order ${orderId} confirmed after deposit payment success`);
        
        // Gửi email thông báo trạng thái
        try {
          const { sendOrderStatusUpdate } = require('../services/emailService');
          sendOrderStatusUpdate(orderId, 'confirmed').catch(err => console.error('[Email] sendOrderStatusUpdate error:', err));
        } catch (e) {
          console.error('[Email] Lỗi require emailService:', e);
        }
      }
    } else if (paymentType === 'remaining') {
      // Cập nhật thanh toán phần còn lại
      await pool.query(
        `UPDATE thanh_toan SET trang_thai = ?, thoi_gian = NOW() 
         WHERE ma_don = ? AND phuong_thuc = 'COD_REMAINING'`,
        [status, orderId]
      );
      
      // Nếu thanh toán phần còn lại thành công, đơn hàng hoàn thành
      if (status === 'success') {
        await pool.query(
          `UPDATE don_hang SET trang_thai = 'completed' WHERE ma_don = ?`,
          [orderId]
        );
        
        // Gửi email thông báo trạng thái
        try {
          const { sendOrderStatusUpdate } = require('../services/emailService');
          sendOrderStatusUpdate(orderId, 'completed').catch(err => console.error('[Email] sendOrderStatusUpdate error:', err));
        } catch (e) {
          console.error('[Email] Lỗi require emailService:', e);
        }

        // Tự động kích hoạt bảo hành điện tử
        try {
          const { createWarrantiesForOrder } = require('../services/warrantyService');
          createWarrantiesForOrder(orderId).catch(err => console.error('[Warranty] createWarrantiesForOrder error:', err));
        } catch (e) {
          console.error('[Warranty] Lỗi require warrantyService:', e);
        }
      }
    } else {
      // Cập nhật tất cả thanh toán của đơn hàng
      await pool.query(
        `UPDATE thanh_toan SET trang_thai = ?, thoi_gian = NOW() WHERE ma_don = ?`,
        [status, orderId]
      );
      
      // Nếu thanh toán thành công, cập nhật trạng thái đơn hàng
      if (status === 'success') {
        await pool.query(
          `UPDATE don_hang SET trang_thai = 'confirmed' WHERE ma_don = ?`,
          [orderId]
        );
        
        // Gửi email thông báo trạng thái
        try {
          const { sendOrderStatusUpdate } = require('../services/emailService');
          sendOrderStatusUpdate(orderId, 'confirmed').catch(err => console.error('[Email] sendOrderStatusUpdate error:', err));
        } catch (e) {
          console.error('[Email] Lỗi require emailService:', e);
        }
      }
    }

    res.json({
      success: true,
      message: 'Cập nhật thanh toán thành công'
    });

  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi cập nhật thanh toán'
    });
  }
});

// GET /api/orders/:orderId - Lấy thông tin đơn hàng
router.get('/:orderId', async (req, res) => {
  try {
    const rawOrderId = req.params.orderId;
    const orderId = await resolveOrderId(rawOrderId);

    const [orders] = await pool.query(
      `SELECT dh.*
       FROM don_hang dh
       WHERE dh.ma_don = ?`,
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    const order = orders[0];

    // Gia cố bảo mật: kiểm tra quyền sở hữu đơn hàng đã đăng ký
    if (order.ma_kh !== null) {
      const sessionUser = req.session ? req.session.user : null;
      const isAdmin = sessionUser && sessionUser.vai_tro === 'admin';
      const sessionUserId = sessionUser ? sessionUser.ma_kh : null;
      
      if (!isAdmin && order.ma_kh != sessionUserId) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin đơn hàng này.' });
      }
    }

    // Lấy tất cả bản ghi thanh toán của đơn hàng (có thể có nhiều nếu là đặt cọc)
    const [payments] = await pool.query(
      `SELECT * FROM thanh_toan WHERE ma_don = ? ORDER BY ma_tt ASC`,
      [orderId]
    );

    // Xử lý thông tin đặt cọc
    let depositInfo = null;
    let mainPayment = payments[0] || null;
    
    const depositPayment = payments.find(p => p.phuong_thuc && p.phuong_thuc.includes('_DEPOSIT'));
    const remainingPayment = payments.find(p => p.phuong_thuc === 'COD_REMAINING');
    
    if (depositPayment) {
      depositInfo = {
        isDeposit: true,
        depositAmount: parseFloat(depositPayment.so_tien) || 0,
        depositStatus: depositPayment.trang_thai,
        depositMethod: depositPayment.phuong_thuc.replace('_DEPOSIT', ''),
        remainingAmount: remainingPayment ? parseFloat(remainingPayment.so_tien) : 0,
        remainingStatus: remainingPayment ? remainingPayment.trang_thai : null
      };
      mainPayment = depositPayment;
    }

    const [items] = await pool.query(
      `SELECT ct.*, sp.ten_sp, sp.anh_dai_dien
       FROM chi_tiet_don_hang ct
       JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
       WHERE ct.ma_don = ?`,
      [orderId]
    );

    res.json({
      success: true,
      data: {
        ...orders[0],
        phuong_thuc: mainPayment?.phuong_thuc || null,
        trang_thai_thanh_toan: mainPayment?.trang_thai || null,
        depositInfo: depositInfo,
        items: items
      }
    });

  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy thông tin đơn hàng' });
  }
});

// GET /api/orders/user/:userId - Lấy danh sách đơn hàng của user (kèm chi tiết sản phẩm)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Lấy danh sách đơn hàng
    const [orders] = await pool.query(
      `SELECT dh.*
       FROM don_hang dh
       WHERE dh.ma_kh = ?
       ORDER BY dh.thoi_gian DESC`,
      [userId]
    );

    // Lấy chi tiết sản phẩm và thông tin thanh toán cho mỗi đơn hàng
    const ordersWithItems = await Promise.all(orders.map(async (order) => {
      const [items] = await pool.query(
        `SELECT ct.ma_sp as id, ct.so_luong as quantity, ct.gia as price,
                sp.ten_sp as name, sp.anh_dai_dien as image, sp.mau_sac as color, sp.bo_nho as storage
         FROM chi_tiet_don_hang ct
         JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
         WHERE ct.ma_don = ?`,
        [order.ma_don]
      );
      
      // Lấy thông tin thanh toán
      const [payments] = await pool.query(
        `SELECT * FROM thanh_toan WHERE ma_don = ? ORDER BY ma_tt ASC`,
        [order.ma_don]
      );
      
      // Xử lý thông tin đặt cọc
      let depositInfo = null;
      let mainPayment = payments[0] || null;
      
      const depositPayment = payments.find(p => p.phuong_thuc && p.phuong_thuc.includes('_DEPOSIT'));
      const remainingPayment = payments.find(p => p.phuong_thuc === 'COD_REMAINING');
      
      if (depositPayment) {
        depositInfo = {
          isDeposit: true,
          depositAmount: parseFloat(depositPayment.so_tien) || 0,
          depositStatus: depositPayment.trang_thai,
          depositMethod: depositPayment.phuong_thuc.replace('_DEPOSIT', ''),
          remainingAmount: remainingPayment ? parseFloat(remainingPayment.so_tien) : 0,
          remainingStatus: remainingPayment ? remainingPayment.trang_thai : null
        };
        mainPayment = depositPayment;
      }
      
      // Format items với đường dẫn ảnh đúng
      const formattedItems = items.map(item => {
        let imagePath = item.image || 'images/iphone.jpg';
        // Tránh trùng lặp images/images/
        if (imagePath && !imagePath.startsWith('images/') && !imagePath.startsWith('http')) {
          imagePath = `images/${imagePath}`;
        }
        return {
          ...item,
          image: imagePath,
          price: parseFloat(item.price)
        };
      });
      
      return {
        ...order,
        phuong_thuc: mainPayment?.phuong_thuc || null,
        trang_thai_thanh_toan: mainPayment?.trang_thai || null,
        depositInfo: depositInfo,
        items: formattedItems
      };
    }));

    res.json({ success: true, data: ordersWithItems });

  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách đơn hàng' });
  }
});

// PUT /api/orders/:orderId/cancel - Người dùng hủy đơn hàng (chỉ khi chưa được admin xác nhận)
router.put('/:orderId/cancel', async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const rawOrderId = req.params.orderId;
    const orderId = await resolveOrderId(rawOrderId);
    const { userId, cancelReason } = req.body;

    console.log('=== Cancel Order Request ===');
    console.log('orderId:', orderId);
    console.log('userId:', userId);
    console.log('cancelReason:', cancelReason);

    // Kiểm tra đơn hàng tồn tại và thuộc về user
    const [orders] = await connection.query(
      'SELECT * FROM don_hang WHERE ma_don = ?',
      [orderId]
    );

    if (orders.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    const order = orders[0];
    

    // Kiểm tra quyền sở hữu hoặc admin từ session (gia cố bảo mật)
    const sessionUser = req.session ? req.session.user : null;
    const isAdmin = sessionUser && sessionUser.vai_tro === 'admin';
    const sessionUserId = sessionUser ? (sessionUser.ma_kh || sessionUser.ma_nv) : null;

    if (!isAdmin) {
      if (!sessionUser) {
        await connection.rollback();
        connection.release();
        return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập để thực hiện thao tác này' });
      }
      if (order.ma_kh && order.ma_kh != sessionUserId) {
        await connection.rollback();
        connection.release();
        return res.status(403).json({ success: false, message: 'Bạn không có quyền hủy đơn hàng này' });
      }
    }

    // Chỉ cho phép hủy khi đơn hàng ở trạng thái 'pending' (chờ xử lý)
    if (order.trang_thai !== 'pending') {
      await connection.rollback();
      connection.release();
      const statusLabels = {
        'confirmed': 'đã được xác nhận',
        'shipping': 'đang giao hàng',
        'delivered': 'đã giao hàng',
        'completed': 'đã hoàn thành',
        'cancelled': 'đã bị hủy'
      };
      const statusText = statusLabels[order.trang_thai] || order.trang_thai;
      return res.status(400).json({ 
        success: false, 
        message: `Không thể hủy đơn hàng đã ${statusText}. Chỉ có thể hủy đơn hàng đang chờ xử lý.`
      });
    }

    // Cập nhật trạng thái đơn hàng thành cancelled (chỉ cập nhật trang_thai, bỏ qua ly_do_huy)
    await connection.query(
      'UPDATE don_hang SET trang_thai = ? WHERE ma_don = ?',
      ['cancelled', orderId]
    );
    console.log('Order status updated to cancelled');
    
    // Gửi email thông báo hủy đơn
    try {
      const { sendOrderStatusUpdate } = require('../services/emailService');
      sendOrderStatusUpdate(orderId, 'cancelled').catch(err => console.error('[Email] sendOrderStatusUpdate error:', err));
    } catch (e) {
      console.error('[Email] Lỗi require emailService:', e);
    }

    // Hoàn lại số lượng tồn kho cho các sản phẩm (cả product-level, variant-level và IMEI)
    const [orderItems] = await connection.query(
      'SELECT ma_ct_don, ma_sp, ma_bt, so_luong FROM chi_tiet_don_hang WHERE ma_don = ?',
      [orderId]
    );

    let imeiRestoredTotal = 0;
    for (const item of orderItems) {
      if (item.ma_bt) {
        // 1. Cộng lại tồn variant-level
        await connection.query(
          'UPDATE bien_the_san_pham SET so_luong = so_luong + ? WHERE ma_bt = ?',
          [item.so_luong, item.ma_bt]
        );
        // 2. Sync tổng tồn kho ở san_pham
        await connection.query(
          `UPDATE san_pham sp
           SET so_luong_ton = (
             SELECT COALESCE(SUM(so_luong), 0)
             FROM bien_the_san_pham
             WHERE ma_sp = sp.ma_sp AND trang_thai = 'active'
           )
           WHERE sp.ma_sp = ?`,
          [item.ma_sp]
        );
      } else {
        // Không có variant -> cộng tồn kho tổng trực tiếp
        await connection.query(
          'UPDATE san_pham SET so_luong_ton = so_luong_ton + ? WHERE ma_sp = ?',
          [item.so_luong, item.ma_sp]
        );
      }

      // 3. Trả IMEI về kho (in_stock), clear liên kết đơn (nếu có)
      const [imeiRes] = await connection.query(
        `UPDATE imei_san_pham
         SET trang_thai = 'in_stock', ma_ct_don = NULL, ngay_ban = NULL
         WHERE ma_ct_don = ? AND trang_thai = 'sold'`,
        [item.ma_ct_don]
      );
      imeiRestoredTotal += imeiRes.affectedRows || 0;
    }
    console.log(`Stock restored for ${orderItems.length} items, IMEIs restored: ${imeiRestoredTotal}`);

    // Cập nhật trạng thái thanh toán
    await connection.query(
      "UPDATE thanh_toan SET trang_thai = 'failed' WHERE ma_don = ?",
      [orderId]
    );

    // Nếu có sử dụng voucher, hoàn lại số lượng đã dùng & khôi phục voucher người dùng
    if (order.ma_km) {
      await connection.query(
        'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
        [order.ma_km]
      );
      console.log(`Voucher refunded for cancelled order. Updated so_luong_da_dung for ma_km=${order.ma_km}`);
      if (order.ma_kh) {
        await connection.query(
          'UPDATE voucher_nguoi_dung SET da_su_dung = 0 WHERE ma_kh = ? AND ma_km = ?',
          [order.ma_kh, order.ma_km]
        );
      }
    }
    
    // Hoàn lại tất cả voucher phụ đã dùng trong đơn hàng (từ bảng lich_su_voucher)
    try {
      const [usedVouchers] = await connection.query(
        'SELECT DISTINCT ma_km FROM lich_su_voucher WHERE ma_don = ?',
        [orderId]
      );
      for (const v of usedVouchers) {
        if (v.ma_km && v.ma_km !== order.ma_km) {
          await connection.query(
            'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
            [v.ma_km]
          );
          console.log(`Additional voucher refunded: ma_km=${v.ma_km}`);
          if (order.ma_kh) {
            await connection.query(
              'UPDATE voucher_nguoi_dung SET da_su_dung = 0 WHERE ma_kh = ? AND ma_km = ?',
              [order.ma_kh, v.ma_km]
            );
          }
        }
      }
      // Xóa lịch sử sử dụng voucher để người dùng có thể áp dụng lại mã
      await connection.query(
        'DELETE FROM lich_su_voucher WHERE ma_don = ?',
        [orderId]
      );
    } catch (e) {
      console.log('Could not refund additional vouchers:', e.message);
    }

    await connection.commit();
    connection.release();

    console.log('Order cancelled successfully:', orderId);

    res.json({
      success: true,
      message: 'Đã hủy đơn hàng thành công'
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hủy đơn hàng: ' + error.message
    });
  }
});

// =====================================================
// DEPOSIT ORDER MANAGEMENT APIs
// =====================================================

// PUT /api/orders/:orderId/confirm-deposit - Admin xác nhận đã nhận tiền đặt cọc
router.put('/:orderId/confirm-deposit', checkAdmin, async (req, res) => {
  try {
    const rawOrderId = req.params.orderId;
    const orderId = await resolveOrderId(rawOrderId);
    const { adminId, note } = req.body;

    console.log('=== Confirm Deposit Request ===');
    console.log('orderId:', orderId, 'adminId:', adminId);

    // Kiểm tra đơn hàng tồn tại và là đơn đặt cọc
    const [orders] = await pool.query(
      'SELECT * FROM don_hang WHERE ma_don = ?',
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    const order = orders[0];

    if (order.loai_don !== 'deposit') {
      return res.status(400).json({ success: false, message: 'Đây không phải đơn hàng đặt cọc' });
    }

    if (order.trang_thai_coc === 'confirmed') {
      return res.status(400).json({ success: false, message: 'Đơn hàng đã được xác nhận cọc trước đó' });
    }

    // Cập nhật trạng thái đặt cọc
    await pool.query(
      `UPDATE don_hang 
       SET trang_thai_coc = 'confirmed', 
           thoi_gian_xac_nhan_coc = NOW(),
           trang_thai = 'confirmed'
       WHERE ma_don = ?`,
      [orderId]
    );
    
    // Gửi email thông báo xác nhận cọc
    try {
      const { sendOrderStatusUpdate } = require('../services/emailService');
      sendOrderStatusUpdate(orderId, 'confirmed').catch(err => console.error('[Email] sendOrderStatusUpdate error:', err));
    } catch (e) {
      console.error('[Email] Lỗi require emailService:', e);
    }

    // Cập nhật thanh toán đặt cọc thành công
    await pool.query(
      `UPDATE thanh_toan SET trang_thai = 'success' WHERE ma_don = ? AND phuong_thuc LIKE '%_DEPOSIT'`,
      [orderId]
    );

    console.log(`✅ Deposit confirmed for order ${orderId}`);

    res.json({
      success: true,
      message: 'Đã xác nhận nhận tiền đặt cọc thành công',
      data: {
        orderId: orderId,
        depositAmount: order.tien_dat_coc,
        remainingAmount: order.tien_con_lai,
        status: 'confirmed'
      }
    });

  } catch (error) {
    console.error('Confirm deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi xác nhận đặt cọc: ' + error.message
    });
  }
});

// PUT /api/orders/:orderId/complete-remaining - Admin xác nhận đã thu tiền còn lại (khi giao hàng)
router.put('/:orderId/complete-remaining', checkAdmin, async (req, res) => {
  try {
    const rawOrderId = req.params.orderId;
    const orderId = await resolveOrderId(rawOrderId);
    const { adminId } = req.body;

    console.log('=== Complete Remaining Payment ===');
    console.log('orderId:', orderId);

    const [orders] = await pool.query(
      'SELECT * FROM don_hang WHERE ma_don = ?',
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    const order = orders[0];

    if (order.loai_don !== 'deposit') {
      return res.status(400).json({ success: false, message: 'Đây không phải đơn hàng đặt cọc' });
    }

    if (order.trang_thai_coc !== 'confirmed') {
      return res.status(400).json({ success: false, message: 'Đơn hàng chưa xác nhận đặt cọc' });
    }

    // Cập nhật đơn hàng thành hoàn thành
    await pool.query(
      `UPDATE don_hang SET trang_thai = 'completed' WHERE ma_don = ?`,
      [orderId]
    );
    
    // Gửi email thông báo hoàn thành
    try {
      const { sendOrderStatusUpdate } = require('../services/emailService');
      sendOrderStatusUpdate(orderId, 'completed').catch(err => console.error('[Email] sendOrderStatusUpdate error:', err));
    } catch (e) {
      console.error('[Email] Lỗi require emailService:', e);
    }

    // Tự động kích hoạt bảo hành điện tử
    try {
      const { createWarrantiesForOrder } = require('../services/warrantyService');
      createWarrantiesForOrder(orderId).catch(err => console.error('[Warranty] createWarrantiesForOrder error:', err));
    } catch (e) {
      console.error('[Warranty] Lỗi require warrantyService:', e);
    }

    // Cập nhật thanh toán còn lại thành công
    await pool.query(
      `UPDATE thanh_toan SET trang_thai = 'success' WHERE ma_don = ? AND phuong_thuc = 'COD_REMAINING'`,
      [orderId]
    );

    console.log(`✅ Order ${orderId} completed - remaining payment collected`);

    res.json({
      success: true,
      message: 'Đã xác nhận thu tiền còn lại và hoàn thành đơn hàng',
      data: {
        orderId: orderId,
        totalAmount: order.tong_tien,
        depositPaid: order.tien_dat_coc,
        remainingPaid: order.tien_con_lai
      }
    });

  } catch (error) {
    console.error('Complete remaining error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hoàn thành đơn hàng: ' + error.message
    });
  }
});

// PUT /api/orders/:orderId/cancel-deposit - Hủy đơn đặt cọc với logic hoàn tiền
router.put('/:orderId/cancel-deposit', async (req, res) => {
  let connection;
  
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const rawOrderId = req.params.orderId;
    const orderId = await resolveOrderId(rawOrderId);
    const { userId, cancelReason, isAdmin } = req.body;

    console.log('=== Cancel Deposit Order ===');
    console.log('orderId:', orderId, 'userId:', userId, 'isAdmin:', isAdmin);

    const [orders] = await connection.query(
      'SELECT * FROM don_hang WHERE ma_don = ?',
      [orderId]
    );

    if (orders.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
    }

    const order = orders[0];

    // Kiểm tra quyền sở hữu hoặc admin từ session (gia cố bảo mật)
    const sessionUser = req.session ? req.session.user : null;
    const isUserAdmin = sessionUser && sessionUser.vai_tro === 'admin';
    const sessionUserId = sessionUser ? (sessionUser.ma_kh || sessionUser.ma_nv) : null;

    if (!isUserAdmin) {
      if (!sessionUser) {
        await connection.rollback();
        connection.release();
        return res.status(401).json({ success: false, message: 'Bạn cần đăng nhập để thực hiện thao tác này' });
      }
      if (order.ma_kh && order.ma_kh != sessionUserId) {
        await connection.rollback();
        connection.release();
        return res.status(403).json({ success: false, message: 'Bạn không có quyền hủy đơn hàng này' });
      }
    }

    // Kiểm tra trạng thái có thể hủy
    if (order.trang_thai === 'shipping' || order.trang_thai === 'completed') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({ 
        success: false, 
        message: 'Không thể hủy đơn hàng đang giao hoặc đã hoàn thành'
      });
    }

    // Tính số tiền hoàn lại
    let refundAmount = 0;
    let refundNote = '';
    
    if (order.loai_don === 'deposit' && order.trang_thai_coc === 'confirmed') {
      // Đã xác nhận cọc -> hoàn 80% (mất 20% phí xử lý)
      refundAmount = Math.floor(order.tien_dat_coc * 0.8);
      refundNote = 'Hoàn 80% tiền cọc (mất 20% phí xử lý do hủy sau khi đã xác nhận)';
    } else if (order.loai_don === 'deposit' && order.trang_thai_coc === 'pending') {
      // Chưa xác nhận cọc -> hoàn 100%
      refundAmount = order.tien_dat_coc || 0;
      refundNote = 'Hoàn 100% tiền cọc (hủy trước khi xác nhận)';
    }

    // Cập nhật đơn hàng
    await connection.query(
      `UPDATE don_hang 
       SET trang_thai = 'cancelled', 
           trang_thai_coc = 'refunded',
           ly_do_huy = ?,
           tien_hoan_lai = ?
       WHERE ma_don = ?`,
      [cancelReason || 'Khách hàng hủy đơn', refundAmount, orderId]
    );
    
    // Gửi email thông báo hủy đơn cọc
    try {
      const { sendOrderStatusUpdate } = require('../services/emailService');
      sendOrderStatusUpdate(orderId, 'cancelled').catch(err => console.error('[Email] sendOrderStatusUpdate error:', err));
    } catch (e) {
      console.error('[Email] Lỗi require emailService:', e);
    }

    // Hoàn lại số lượng tồn kho (cả product-level, variant-level và IMEI)
    const [orderItems] = await connection.query(
      'SELECT ma_ct_don, ma_sp, ma_bt, so_luong FROM chi_tiet_don_hang WHERE ma_don = ?',
      [orderId]
    );

    let imeiRestoredTotal = 0;
    for (const item of orderItems) {
      if (item.ma_bt) {
        // 1. Cộng lại tồn variant-level
        await connection.query(
          'UPDATE bien_the_san_pham SET so_luong = so_luong + ? WHERE ma_bt = ?',
          [item.so_luong, item.ma_bt]
        );
        // 2. Sync tổng tồn kho ở san_pham
        await connection.query(
          `UPDATE san_pham sp
           SET so_luong_ton = (
             SELECT COALESCE(SUM(so_luong), 0)
             FROM bien_the_san_pham
             WHERE ma_sp = sp.ma_sp AND trang_thai = 'active'
           )
           WHERE sp.ma_sp = ?`,
          [item.ma_sp]
        );
      } else {
        // Không có variant -> cộng tồn kho tổng trực tiếp
        await connection.query(
          'UPDATE san_pham SET so_luong_ton = so_luong_ton + ? WHERE ma_sp = ?',
          [item.so_luong, item.ma_sp]
        );
      }

      // 3. Trả IMEI về kho (in_stock), clear liên kết đơn (nếu có)
      const [imeiRes] = await connection.query(
        `UPDATE imei_san_pham
         SET trang_thai = 'in_stock', ma_ct_don = NULL, ngay_ban = NULL
         WHERE ma_ct_don = ? AND trang_thai = 'sold'`,
        [item.ma_ct_don]
      );
      imeiRestoredTotal += imeiRes.affectedRows || 0;
    }
    console.log(`Stock restored for ${orderItems.length} items, IMEIs restored: ${imeiRestoredTotal}`);

    // Cập nhật thanh toán
    await connection.query(
      "UPDATE thanh_toan SET trang_thai = 'failed' WHERE ma_don = ?",
      [orderId]
    );

    // Hoàn lại voucher & khôi phục voucher người dùng
    if (order.ma_km) {
      await connection.query(
        'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
        [order.ma_km]
      );
      if (order.ma_kh) {
        await connection.query(
          'UPDATE voucher_nguoi_dung SET da_su_dung = 0 WHERE ma_kh = ? AND ma_km = ?',
          [order.ma_kh, order.ma_km]
        );
      }
    }

    // Hoàn lại tất cả voucher phụ đã dùng trong đơn hàng (từ bảng lich_su_voucher)
    try {
      const [usedVouchers] = await connection.query(
        'SELECT DISTINCT ma_km FROM lich_su_voucher WHERE ma_don = ?',
        [orderId]
      );
      for (const v of usedVouchers) {
        if (v.ma_km && v.ma_km !== order.ma_km) {
          await connection.query(
            'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
            [v.ma_km]
          );
          if (order.ma_kh) {
            await connection.query(
              'UPDATE voucher_nguoi_dung SET da_su_dung = 0 WHERE ma_kh = ? AND ma_km = ?',
              [order.ma_kh, v.ma_km]
            );
          }
        }
      }
      // Xóa lịch sử sử dụng voucher để người dùng có thể áp dụng lại mã
      await connection.query(
        'DELETE FROM lich_su_voucher WHERE ma_don = ?',
        [orderId]
      );
    } catch (e) {
      console.log('Could not refund additional vouchers:', e.message);
    }

    await connection.commit();
    connection.release();

    console.log(`✅ Deposit order ${orderId} cancelled. Refund: ${refundAmount}`);

    res.json({
      success: true,
      message: 'Đã hủy đơn hàng đặt cọc thành công',
      data: {
        orderId: orderId,
        refundAmount: refundAmount,
        refundNote: refundNote
      }
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    console.error('Cancel deposit order error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi hủy đơn hàng: ' + error.message
    });
  }
});

// GET /api/orders/deposit/stats - Thống kê đơn đặt cọc (cho admin)
router.get('/deposit/stats', checkAdmin, async (req, res) => {
  try {
    // Tổng đơn đặt cọc
    const [totalDeposit] = await pool.query(
      `SELECT COUNT(*) as total, SUM(tien_dat_coc) as total_deposit, SUM(tien_con_lai) as total_remaining
       FROM don_hang WHERE loai_don = 'deposit'`
    );

    // Đơn chờ xác nhận cọc
    const [pendingDeposit] = await pool.query(
      `SELECT COUNT(*) as count, SUM(tien_dat_coc) as amount
       FROM don_hang WHERE loai_don = 'deposit' AND trang_thai_coc = 'pending'`
    );

    // Đơn đã xác nhận cọc
    const [confirmedDeposit] = await pool.query(
      `SELECT COUNT(*) as count, SUM(tien_dat_coc) as deposit_collected, SUM(tien_con_lai) as remaining_to_collect
       FROM don_hang WHERE loai_don = 'deposit' AND trang_thai_coc = 'confirmed' AND trang_thai != 'completed'`
    );

    // Đơn đặt cọc đã hoàn thành
    const [completedDeposit] = await pool.query(
      `SELECT COUNT(*) as count, SUM(tong_tien) as total_revenue
       FROM don_hang WHERE loai_don = 'deposit' AND trang_thai = 'completed'`
    );

    res.json({
      success: true,
      data: {
        total: totalDeposit[0],
        pending: pendingDeposit[0],
        confirmed: confirmedDeposit[0],
        completed: completedDeposit[0]
      }
    });

  } catch (error) {
    console.error('Get deposit stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi lấy thống kê đặt cọc'
    });
  }
});

module.exports = router;
