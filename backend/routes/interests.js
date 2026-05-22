const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Các sở thích mặc định gợi ý cho người dùng
const defaultInterests = [
    { id: 'apple', label: 'Apple (iPhone/Mac)' },
    { id: 'samsung', label: 'Samsung (Galaxy)' },
    { id: 'xiaomi', label: 'Xiaomi' },
    { id: 'oppo', label: 'Oppo / Vivo' },
    { id: 'gaming', label: 'Chơi game mạnh' },
    { id: 'camera', label: 'Chụp ảnh đẹp' },
    { id: 'battery', label: 'Pin trâu' },
    { id: 'luxury', label: 'Sang trọng' },
    { id: 'budget', label: 'Giá rẻ / Sinh viên' }
];

// GET /api/interests/default - Lấy danh sách sở thích gợi ý
router.get('/default', (req, res) => {
    res.json({ success: true, data: defaultInterests });
});

// GET /api/interests/check-user/:userId - Kiểm tra xem user đã có sở thích chưa
router.get('/check-user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId || isNaN(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid userId' });
        }

        const [rows] = await pool.query(
            'SELECT tu_khoa, kieu_tao, ngay_tao FROM so_thich_khach_hang WHERE ma_kh = ?',
            [userId]
        );

        res.json({
            success: true,
            hasInterests: rows.length > 0,
            data: rows
        });
    } catch (error) {
        console.error('Check user interests error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// POST /api/interests/user - Lưu sở thích khách hàng chọn
router.post('/user', async (req, res) => {
    try {
        const { userId, interests } = req.body; // interests is an array of strings like ['Apple', 'Gaming']
        
        if (!userId || !interests || !Array.isArray(interests)) {
            return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
        }

        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Xóa sở thích cũ để ghi đè hoàn toàn khi user chọn lại
            await connection.query('DELETE FROM so_thich_khach_hang WHERE ma_kh = ?', [userId]);

            for (const keyword of interests) {
                // Kiểm tra xem đã tồn tại chưa
                const [existing] = await connection.query(
                    'SELECT 1 FROM so_thich_khach_hang WHERE ma_kh = ? AND tu_khoa = ?',
                    [userId, keyword]
                );

                if (existing.length === 0) {
                    await connection.query(
                        'INSERT INTO so_thich_khach_hang (ma_kh, tu_khoa, kieu_tao) VALUES (?, ?, ?)',
                        [userId, keyword, 'manual']
                    );
                }
            }

            await connection.commit();
            res.json({ success: true, message: 'Đã lưu sở thích' });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

    } catch (error) {
        console.error('Save user interests error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

const axios = require('axios');

// POST /api/interests/ai-generate - Tạo sở thích từ AI
router.post('/ai-generate', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ success: false, message: 'Thiếu userId' });

        // Gọi Python Service với cơ chế tự phục hồi (Self-Healing Try-Catch)
        let interests = [];
        try {
            const pythonResponse = await axios.post('http://127.0.0.1:8000/api/generate-interests', {
                userId: String(userId)
            }, { timeout: 5000 });
            interests = pythonResponse.data.interests || [];
        } catch (pyError) {
            console.warn('⚠️ Python recommendation service offline or timed out. Falling back to default interests. Error:', pyError.message);
            // Gán 3 sở thích phổ biến làm mặc định để đảm bảo DB có dòng lưu và popup không hiện lại
            interests = ['budget', 'apple', 'gaming'];
        }

        // Cải tiến: Nếu AI chạy thành công nhưng không tự trích xuất được sở thích nào (user mới tinh chưa có search hay chat),
        // Ta gán 3 sở thích phổ biến làm mặc định
        if (interests.length === 0) {
            interests = ['budget', 'apple', 'gaming'];
        }

        if (interests.length > 0) {
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();
                for (const keyword of interests) {
                    const [existing] = await connection.query(
                        'SELECT 1 FROM so_thich_khach_hang WHERE ma_kh = ? AND tu_khoa = ?',
                        [userId, keyword]
                    );
                    if (existing.length === 0) {
                        await connection.query(
                            'INSERT INTO so_thich_khach_hang (ma_kh, tu_khoa, kieu_tao) VALUES (?, ?, ?)',
                            [userId, keyword, 'ai_generated']
                        );
                    } else {
                        // Cập nhật lại thời gian tạo để làm mới sở thích
                        await connection.query(
                            'UPDATE so_thich_khach_hang SET ngay_tao = CURRENT_TIMESTAMP WHERE ma_kh = ? AND tu_khoa = ?',
                            [userId, keyword]
                        );
                    }
                }
                await connection.commit();
            } catch (err) {
                await connection.rollback();
                throw err;
            } finally {
                connection.release();
            }
        }
        res.json({ success: true, interests, message: 'Đã sinh sở thích tự động' });
    } catch (error) {
        console.error('AI Generate interests error:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi gọi AI' });
    }
});

