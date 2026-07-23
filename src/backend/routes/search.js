const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// ==========================================
// UTILITY FUNCTIONS FOR SMART SEARCH
// ==========================================

// Hàm loại bỏ dấu tiếng Việt để tìm kiếm không dấu
function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    str = str.replace(/\u0300|\u0301|\u0309|\u0303|\u0323/g, ""); 
    str = str.replace(/\u02C6|\u0306|\u031B/g, ""); 
    str = str.replace(/[^a-zA-Z0-9\s]/g, " ");
    str = str.replace(/\s+/g, " ");
    return str.trim();
}

// Tiền xử lý từ khóa tìm kiếm: sửa lỗi chính tả và chuyển đổi từ viết tắt tiếng Việt
function preprocessSearchQuery(query) {
    if (!query) return '';
    let processed = query.toLowerCase().trim();

    const phraseMap = {
        "xung xam": "samsung",
        "sam sung": "samsung",
        "sa mi": "xiaomi",
        "sao mi": "xiaomi",
        "xiao mi": "xiaomi",
        "real me": "realme",
        "vi vo": "vivo",
        "no kia": "nokia",
        "c luc": "cường lực",
        "c lực": "cường lực",
        "cuong luc": "cường lực",
        "tai nghe": "tai nghe",
        "t nghe": "tai nghe",
        "sac dp": "sạc dự phòng",
        "s dự phòng": "sạc dự phòng",
        "s du phong": "sạc dự phòng",
        "sac du phong": "sạc dự phòng",
        "op lung": "ốp lưng",
        "ốp lung": "ốp lưng",
        "op lưng": "ốp lưng",
        "cu sac": "củ sạc",
        "co sac": "củ sạc",
        "coc sac": "củ sạc",
        "day sac": "dây sạc",
        "cap sac": "cáp sạc",
        "kinh cuong luc": "kính cường lực"
    };

    for (const [key, val] of Object.entries(phraseMap)) {
        processed = processed.replace(new RegExp('\\b' + key + '\\b', 'g'), val);
    }

    const wordMap = {
        "xungxam": "samsung",
        "sámung": "samsung",
        "samsum": "samsung",
        "samsug": "samsung",
        "ss": "samsung",
        "ip": "iphone",
        "ipon": "iphone",
        "ifone": "iphone",
        "iphne": "iphone",
        "ipho": "iphone",
        "aple": "apple",
        "appple": "apple",
        "op": "oppo",
        "opo": "oppo",
        "xiami": "xiaomi",
        "redmi": "redmi",
        "readmi": "redmi",
        "remy": "redmi",
        "dt": "điện thoại",
        "đt": "điện thoại",
        "dthoai": "điện thoại",
        "cl": "cường lực",
        "tn": "tai nghe",
        "sdp": "sạc dự phòng",
        "pk": "phụ kiện",
        "cs": "củ sạc",
        "ds": "dây sạc",
        "ol": "ốp lưng"
    };

    let words = processed.split(/\s+/);
    words = words.map(w => wordMap[w] || w);
    processed = words.join(" ");
    return processed;
}

// So khớp thông minh giữa sản phẩm và từ khóa tìm kiếm (trả về điểm độ tương quan)
function getSearchRelevanceScore(product, query) {
    if (!query) return 1;
    
    const correctedQuery = preprocessSearchQuery(query);
    if (!correctedQuery) return 0;

    const normQuery = removeVietnameseTones(correctedQuery).toLowerCase();
    const queryTokens = normQuery.split(/\s+/).filter(t => t.length > 0);
    if (queryTokens.length === 0) return 0;

    const normName = removeVietnameseTones(product.name || '').toLowerCase();
    const normBrand = removeVietnameseTones(product.brand || '').toLowerCase();
    const normCategory = removeVietnameseTones(product.category || '').toLowerCase();
    const normType = removeVietnameseTones(product.type || '').toLowerCase();
    const normDesc = removeVietnameseTones(product.description || '').toLowerCase();
    
    let vietnameseCategory = '';
    if (product.category === 'phukien') vietnameseCategory = 'phu kien';
    else if (product.category === 'dienthoai') vietnameseCategory = 'dien thoai';
    const normVietnameseCategory = removeVietnameseTones(vietnameseCategory);

    let matchCount = 0;
    let nameMatchCount = 0;

    for (const token of queryTokens) {
        let isTokenMatched = false;

        if (normName.includes(token)) {
            nameMatchCount++;
            isTokenMatched = true;
        }
        
        if (normBrand.includes(token) || 
            normCategory.includes(token) || 
            normVietnameseCategory.includes(token) ||
            normType.includes(token) || 
            normDesc.includes(token)) {
            isTokenMatched = true;
        }

        if (isTokenMatched) {
            matchCount++;
        }
    }

    const requiredMatches = queryTokens.length <= 2 ? queryTokens.length : Math.max(2, queryTokens.length - 1);
    if (matchCount < requiredMatches) {
        return 0;
    }

    let score = (matchCount / queryTokens.length) * 100;

    if (normName.includes(normQuery)) {
        score += 50;
    }

    score += nameMatchCount * 10;

    if (queryTokens.some(token => normBrand === token)) {
        score += 30;
    }

    if (normName.startsWith(queryTokens[0])) {
        score += 15;
    }

    return score;
}

