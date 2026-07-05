const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Middleware kiểm tra quyền admin cho các thao tác quản lý đổi trả
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

// Middleware yêu cầu đăng nhập
const requireLogin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập để gửi và tra cứu yêu cầu đổi trả.',
      code: 'LOGIN_REQUIRED'
    });
  }
  const u = req.session.user;
  const isAdmin = u.vai_tro === 'admin';
  if (!isAdmin && !u.ma_kh) {
    return res.status(401).json({
      success: false,
      message: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
      code: 'LOGIN_REQUIRED'
    });
  }
  next();
};

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Đảm bảo thư mục lưu ảnh đổi trả tồn tại
const claimsDir = path.join(__dirname, '../../frontend/images/claims');
if (!fs.existsSync(claimsDir)) {
    fs.mkdirSync(claimsDir, { recursive: true });
}

// Cấu hình multer lưu ảnh
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, claimsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'claim-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
    fileFilter: function (req, file, cb) {
        const allowedExtensions = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif|jfif)$/i;
        const allowedMimeTypes = /^image\/(jpeg|png|gif|webp|bmp|tiff|heic|heif|avif)$/i;
        if (allowedExtensions.test(path.extname(file.originalname)) && allowedMimeTypes.test(file.mimetype)) {
            return cb(null, true);
        }
        cb(new Error('Chỉ hỗ trợ tải lên tệp ảnh hợp lệ!'));
    }
});

// POST /api/returns/upload-image - Tải ảnh lỗi sản phẩm lên server
router.post('/upload-image', requireLogin, (req, res) => {
    upload.single('claimImage')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, message: 'Lỗi tải ảnh: ' + err.message });
        } else if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Không tìm thấy file ảnh.' });
        }
        
        const imageUrl = 'images/claims/' + req.file.filename;
        res.json({
            success: true,
            message: 'Tải ảnh thành công',
            imageUrl: imageUrl
        });
    });
});

/**
 * POST /api/returns/claim
 * Gửi yêu cầu đổi trả online
 */
