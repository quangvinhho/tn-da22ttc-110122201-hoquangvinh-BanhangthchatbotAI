const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../config/database');

// Gọi Python Service (Microservice)
router.post('/', async (req, res) => {
    try {
        const { userId, cartItems } = req.body;
        
        if (!userId) {
            return res.json({ success: true, data: [], source: 'no_user' });
        }

        // Kiểm tra tổng số lần click chuột của user, phải >= 5 mới hiển thị mục này
        const [totalViewsRow] = await pool.query(
            `SELECT SUM(so_lan_xem) as total FROM lich_su_xem_san_pham WHERE ma_kh = ?`,
            [userId]
        );
        const totalViews = totalViewsRow[0].total || 0;

        if (totalViews < 5) {
            // Khách hàng chưa click đủ 5 lần -> Ẩn mục Dành riêng cho bạn
            return res.json({ success: true, data: [], source: 'not_enough_clicks' });
        }
        
        // 1. Lấy danh sách sản phẩm người dùng đã xem
        let viewedProducts = [];
        try {
            const [viewedRows] = await pool.query(
                `SELECT sp.ma_sp as id, sp.ten_sp as name, sp.gia as price, sp.anh_dai_dien as image, sp.mau_sac as color, sp.bo_nho as storage, hsx.ten_hang as brand
                 FROM lich_su_xem_san_pham ls
                 JOIN san_pham sp ON ls.ma_sp = sp.ma_sp
                 LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                 WHERE ls.ma_kh = ? AND ls.so_lan_xem >= 1
                 ORDER BY ls.so_lan_xem DESC, ls.ngay_cap_nhat DESC`,
                [userId]
            );
            viewedProducts = viewedRows;
        } catch (viewError) {
            console.error("⚠️ Lỗi truy vấn lịch sử xem sản phẩm:", viewError.message);
        }

        // 1.5 Tìm các sản phẩm tương tự cùng thương hiệu cho các sản phẩm đã xem > 3 lần
        let similarProducts = [];
        if (viewedProducts.length > 0) {
            for (const p of viewedProducts) {
                try {
                    // Lấy ra các sản phẩm cùng hãng có giá bán gần nhất, loại trừ chính nó
                    const [similarRows] = await pool.query(
                        `SELECT sp.ma_sp as id, sp.ten_sp as name, sp.gia as price, sp.anh_dai_dien as image, sp.mau_sac as color, sp.bo_nho as storage, hsx.ten_hang as brand
                         FROM san_pham sp
                         LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                         WHERE (hsx.ten_hang = ? OR sp.ten_sp LIKE ?) AND sp.ma_sp != ?
                         ORDER BY ABS(sp.gia - ?) ASC
                         LIMIT 3`,
                        [p.brand, `%${p.brand || ''}%`, p.id, p.price]
                    );
                    similarProducts.push(...similarRows);
                } catch (simError) {
                    console.error("⚠️ Lỗi truy vấn sản phẩm tương tự:", simError.message);
                }
            }
        }

        // Lọc trùng lặp sản phẩm tương tự (loại bỏ nếu đã có trong viewedProducts hoặc trùng nhau)
        const viewedIds = new Set(viewedProducts.map(p => p.id));
        const uniqueSimilarProducts = [];
        const similarIds = new Set();
        for (const p of similarProducts) {
            if (!viewedIds.has(p.id) && !similarIds.has(p.id)) {
                uniqueSimilarProducts.push(p);
                similarIds.add(p.id);
            }
        }

        let recommendedProductIds = [];
        try {
            // Cố gắng gọi sang AI/Python service
            // Bắt lỗi với timeout trung bình (5000ms) để không làm đơ web nếu Python lỗi
            const pythonResponse = await axios.post('http://127.0.0.1:8000/api/recommend', {
                userId: userId ? String(userId) : null,
                cartItems: cartItems
            }, { timeout: 5000 });
            
            if (pythonResponse.data && pythonResponse.data.recommendations) {
                recommendedProductIds = pythonResponse.data.recommendations;
            }
        } catch (aiError) {
            console.warn("⚠️ AI Service Recommendation Failed. Using Fallback System.", aiError.message);
            // Tiếp tục chạy hệ thống fallback thay vì trả lỗi 500
        }

        // Bước 2: Truy vấn sản phẩm gợi ý từ CSDL
        let baseProducts = [];
        if (recommendedProductIds.length > 0) {
            // Xử lý dummy PROD1, PROD2 sang ID hệ thống, ép kiểu an toàn cho cả string và number từ database thật
            // Lọc ra các ID có vẻ là số
            const numericIds = recommendedProductIds.map(id => parseInt(String(id).replace(/[^0-9]/g, '')) || id);

            const [products] = await pool.query(
                `SELECT ma_sp as id, ten_sp as name, gia as price, anh_dai_dien as image, mau_sac as color, bo_nho as storage FROM san_pham WHERE ma_sp IN (?)`,
                [numericIds.length > 0 ? numericIds : [0]] // Tránh lỗi SQL
            );
            
            if (products.length > 0) {
                // Sắp xếp sản phẩm theo đúng thứ tự xuất hiện trong numericIds để giữ độ ưu tiên của thuật toán AI!
                products.sort((a, b) => {
                    const idxA = numericIds.indexOf(a.id);
                    const idxB = numericIds.indexOf(b.id);
                    return idxA - idxB;
                });
                baseProducts = products;
            }
        }
        
        if (baseProducts.length === 0) {
            // --- CƠ CHẾ FALLBACK (Không ảnh hưởng trang web) ---
            // Gợi ý những sản phẩm mới hoặc ngẫu nhiên
            const [fallbackProducts] = await pool.query(
                `SELECT ma_sp as id, ten_sp as name, gia as price, anh_dai_dien as image, mau_sac as color, bo_nho as storage FROM san_pham ORDER BY ngay_cap_nhat DESC LIMIT 8`
            );
            baseProducts = fallbackProducts;
        }

        // Bước 3: Kết hợp và lọc trùng để ưu tiên các sản phẩm đã xem > 3 lần và sản phẩm tương tự lên đầu
        const seenIds = new Set([...viewedProducts.map(p => p.id), ...uniqueSimilarProducts.map(p => p.id)]);
        const filteredBaseProducts = baseProducts.filter(p => !seenIds.has(p.id));
        
        const finalProducts = [...viewedProducts, ...uniqueSimilarProducts, ...filteredBaseProducts].slice(0, 8);
        
        res.json({
            success: true,
            data: finalProducts,
            source: viewedProducts.length > 0 
                ? (uniqueSimilarProducts.length > 0 ? 'behavioral_and_similar' : 'behavioral_and_ai') 
                : (recommendedProductIds.length > 0 ? 'ai' : 'fallback')
        });

    } catch (error) {
        console.error('Lỗi khi lấy recommendation:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

module.exports = router;
