// API routes cho đánh giá sản phẩm
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// In-memory rate limit cho POST review: max 3/user/24h + 1/60s.
// Đơn giản, không cần Redis; nếu Express cluster nhiều worker thì có thể bypass — chấp nhận trade-off.
const _reviewRate = new Map(); // userId → { ts: [unix_ms,...] }
function _checkReviewRate(userId) {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const MIN = 60 * 1000;
    let bucket = _reviewRate.get(userId) || [];
    bucket = bucket.filter(t => now - t < DAY);
    const recent = bucket.filter(t => now - t < MIN);
    if (recent.length > 0) return { ok: false, reason: 'Vui lòng chờ 1 phút giữa các đánh giá.' };
    if (bucket.length >= 3) return { ok: false, reason: 'Bạn đã đăng tối đa 3 đánh giá trong 24h.' };
    bucket.push(now);
    _reviewRate.set(userId, bucket);
    return { ok: true };
}

// GET /api/reviews/product/:productId - Lấy đánh giá của sản phẩm (hỗ trợ phân trang + filter)
// Query params:
//   ?page=1&limit=10&sort=newest|highest|lowest|helpful&hasImages=1&star=5&userId=123
//   userId (optional) → để biết user hiện tại đã vote những review nào (tô đậm nút đã bấm)
router.get('/product/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
        const offset = (page - 1) * limit;
        const sort = ['newest', 'highest', 'lowest', 'helpful'].includes(req.query.sort) ? req.query.sort : 'newest';
        const hasImages = req.query.hasImages === '1' || req.query.hasImages === 'true';
        const star = parseInt(req.query.star);
        const viewerId = parseInt(req.query.userId) || null;

        let orderClause = 'dg.ngay_danh_gia DESC';
        if (sort === 'highest') orderClause = 'dg.so_sao DESC, dg.ngay_danh_gia DESC';
        else if (sort === 'lowest') orderClause = 'dg.so_sao ASC, dg.ngay_danh_gia DESC';
        else if (sort === 'helpful') orderClause = 'dg.helpful_count DESC, dg.ngay_danh_gia DESC';

        const whereExtra = [];
        const params = [productId];
        if (hasImages) whereExtra.push("(dg.hinh_anh IS NOT NULL AND dg.hinh_anh <> '' AND dg.hinh_anh <> '[]')");
        if (Number.isInteger(star) && star >= 1 && star <= 5) {
            whereExtra.push('dg.so_sao = ?');
            params.push(star);
        }
        const whereSql = `WHERE dg.ma_sp = ? AND COALESCE(dg.is_hidden, 0) = 0${whereExtra.length ? ' AND ' + whereExtra.join(' AND ') : ''}`;

        // Tổng số (để FE biết còn page nào)
        const [countRows] = await pool.query(
            `SELECT COUNT(*) AS total FROM danh_gia dg ${whereSql}`,
            params
        );
        const total = countRows[0].total || 0;

        const [rows] = await pool.query(`
            SELECT dg.*, kh.ho_ten, kh.avt,
                   EXISTS (
                     SELECT 1
                     FROM chi_tiet_don_hang ct
                     JOIN don_hang dh ON ct.ma_don = dh.ma_don
                     WHERE ct.ma_sp = dg.ma_sp
                       AND dh.ma_kh = dg.ma_kh
                       AND dh.trang_thai IN ('delivered','completed','paid','confirmed')
                   ) AS verified_purchase
            FROM danh_gia dg
            LEFT JOIN khach_hang kh ON dg.ma_kh = kh.ma_kh
            ${whereSql}
            ORDER BY ${orderClause}
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        // Vote map của viewer (nếu có)
        let votedSet = new Set();
        if (viewerId && rows.length > 0) {
            const ids = rows.map(r => r.ma_dg);
            const [voted] = await pool.query(
                `SELECT ma_dg FROM review_votes WHERE ma_kh = ? AND ma_dg IN (?)`,
                [viewerId, ids]
            );
            votedSet = new Set(voted.map(v => v.ma_dg));
        }

        const reviews = rows.map(row => {
            let images = [];
            if (row.hinh_anh) {
                try { images = JSON.parse(row.hinh_anh); }
                catch { images = row.hinh_anh.split(','); }
            }
            return {
                id: row.ma_dg,
                productId: row.ma_sp,
                userId: row.ma_kh,
                userName: row.ho_ten || 'Khách hàng',
                userAvatar: row.avt || null,
                rating: row.so_sao,
                comment: row.binh_luan,
                images: images,
                date: row.ngay_danh_gia,
                verified: !!row.verified_purchase,
                shopReply: row.phan_hoi_shop || null,
                shopReplyDate: row.ngay_phan_hoi || null,
                helpfulCount: row.helpful_count || 0,
                viewerVoted: votedSet.has(row.ma_dg)
            };
        });

        // Backward-compat: nếu client cũ gọi không có ?page (header X-Total có giá trị, nhưng body vẫn là array)
        res.set('X-Total-Count', String(total));
        res.set('X-Page', String(page));
        res.set('X-Limit', String(limit));
        res.json(reviews);
    } catch (error) {
        console.error('Lỗi lấy đánh giá:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/reviews/:id/vote - KH bấm "Hữu ích" (toggle)
router.post('/:id/vote', async (req, res) => {
    try {
        const sessionUser = req.session && req.session.user;
        if (!sessionUser || !sessionUser.ma_kh) {
            return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
        }
        const userId = Number(sessionUser.ma_kh);
        const reviewId = Number(req.params.id);
        if (!reviewId) return res.status(400).json({ success: false, message: 'ID không hợp lệ' });

        // Toggle: nếu đã vote → bỏ; chưa → thêm
        const [existed] = await pool.query(
            'SELECT ma_vote FROM review_votes WHERE ma_dg = ? AND ma_kh = ?',
            [reviewId, userId]
        );
        let voted;
        if (existed.length > 0) {
            await pool.query('DELETE FROM review_votes WHERE ma_dg = ? AND ma_kh = ?', [reviewId, userId]);
            await pool.query('UPDATE danh_gia SET helpful_count = GREATEST(0, helpful_count - 1) WHERE ma_dg = ?', [reviewId]);
            voted = false;
        } else {
            await pool.query('INSERT INTO review_votes (ma_dg, ma_kh, is_helpful) VALUES (?, ?, 1)', [reviewId, userId]);
            await pool.query('UPDATE danh_gia SET helpful_count = helpful_count + 1 WHERE ma_dg = ?', [reviewId]);
            voted = true;
        }
        const [row] = await pool.query('SELECT helpful_count FROM danh_gia WHERE ma_dg = ?', [reviewId]);
        res.json({ success: true, voted, helpfulCount: row[0]?.helpful_count || 0 });
    } catch (error) {
        console.error('Lỗi vote review:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/reviews/:id/report - KH báo cáo review vi phạm
router.post('/:id/report', async (req, res) => {
    try {
        const sessionUser = req.session && req.session.user;
        if (!sessionUser || !sessionUser.ma_kh) {
            return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để báo cáo' });
        }
        const userId = Number(sessionUser.ma_kh);
        const reviewId = Number(req.params.id);
        const lyDo = String(req.body.reason || '').trim();
        const moTa = String(req.body.description || '').trim().slice(0, 500);
        const VALID = ['spam', 'offensive', 'fake', 'irrelevant', 'other'];
        if (!VALID.includes(lyDo)) {
            return res.status(400).json({ success: false, message: 'Lý do báo cáo không hợp lệ' });
        }
        // Tránh báo cáo trùng: 1 user / 1 review chỉ báo cáo 1 lần khi đang pending
        const [dup] = await pool.query(
            "SELECT ma_rp FROM review_reports WHERE ma_dg = ? AND ma_kh = ? AND trang_thai = 'pending'",
            [reviewId, userId]
        );
        if (dup.length > 0) {
            return res.json({ success: true, message: 'Bạn đã báo cáo review này.' });
        }
        await pool.query(
            'INSERT INTO review_reports (ma_dg, ma_kh, ly_do, mo_ta) VALUES (?, ?, ?, ?)',
            [reviewId, userId, lyDo, moTa || null]
        );
        res.json({ success: true, message: 'Đã ghi nhận báo cáo. Cảm ơn bạn!' });
    } catch (error) {
        console.error('Lỗi report review:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/reviews/:id/reply - Admin trả lời review
router.put('/:id/reply', async (req, res) => {
    try {
        if (!req.session || !req.session.user || req.session.user.vai_tro !== 'admin') {
            return res.status(403).json({ success: false, message: 'Chỉ admin được phản hồi review' });
        }
        const { id } = req.params;
        const reply = (req.body.reply || '').trim();
        if (!reply) {
            return res.status(400).json({ success: false, message: 'Nội dung phản hồi không được trống' });
        }
        const [result] = await pool.query(
            'UPDATE danh_gia SET phan_hoi_shop = ?, ngay_phan_hoi = NOW() WHERE ma_dg = ?',
            [reply, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Review không tồn tại' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Lỗi reply review:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/reviews/:id/hide - Admin ẩn / hiện review
router.put('/:id/hide', async (req, res) => {
    try {
        if (!req.session || !req.session.user || req.session.user.vai_tro !== 'admin') {
            return res.status(403).json({ success: false, message: 'Chỉ admin' });
        }
        const hidden = req.body.hidden ? 1 : 0;
        await pool.query('UPDATE danh_gia SET is_hidden = ? WHERE ma_dg = ?', [hidden, req.params.id]);
        res.json({ success: true, hidden: !!hidden });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/reviews/admin/list - Admin lấy danh sách review (kèm reports)
router.get('/admin/list', async (req, res) => {
    try {
        if (!req.session || !req.session.user || req.session.user.vai_tro !== 'admin') {
            return res.status(403).json({ success: false, message: 'Chỉ admin' });
        }
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
        const offset = Math.max(0, parseInt(req.query.offset) || 0);
        const onlyReported = req.query.reported === '1' || req.query.reported === 'true';

        const baseWhere = onlyReported ? 'WHERE r_count.total_reports > 0' : '';
        const [rows] = await pool.query(`
            SELECT dg.ma_dg, dg.ma_sp, dg.ma_kh, dg.so_sao, dg.binh_luan, dg.hinh_anh,
                   dg.ngay_danh_gia, dg.phan_hoi_shop, dg.ngay_phan_hoi,
                   dg.helpful_count, dg.is_hidden,
                   sp.ten_sp, kh.ho_ten,
                   COALESCE(r_count.total_reports, 0) AS total_reports
            FROM danh_gia dg
            LEFT JOIN san_pham sp ON sp.ma_sp = dg.ma_sp
            LEFT JOIN khach_hang kh ON kh.ma_kh = dg.ma_kh
            LEFT JOIN (
              SELECT ma_dg, COUNT(*) AS total_reports
              FROM review_reports
              WHERE trang_thai = 'pending'
              GROUP BY ma_dg
            ) r_count ON r_count.ma_dg = dg.ma_dg
            ${baseWhere}
            ORDER BY total_reports DESC, dg.ngay_danh_gia DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Lỗi list review admin:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/reviews/product/:productId/stats - Lấy thống kê đánh giá của sản phẩm
router.get('/product/:productId/stats', async (req, res) => {
    try {
        const { productId } = req.params;
        
        // Lấy thống kê tổng quan
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as totalReviews,
                AVG(so_sao) as avgRating,
                SUM(CASE WHEN so_sao = 5 THEN 1 ELSE 0 END) as star5,
                SUM(CASE WHEN so_sao = 4 THEN 1 ELSE 0 END) as star4,
                SUM(CASE WHEN so_sao = 3 THEN 1 ELSE 0 END) as star3,
                SUM(CASE WHEN so_sao = 2 THEN 1 ELSE 0 END) as star2,
                SUM(CASE WHEN so_sao = 1 THEN 1 ELSE 0 END) as star1
            FROM danh_gia
            WHERE ma_sp = ?
        `, [productId]);
        
        const total = stats[0].totalReviews || 0;
        const result = {
            totalReviews: total,
            avgRating: stats[0].avgRating ? parseFloat(stats[0].avgRating).toFixed(1) : 0,
            distribution: {
                star5: { count: stats[0].star5 || 0, percent: total > 0 ? Math.round((stats[0].star5 / total) * 100) : 0 },
                star4: { count: stats[0].star4 || 0, percent: total > 0 ? Math.round((stats[0].star4 / total) * 100) : 0 },
                star3: { count: stats[0].star3 || 0, percent: total > 0 ? Math.round((stats[0].star3 / total) * 100) : 0 },
                star2: { count: stats[0].star2 || 0, percent: total > 0 ? Math.round((stats[0].star2 / total) * 100) : 0 },
                star1: { count: stats[0].star1 || 0, percent: total > 0 ? Math.round((stats[0].star1 / total) * 100) : 0 }
            }
        };
        
        res.json(result);
    } catch (error) {
        console.error('Lỗi lấy thống kê đánh giá:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/reviews - Thêm đánh giá mới
router.post('/', async (req, res) => {
    try {
        const { productId, rating, comment, images } = req.body;
        // Lấy userId từ session (chống giả mạo); fallback body chỉ chấp nhận khi khớp session
        const sessionUserId = req.session && req.session.user ? Number(req.session.user.ma_kh) : null;
        if (!sessionUserId) {
            return res.status(401).json({ error: 'Vui lòng đăng nhập để đánh giá', code: 'AUTH_REQUIRED' });
        }
        const bodyUserId = req.body.userId ? Number(req.body.userId) : sessionUserId;
        if (bodyUserId !== sessionUserId) {
            return res.status(403).json({ error: 'Không thể đánh giá thay người dùng khác', code: 'USERID_MISMATCH' });
        }
        const userId = sessionUserId;

        // Validate
        if (!productId || !rating) {
            return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
        }

        const ratingNum = Number(rating);
        if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return res.status(400).json({ error: 'Số sao phải là số nguyên từ 1-5' });
        }

        // Rate limit chống spam (3/24h + 1/60s)
        const rateCheck = _checkReviewRate(userId);
        if (!rateCheck.ok) {
            return res.status(429).json({ error: rateCheck.reason, code: 'RATE_LIMIT' });
        }
        
        // Kiểm tra xem user đã mua sản phẩm này chưa (đơn hàng đã xác nhận trở lên)
        const [purchaseCheck] = await pool.query(`
            SELECT dh.ma_don 
            FROM don_hang dh
            INNER JOIN chi_tiet_don_hang ct ON dh.ma_don = ct.ma_don
            WHERE dh.ma_kh = ? 
              AND ct.ma_sp = ? 
              AND dh.trang_thai IN ('delivered', 'completed', 'da_giao', 'hoan_thanh', 'confirmed', 'paid', 'shipping')
            LIMIT 1
        `, [userId, productId]);
        
        if (purchaseCheck.length === 0) {
            return res.status(403).json({ 
                error: 'Bạn cần mua sản phẩm này trước khi đánh giá',
                code: 'NOT_PURCHASED'
            });
        }
        
        // Kiểm tra xem user đã đánh giá sản phẩm này chưa
        const [existing] = await pool.query(
            'SELECT ma_dg FROM danh_gia WHERE ma_sp = ? AND ma_kh = ?',
            [productId, userId]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Bạn đã đánh giá sản phẩm này rồi' });
        }
        
        // Thêm đánh giá - lưu ảnh dưới dạng JSON string
        const imageStr = images && images.length > 0 ? JSON.stringify(images) : null;
        const [result] = await pool.query(
            'INSERT INTO danh_gia (ma_sp, ma_kh, so_sao, binh_luan, hinh_anh) VALUES (?, ?, ?, ?, ?)',
            [productId, userId, ratingNum, comment || '', imageStr]
        );

        res.status(201).json({
            id: result.insertId,
            message: 'Đánh giá đã được gửi thành công!'
        });
    } catch (error) {
        console.error('Lỗi thêm đánh giá:', error && error.message);
        res.status(500).json({ error: 'Lỗi server, vui lòng thử lại.' });
    }
});

// PUT /api/reviews/:id - Cập nhật đánh giá
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment, images, userId } = req.body;
        
        // Kiểm tra quyền sở hữu
        const [existing] = await pool.query(
            'SELECT ma_kh FROM danh_gia WHERE ma_dg = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy đánh giá' });
        }
        
        if (existing[0].ma_kh !== userId) {
            return res.status(403).json({ error: 'Bạn không có quyền sửa đánh giá này' });
        }
        
        const imageStr = images && images.length > 0 ? JSON.stringify(images) : null;
        await pool.query(
            'UPDATE danh_gia SET so_sao = ?, binh_luan = ?, hinh_anh = ? WHERE ma_dg = ?',
            [rating, comment, imageStr, id]
        );
        
        res.json({ message: 'Đã cập nhật đánh giá' });
    } catch (error) {
        console.error('Lỗi cập nhật đánh giá:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/reviews/:id - Xóa đánh giá
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        
        // Kiểm tra quyền sở hữu
        const [existing] = await pool.query(
            'SELECT ma_kh FROM danh_gia WHERE ma_dg = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy đánh giá' });
        }
        
        if (existing[0].ma_kh !== userId) {
            return res.status(403).json({ error: 'Bạn không có quyền xóa đánh giá này' });
        }
        
        await pool.query('DELETE FROM danh_gia WHERE ma_dg = ?', [id]);
        res.json({ message: 'Đã xóa đánh giá' });
    } catch (error) {
        console.error('Lỗi xóa đánh giá:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/reviews/can-review/:productId/:userId - Kiểm tra user có thể đánh giá sản phẩm không
router.get('/can-review/:productId/:userId', async (req, res) => {
    try {
        const { productId, userId } = req.params;
        
        // Kiểm tra đã mua sản phẩm chưa (đơn hàng đã xác nhận trở lên)
        const [purchaseCheck] = await pool.query(`
            SELECT dh.ma_don 
            FROM don_hang dh
            INNER JOIN chi_tiet_don_hang ct ON dh.ma_don = ct.ma_don
            WHERE dh.ma_kh = ? 
              AND ct.ma_sp = ? 
              AND dh.trang_thai IN ('delivered', 'completed', 'da_giao', 'hoan_thanh', 'confirmed', 'paid', 'shipping')
            LIMIT 1
        `, [userId, productId]);
        
        const hasPurchased = purchaseCheck.length > 0;
        
        // Kiểm tra đã đánh giá chưa
        const [reviewCheck] = await pool.query(
            'SELECT ma_dg FROM danh_gia WHERE ma_sp = ? AND ma_kh = ?',
            [productId, userId]
        );
        
        const hasReviewed = reviewCheck.length > 0;
        
        res.json({
            canReview: hasPurchased && !hasReviewed,
            hasPurchased,
            hasReviewed,
            message: !hasPurchased 
                ? 'Bạn cần mua sản phẩm này trước khi đánh giá' 
                : hasReviewed 
                    ? 'Bạn đã đánh giá sản phẩm này rồi' 
                    : 'Bạn có thể đánh giá sản phẩm này'
        });
    } catch (error) {
        console.error('Lỗi kiểm tra quyền đánh giá:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/reviews/user/:userId - Lấy tất cả đánh giá của user
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.query(`
            SELECT dg.*, sp.ten_sp, sp.anh_dai_dien
            FROM danh_gia dg
            LEFT JOIN san_pham sp ON dg.ma_sp = sp.ma_sp
            WHERE dg.ma_kh = ?
            ORDER BY dg.ngay_danh_gia DESC
        `, [userId]);
        
        const reviews = rows.map(row => ({
            id: row.ma_dg,
            productId: row.ma_sp,
            productName: row.ten_sp,
            productImage: row.anh_dai_dien,
            rating: row.so_sao,
            comment: row.binh_luan,
            images: row.hinh_anh ? row.hinh_anh.split(',') : [],
            date: row.ngay_danh_gia
        }));
        
        res.json(reviews);
    } catch (error) {
        console.error('Lỗi lấy đánh giá của user:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