router.post('/claim', requireLogin, async (req, res) => {
  try {
    const { ma_don, ma_sp, ly_do, loai, hinh_anh } = req.body;

    if (!ma_don || !ma_sp || !ly_do || !ly_do.trim() || !loai) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin yêu cầu đổi trả.' });
    }

    const allowedTypes = ['doi', 'tra', 'hoan_tien'];
    if (!allowedTypes.includes(loai)) {
      return res.status(400).json({ success: false, message: 'Loại yêu cầu không hợp lệ.' });
    }

    const sessionUser = req.session.user;
    const isAdmin = sessionUser.vai_tro === 'admin';
    const userId = sessionUser.ma_kh;

    // 1. Kiểm tra đơn hàng tồn tại + trạng thái (hỗ trợ cả ma_don và order_code)
    const [orders] = await pool.query(
      `SELECT ma_don, ma_kh, trang_thai, thoi_gian FROM don_hang WHERE ma_don = ? OR order_code = ?`,
      [ma_don, ma_don]
    );

    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng này.' });
    }

    const order = orders[0];
    const actualMaDon = order.ma_don;

    // 2. Xác thực quyền sở hữu
    if (!isAdmin && Number(order.ma_kh) !== Number(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ có thể gửi yêu cầu đổi trả cho đơn hàng mình đã mua.'
      });
    }

    // 3. Đơn hàng phải hoàn thành hoặc đã giao
    const completedStatuses = ['completed', 'delivered'];
    if (!completedStatuses.includes(order.trang_thai)) {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng này chưa được giao thành công. Chỉ có thể yêu cầu đổi trả sau khi nhận hàng.'
      });
    }

    // 4. Kiểm tra sản phẩm có trong đơn hàng không
    const [items] = await pool.query(
      `SELECT ma_sp FROM chi_tiet_don_hang WHERE ma_don = ? AND ma_sp = ?`,
      [actualMaDon, ma_sp]
    );
    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sản phẩm yêu cầu đổi trả không nằm trong đơn hàng này.'
      });
    }

    // 5. Kiểm tra thời hạn đổi trả
    const orderDate = new Date(order.thoi_gian);
    const currentDate = new Date();
    const diffTime = Math.abs(currentDate - orderDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (loai === 'doi') {
      if (diffDays > 30) {
        return res.status(400).json({
          success: false,
          message: 'Đã quá thời hạn đổi trả 30 ngày cho sản phẩm này.'
        });
      }
    } else { // tra hoặc hoan_tien
      if (diffDays > 7) {
        return res.status(400).json({
          success: false,
          message: 'Đã quá thời hạn hoàn trả 7 ngày cho sản phẩm này.'
        });
      }
    }

    // 6. Kiểm tra xem sản phẩm trong đơn hàng này đã được tạo yêu cầu đổi trả chưa (tránh spam)
    const [existingClaims] = await pool.query(
      `SELECT ma_ycdt FROM yeu_cau_doi_tra WHERE ma_don = ? AND ma_sp = ? AND trang_thai IN ('pending', 'approved', 'processing')`,
      [actualMaDon, ma_sp]
    );
    if (existingClaims.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Yêu cầu đổi trả cho sản phẩm này đang được xử lý, bạn không thể gửi thêm yêu cầu.'
      });
    }

    // 7. Tạo yêu cầu đổi trả
    const imgStr = hinh_anh ? (Array.isArray(hinh_anh) ? JSON.stringify(hinh_anh) : hinh_anh) : null;
    const finalCustomerId = isAdmin ? order.ma_kh : userId;

    const [result] = await pool.query(
      `INSERT INTO yeu_cau_doi_tra (ma_don, ma_kh, ma_sp, ly_do, loai, hinh_anh, trang_thai)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [actualMaDon, finalCustomerId, ma_sp, ly_do.trim(), loai, imgStr]
    );

    // Lấy thông tin phụ cho email thông báo admin
    let customerName = order.ten_nguoi_nhan;
    let productName = 'Thiết bị';
    try {
        const [[prod]] = await pool.query('SELECT ten_sp FROM san_pham WHERE ma_sp = ?', [ma_sp]);
        if (prod) productName = prod.ten_sp;
    } catch (e) { console.error('[Return API] Query product name error:', e.message); }

    // Gửi email thông báo cho Admin (chạy ngầm bất đồng bộ)
    const { sendNewReturnRequestToAdmin } = require('../services/emailService');
    sendNewReturnRequestToAdmin(result.insertId, {
        orderId: actualMaDon,
        customerName,
        productName,
        type: loai,
        reason: ly_do
    }).catch(err => console.error('[Notification Error] Cannot notify admin of new return:', err.message));

    res.json({
      success: true,
      message: 'Gửi yêu cầu đổi trả thành công! Chúng tôi sẽ kiểm tra và liên hệ với bạn sớm nhất.',
      data: {
        claimId: result.insertId
      }
    });

  } catch (error) {
    console.error('[Return API] Create claim error:', error);
    res.status(500).json({ success: false, message: 'Lỗi gửi yêu cầu đổi trả: ' + error.message });
  }
});

/**
 * GET /api/returns/user/:userId
 * Lấy danh sách yêu cầu đổi trả của khách hàng
 */
router.get('/user/:userId', requireLogin, async (req, res) => {
  try {
    const { userId } = req.params;
    const sessionUser = req.session.user;
    const isAdmin = sessionUser.vai_tro === 'admin';

    if (!isAdmin && Number(userId) !== Number(sessionUser.ma_kh)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập thông tin đổi trả này.' });
    }

    const [claims] = await pool.query(
      `SELECT ycdt.*, sp.ten_sp, sp.anh_dai_dien
       FROM yeu_cau_doi_tra ycdt
       JOIN san_pham sp ON ycdt.ma_sp = sp.ma_sp
       WHERE ycdt.ma_kh = ?
       ORDER BY ycdt.ngay_tao DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: claims
    });

  } catch (error) {
    console.error('[Return API] Get user claims error:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách đổi trả: ' + error.message });
  }
});

/**
 * GET /api/returns/claims
 * Admin: Lấy danh sách tất cả yêu cầu đổi trả
 */
