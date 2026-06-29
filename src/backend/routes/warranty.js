const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Middleware kiểm tra quyền admin cho các thao tác quản lý bảo hành
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

// Middleware yêu cầu đăng nhập (customer hoặc admin) - dùng cho tra cứu & gửi yêu cầu bảo hành
const requireLogin = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: 'Vui lòng đăng nhập để tra cứu và gửi yêu cầu bảo hành.',
      code: 'LOGIN_REQUIRED'
    });
  }
  // Customer phải có ma_kh, admin được phép luôn
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

/**
 * POST /api/warranty/check
 * Tra cứu bảo hành theo IMEI, Số Serial hoặc Mã Đơn hàng
 * YÊU CẦU: Đã đăng nhập + chỉ tra cứu được phiếu BH thuộc về mình
 * (qua phieu_bao_hanh.ma_kh hoặc don_hang.ma_kh). Admin xem được tất cả.
 */
router.post('/check', requireLogin, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã IMEI, Serial hoặc Mã đơn hàng' });
    }

    const searchQuery = query.trim();
    const sessionUser = req.session.user;
    const isAdmin = sessionUser.vai_tro === 'admin';
    const userId = sessionUser.ma_kh;

    // Tìm kiếm phiếu bảo hành - admin xem hết, customer chỉ xem của mình
    let warrantySql = `
      SELECT pbh.*, sp.ten_sp, sp.anh_dai_dien, dh.trang_thai as trang_thai_don, dh.ma_kh as ma_kh_don
      FROM phieu_bao_hanh pbh
      JOIN san_pham sp ON pbh.ma_sp = sp.ma_sp
      JOIN don_hang dh ON pbh.ma_don = dh.ma_don
      WHERE (pbh.so_imei = ? OR pbh.so_serial = ? OR pbh.ma_don = ?)
    `;
    const params = [searchQuery, searchQuery, searchQuery];

    if (!isAdmin) {
      // Khách hàng chỉ tra cứu được phiếu BH mà họ là chủ sở hữu hoặc người mua đơn hàng
      // và đơn hàng liên quan phải ở trạng thái đã giao (delivered) hoặc hoàn thành (completed)
      warrantySql += ` AND (pbh.ma_kh = ? OR dh.ma_kh = ?) AND dh.trang_thai IN ('completed', 'delivered')`;
      params.push(userId, userId);
    }

    const [warranties] = await pool.query(warrantySql, params);

    if (warranties.length === 0) {
      // Phân biệt các case:
      // 1. Phân biệt xem mã này có tồn tại trong hệ thống không
      const [exists] = await pool.query(
        `SELECT pbh.*, dh.trang_thai as trang_thai_don, dh.ma_kh as ma_kh_don 
         FROM phieu_bao_hanh pbh
         JOIN don_hang dh ON pbh.ma_don = dh.ma_don
         WHERE pbh.so_imei = ? OR pbh.so_serial = ? OR pbh.ma_don = ? LIMIT 1`,
        [searchQuery, searchQuery, searchQuery]
      );
      if (exists.length > 0 && !isAdmin) {
        const item = exists[0];
        // Check ownership
        const ownerOfWarranty = item.ma_kh != null && Number(item.ma_kh) === Number(userId);
        const buyerOfOrder = item.ma_kh_don != null && Number(item.ma_kh_don) === Number(userId);
        if (!ownerOfWarranty && !buyerOfOrder) {
          return res.status(403).json({
            success: false,
            message: 'Bạn chỉ có thể tra cứu bảo hành cho sản phẩm mình đã mua. Mã này không thuộc về tài khoản của bạn.',
            code: 'NOT_OWNER'
          });
        }
        // Check order status
        if (item.trang_thai_don !== 'completed' && item.trang_thai_don !== 'delivered') {
          return res.status(400).json({
            success: false,
            message: 'Sản phẩm/Đơn hàng này chưa được hoàn thành hoặc giao hàng thành công. Quyền lợi bảo hành chỉ được kích hoạt sau khi nhận hàng thành công.',
            code: 'ORDER_NOT_COMPLETED'
          });
        }
      }
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu bảo hành nào tương ứng với thông tin tra cứu.' });
    }

    // Lấy chi tiết lịch sử sửa chữa/yêu cầu bảo hành cho từng phiếu
    const warrantiesWithClaims = await Promise.all(warranties.map(async (pbh) => {
      const [claims] = await pool.query(
        `SELECT * FROM yeu_cau_bao_hanh WHERE ma_pbh = ? ORDER BY ngay_tao DESC`,
        [pbh.ma_pbh]
      );
      return {
        ...pbh,
        claims: claims
      };
    }));

    res.json({
      success: true,
      data: warrantiesWithClaims
    });

  } catch (error) {
    console.error('[Warranty API] Check error:', error);
    res.status(500).json({ success: false, message: 'Lỗi tra cứu bảo hành: ' + error.message });
  }
});

