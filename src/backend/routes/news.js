const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Lấy tất cả tin tức (có phân trang)
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const loaiTin = req.query.loai_tin;
        const offset = (page - 1) * limit;

        // Đếm tổng số tin tức (chỉ lấy tin hiển thị)
        let countQuery = "SELECT COUNT(*) as total FROM tin_tuc WHERE (trang_thai = 'hien_thi' OR trang_thai IS NULL)";
        let countParams = [];
        
        if (loaiTin) {
            countQuery += " AND loai_tin = ?";
            countParams.push(loaiTin);
        }
        
        const [countResult] = await pool.query(countQuery, countParams);
        const total = countResult[0].total;

        // Lấy danh sách tin tức
        let query = `
            SELECT 
                tt.ma_tintuc,
                tt.tieu_de,
                tt.noi_dung,
                tt.loai_tin,
                tt.mo_ta_ngan,
                tt.luot_xem,
                tt.anh_dai_dien,
                tt.video_url,
                tt.ngay_dang,
                a.ho_ten as tac_gia
            FROM tin_tuc tt
            LEFT JOIN admin a ON tt.ma_admin = a.ma_admin
            WHERE (tt.trang_thai = 'hien_thi' OR tt.trang_thai IS NULL)
        `;
        let params = [];
        
        if (loaiTin) {
            query += " AND tt.loai_tin = ?";
            params.push(loaiTin);
        }
        
        query += " ORDER BY tt.thu_tu DESC, tt.ngay_dang DESC LIMIT ? OFFSET ?";
        params.push(limit, offset);
        
        const [rows] = await pool.query(query, params);

        res.json({
            success: true,
            data: rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Lỗi lấy tin tức:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// Lấy tin tức nổi bật (mới nhất)
router.get('/featured', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        const [rows] = await pool.query(`
            SELECT 
                tt.ma_tintuc,
                tt.tieu_de,
                tt.noi_dung,
                tt.loai_tin,
                tt.mo_ta_ngan,
                tt.luot_xem,
                tt.anh_dai_dien,
                tt.ngay_dang,
                a.ho_ten as tac_gia
            FROM tin_tuc tt
            LEFT JOIN admin a ON tt.ma_admin = a.ma_admin
            WHERE (tt.trang_thai = 'hien_thi' OR tt.trang_thai IS NULL)
            ORDER BY tt.thu_tu DESC, tt.ngay_dang DESC
            LIMIT ?
        `, [limit]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Lỗi lấy tin tức nổi bật:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// Lấy chi tiết tin tức theo ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Tăng lượt xem
        await pool.query('UPDATE tin_tuc SET luot_xem = COALESCE(luot_xem, 0) + 1 WHERE ma_tintuc = ?', [id]);
        
        const [rows] = await pool.query(`
            SELECT 
                tt.ma_tintuc,
                tt.tieu_de,
                tt.noi_dung,
                tt.loai_tin,
                tt.mo_ta_ngan,
                tt.thu_tu,
                tt.luot_xem,
                tt.trang_thai,
                tt.anh_dai_dien,
                tt.video_url,
                tt.ngay_dang,
                a.ho_ten as tac_gia
            FROM tin_tuc tt
            LEFT JOIN admin a ON tt.ma_admin = a.ma_admin
            WHERE tt.ma_tintuc = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tin tức' });
        }

        // Lấy tin tức liên quan (cùng loại hoặc mới nhất)
        const currentNews = rows[0];
        const [relatedNews] = await pool.query(`
            SELECT 
                ma_tintuc,
                tieu_de,
                loai_tin,
                mo_ta_ngan,
                anh_dai_dien,
                ngay_dang
            FROM tin_tuc
            WHERE ma_tintuc != ? AND (trang_thai = 'hien_thi' OR trang_thai IS NULL)
            ORDER BY 
                CASE WHEN loai_tin = ? THEN 0 ELSE 1 END,
                ngay_dang DESC
            LIMIT 4
        `, [id, currentNews.loai_tin]);

        res.json({
            success: true,
            data: rows[0],
            relatedNews
        });
    } catch (error) {
        console.error('Lỗi lấy chi tiết tin tức:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// Thêm tin tức mới (Admin)
router.post('/', async (req, res) => {
    try {
        const { tieu_de, noi_dung, loai_tin, mo_ta_ngan, thu_tu, trang_thai, anh_dai_dien, video_url, ma_admin } = req.body;
        
        const [result] = await pool.query(`
            INSERT INTO tin_tuc (tieu_de, noi_dung, loai_tin, mo_ta_ngan, thu_tu, trang_thai, anh_dai_dien, video_url, ma_admin, ngay_dang)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [tieu_de, noi_dung, loai_tin || 'thuong', mo_ta_ngan, thu_tu || 0, trang_thai || 'hien_thi', anh_dai_dien, video_url, ma_admin]);

        res.json({
            success: true,
            message: 'Thêm tin tức thành công',
            data: { ma_tintuc: result.insertId }
        });
    } catch (error) {
        console.error('Lỗi thêm tin tức:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// Cập nhật tin tức (Admin)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { tieu_de, noi_dung, loai_tin, mo_ta_ngan, thu_tu, trang_thai, anh_dai_dien, video_url } = req.body;
        
        await pool.query(`
            UPDATE tin_tuc 
            SET tieu_de = ?, noi_dung = ?, loai_tin = ?, mo_ta_ngan = ?, thu_tu = ?, trang_thai = ?, anh_dai_dien = ?, video_url = ?
            WHERE ma_tintuc = ?
        `, [tieu_de, noi_dung, loai_tin, mo_ta_ngan, thu_tu, trang_thai, anh_dai_dien, video_url, id]);

        res.json({ success: true, message: 'Cập nhật tin tức thành công' });
    } catch (error) {
        console.error('Lỗi cập nhật tin tức:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// Xóa tin tức (Admin)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM tin_tuc WHERE ma_tintuc = ?', [id]);

        res.json({ success: true, message: 'Xóa tin tức thành công' });
    } catch (error) {
        console.error('Lỗi xóa tin tức:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// Tìm kiếm tin tức
router.get('/search/:keyword', async (req, res) => {
    try {
        const { keyword } = req.params;
        const searchTerm = `%${keyword}%`;

        const [rows] = await pool.query(`
            SELECT 
                tt.ma_tintuc,
                tt.tieu_de,
                tt.noi_dung,
                tt.anh_dai_dien,
                tt.video_url,
                tt.ngay_dang,
                a.ho_ten as tac_gia
            FROM tin_tuc tt
            LEFT JOIN admin a ON tt.ma_admin = a.ma_admin
            WHERE tt.tieu_de LIKE ? OR tt.noi_dung LIKE ?
            ORDER BY tt.ngay_dang DESC
            LIMIT 20
        `, [searchTerm, searchTerm]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Lỗi tìm kiếm tin tức:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

module.exports = router;
