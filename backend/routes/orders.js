const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

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
      isDeposit           // Có phải đơn đặt cọc không
    } = req.body;

    // Xử lý voucher - hỗ trợ cả cách cũ (voucherCode) và cách mới (freeshipVoucher, discountVoucher)
    let maKmFreeship = null;
    let maKmDiscount = null;
    const usedVouchers = [];

    // Xử lý mã freeship
    if (freeshipVoucher && freeshipVoucher.code) {
      
      
      // Tìm voucher trong DB (không lọc điều kiện để debug)
      const [allVouchers] = await connection.query(
        `SELECT ma_km, code, so_luong, so_luong_da_dung, trang_thai, ngay_bat_dau, ngay_ket_thuc 
         FROM khuyen_mai WHERE code = ?`,
        [freeshipVoucher.code]
      );
      
      
      const [vouchers] = await connection.query(
        `SELECT ma_km, code, so_luong, so_luong_da_dung 
         FROM khuyen_mai 
         WHERE code = ? 
           AND trang_thai = 'active'
           AND ngay_bat_dau <= NOW()
           AND ngay_ket_thuc >= NOW() 
           AND so_luong_da_dung < so_luong`,
        [freeshipVoucher.code]
      );
      
      if (vouchers.length > 0) {
        maKmFreeship = vouchers[0].ma_km;
        await connection.query(
          'UPDATE khuyen_mai SET so_luong_da_dung = so_luong_da_dung + 1 WHERE ma_km = ?', 
          [maKmFreeship]
        );
        usedVouchers.push({ code: freeshipVoucher.code, type: 'freeship', maKm: maKmFreeship });
        console.log(`✅ Freeship voucher ${freeshipVoucher.code} used. Remaining: ${vouchers[0].so_luong - vouchers[0].so_luong_da_dung - 1}`);
      } else {
        console.log(`⚠️ Freeship voucher ${freeshipVoucher.code} not found or not valid in DB`);
      }
    }

    // Xử lý mã giảm giá
    if (discountVoucher && discountVoucher.code) {
      
      
      // Tìm voucher trong DB (không lọc điều kiện để debug)
      const [allVouchers] = await connection.query(
        `SELECT ma_km, code, so_luong, so_luong_da_dung, trang_thai, ngay_bat_dau, ngay_ket_thuc 
         FROM khuyen_mai WHERE code = ?`,
        [discountVoucher.code]
      );
      
      
      const [vouchers] = await connection.query(
        `SELECT ma_km, code, so_luong, so_luong_da_dung 
         FROM khuyen_mai 
         WHERE code = ? 
           AND trang_thai = 'active'
           AND ngay_bat_dau <= NOW()
           AND ngay_ket_thuc >= NOW() 
           AND so_luong_da_dung < so_luong`,
        [discountVoucher.code]
      );
      
      if (vouchers.length > 0) {
        maKmDiscount = vouchers[0].ma_km;
        await connection.query(
          'UPDATE khuyen_mai SET so_luong_da_dung = so_luong_da_dung + 1 WHERE ma_km = ?', 
          [maKmDiscount]
        );
        usedVouchers.push({ code: discountVoucher.code, type: 'discount', maKm: maKmDiscount });
        console.log(`✅ Discount voucher ${discountVoucher.code} used. Remaining: ${vouchers[0].so_luong - vouchers[0].so_luong_da_dung - 1}`);
      } else {
        console.log(`⚠️ Discount voucher ${discountVoucher.code} not found or not valid in DB`);
      }
    }

    // Fallback: xử lý voucherCode cũ (tương thích ngược)
    let maKm = maKmDiscount || maKmFreeship; // Ưu tiên mã giảm giá
    if (!maKm && voucherCode) {
      const [vouchers] = await connection.query(
        `SELECT ma_km, so_luong, so_luong_da_dung 
         FROM khuyen_mai 
         WHERE code = ? 
           AND trang_thai = 'active'
           AND ngay_bat_dau <= NOW()
           AND ngay_ket_thuc >= NOW() 
           AND so_luong_da_dung < so_luong`,
        [voucherCode]
      );
      if (vouchers.length > 0) {
        maKm = vouchers[0].ma_km;
        await connection.query(
          'UPDATE khuyen_mai SET so_luong_da_dung = so_luong_da_dung + 1 WHERE ma_km = ?', 
          [maKm]
        );
        usedVouchers.push({ code: voucherCode, type: 'legacy', maKm: maKm });
        console.log(`Legacy voucher ${voucherCode} used. Updated so_luong_da_dung for ma_km=${maKm}`);
      }
    }

    // Lưu discount amount để ghi lịch sử sau
    const discountAmount = discount || 0;

    // Xác định loại đơn hàng (normal/deposit)
    const orderType = isDeposit ? 'deposit' : 'normal';
    const depositStatus = isDeposit ? 'pending' : null;
    const actualDepositAmount = isDeposit ? (depositAmount || 0) : 0;
    const actualRemainingAmount = isDeposit ? (remainingAmount || 0) : 0;

    // Tạo đơn hàng với thông tin đặt cọc
    const [orderResult] = await connection.query(
      `INSERT INTO don_hang (ma_kh, ten_nguoi_nhan, so_dt, dia_chi_nhan, tong_tien, trang_thai, ma_km, loai_don, tien_dat_coc, tien_con_lai, trang_thai_coc)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [customerId || null, customerName, phone, address, total, maKm, orderType, actualDepositAmount, actualRemainingAmount, depositStatus]
    );
    
    const orderId = orderResult.insertId;
    
    console.log(`Order ${orderId} created: type=${orderType}, deposit=${actualDepositAmount}, remaining=${actualRemainingAmount}`);

    // Thêm chi tiết đơn hàng
    for (const item of items) {
      // Lấy giá nhập hiện tại của sản phẩm để lưu vào chi tiết đơn hàng (khóa vốn)
      const [[product]] = await connection.query('SELECT gia_nhap FROM san_pham WHERE ma_sp = ?', [item.id]);
      const importPrice = product && product.gia_nhap ? product.gia_nhap : 0;

      await connection.query(
        `INSERT INTO chi_tiet_don_hang (ma_don, ma_sp, so_luong, gia, gia_nhap)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.id, item.quantity, item.price, importPrice]
      );
      
      // Giảm số lượng tồn kho
      await connection.query(
        'UPDATE san_pham SET so_luong_ton = so_luong_ton - ? WHERE ma_sp = ?',
        [item.quantity, item.id]
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

    res.json({
      success: true,
      data: {
        orderId: orderId,
        message: isDeposit ? 'Đặt cọc thành công' : 'Đặt hàng thành công',
        isDeposit: isDeposit || false,
        depositAmount: depositAmount || 0,
        remainingAmount: remainingAmount || 0
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi tạo đơn hàng: ' + error.message
    });
  } finally {
    connection.release();
  }
});