router.get('/claims', checkAdmin, async (req, res) => {
  try {
    const [claims] = await pool.query(
      `SELECT ycdt.*, sp.ten_sp, kh.ho_ten as ten_kh, kh.so_dt as sdt_kh, kh.email as kh_email
       FROM yeu_cau_doi_tra ycdt
       JOIN san_pham sp ON ycdt.ma_sp = sp.ma_sp
       LEFT JOIN khach_hang kh ON ycdt.ma_kh = kh.ma_kh
       ORDER BY ycdt.ngay_tao DESC`
    );

    res.json({
      success: true,
      data: claims
    });

  } catch (error) {
    console.error('[Return API] Get all claims error:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy tất cả yêu cầu đổi trả: ' + error.message });
  }
});

/**
 * PUT /api/returns/claim/:id/status
 * Admin: Cập nhật trạng thái và kết quả đổi trả
 */
router.put('/claim/:id/status', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, refundAmount, note } = req.body;

    const allowedStatuses = ['pending', 'approved', 'processing', 'completed', 'rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
    }

    // 1. Lấy thông tin yêu cầu đổi trả và khách hàng
    const [claims] = await pool.query(
      `SELECT ycdt.*, sp.ten_sp, kh.email as kh_email, kh.ho_ten as kh_name
       FROM yeu_cau_doi_tra ycdt
       JOIN san_pham sp ON ycdt.ma_sp = sp.ma_sp
       LEFT JOIN khach_hang kh ON ycdt.ma_kh = kh.ma_kh
       WHERE ycdt.ma_ycdt = ?`,
      [id]
    );

    if (claims.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu đổi trả.' });
    }

    const claim = claims[0];

    if (['completed', 'rejected'].includes(claim.trang_thai)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Yêu cầu đổi trả này đã hoàn thành hoặc bị từ chối, không thể thay đổi trạng thái.' 
      });
    }

    const completedDate = ['completed', 'rejected'].includes(status) ? new Date() : null;
    const finalRefund = parseFloat(refundAmount) || 0.00;

    // 2. Tiến hành transaction để cập nhật đổi trả và khấu trừ điểm
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Cập nhật trạng thái yêu cầu đổi trả
      await connection.query(
        `UPDATE yeu_cau_doi_tra
         SET trang_thai = ?, so_tien_hoan = ?, ghi_chu_admin = ?, ngay_xu_ly = ?
         WHERE ma_ycdt = ?`,
        [status, finalRefund, note || null, completedDate, id]
      );

      // Tự động đồng bộ vào kho_bao_hanh khi yêu cầu đổi/trả hoàn tất (completed)
      if (status === 'completed' && ['doi', 'tra'].includes(claim.loai)) {
        const [exists] = await connection.query(
          `SELECT ma_kbh FROM kho_bao_hanh WHERE nguon_goc = 'return' AND ma_nguon = ?`,
          [id]
        );
        if (exists.length === 0) {
          // Thử tìm IMEI bán ra của đơn hàng để tự động điền (nếu có)
          const [imeiRows] = await connection.query(
            `SELECT imei, ma_bt FROM imei_san_pham WHERE ma_sp = ? AND ma_ct_don IN (
              SELECT ma_ct_don FROM chi_tiet_don_hang WHERE ma_don = ? AND ma_sp = ?
             ) LIMIT 1`,
            [claim.ma_sp, claim.ma_don, claim.ma_sp]
          );
          const imei = imeiRows.length > 0 ? imeiRows[0].imei : null;
          const ma_bt = imeiRows.length > 0 ? imeiRows[0].ma_bt : null;

          await connection.query(
            `INSERT INTO kho_bao_hanh (ma_sp, ma_bt, imei, nguon_goc, ma_nguon, trang_thai, ghi_chu)
             VALUES (?, ?, ?, 'return', ?, 'cho_xu_ly', ?)`,
            [claim.ma_sp, ma_bt, imei, id, `Tự động tạo từ yêu cầu đổi trả #${id}`]
          );
        }
      }

      // Nếu hoàn tất (completed) và là yêu cầu trả máy/hoàn tiền -> Trừ điểm tích lũy & doanh thu chi tiêu
      if (status === 'completed' && ['tra', 'hoan_tien'].includes(claim.loai) && claim.ma_kh) {
        // Tích lũy điểm là 100k = 1 điểm, suy ra khấu trừ:
        const pointsToDeduct = Math.floor(finalRefund / 100000);
        
        if (pointsToDeduct > 0 || finalRefund > 0) {
          // Trừ điểm và doanh thu (đảm bảo lớn hơn hoặc bằng 0)
          await connection.query(
            `UPDATE khach_hang 
             SET tong_diem = GREATEST(0, tong_diem - ?), 
                 tong_chi_tieu = GREATEST(0, tong_chi_tieu - ?)
             WHERE ma_kh = ?`,
            [pointsToDeduct, finalRefund, claim.ma_kh]
          );

          // Ghi nhận lịch sử khấu trừ điểm
          if (pointsToDeduct > 0) {
            await connection.query(
              `INSERT INTO diem_thuong (ma_kh, so_diem, loai, mo_ta, ma_don, ngay_tao) 
               VALUES (?, ?, 'redeem', ?, ?, NOW())`,
              [claim.ma_kh, pointsToDeduct, `Khấu trừ điểm hoàn trả đơn hàng #${claim.ma_don} (Yêu cầu #${id})`, claim.ma_don]
            );
          }

          // Cập nhật lại thứ hạng thành viên dựa trên tổng chi tiêu mới
          const [[cust]] = await connection.query(`SELECT tong_chi_tieu FROM khach_hang WHERE ma_kh = ?`, [claim.ma_kh]);
          if (cust) {
            const totalSpent = parseFloat(cust.tong_chi_tieu) || 0;
            let newRank = 'dong';
            if (totalSpent >= 100000000) newRank = 'kim_cuong';      // 100tr
            else if (totalSpent >= 50000000) newRank = 'vang';       // 50tr
            else if (totalSpent >= 15000000) newRank = 'bac';        // 15tr
            await connection.query(`UPDATE khach_hang SET hang_thanh_vien = ? WHERE ma_kh = ?`, [newRank, claim.ma_kh]);
          }
        }
      }

      await connection.commit();
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }

    // 3. Gửi email thông báo cho khách hàng
    if (claim.kh_email) {
      try {
        const { sendReturnStatusUpdate } = require('../services/emailService');
        await sendReturnStatusUpdate(id, status, {
          refundAmount: finalRefund,
          note: note,
          email: claim.kh_email,
          customerName: claim.kh_name,
          productName: claim.ten_sp,
          type: claim.loai,
          orderId: claim.ma_don
        });
      } catch (emailErr) {
        console.error('[Return API] Gửi email cập nhật đổi trả thất bại:', emailErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Cập nhật trạng thái yêu cầu đổi trả thành công!'
    });

  } catch (error) {
    console.error('[Return API] Update status error:', error);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật yêu cầu đổi trả: ' + error.message });
  }
});

