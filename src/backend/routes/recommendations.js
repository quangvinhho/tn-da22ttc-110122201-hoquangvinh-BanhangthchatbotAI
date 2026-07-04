const express = require('express');
const router = express.Router();
const axios = require('axios');
const { pool } = require('../config/database');

// Gọi Python Service (Microservice)
router.post('/', async (req, res) => {
    try {
        const { userId, cartItems, currentProductId } = req.body;
        
        if (!userId) {
            return res.json({ success: true, data: [], source: 'no_user' });
        }

        // Kiểm tra điều kiện hiển thị "Dành riêng cho bạn":
        //   - Đã xem ≥ 5 SP (KH active), HOẶC
        //   - Đã có ≥ 1 sở thích trong so_thich_khach_hang (KH onboarding xong)
        const [totalViewsRow] = await pool.query(
            `SELECT SUM(so_lan_xem) as total FROM lich_su_xem_san_pham WHERE ma_kh = ?`,
            [userId]
        );
        const totalViews = parseInt(totalViewsRow[0].total) || 0;

        const [interestsRow] = await pool.query(
            `SELECT COUNT(*) AS c FROM so_thich_khach_hang WHERE ma_kh = ?`,
            [userId]
        );
        const interestsCount = parseInt(interestsRow[0].c) || 0;

        const mapRecommendationProduct = (p) => {
            const hasDiscount = p.gia_giam && parseFloat(p.gia_giam) > 0;
            return {
                id: p.id,
                name: p.name,
                price: hasDiscount ? parseFloat(p.gia_giam) : parseFloat(p.price),
                oldPrice: hasDiscount ? parseFloat(p.price) : null,
                image: p.image,
                color: p.color,
                storage: p.storage,
                brand: p.brand,
                explanation: p.explanation || null // Nhãn tag nguồn thuật toán từ AI
            };
        };

        if (totalViews < 5 && interestsCount === 0) {
            // KH hoàn toàn mới — fallback sang top sản phẩm bán chạy / có lượt xem cao thay vì ẩn hẳn
            try {
                const [trending] = await pool.query(
                    `SELECT sp.ma_sp AS id, sp.ten_sp AS name, sp.gia AS price, sp.gia_giam,
                            sp.anh_dai_dien AS image, sp.mau_sac AS color, sp.bo_nho AS storage
                     FROM san_pham sp
                     LEFT JOIN (
                       SELECT ma_sp, COUNT(*) AS sold
                       FROM chi_tiet_don_hang ct
                       JOIN don_hang dh ON ct.ma_don = dh.ma_don
                       WHERE dh.trang_thai IN ('delivered','completed','da_giao','hoan_thanh','confirmed','paid','shipping')
                       GROUP BY ma_sp
                     ) bs ON sp.ma_sp = bs.ma_sp
                     LEFT JOIN (
                       SELECT ma_sp, SUM(so_lan_xem) AS views FROM lich_su_xem_san_pham GROUP BY ma_sp
                     ) vs ON sp.ma_sp = vs.ma_sp
                     WHERE sp.so_luong_ton > 0
                     ORDER BY (COALESCE(bs.sold,0) * 3 + COALESCE(vs.views,0)) DESC, sp.ngay_cap_nhat DESC
                     LIMIT 8`
                );
                return res.json({ success: true, data: trending.map(mapRecommendationProduct), source: 'cold_start_trending' });
            } catch (e) {
                console.warn('Cold-start trending fallback failed:', e.message);
                return res.json({ success: true, data: [], source: 'cold_start' });
            }
        }
        
        // 1. Lấy danh sách sản phẩm người dùng đã xem
        let viewedProducts = [];
        try {
            const [viewedRows] = await pool.query(
                `SELECT sp.ma_sp as id, sp.ten_sp as name, sp.gia as price, sp.gia_giam, sp.anh_dai_dien as image, sp.mau_sac as color, sp.bo_nho as storage, hsx.ten_hang as brand
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
                        `SELECT sp.ma_sp as id, sp.ten_sp as name, sp.gia as price, sp.gia_giam, sp.anh_dai_dien as image, sp.mau_sac as color, sp.bo_nho as storage, hsx.ten_hang as brand
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
        let explanationMap = {};
        try {
            // Gọi sang Python explain endpoint để lấy chi tiết nguồn thuật toán gợi ý của từng sản phẩm
            const pythonResponse = await axios.get('http://127.0.0.1:8000/api/recommend/admin/explain', {
                params: {
                    userId: userId ? String(userId) : 'null',
                    cartItems: cartItems ? cartItems.join(',') : ''
                },
                timeout: 5000
            });
            
            if (pythonResponse.data && pythonResponse.data.recommendations) {
                recommendedProductIds = pythonResponse.data.recommendations.map(r => r.ma_sp);
                pythonResponse.data.recommendations.forEach(r => {
                    explanationMap[r.ma_sp] = r.explanation;
                });
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
                `SELECT ma_sp as id, ten_sp as name, gia as price, gia_giam, anh_dai_dien as image, mau_sac as color, bo_nho as storage FROM san_pham WHERE ma_sp IN (?)`,
                [numericIds.length > 0 ? numericIds : [0]] // Tránh lỗi SQL
            );
            
            if (products.length > 0) {
                // Sắp xếp sản phẩm theo đúng thứ tự xuất hiện trong numericIds để giữ độ ưu tiên của thuật toán AI!
                products.sort((a, b) => {
                    const idxA = numericIds.indexOf(a.id);
                    const idxB = numericIds.indexOf(b.id);
                    return idxA - idxB;
                });
                // Đính kèm giải thích thuật toán AI
                products.forEach(p => {
                    p.explanation = explanationMap[p.id] || "AI Đề xuất";
                });
                baseProducts = products;
            }
        }
        
        if (baseProducts.length === 0) {
            // --- CƠ CHẾ FALLBACK ---
            // [MỚI] Nếu KH có sở thích → ưu tiên SP cùng hãng yêu thích.
            // Ngược lại → SP mới nhất.
            let fallbackProducts = [];
            if (interestsCount > 0) {
                try {
                    const [byInterest] = await pool.query(
                        `SELECT sp.ma_sp AS id, sp.ten_sp AS name, sp.gia AS price, sp.gia_giam, sp.anh_dai_dien AS image,
                                sp.mau_sac AS color, sp.bo_nho AS storage
                         FROM san_pham sp
                         LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                         WHERE EXISTS (
                           SELECT 1 FROM so_thich_khach_hang st
                           WHERE st.ma_kh = ?
                             AND (LOWER(hsx.ten_hang) LIKE LOWER(CONCAT('%', st.tu_khoa, '%'))
                                  OR LOWER(sp.ten_sp) LIKE LOWER(CONCAT('%', st.tu_khoa, '%')))
                         )
                         AND sp.so_luong_ton > 0
                         ORDER BY sp.ngay_cap_nhat DESC
                         LIMIT 8`,
                        [userId]
                    );
                    fallbackProducts = byInterest;
                    fallbackProducts.forEach(p => { p.explanation = "Đúng sở thích"; });
                } catch (e) { console.warn('Fallback by interest failed:', e.message); }
            }
            if (fallbackProducts.length === 0) {
                const [latest] = await pool.query(
                    `SELECT ma_sp as id, ten_sp as name, gia as price, gia_giam, anh_dai_dien as image, mau_sac as color, bo_nho as storage FROM san_pham ORDER BY ngay_cap_nhat DESC LIMIT 8`
                );
                fallbackProducts = latest;
                fallbackProducts.forEach(p => { p.explanation = "Sản phẩm mới"; });
            }
            baseProducts = fallbackProducts;
        }

        // Đính kèm lý do cho sản phẩm đã xem và sản phẩm tương tự
        viewedProducts.forEach(p => {
            p.explanation = "Xem gần đây";
        });
        uniqueSimilarProducts.forEach(p => {
            p.explanation = `Cùng hãng ${p.brand || 'Apple'}`;
        });

        // Bước 3: Kết hợp và lọc trùng để ưu tiên các sản phẩm đã xem và sản phẩm tương thích
        let finalProducts = [];
        const cleanCurrentId = currentProductId ? parseInt(currentProductId) : null;

        if (cleanCurrentId) {
            // Khi người dùng đang ở trang chi tiết sản phẩm:
            // 1. Ưu tiên cao nhất cho gợi ý AI/Apriori (baseProducts)
            // 2. Sau đó đến sản phẩm tương tự cùng thương hiệu (uniqueSimilarProducts)
            // 3. Cuối cùng mới đến sản phẩm đã xem (viewedProducts)
            // Lọc bỏ chính sản phẩm đang xem để tránh gợi ý trùng lặp
            const cleanBase = baseProducts.filter(p => p.id != cleanCurrentId);
            const baseIds = new Set(cleanBase.map(p => p.id));
            
            const cleanSimilar = uniqueSimilarProducts.filter(p => p.id != cleanCurrentId && !baseIds.has(p.id));
            const similarIds = new Set(cleanSimilar.map(p => p.id));
            
            const cleanViewed = viewedProducts.filter(p => p.id != cleanCurrentId && !baseIds.has(p.id) && !similarIds.has(p.id));
            
            finalProducts = [...cleanBase, ...cleanSimilar, ...cleanViewed].slice(0, 8);
        } else {
            // Đối với các trang khác (ví dụ: Trang chủ), giữ nguyên logic cũ
            const seenIds = new Set([...viewedProducts.map(p => p.id), ...uniqueSimilarProducts.map(p => p.id)]);
            const filteredBaseProducts = baseProducts.filter(p => !seenIds.has(p.id));
            finalProducts = [...viewedProducts, ...uniqueSimilarProducts, ...filteredBaseProducts].slice(0, 8);
        }
        
        res.json({
            success: true,
            data: finalProducts.map(mapRecommendationProduct),
            source: cleanCurrentId
                ? 'ai_detail_page'
                : (viewedProducts.length > 0 
                    ? (uniqueSimilarProducts.length > 0 ? 'behavioral_and_similar' : 'behavioral_and_ai') 
                    : (recommendedProductIds.length > 0 ? 'ai' : 'fallback'))
        });

    } catch (error) {
        console.error('Lỗi khi lấy recommendation:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// ==================== ADMIN RECOMMENDATION MANAGEMENT & SIMULATOR ====================

const checkAdmin = (req, res, next) => {
    if (!req.session || !req.session.user || req.session.user.vai_tro !== 'admin') {
        return res.status(401).json({ success: false, message: 'Unauthorized: Yêu cầu quyền admin' });
    }
    next();
};

// GET /api/recommendations/admin/test-customers
// Lấy danh sách khách hàng có lịch sử tương tác để test gợi ý
router.get('/admin/test-customers', checkAdmin, async (req, res) => {
    try {
        const [customers] = await pool.query(`
            SELECT DISTINCT kh.ma_kh, kh.ho_ten, kh.email
            FROM khach_hang kh
            WHERE EXISTS (SELECT 1 FROM lich_su_xem_san_pham ls WHERE ls.ma_kh = kh.ma_kh)
               OR EXISTS (SELECT 1 FROM don_hang dh WHERE dh.ma_kh = kh.ma_kh)
            ORDER BY kh.ho_ten ASC
        `);
        res.json({ success: true, data: customers });
    } catch (error) {
        console.error('Error fetching test customers:', error);
        res.status(500).json({ success: false, message: 'Lỗi server' });
    }
});

// GET /api/recommendations/admin/status
// Lấy trạng thái của hệ thống gợi ý AI
router.get('/admin/status', checkAdmin, async (req, res) => {
    try {
        const response = await axios.get('http://127.0.0.1:8000/api/recommend/admin/status');
        res.json({ success: true, data: response.data });
    } catch (error) {
        console.error('Error fetching python status:', error.message);
        res.status(500).json({ success: false, message: 'Python recommendation service offline hoặc lỗi' });
    }
});

// POST /api/recommendations/admin/config
// Cập nhật cấu hình tham số học máy và huấn luyện lại
router.post('/admin/config', checkAdmin, async (req, res) => {
    try {
        const { k_neighbors, min_support, min_threshold } = req.body;
        const response = await axios.post('http://127.0.0.1:8000/api/recommend/admin/config', {
            k_neighbors: parseInt(k_neighbors),
            min_support: parseFloat(min_support),
            min_threshold: parseFloat(min_threshold)
        });
        res.json({ success: true, message: response.data.message, data: response.data.data });
    } catch (error) {
        console.error('Error updating python config:', error.message);
        res.status(500).json({ success: false, message: 'Python recommendation service offline hoặc lỗi' });
    }
});

// POST /api/recommendations/admin/retrain
// Yêu cầu huấn luyện lại các mô hình AI ngay lập tức
router.post('/admin/retrain', checkAdmin, async (req, res) => {
    try {
        const response = await axios.post('http://127.0.0.1:8000/api/recommend/admin/retrain');
        res.json({ success: true, message: response.data.message, data: response.data.data });
    } catch (error) {
        console.error('Error retraining python service:', error.message);
        res.status(500).json({ success: false, message: 'Python recommendation service offline hoặc lỗi' });
    }
});

// GET /api/recommendations/admin/explain/:userId
// Chạy mô phỏng và giải thích kết quả gợi ý cho khách hàng cụ thể
router.get('/admin/explain/:userId', checkAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { cartItems } = req.query;
        const response = await axios.get('http://127.0.0.1:8000/api/recommend/admin/explain', {
            params: { userId, cartItems }
        });
        res.json({ success: true, recommendations: response.data.recommendations });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Python recommendation service offline hoặc lỗi' });
    }
});

// GET /api/recommendations/admin/overview-knn
// Lấy danh sách tổng quan khách hàng có gu mua sắm tương đồng
router.get('/admin/overview-knn', checkAdmin, async (req, res) => {
    try {
        const response = await axios.get('http://127.0.0.1:8000/api/recommend/admin/overview-knn');
        res.json({ success: true, data: response.data.data });
    } catch (error) {
        console.error('Error fetching overview-knn:', error.message);
        res.status(500).json({ success: false, message: 'Python recommendation service offline hoặc lỗi' });
    }
});

// GET /api/recommendations/admin/overview-apriori
// Lấy danh sách tổng quan các luật mua chung và gợi ý mua kèm Apriori
router.get('/admin/overview-apriori', checkAdmin, async (req, res) => {
    try {
        const response = await axios.get('http://127.0.0.1:8000/api/recommend/admin/overview-apriori');
        res.json({ success: true, data: response.data.data });
    } catch (error) {
        console.error('Error fetching overview-apriori:', error.message);
        res.status(500).json({ success: false, message: 'Python recommendation service offline hoặc lỗi' });
    }
});

module.exports = router;