/**
 * GET /api/warranty/user/:userId
 * Lấy danh sách phiếu bảo hành của khách hàng
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Xác thực người dùng truy cập chính xác tài khoản của họ (hoặc là admin)
    const sessionUser = req.session ? req.session.user : null;
    const isAdmin = sessionUser && sessionUser.vai_tro === 'admin';
    const sessionUserId = sessionUser ? sessionUser.ma_kh : null;

    if (!isAdmin && Number(userId) !== Number(sessionUserId)) {
      return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập thông tin bảo hành này.' });
    }

    const [warranties] = await pool.query(
      `SELECT pbh.*, sp.ten_sp, sp.anh_dai_dien
       FROM phieu_bao_hanh pbh
       JOIN san_pham sp ON pbh.ma_sp = sp.ma_sp
       WHERE pbh.ma_kh = ?
       ORDER BY pbh.ngay_het_han DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: warranties
    });

  } catch (error) {
    console.error('[Warranty API] Get user warranties error:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách bảo hành: ' + error.message });
  }
});

/**
 * POST /api/warranty/claim
 * Gửi yêu cầu bảo hành online
 * YÊU CẦU: Đã đăng nhập + sở hữu phiếu BH (qua pbh.ma_kh hoặc don_hang.ma_kh)
 */
router.post('/claim', requireLogin, async (req, res) => {
  try {
    const { ma_pbh, mo_ta_loi, hinh_anh } = req.body;

    if (!ma_pbh || !mo_ta_loi || !mo_ta_loi.trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin yêu cầu bảo hành.' });
    }

    // 1. Kiểm tra phiếu bảo hành có hợp lệ không + lấy ma_kh và trạng thái của đơn hàng
    const [warranties] = await pool.query(
      `SELECT pbh.*, dh.ma_kh as ma_kh_don, dh.trang_thai as trang_thai_don
       FROM phieu_bao_hanh pbh
       JOIN don_hang dh ON pbh.ma_don = dh.ma_don
       WHERE pbh.ma_pbh = ?`,
      [ma_pbh]
    );

    if (warranties.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu bảo hành này.' });
    }

    const pbh = warranties[0];

    // 2. Xác thực sở hữu: phải có ma_kh khớp với pbh.ma_kh hoặc don_hang.ma_kh
    const sessionUser = req.session.user;
    const isAdmin = sessionUser.vai_tro === 'admin';
    const sessionUserId = sessionUser.ma_kh;
    const ownerOfWarranty = pbh.ma_kh != null && Number(pbh.ma_kh) === Number(sessionUserId);
    const buyerOfOrder = pbh.ma_kh_don != null && Number(pbh.ma_kh_don) === Number(sessionUserId);

    if (!isAdmin && !ownerOfWarranty && !buyerOfOrder) {
      return res.status(403).json({
        success: false,
        message: 'Bạn chỉ có thể gửi yêu cầu bảo hành cho sản phẩm mình đã mua.',
        code: 'NOT_OWNER'
      });
    }

    // Kiểm tra trạng thái đơn hàng: phải hoàn thành hoặc đã giao mới được gửi bảo hành
    if (!isAdmin && pbh.trang_thai_don !== 'completed' && pbh.trang_thai_don !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Đơn hàng này chưa được giao hàng hoặc hoàn thành thành công, do đó bạn chưa thể yêu cầu bảo hành/sửa chữa.',
        code: 'ORDER_NOT_COMPLETED'
      });
    }

    // 3. Kiểm tra hạn bảo hành
    if (pbh.trang_thai === 'expired' || new Date(pbh.ngay_het_han) < new Date()) {
      // Tự động cập nhật expired nếu đã quá hạn
      await pool.query(`UPDATE phieu_bao_hanh SET trang_thai = 'expired' WHERE ma_pbh = ?`, [ma_pbh]);
      return res.status(400).json({ success: false, message: 'Sản phẩm đã hết hạn bảo hành. Vui lòng liên hệ trực tiếp để sửa chữa tính phí.' });
    }

    if (pbh.trang_thai === 'voided') {
      return res.status(400).json({ success: false, message: 'Phiếu bảo hành này đã bị vô hiệu hóa do vi phạm chính sách bảo hành.' });
    }

    // 4. Tạo yêu cầu bảo hành — luôn gắn ma_kh của session (không cho phép anonymous)
    const imgStr = hinh_anh ? (Array.isArray(hinh_anh) ? JSON.stringify(hinh_anh) : hinh_anh) : null;
    const customerId = isAdmin ? (pbh.ma_kh || pbh.ma_kh_don) : sessionUserId;

    const [result] = await pool.query(
      `INSERT INTO yeu_cau_bao_hanh (ma_pbh, ma_kh, mo_ta_loi, hinh_anh, trang_thai)
       VALUES (?, ?, ?, ?, 'pending')`,
      [ma_pbh, customerId, mo_ta_loi.trim(), imgStr]
    );

    // Nếu phiếu bảo hành chưa gắn ma_kh, gắn luôn từ buyer của đơn hàng để các lần sau đỡ phải JOIN
    if (!pbh.ma_kh && pbh.ma_kh_don) {
      await pool.query(`UPDATE phieu_bao_hanh SET ma_kh = ? WHERE ma_pbh = ?`, [pbh.ma_kh_don, ma_pbh]);
    }

    res.json({
      success: true,
      message: 'Gửi yêu cầu bảo hành online thành công! Đội ngũ kỹ thuật sẽ liên hệ hỗ trợ bạn trong thời gian sớm nhất.',
      data: {
        claimId: result.insertId
      }
    });

  } catch (error) {
    console.error('[Warranty API] Create claim error:', error);
    res.status(500).json({ success: false, message: 'Lỗi gửi yêu cầu bảo hành: ' + error.message });
  }
});