/**
 * GET /api/returns/warehouse/defective
 * Admin: Lấy danh sách máy lỗi trong kho
 */
router.get('/warehouse/defective', checkAdmin, async (req, res) => {
  try {
    const { search, status, origin } = req.query;
    
    let sql = `
      SELECT kbh.*, sp.ten_sp, bt.mau_sac, bt.dung_luong
      FROM kho_bao_hanh kbh
      JOIN san_pham sp ON kbh.ma_sp = sp.ma_sp
      LEFT JOIN bien_the_san_pham bt ON kbh.ma_bt = bt.ma_bt
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      sql += ` AND (sp.ten_sp LIKE ? OR kbh.imei LIKE ? OR kbh.ma_nguon = ?)`;
      const searchVal = `%${search.trim()}%`;
      const idVal = parseInt(search.trim()) || -1;
      params.push(searchVal, searchVal, idVal);
    }

    if (status) {
      sql += ` AND kbh.trang_thai = ?`;
      params.push(status);
    }

    if (origin) {
      sql += ` AND kbh.nguon_goc = ?`;
      params.push(origin);
    }

    sql += ` ORDER BY kbh.ngay_nhap DESC`;

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[Warehouse API] Get defective error:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách máy lỗi: ' + error.message });
  }
});

/**
 * GET /api/returns/warehouse/products
 * Admin: Lấy danh sách sản phẩm phục vụ dropdown
 */
router.get('/warehouse/products', checkAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT ma_sp, ten_sp FROM san_pham ORDER BY ten_sp`);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[Warehouse API] Get products error:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách sản phẩm: ' + error.message });
  }
});