// POST /api/interests/track-click - Ghi nhận lượt xem sản phẩm để cập nhật số lần xem sản phẩm
router.post('/track-click', async (req, res) => {
    try {
        const { userId, productId } = req.body;
        if (!userId || !productId) {
            return res.status(400).json({ success: false, message: 'Thiếu userId hoặc productId' });
        }

        // Ghi nhận lượt xem sản phẩm vào lich_su_xem_san_pham
        await pool.query(
            `INSERT INTO lich_su_xem_san_pham (ma_kh, ma_sp, so_lan_xem)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE so_lan_xem = so_lan_xem + 1`,
            [userId, productId]
        );

        res.json({ success: true, message: 'Đã cập nhật lượt xem sản phẩm' });
    } catch (error) {
        console.error('Track click error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi ghi nhận lượt click sản phẩm' });
    }
});

// GET /api/interests/admin/user-interests - Dành cho admin xem danh sách
router.get('/admin/user-interests', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT st.ma_st_kh, st.ma_kh, kh.ho_ten, kh.email, st.tu_khoa, st.kieu_tao, st.ngay_tao
            FROM so_thich_khach_hang st
            JOIN khach_hang kh ON st.ma_kh = kh.ma_kh
            ORDER BY st.ngay_tao DESC
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Admin get user interests error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// DELETE /api/interests/admin/user-interests/:id - Admin xóa sở thích của user
router.delete('/admin/user-interests/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM so_thich_khach_hang WHERE ma_st_kh = ?', [id]);
        res.json({ success: true, message: 'Đã xóa sở thích' });
    } catch (error) {
        console.error('Admin delete user interest error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// GET /api/interests/admin/view-history - Admin xem lịch sử xem sản phẩm của các khách hàng
router.get('/admin/view-history', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT ls.ma_kh, ls.ma_sp, kh.ho_ten, kh.email, sp.ten_sp, sp.anh_dai_dien, ls.so_lan_xem, ls.ngay_cap_nhat
            FROM lich_su_xem_san_pham ls
            JOIN khach_hang kh ON ls.ma_kh = kh.ma_kh
            JOIN san_pham sp ON ls.ma_sp = sp.ma_sp
            ORDER BY ls.ngay_cap_nhat DESC
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Admin get view history error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// DELETE /api/interests/admin/view-history/:userId/:productId - Admin xóa 1 dòng lịch sử xem sản phẩm
router.delete('/admin/view-history/:userId/:productId', async (req, res) => {
    try {
        const { userId, productId } = req.params;
        await pool.query('DELETE FROM lich_su_xem_san_pham WHERE ma_kh = ? AND ma_sp = ?', [userId, productId]);
        res.json({ success: true, message: 'Đã xóa lịch sử xem sản phẩm' });
    } catch (error) {
        console.error('Admin delete view history error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// DELETE /api/interests/admin/view-history/clear - Admin xóa toàn bộ lịch sử xem sản phẩm
router.delete('/admin/view-history/clear', async (req, res) => {
    try {
        await pool.query('DELETE FROM lich_su_xem_san_pham');
        res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử xem sản phẩm' });
    } catch (error) {
        console.error('Admin clear view history error:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

module.exports = router;