// ==========================================
// API TÌM KIẾM KIỂU YOUTUBE - NÂNG CẤP
// ==========================================

/**
 * Lưu từ khóa tìm kiếm của người dùng
 * POST /api/search/save
 * Body: { tu_khoa: string, ma_kh: number (optional) }
 */
router.post('/save', async (req, res) => {
    try {
        const { tu_khoa, ma_kh } = req.body;

        if (!tu_khoa || tu_khoa.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Từ khóa tìm kiếm không được để trống'
            });
        }

        const keyword = tu_khoa.trim();

        // Kiểm tra nếu từ khóa đã tồn tại trong lịch sử của user này
        if (ma_kh) {
            const [existing] = await pool.query(
                `SELECT ma FROM du_lieu_tim_kiem 
                 WHERE tu_khoa = ? AND ma_kh = ? 
                 ORDER BY thoi_gian DESC LIMIT 1`,
                [keyword, ma_kh]
            );

            // Nếu đã có, cập nhật thời gian
            if (existing.length > 0) {
                await pool.query(
                    `UPDATE du_lieu_tim_kiem SET thoi_gian = CURRENT_TIMESTAMP 
                     WHERE ma = ?`,
                    [existing[0].ma]
                );
                return res.json({
                    success: true,
                    message: 'Đã cập nhật lịch sử tìm kiếm'
                });
            }
        }

        // Thêm mới từ khóa tìm kiếm
        await pool.query(
            `INSERT INTO du_lieu_tim_kiem (tu_khoa, ma_kh) VALUES (?, ?)`,
            [keyword, ma_kh || null]
        );

        // Giới hạn số lượng lịch sử tìm kiếm của mỗi user (giữ lại 20 từ khóa gần nhất)
        if (ma_kh) {
            await pool.query(
                `DELETE FROM du_lieu_tim_kiem 
                 WHERE ma_kh = ? 
                 AND ma NOT IN (
                     SELECT ma FROM (
                         SELECT ma FROM du_lieu_tim_kiem 
                         WHERE ma_kh = ? 
                         ORDER BY thoi_gian DESC LIMIT 20
                     ) AS recent
                 )`,
                [ma_kh, ma_kh]
            );
        }

        res.json({
            success: true,
            message: 'Đã lưu từ khóa tìm kiếm'
        });
    } catch (error) {
        console.error('Lỗi lưu từ khóa tìm kiếm:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

/**
 * 🔥 TRENDING - Từ khóa tìm kiếm hot nhất (kiểu YouTube)
 * GET /api/search/trending
 */
router.get('/trending', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 8;

        // Lấy từ khóa được tìm nhiều nhất trong 7 ngày gần đây
        const [trending] = await pool.query(
            `SELECT tu_khoa as text, COUNT(*) as search_count, 'trending' as type
             FROM du_lieu_tim_kiem 
             WHERE thoi_gian >= DATE_SUB(NOW(), INTERVAL 7 DAY)
             GROUP BY tu_khoa 
             ORDER BY search_count DESC 
             LIMIT ?`,
            [limit]
        );

        // Nếu không đủ trending, bổ sung từ sản phẩm mới/hot
        if (trending.length < limit) {
            const remaining = limit - trending.length;
            const [hotProducts] = await pool.query(
                `SELECT ten_sp as text, ma_sp, gia, anh_dai_dien, 'hot_product' as type
                 FROM san_pham 
                 WHERE ten_sp NOT IN (?)
                 ORDER BY ngay_cap_nhat DESC, ma_sp DESC
                 LIMIT ?`,
                [trending.length > 0 ? trending.map(t => t.text) : [''], remaining]
            );
            trending.push(...hotProducts);
        }

        res.json({
            success: true,
            data: trending
        });
    } catch (error) {
        console.error('Lỗi lấy trending:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

/**
 * 🎯 AUTOCOMPLETE - Gợi ý hoàn thành từ khóa thông minh (kiểu YouTube)
 * GET /api/search/autocomplete?q=iphone
 * Trả về các gợi ý hoàn thành câu: "iphone 15 pro", "iphone giá rẻ"...
 */
router.get('/autocomplete', async (req, res) => {
    try {
        const { q } = req.query;
        const limit = parseInt(req.query.limit) || 6;

        if (!q || q.trim().length < 1) {
            return res.json({ success: true, data: [] });
        }

        const corrected = preprocessSearchQuery(q);
        const keyword = (corrected || q).trim().toLowerCase();
        const startWith = `${keyword}%`;
        const contains = `%${keyword}%`;

        // Gợi ý từ tên sản phẩm - ưu tiên bắt đầu bằng từ khóa
        const [productSuggestions] = await pool.query(
            `SELECT DISTINCT 
                LOWER(ten_sp) as suggestion,
                ma_sp,
                gia,
                anh_dai_dien,
                CASE 
                    WHEN LOWER(ten_sp) LIKE ? THEN 1
                    WHEN LOWER(ten_sp) LIKE ? THEN 2
                    ELSE 3
                END as priority
             FROM san_pham
             WHERE LOWER(ten_sp) LIKE ? OR LOWER(ten_sp) LIKE ?
             ORDER BY priority, suggestion
             LIMIT ?`,
            [startWith, contains, startWith, contains, limit]
        );

        // Gợi ý từ lịch sử tìm kiếm phổ biến
        const [historySuggestions] = await pool.query(
            `SELECT tu_khoa as suggestion, COUNT(*) as freq
             FROM du_lieu_tim_kiem 
             WHERE LOWER(tu_khoa) LIKE ? OR LOWER(tu_khoa) LIKE ?
             GROUP BY tu_khoa
             ORDER BY freq DESC
             LIMIT ?`,
            [startWith, contains, 4]
        );

        // Kết hợp và loại bỏ trùng lặp
        const seen = new Set();
        const combined = [];

        // Thêm từ lịch sử trước (phổ biến)
        historySuggestions.forEach(item => {
            const key = item.suggestion.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                combined.push({
                    text: item.suggestion,
                    type: 'autocomplete',
                    frequency: item.freq
                });
            }
        });

        // Thêm từ sản phẩm
        productSuggestions.forEach(item => {
            const key = item.suggestion.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                combined.push({
                    text: item.suggestion,
                    type: 'product_suggest',
                    ma_sp: item.ma_sp,
                    gia: item.gia,
                    anh_dai_dien: item.anh_dai_dien
                });
            }
        });

        res.json({
            success: true,
            data: combined.slice(0, limit)
        });
    } catch (error) {
        console.error('Lỗi autocomplete:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

/**
 * Lấy lịch sử tìm kiếm của người dùng
 * GET /api/search/history/:ma_kh
 */
router.get('/history/:ma_kh', async (req, res) => {
    try {
        const { ma_kh } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        const [history] = await pool.query(
            `SELECT tu_khoa, thoi_gian 
             FROM du_lieu_tim_kiem 
             WHERE ma_kh = ? 
             ORDER BY thoi_gian DESC 
             LIMIT ?`,
            [ma_kh, limit]
        );

        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Lỗi lấy lịch sử tìm kiếm:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

/**
 * Xóa một từ khóa khỏi lịch sử tìm kiếm
 * DELETE /api/search/history
 * Body: { tu_khoa: string, ma_kh: number }
 */
router.delete('/history', async (req, res) => {
    try {
        const { tu_khoa, ma_kh } = req.body;

        if (!ma_kh) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu mã khách hàng'
            });
        }

        await pool.query(
            `DELETE FROM du_lieu_tim_kiem WHERE tu_khoa = ? AND ma_kh = ?`,
            [tu_khoa, ma_kh]
        );

        res.json({
            success: true,
            message: 'Đã xóa từ khóa khỏi lịch sử'
        });
    } catch (error) {
        console.error('Lỗi xóa lịch sử tìm kiếm:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

/**
 * Xóa tất cả lịch sử tìm kiếm của người dùng
 * DELETE /api/search/history/all/:ma_kh
 */
router.delete('/history/all/:ma_kh', async (req, res) => {
    try {
        const { ma_kh } = req.params;

        await pool.query(
            `DELETE FROM du_lieu_tim_kiem WHERE ma_kh = ?`,
            [ma_kh]
        );

        res.json({
            success: true,
            message: 'Đã xóa tất cả lịch sử tìm kiếm'
        });
    } catch (error) {
        console.error('Lỗi xóa tất cả lịch sử:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

/**
 * 🎬 GỢI Ý TÌM KIẾM KIỂU YOUTUBE - NÂNG CẤP
 * GET /api/search/suggest?q=keyword&ma_kh=123
 * Trả về: trending + lịch sử + autocomplete + sản phẩm phù hợp
 */
router.get('/suggest', async (req, res) => {
    try {
        const { q, ma_kh } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 10, 20);

        let suggestions = [];

        // ========== TRƯỜNG HỢP 1: Có từ khóa tìm kiếm ==========
        if (q && q.trim() !== '') {
            const corrected = preprocessSearchQuery(q);
            const keyword = corrected || q.trim();
            const keywordLower = keyword.toLowerCase();
            const startWith = `${keywordLower}%`;
            const contains = `%${keywordLower}%`;

            // 1. Autocomplete từ lịch sử phổ biến
            const [autocompleteSuggestions] = await pool.query(
                `SELECT tu_khoa as text, COUNT(*) as freq, 'autocomplete' as type
                 FROM du_lieu_tim_kiem 
                 WHERE LOWER(tu_khoa) LIKE LOWER(?) 
                 GROUP BY tu_khoa
                 ORDER BY freq DESC
                 LIMIT 3`,
                [startWith]
            );

            // 2. Lịch sử cá nhân của user (nếu đăng nhập)
            let userHistory = [];
            if (ma_kh && parseInt(ma_kh) > 0) {
                const [history] = await pool.query(
                    `SELECT tu_khoa as text, 'history' as type, MAX(thoi_gian) as last_time
                     FROM du_lieu_tim_kiem 
                     WHERE ma_kh = ? AND LOWER(tu_khoa) LIKE LOWER(?)
                     GROUP BY tu_khoa
                     ORDER BY last_time DESC 
                     LIMIT 3`,
                    [parseInt(ma_kh), contains]
                );
                userHistory = history;
            }

            // 3. Sản phẩm phù hợp với hình ảnh và giá (sử dụng in-memory relevance scoring)
            const [allDbProducts] = await pool.query(
                `SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, sp.mo_ta, hsx.ten_hang
                 FROM san_pham sp
                 LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
                 WHERE COALESCE(sp.trang_thai, 'active') <> 'discontinued'`
            );

            const scoredProducts = allDbProducts.map(row => {
                const nameLower = (row.ten_sp || '').toLowerCase();
                const isAccessory = nameLower.includes('ốp') || 
                                   nameLower.includes('case') ||
                                   nameLower.includes('tai nghe') || 
                                   nameLower.includes('earpods') || 
                                   nameLower.includes('airpods') || 
                                   nameLower.includes('buds') || 
                                   nameLower.includes('sạc') || 
                                   nameLower.includes('cáp') || 
                                   nameLower.includes('dây sạc') || 
                                   nameLower.includes('cường lực');
                
                const product = {
                    id: row.ma_sp,
                    name: row.ten_sp,
                    brand: row.ten_hang || 'unknown',
                    category: isAccessory ? 'phukien' : 'dienthoai',
                    description: row.mo_ta || '',
                    type: (() => {
                        if (nameLower.includes('tai nghe') || nameLower.includes('earpods') || nameLower.includes('airpods') || nameLower.includes('buds')) return 'tainghe';
                        if (nameLower.includes('ốp') || nameLower.includes('case')) return 'oplung';
                        if (nameLower.includes('cường lực')) return 'cuongluc';
                        if (nameLower.includes('cáp') || nameLower.includes('dây sạc')) return 'cap';
                        if (nameLower.includes('sạc dự phòng') || nameLower.includes('pin dự phòng')) return 'sac';
                        if (nameLower.includes('sạc') || nameLower.includes('củ sạc') || nameLower.includes('cốc sạc')) return 'sac';
                        return null;
                    })()
                };

                const score = getSearchRelevanceScore(product, q);
                return {
                    ma_sp: row.ma_sp,
                    text: row.ten_sp,
                    gia: row.gia,
                    anh_dai_dien: row.anh_dai_dien,
                    type: 'product',
                    score: score
                };
            })
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score);

            const products = scoredProducts.slice(0, 6);

            // Kết hợp và loại bỏ trùng lặp
            const seen = new Set();
            
            // Thêm lịch sử cá nhân trước
            userHistory.forEach(item => {
                const key = item.text.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    suggestions.push(item);
                }
            });

            // Thêm autocomplete
            autocompleteSuggestions.forEach(item => {
                const key = item.text.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    suggestions.push(item);
                }
            });

            // Thêm sản phẩm
            products.forEach(item => {
                const key = item.text.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    suggestions.push(item);
                }
            });

            suggestions = suggestions.slice(0, limit);
        } 
        // ========== TRƯỜNG HỢP 2: Không có từ khóa (click vào ô search) ==========
        else {
            // 1. Lịch sử cá nhân (nếu đăng nhập)
            if (ma_kh && parseInt(ma_kh) > 0) {
                const [history] = await pool.query(
                    `SELECT tu_khoa as text, 'history' as type, MAX(thoi_gian) as last_time
                     FROM du_lieu_tim_kiem 
                     WHERE ma_kh = ? 
                     GROUP BY tu_khoa
                     ORDER BY last_time DESC 
                     LIMIT 5`,
                    [parseInt(ma_kh)]
                );
                suggestions.push(...history);
            }

            // 2. Trending - từ khóa hot
            const [trending] = await pool.query(
                `SELECT tu_khoa as text, COUNT(*) as search_count, 'trending' as type
                 FROM du_lieu_tim_kiem 
                 WHERE thoi_gian >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                   AND tu_khoa NOT IN (?)
                 GROUP BY tu_khoa 
                 ORDER BY search_count DESC 
                 LIMIT 4`,
                [suggestions.length > 0 ? suggestions.map(s => s.text) : ['']]
            );
            suggestions.push(...trending);

            // 3. Sản phẩm hot/mới
            const existingTexts = suggestions.map(s => s.text.toLowerCase());
            const [hotProducts] = await pool.query(
                `SELECT ma_sp, ten_sp as text, gia, anh_dai_dien, 'hot' as type 
                 FROM san_pham 
                 ORDER BY ngay_cap_nhat DESC, ma_sp DESC
                 LIMIT 5`
            );
            
            hotProducts.forEach(product => {
                if (!existingTexts.includes(product.text.toLowerCase())) {
                    suggestions.push(product);
                }
            });

            suggestions = suggestions.slice(0, limit);
        }

        res.json({
            success: true,
            data: suggestions
        });
    } catch (error) {
        console.error('Lỗi gợi ý tìm kiếm:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: error.message
        });
    }
});

/**
 * Thống kê từ khóa tìm kiếm phổ biến (cho admin)
 * GET /api/search/popular
 */
router.get('/popular', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const [popular] = await pool.query(
            `SELECT tu_khoa, COUNT(*) as so_lan_tim 
             FROM du_lieu_tim_kiem 
             GROUP BY tu_khoa 
             ORDER BY so_lan_tim DESC 
             LIMIT ?`,
            [limit]
        );

        res.json({
            success: true,
            data: popular
        });
    } catch (error) {
        console.error('Lỗi lấy từ khóa phổ biến:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

module.exports = router;
