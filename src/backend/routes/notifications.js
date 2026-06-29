// API routes cho Thông báo người dùng
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// GET /api/notifications/user/:userId - Lấy thông báo của user theo ma_kh
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 20, unread_only } = req.query;
        
        let query = `
            SELECT * FROM thong_bao 
            WHERE ma_kh = ?
        `;
        const params = [userId];
        
        if (unread_only === 'true') {
            query += ' AND da_doc = 0';
        }
        
        query += ' ORDER BY ngay_tao DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const [notifications] = await pool.query(query, params);
        
        // Đếm số thông báo chưa đọc
        const [[countResult]] = await pool.query(
            'SELECT COUNT(*) as unread_count FROM thong_bao WHERE ma_kh = ? AND da_doc = 0',
            [userId]
        );
        
        res.json({ 
            success: true, 
            data: notifications,
            unread_count: countResult.unread_count
        });
    } catch (error) {
        console.error('Error getting user notifications:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/notifications/email/:email - Lấy thông báo theo email (cho user chưa đăng nhập)
router.get('/email/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const { limit = 20, unread_only } = req.query;
        
        let query = `
            SELECT * FROM thong_bao 
            WHERE email_nguoi_nhan = ?
        `;
        const params = [email];
        
        if (unread_only === 'true') {
            query += ' AND da_doc = 0';
        }
        
        query += ' ORDER BY ngay_tao DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const [notifications] = await pool.query(query, params);
        
        // Đếm số thông báo chưa đọc
        const [[countResult]] = await pool.query(
            'SELECT COUNT(*) as unread_count FROM thong_bao WHERE email_nguoi_nhan = ? AND da_doc = 0',
            [email]
        );
        
        res.json({ 
            success: true, 
            data: notifications,
            unread_count: countResult.unread_count
        });
    } catch (error) {
        console.error('Error getting notifications by email:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/notifications/count/:userId - Đếm thông báo chưa đọc
router.get('/count/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const [[result]] = await pool.query(
            'SELECT COUNT(*) as count FROM thong_bao WHERE ma_kh = ? AND da_doc = 0',
            [userId]
        );
        
        res.json({ success: true, count: result.count });
    } catch (error) {
        console.error('Error counting notifications:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/notifications/:id/read - Đánh dấu đã đọc
router.put('/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('UPDATE thong_bao SET da_doc = 1 WHERE ma_thong_bao = ?', [id]);
        
        res.json({ success: true, message: 'Đã đánh dấu đã đọc' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/notifications/read-all/:userId - Đánh dấu tất cả đã đọc
router.put('/read-all/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        await pool.query('UPDATE thong_bao SET da_doc = 1 WHERE ma_kh = ?', [userId]);
        
        res.json({ success: true, message: 'Đã đánh dấu tất cả đã đọc' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/notifications/:id - Xóa thông báo
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM thong_bao WHERE ma_thong_bao = ?', [id]);
        
        res.json({ success: true, message: 'Đã xóa thông báo' });
    } catch (error) {
        console.error('Error deleting notification:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/notifications - Tạo thông báo mới (Admin gửi cho user)
router.post('/', async (req, res) => {
    try {
        const { ma_kh, email_nguoi_nhan, tieu_de, noi_dung, loai, lien_ket } = req.body;
        
        if (!tieu_de || !noi_dung) {
            return res.status(400).json({ success: false, message: 'Thiếu tiêu đề hoặc nội dung' });
        }
        
        const [result] = await pool.query(
            `INSERT INTO thong_bao (ma_kh, email_nguoi_nhan, tieu_de, noi_dung, loai, lien_ket, da_doc, ngay_tao) 
             VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
            [ma_kh || null, email_nguoi_nhan || null, tieu_de, noi_dung, loai || 'system', lien_ket || null]
        );
        
        res.json({ 
            success: true, 
            message: 'Đã tạo thông báo',
            data: { ma_thong_bao: result.insertId }
        });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/notifications/broadcast - Gửi thông báo cho tất cả user
router.post('/broadcast', async (req, res) => {
    try {
        const { tieu_de, noi_dung, loai, lien_ket } = req.body;
        
        if (!tieu_de || !noi_dung) {
            return res.status(400).json({ success: false, message: 'Thiếu tiêu đề hoặc nội dung' });
        }
        
        // Lấy tất cả user
        const [users] = await pool.query('SELECT ma_kh FROM khach_hang');
        
        // Tạo thông báo cho từng user
        const values = users.map(u => [u.ma_kh, null, tieu_de, noi_dung, loai || 'system', lien_ket || null, 0]);
        
        if (values.length > 0) {
            await pool.query(
                `INSERT INTO thong_bao (ma_kh, email_nguoi_nhan, tieu_de, noi_dung, loai, lien_ket, da_doc) VALUES ?`,
                [values]
            );
        }
        
        res.json({ 
            success: true, 
            message: `Đã gửi thông báo cho ${users.length} người dùng`
        });
    } catch (error) {
        console.error('Error broadcasting notification:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// GET /api/notifications/admin/all - Lấy tất cả thông báo (cho admin)
router.get('/admin/all', async (req, res) => {
    try {
        const [notifications] = await pool.query(`
            SELECT tb.*, kh.ho_ten, kh.email as email_kh
            FROM thong_bao tb
            LEFT JOIN khach_hang kh ON tb.ma_kh = kh.ma_kh
            ORDER BY tb.ngay_tao DESC
            LIMIT 200
        `);
        
        res.json({ success: true, data: notifications });
    } catch (error) {
        console.error('Error getting all notifications:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/notifications/admin/send - Admin gửi thông báo
router.post('/admin/send', async (req, res) => {
    try {
        const { target, email, type, title, content, link } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'Thiếu tiêu đề hoặc nội dung' });
        }
        
        if (target === 'all') {
            // Gửi cho tất cả user
            const [users] = await pool.query('SELECT ma_kh FROM khach_hang');
            
            if (users.length === 0) {
                return res.json({ success: true, message: 'Không có khách hàng nào' });
            }
            
            const values = users.map(u => [u.ma_kh, null, title, content, type || 'system', link || null, 0]);
            
            await pool.query(
                `INSERT INTO thong_bao (ma_kh, email_nguoi_nhan, tieu_de, noi_dung, loai, lien_ket, da_doc) VALUES ?`,
                [values]
            );
            
            res.json({ success: true, message: `Đã gửi thông báo cho ${users.length} khách hàng` });
        } else {
            // Gửi cho user cụ thể theo email
            const [users] = await pool.query('SELECT ma_kh FROM khach_hang WHERE email = ?', [email]);
            
            if (users.length === 0) {
                // Gửi cho email không có tài khoản
                await pool.query(
                    `INSERT INTO thong_bao (ma_kh, email_nguoi_nhan, tieu_de, noi_dung, loai, lien_ket, da_doc) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [null, email, title, content, type || 'system', link || null, 0]
                );
            } else {
                await pool.query(
                    `INSERT INTO thong_bao (ma_kh, email_nguoi_nhan, tieu_de, noi_dung, loai, lien_ket, da_doc) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [users[0].ma_kh, email, title, content, type || 'system', link || null, 0]
                );
            }
            
            res.json({ success: true, message: `Đã gửi thông báo đến ${email}` });
        }
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
