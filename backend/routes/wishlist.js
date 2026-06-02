const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// POST /api/wishlist - Thêm SP vào yêu thích (UNIQUE KEY xử lý duplicate)
router.post('/', async (req, res) => {
    try {
        const { ma_kh, ma_sp } = req.body;
        if (!ma_kh || !ma_sp) {
            return res.status(400).json({ success: false, message: 'Thiếu ma_kh hoặc ma_sp' });
        }
        try {
            const [r] = await pool.query(
                `INSERT INTO san_pham_yeu_thich (ma_kh, ma_sp) VALUES (?, ?)`,
                [parseInt(ma_kh), parseInt(ma_sp)]
            );
            res.json({ success: true, data: { ma_yeu_thich: r.insertId } });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                return res.json({ success: true, message: 'SP đã trong danh sách yêu thích', alreadyExists: true });
            }
            throw e;
        }
    } catch (e) {
        console.error('POST /wishlist error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// DELETE /api/wishlist/:ma_kh/:ma_sp - Bỏ yêu thích
router.delete('/:ma_kh/:ma_sp', async (req, res) => {
    try {
        const { ma_kh, ma_sp } = req.params;
        const [r] = await pool.query(
            `DELETE FROM san_pham_yeu_thich WHERE ma_kh = ? AND ma_sp = ?`,
            [parseInt(ma_kh), parseInt(ma_sp)]
        );
        res.json({ success: true, deleted: r.affectedRows });
    } catch (e) {
        console.error('DELETE /wishlist error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/wishlist/:ma_kh - List SP yêu thích kèm thông tin chi tiết
router.get('/:ma_kh', async (req, res) => {
    try {
        const { ma_kh } = req.params;
        const [rows] = await pool.query(
            `SELECT yt.ma_yeu_thich, yt.ngay_them,
                    sp.ma_sp, sp.ten_sp, sp.gia, sp.gia_giam, sp.anh_dai_dien, sp.so_luong_ton,
                    hsx.ten_hang
             FROM san_pham_yeu_thich yt
             JOIN san_pham sp ON yt.ma_sp = sp.ma_sp
             LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
             WHERE yt.ma_kh = ?
             ORDER BY yt.ngay_them DESC`,
            [parseInt(ma_kh)]
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('GET /wishlist error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// GET /api/wishlist/check/:ma_kh/:ma_sp - Check 1 SP có trong wishlist không
router.get('/check/:ma_kh/:ma_sp', async (req, res) => {
    try {
        const { ma_kh, ma_sp } = req.params;
        const [rows] = await pool.query(
            `SELECT 1 FROM san_pham_yeu_thich WHERE ma_kh = ? AND ma_sp = ? LIMIT 1`,
            [parseInt(ma_kh), parseInt(ma_sp)]
        );
        res.json({ success: true, isFavorite: rows.length > 0 });
    } catch (e) {
        console.error('GET /wishlist/check error:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

module.exports = router;