/**
 * GET /api/warranty/claims
 * Admin: Lấy tất cả danh sách yêu cầu bảo hành
 */
router.get('/claims', checkAdmin, async (req, res) => {
  try {
    const [claims] = await pool.query(
      `SELECT ycbh.*, pbh.ma_don, pbh.so_imei, sp.ten_sp, kh.ho_ten as ten_kh, kh.so_dt as sdt_kh
       FROM yeu_cau_bao_hanh ycbh
       JOIN phieu_bao_hanh pbh ON ycbh.ma_pbh = pbh.ma_pbh
       JOIN san_pham sp ON pbh.ma_sp = sp.ma_sp
       LEFT JOIN khach_hang kh ON ycbh.ma_kh = kh.ma_kh
       ORDER BY ycbh.ngay_tao DESC`
    );

    res.json({
      success: true,
      data: claims
    });

  } catch (error) {
    console.error('[Warranty API] Get all claims error:', error);
    res.status(500).json({ success: false, message: 'Lỗi lấy danh sách yêu cầu bảo hành: ' + error.message });
  }
});

/**
 * PUT /api/warranty/claim/:id/status
 * Admin: Cập nhật trạng thái và kết quả xử lý yêu cầu bảo hành
 */
router.put('/claim/:id/status', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, result, note } = req.body;

    const allowedStatuses = ['pending', 'received', 'diagnosing', 'repairing', 'completed', 'rejected'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ.' });
    }

    // 1. Kiểm tra yêu cầu bảo hành
    const [claims] = await pool.query(
      `SELECT ycbh.*, pbh.ma_kh, pbh.ma_sp, sp.ten_sp, kh.email as kh_email, kh.ho_ten as kh_name
       FROM yeu_cau_bao_hanh ycbh
       JOIN phieu_bao_hanh pbh ON ycbh.ma_pbh = pbh.ma_pbh
       JOIN san_pham sp ON pbh.ma_sp = sp.ma_sp
       LEFT JOIN khach_hang kh ON ycbh.ma_kh = kh.ma_kh
       WHERE ycbh.ma_ycbh = ?`,
      [id]
    );

    if (claims.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu bảo hành.' });
    }

    const claim = claims[0];
    const completedDate = ['completed', 'rejected'].includes(status) ? new Date() : null;

    // 2. Cập nhật
    await pool.query(
      `UPDATE yeu_cau_bao_hanh
       SET trang_thai = ?, ket_qua = ?, ngay_hoan_thanh = ?
       WHERE ma_ycbh = ?`,
      [status, result || null, completedDate, id]
    );

    // Tự động đồng bộ vào kho_bao_hanh khi yêu cầu bảo hành được tiếp nhận/xử lý
    if (['received', 'diagnosing', 'repairing', 'completed'].includes(status)) {
      try {
        const [exists] = await pool.query(
          `SELECT ma_kbh FROM kho_bao_hanh WHERE nguon_goc = 'warranty' AND ma_nguon = ?`,
          [id]
        );
        if (exists.length === 0) {
          // Lấy IMEI, Serial và các thông tin cần thiết của thiết bị từ phiếu bảo hành
          const [pbhRows] = await pool.query(
            `SELECT so_imei, so_serial, ma_sp FROM phieu_bao_hanh WHERE ma_pbh = ?`,
            [claim.ma_pbh]
          );
          if (pbhRows.length > 0) {
            const pbh = pbhRows[0];
            const imei = pbh.so_imei || pbh.so_serial || null;
            let ma_bt = null;
            if (imei) {
              const [imeiRows] = await pool.query(
                `SELECT ma_bt FROM imei_san_pham WHERE imei = ? LIMIT 1`,
                [imei]
              );
              if (imeiRows.length > 0) {
                ma_bt = imeiRows[0].ma_bt;
              }
            }
            await pool.query(
              `INSERT INTO kho_bao_hanh (ma_sp, ma_bt, imei, nguon_goc, ma_nguon, trang_thai, ghi_chu)
               VALUES (?, ?, ?, 'warranty', ?, 'cho_xu_ly', ?)`,
              [pbh.ma_sp, ma_bt, imei, id, `Tự động tạo từ yêu cầu bảo hành #${id}`]
            );
          }
        }
      } catch (dbErr) {
        console.error('[Warranty Sync Error]', dbErr.message);
      }
    }

    // Cập nhật thêm ghi chú trong phiếu bảo hành nếu được yêu cầu (ví dụ đổi máy mới, thay linh kiện)
    if (note && note.trim()) {
      await pool.query(
        `UPDATE phieu_bao_hanh SET ghi_chu = CONCAT(COALESCE(ghi_chu, ''), '\n', ?) WHERE ma_pbh = ?`,
        [`[${new Date().toLocaleDateString('vi-VN')}] ${note.trim()}`, claim.ma_pbh]
      );
    }

    // 3. Gửi email thông báo cho khách hàng nếu họ có email đăng ký
    if (claim.kh_email) {
      try {
        const { sendMarketingEmail } = require('../services/emailService');
        
        let statusLabel = 'Đang xử lý';
        let statusText = '';
        if (status === 'received') {
          statusLabel = 'Đã tiếp nhận sản phẩm';
          statusText = 'QuangHưng Mobile đã tiếp nhận sản phẩm lỗi của bạn và đang bàn giao cho bộ phận kỹ thuật để chuẩn bị kiểm tra đánh giá.';
        } else if (status === 'diagnosing') {
          statusLabel = 'Đang kiểm tra chẩn đoán lỗi';
          statusText = 'Kỹ thuật viên đang tiến hành đo đạc, kiểm tra chi tiết thiết bị để xác định nguyên nhân gây lỗi phần cứng/phần mềm.';
        } else if (status === 'repairing') {
          statusLabel = 'Đang tiến hành sửa chữa/thay thế';
          statusText = 'Chúng tôi đang tiến hành thay thế linh kiện hoặc sửa chữa mạch điện tử theo đúng quy chuẩn bảo hành của hãng.';
        } else if (status === 'completed') {
          statusLabel = 'Đã hoàn thành bảo hành';
          statusText = `Sản phẩm của bạn đã được khắc phục lỗi hoàn toàn và đã vượt qua bài kiểm tra chất lượng của chúng tôi. Kết quả: **${result || 'Sửa chữa thành công'}**. Chúng tôi sẽ sớm giao trả lại sản phẩm cho bạn.`;
        } else if (status === 'rejected') {
          statusLabel = 'Từ chối bảo hành';
          statusText = `Rất tiếc, yêu cầu bảo hành sản phẩm của bạn đã bị từ chối. Lý do từ chối kỹ thuật: **${result || 'Không đủ điều kiện bảo hành theo quy định của nhà sản xuất (vỡ móp, ẩm ướt, tự ý sửa chữa...)'}**. Thiết bị sẽ được gửi trả về cho bạn ở trạng thái hiện tại.`;
        }

        const emailContent = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 30px; text-align: center; color: white;">
              <h1 style="margin: 0; font-size: 24px;">🛡️ Cập Nhật Tiến Độ Bảo Hành</h1>
              <p style="margin: 5px 0 0 0; opacity: 0.8;">QuangHưng Mobile Support</p>
            </div>
            <div style="padding: 25px; background: #ffffff;">
              <p>Xin chào <strong>${claim.kh_name || 'Quý khách'}</strong>,</p>
              <p>Chúng tôi xin thông báo yêu cầu bảo hành mã số <strong>#${id}</strong> cho sản phẩm <strong>${claim.ten_sp}</strong> của bạn đã có cập nhật tiến độ mới:</p>
              
              <div style="background: #f9f9f9; padding: 20px; border-left: 4px solid #e41e26; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin: 0 0 8px 0; color: #e41e26; font-size: 18px;">Trạng thái: ${statusLabel}</h3>
                <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.5;">${statusText}</p>
              </div>

              <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 15px;">
                <tr>
                  <td style="padding: 6px 0; color: #666; font-weight: bold; width: 140px;">Sản phẩm bảo hành:</td>
                  <td style="padding: 6px 0; color: #333;">${claim.ten_sp}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666; font-weight: bold;">Mã bảo hành:</td>
                  <td style="padding: 6px 0; color: #333;">#${claim.ma_pbh}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666; font-weight: bold;">Mô tả lỗi:</td>
                  <td style="padding: 6px 0; color: #555; font-style: italic;">"${claim.mo_ta_loi}"</td>
                </tr>
                ${result ? `
                <tr>
                  <td style="padding: 6px 0; color: #666; font-weight: bold;">Kết luận kỹ thuật:</td>
                  <td style="padding: 6px 0; color: #e41e26; font-weight: bold;">${result}</td>
                </tr>
                ` : ''}
              </table>

              <div style="text-align: center; margin: 30px 0 10px 0;">
                <a href="http://localhost:3000/tra-cuu-bao-hanh" style="background-color: #e41e26; color: white; padding: 12px 24px; text-decoration: none; border-radius: 20px; font-weight: bold; font-size: 14px; box-shadow: 0 4px 6px rgba(228,30,38,0.2);">
                  🔍 Tra cứu tiến độ chi tiết
                </a>
              </div>

              <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;">
              <p style="font-size: 12px; color: #999; text-align: center; line-height: 1.6;">
                Nếu bạn có bất cứ câu hỏi nào, vui lòng liên hệ tổng đài 1900 1234 để được kỹ thuật viên giải đáp trực tiếp.<br>
                © 2026 QuangHưng Mobile - Phục vụ tận tâm
              </p>
            </div>
          </div>
        `;

        sendMarketingEmail(claim.kh_email, `🛡️ [QuangHưng Mobile] Tiến độ bảo hành yêu cầu #${id}: ${statusLabel}`, emailContent, { ma_kh: claim.ma_kh, loai_email: 'voucher' });
      } catch (emailErr) {
        console.error('[Warranty API] Gửi email cập nhật bảo hành thất bại:', emailErr);
      }
    }

    // [MỚI] In-app notification song song với email — luôn gửi cho KH đăng nhập
    if (claim.ma_kh) {
      try {
        const { createInAppNotification } = require('../services/emailService');
        const statusEmoji = {
          'pending': '⏳', 'received': '📦', 'diagnosing': '🔍',
          'repairing': '🔧', 'completed': '✅', 'rejected': '❌'
        }[status] || '🛡️';
        const statusLabelInApp = {
          'pending': 'Chờ tiếp nhận', 'received': 'Đã tiếp nhận',
          'diagnosing': 'Đang chẩn đoán', 'repairing': 'Đang sửa chữa',
          'completed': 'Hoàn thành bảo hành', 'rejected': 'Từ chối bảo hành'
        }[status] || status;
        await createInAppNotification({
          ma_kh: claim.ma_kh,
          tieu_de: `${statusEmoji} YC bảo hành #${id}: ${statusLabelInApp}`,
          noi_dung: `Sản phẩm ${claim.ten_sp} - ${statusLabelInApp}. ${result ? 'Kết quả: ' + result : ''}`,
          loai: 'warranty',
          lien_ket: '/tra-cuu-bao-hanh.html'
        });
      } catch (e) { console.error('[Warranty in-app]', e.message); }
    }

    res.json({
      success: true,
      message: 'Cập nhật trạng thái bảo hành thành công và đã gửi thông báo cho khách hàng.'
    });

  } catch (error) {
    console.error('[Warranty API] Update claim status error:', error);
    res.status(500).json({ success: false, message: 'Lỗi cập nhật trạng thái yêu cầu bảo hành: ' + error.message });
  }
});

module.exports = router;
