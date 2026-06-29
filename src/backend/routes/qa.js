// API routes cho Hỏi-Đáp (Q&A) trên trang chi tiết sản phẩm
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Rate limit POST câu hỏi: 5/user/h
const _qaRate = new Map();
function _checkQARate(userId) {
    const now = Date.now();
    const HOUR = 60 * 60 * 1000;
    let bucket = _qaRate.get(userId) || [];
    bucket = bucket.filter(t => now - t < HOUR);
    if (bucket.length >= 5) return { ok: false, reason: 'Bạn đã đăng quá nhiều câu hỏi trong 1 giờ.' };
    bucket.push(now);
    _qaRate.set(userId, bucket);
    return { ok: true };
}

// GET /api/qa/product/:productId — Danh sách câu hỏi của 1 SP
router.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;

        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS total FROM cau_hoi_san_pham WHERE ma_sp = ? AND COALESCE(is_hidden, 0) = 0`,
            [productId]
        );
        const total = countRows[0].total || 0;

        const [rows] = await pool.query(`
            SELECT q.ma_ch, q.ma_sp, q.ma_kh, q.ten_nguoi_hoi, q.cau_hoi, q.cau_tra_loi,
                   q.ngay_hoi, q.ngay_tra_loi,
                   COALESCE(kh.ho_ten, q.ten_nguoi_hoi, 'Khách hàng') AS asker_name,
                   kh.avt AS asker_avatar
            FROM cau_hoi_san_pham q
            LEFT JOIN khach_hang kh ON kh.ma_kh = q.ma_kh
            WHERE q.ma_sp = ? AND COALESCE(q.is_hidden, 0) = 0
            ORDER BY q.ngay_hoi DESC
            LIMIT ? OFFSET ?
        `, [productId, limit, offset]);

        res.set('X-Total-Count', String(total));
        res.set('X-Page', String(page));
        res.json({
            success: true,
            data: rows.map(r => ({
                id: r.ma_ch,
                productId: r.ma_sp,
                askerId: r.ma_kh,
                askerName: r.asker_name,
                askerAvatar: r.asker_avatar,
                question: r.cau_hoi,
                answer: r.cau_tra_loi || null,
                askDate: r.ngay_hoi,
                answerDate: r.ngay_tra_loi || null
            })),
            total
        });
    } catch (error) {
        console.error('Lỗi lấy Q&A:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/qa - Khách hàng đặt câu hỏi (login required)
router.post('/', async (req, res) => {
    try {
        const sessionUser = req.session && req.session.user;
        if (!sessionUser || !sessionUser.ma_kh) {
            return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để đặt câu hỏi' });
        }
        const userId = Number(sessionUser.ma_kh);
        const productId = Number(req.body.productId);
        const question = String(req.body.question || '').trim();
        if (!productId || !question) {
            return res.status(400).json({ success: false, message: 'Thiếu sản phẩm hoặc câu hỏi' });
        }
        if (question.length < 5 || question.length > 500) {
            return res.status(400).json({ success: false, message: 'Câu hỏi phải từ 5 đến 500 ký tự' });
        }
        const rateCheck = _checkQARate(userId);
        if (!rateCheck.ok) return res.status(429).json({ success: false, message: rateCheck.reason });

        const tenNguoiHoi = sessionUser.ho_ten || null;
        const [result] = await pool.query(
            'INSERT INTO cau_hoi_san_pham (ma_sp, ma_kh, ten_nguoi_hoi, cau_hoi) VALUES (?, ?, ?, ?)',
            [productId, userId, tenNguoiHoi, question]
        );
        res.status(201).json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Lỗi POST Q&A:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/qa/:id/answer - Admin trả lời
router.put('/:id/answer', async (req, res) => {
    try {
        const sessionUser = req.session && req.session.user;
        if (!sessionUser || sessionUser.vai_tro !== 'admin') {
            return res.status(403).json({ success: false, message: 'Chỉ admin được trả lời' });
        }
        const answer = String(req.body.answer || '').trim();
        if (!answer) return res.status(400).json({ success: false, message: 'Câu trả lời không được trống' });
        const [r] = await pool.query(
            'UPDATE cau_hoi_san_pham SET cau_tra_loi = ?, ngay_tra_loi = NOW(), ma_admin_tra_loi = ? WHERE ma_ch = ?',
            [answer, sessionUser.ma_admin || sessionUser.ma_nv || null, req.params.id]
        );
        if (r.affectedRows === 0) return res.status(404).json({ success: false, message: 'Câu hỏi không tồn tại' });
        res.json({ success: true });
    } catch (error) {
        console.error('Lỗi answer Q&A:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/qa/:id/hide - Admin ẩn câu hỏi
router.put('/:id/hide', async (req, res) => {
    try {
        const sessionUser = req.session && req.session.user;
        if (!sessionUser || sessionUser.vai_tro !== 'admin') {
            return res.status(403).json({ success: false, message: 'Chỉ admin' });
        }
        const hidden = req.body.hidden ? 1 : 0;
        await pool.query('UPDATE cau_hoi_san_pham SET is_hidden = ? WHERE ma_ch = ?', [hidden, req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/qa/admin/list - Admin xem tất cả Q&A (lọc chưa trả lời)
router.get('/admin/list', async (req, res) => {
    try {
        const sessionUser = req.session && req.session.user;
        if (!sessionUser || sessionUser.vai_tro !== 'admin') {
            return res.status(403).json({ success: false, message: 'Chỉ admin' });
        }
        const onlyUnanswered = req.query.unanswered === '1' || req.query.unanswered === 'true';
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
        const offset = Math.max(0, parseInt(req.query.offset) || 0);
        const where = onlyUnanswered ? 'WHERE q.cau_tra_loi IS NULL OR q.cau_tra_loi = ""' : '';
        const [rows] = await pool.query(`
            SELECT q.*, sp.ten_sp, kh.ho_ten AS asker_name
            FROM cau_hoi_san_pham q
            LEFT JOIN san_pham sp ON sp.ma_sp = q.ma_sp
            LEFT JOIN khach_hang kh ON kh.ma_kh = q.ma_kh
            ${where}
            ORDER BY q.ngay_hoi DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