/**
 * GET /api/returns/warehouse/variants/:productId
 * Admin: Lấy danh sách biến thể của sản phẩm
 */
router.get('/warehouse/variants/:productId', checkAdmin, async (req, res) => {
  try {
    const { productId } = req.params;
    const [rows] = await pool.query(
      `SELECT ma_bt, mau_sac, dung_luong, so_luong FROM bien_the_san_pham WHERE ma_sp = ?`,
      [productId]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[Warehouse API] Get variants error:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách biến thể: ' + error.message });
  }
});

/**
 * POST /api/returns/warehouse/defective
 * Admin: Thêm máy lỗi thủ công vào kho
 */
router.post('/warehouse/defective', checkAdmin, async (req, res) => {
  try {
    const { ma_sp, ma_bt, imei, nguon_goc, ma_nguon, trang_thai, ghi_chu } = req.body;

    if (!ma_sp) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn sản phẩm.' });
    }

    const finalOrigin = nguon_goc || 'manual';
    const finalStatus = trang_thai || 'cho_xu_ly';

    const [result] = await pool.query(
      `INSERT INTO kho_bao_hanh (ma_sp, ma_bt, imei, nguon_goc, ma_nguon, trang_thai, ghi_chu)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ma_sp, ma_bt || null, imei || null, finalOrigin, ma_nguon || null, finalStatus, ghi_chu || null]
    );

    res.json({ success: true, message: 'Thêm máy lỗi vào kho thành công!', data: { ma_kbh: result.insertId } });
  } catch (error) {
    console.error('[Warehouse API] Add defective error:', error);
    res.status(500).json({ success: false, message: 'Lỗi thêm máy lỗi: ' + error.message });
  }
});

/**
 * PUT /api/returns/warehouse/defective/:id
 * Admin: Cập nhật trạng thái vật lý, IMEI, biến thể hoặc ghi chú máy lỗi
 */
router.put('/warehouse/defective/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ma_bt, imei, trang_thai, ghi_chu } = req.body;

    const allowedStatuses = ['cho_xu_ly', 'gui_hang', 'ra_linh_kien', 'luu_kho', 'da_tra_khach'];
    if (trang_thai && !allowedStatuses.includes(trang_thai)) {
      return res.status(400).json({ success: false, message: 'Trạng thái xử lý không hợp lệ.' });
    }

    const [exists] = await pool.query(`SELECT ma_kbh FROM kho_bao_hanh WHERE ma_kbh = ?`, [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi máy lỗi này.' });
    }

    await pool.query(
      `UPDATE kho_bao_hanh
       SET ma_bt = COALESCE(?, ma_bt),
           imei = COALESCE(?, imei),
           trang_thai = COALESCE(?, trang_thai),
           ghi_chu = COALESCE(?, ghi_chu)
       WHERE ma_kbh = ?`,
      [ma_bt || null, imei || null, trang_thai || null, ghi_chu || null, id]
    );

    res.json({ success: true, message: 'Cập nhật trạng thái kho máy lỗi thành công!' });
  } catch (error) {
    console.error('[Warehouse API] Update defective error:', error);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật máy lỗi: ' + error.message });
  }
});

/**
 * DELETE /api/returns/warehouse/defective/:id
 * Admin: Xóa bản ghi máy lỗi khỏi kho
 */
router.delete('/warehouse/defective/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [exists] = await pool.query(`SELECT ma_kbh FROM kho_bao_hanh WHERE ma_kbh = ?`, [id]);
    if (exists.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi máy lỗi này.' });
    }

    await pool.query(`DELETE FROM kho_bao_hanh WHERE ma_kbh = ?`, [id]);
    res.json({ success: true, message: 'Xóa bản ghi máy lỗi khỏi kho thành công!' });
  } catch (error) {
    console.error('[Warehouse API] Delete defective error:', error);
    res.status(500).json({ success: false, message: 'Lỗi xóa máy lỗi: ' + error.message });
  }
});

module.exports = router;