// PUT /api/orders/:orderId/payment - Cập nhật trạng thái thanh toán
router.put('/:orderId/payment', async (req, res) => {
  try {
    const { orderId } = req.params;
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
    const { orderId } = req.params;

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
    
    const { orderId } = req.params;
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

    // Hoàn lại số lượng tồn kho cho các sản phẩm
    const [orderItems] = await connection.query(
      'SELECT ma_sp, so_luong FROM chi_tiet_don_hang WHERE ma_don = ?',
      [orderId]
    );

    for (const item of orderItems) {
      await connection.query(
        'UPDATE san_pham SET so_luong_ton = so_luong_ton + ? WHERE ma_sp = ?',
        [item.so_luong, item.ma_sp]
      );
    }
    console.log('Stock restored for', orderItems.length, 'items');

    // Cập nhật trạng thái thanh toán
    await connection.query(
      "UPDATE thanh_toan SET trang_thai = 'failed' WHERE ma_don = ?",
      [orderId]
    );

    // Nếu có sử dụng voucher, hoàn lại số lượng đã dùng
    if (order.ma_km) {
      await connection.query(
        'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
        [order.ma_km]
      );
      console.log(`Voucher refunded for cancelled order. Updated so_luong_da_dung for ma_km=${order.ma_km}`);
    }
    
    // Hoàn lại tất cả voucher đã dùng trong đơn hàng (từ bảng lich_su_voucher)
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
        }
      }
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
    const { orderId } = req.params;
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
    const { orderId } = req.params;
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
    
    const { orderId } = req.params;
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

    // Hoàn lại số lượng tồn kho
    const [orderItems] = await connection.query(
      'SELECT ma_sp, so_luong FROM chi_tiet_don_hang WHERE ma_don = ?',
      [orderId]
    );

    for (const item of orderItems) {
      await connection.query(
        'UPDATE san_pham SET so_luong_ton = so_luong_ton + ? WHERE ma_sp = ?',
        [item.so_luong, item.ma_sp]
      );
    }

    // Cập nhật thanh toán
    await connection.query(
      "UPDATE thanh_toan SET trang_thai = 'failed' WHERE ma_don = ?",
      [orderId]
    );

    // Hoàn lại voucher
    if (order.ma_km) {
      await connection.query(
        'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
        [order.ma_km]
      );
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
