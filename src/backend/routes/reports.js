const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const chatbotRouter = require('./chatbot');
const ExcelJS = require('exceljs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, HeadingLevel, WidthType } = require('docx');

// Expose AI helpers from chatbot router
const { callGemini, callGroqWithRetry } = chatbotRouter;

// ==================== SECURITY MIDDLEWARES ====================
const checkAdmin = (req, res, next) => {
    if (!req.session || !req.session.user || req.session.user.vai_tro !== 'admin') {
        return res.status(401).json({
            success: false,
            message: 'Phiên đăng nhập hết hạn hoặc bạn không có quyền truy cập.',
            code: 'AUTH_REQUIRED'
        });
    }
    next();
};

const checkSuperAdmin = (req, res, next) => {
    if (req.session.user.quyen !== 'superadmin') {
        return res.status(403).json({
            success: false,
            message: 'Chỉ Chủ cửa hàng (SuperAdmin) mới có quyền truy cập dữ liệu này.',
            code: 'SUPERADMIN_REQUIRED'
        });
    }
    next();
};

const checkPermission = (moduleName) => {
    const modulesToCheck = Array.isArray(moduleName) ? moduleName : [moduleName];
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                success: false,
                message: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
                code: 'AUTH_REQUIRED'
            });
        }

        // Superadmin có toàn quyền
        if (req.session.user.quyen === 'superadmin') {
            return next();
        }

        // Kiểm tra phân quyền chi tiết của nhân viên
        let allowed = [];
        if (req.session.user.allowed_modules) {
            try {
                allowed = typeof req.session.user.allowed_modules === 'string'
                    ? JSON.parse(req.session.user.allowed_modules)
                    : req.session.user.allowed_modules;
            } catch (e) {
                console.error('Error parsing allowed_modules in checkPermission middleware:', e);
            }
        }

        const hasDynamicPerm = modulesToCheck.some(m => Array.isArray(allowed) && allowed.includes(m));
        if (hasDynamicPerm) {
            return next();
        }

        // Fallback: Kiểm tra phân quyền theo vai trò mặc định
        const role = req.session.user.quyen;
        const defaultRolePermissions = {
            'banhang': ['nav-orders', 'nav-products', 'nav-brands', 'nav-imei', 'nav-shifts', 'nav-attendance', 'nav-pos', 'nav-warranties', 'nav-promotions'],
            'kho': ['nav-products', 'nav-inventory', 'nav-brands', 'nav-colors', 'nav-storages', 'nav-imei', 'nav-shifts', 'nav-attendance'],
            'ketoan': ['nav-revenue-report', 'nav-expenses', 'nav-profit-report', 'nav-payroll', 'nav-shifts', 'nav-attendance'],
            'cskh': ['nav-chatbot-rag', 'nav-notifications', 'nav-reviews', 'nav-contacts', 'nav-warranties', 'nav-shifts', 'nav-attendance'],
            'nhanvien': ['nav-orders', 'nav-products', 'nav-brands', 'nav-shifts', 'nav-attendance', 'nav-pos', 'nav-reviews', 'nav-warranties']
        };

        const roleAllowed = defaultRolePermissions[role] || [];
        const hasRolePerm = modulesToCheck.some(m => roleAllowed.includes(m));
        if (hasRolePerm) {
            return next();
        }

        return res.status(403).json({
            success: false,
            message: `Bạn không có quyền thực hiện chức năng này (yêu cầu quyền: ${modulesToCheck.join(', ')}).`,
            code: 'PERMISSION_DENIED'
        });
    };
};


// ==================== DATE PARSING HELPER ====================
function getDateRange(period, fromDate, toDate, year, month) {
    let start, end;
    const now = new Date();
    
    if (period === 'custom' && fromDate && toDate) {
        start = new Date(fromDate);
        start.setHours(0, 0, 0, 0);
        end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    const currentYear = year ? parseInt(year) : now.getFullYear();
    const currentMonth = month ? parseInt(month) : (now.getMonth() + 1);

    if (period === 'today') {
        start = new Date();
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
    } else if (period === 'week') {
        // Last 7 days
        start = new Date();
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        end = new Date();
        end.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
        start = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
        end = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
    } else if (period === 'quarter') {
        const currentQuarter = Math.floor((now.getMonth()) / 3);
        start = new Date(now.getFullYear(), currentQuarter * 3, 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59, 999);
    } else if (period === 'year') {
        start = new Date(currentYear, 0, 1, 0, 0, 0, 0);
        end = new Date(currentYear, 11, 31, 23, 59, 59, 999);
    } else {
        // Default: this month
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    return { start, end };
}

function getPeriodLabel(period, fromDate, toDate, year, month) {
    if (period === 'custom') return `Từ ${fromDate} đến ${toDate}`;
    if (period === 'today') return 'Hôm nay';
    if (period === 'week') return '7 ngày gần nhất';
    if (period === 'month') return `Tháng ${month || (new Date().getMonth() + 1)}/${year || new Date().getFullYear()}`;
    if (period === 'quarter') return `Quý ${Math.floor(new Date().getMonth() / 3) + 1}/${new Date().getFullYear()}`;
    if (period === 'year') return `Năm ${year || new Date().getFullYear()}`;
    return 'Tháng này';
}

// ==================== AI ADVICE HELPER ====================
async function getAiAdvice(type, dataSummary) {
    if (!callGemini && !callGroqWithRetry) {
        return "Hệ thống AI hiện chưa sẵn sàng.";
    }

    try {
        const systemPrompt = `Bạn là trợ lý AI chuyên nghiệp phụ trách phân tích tài chính và kinh doanh tại cửa hàng di động QuangHung Mobile. 
Hãy phân tích số liệu thực tế được gửi tới, đưa ra nhận xét sâu sắc và đề xuất hành động cụ thể bằng Tiếng Việt. 
Định dạng câu trả lời bằng Markdown. Hãy chia thành 3-4 gạch đầu dòng rõ ràng, súc tích và cực kỳ thiết thực.`;
        
        let prompt = "";
        if (type === 'revenue') {
            prompt = `Báo cáo Doanh thu (${dataSummary.periodLabel}):
- Tổng doanh thu: ${new Intl.NumberFormat('vi-VN').format(dataSummary.totalRevenue)} VNĐ
- Tổng số hóa đơn bán ra: ${dataSummary.totalOrders}
- Tổng số sản phẩm bán ra: ${dataSummary.totalProductsSold}

Hiệu suất nhân viên kinh doanh:
${dataSummary.topEmployees.map((e, i) => `- Top ${i+1}: ${e.ho_ten} (${e.orders_count} đơn, doanh thu mang lại ${new Intl.NumberFormat('vi-VN').format(e.total_revenue)} VNĐ)`).join('\n')}

Vui lòng nhận xét về hiệu quả doanh số kỳ này, đề xuất hành động để thúc đẩy các nhân viên và phương án bán hàng trong tương lai.`;
        } else {
            prompt = `Báo cáo Lợi nhuận & Tồn kho (${dataSummary.periodLabel}):
- Tổng doanh thu: ${new Intl.NumberFormat('vi-VN').format(dataSummary.totalRevenue)} VNĐ
- Tổng giá vốn hàng bán: ${new Intl.NumberFormat('vi-VN').format(dataSummary.totalCost)} VNĐ
- Tổng lợi nhuận gộp: ${new Intl.NumberFormat('vi-VN').format(dataSummary.totalProfit)} VNĐ (Biên lợi nhuận gộp: ${dataSummary.margin}%)

Hiệu suất sản phẩm theo màu sắc & dung lượng:
${dataSummary.topProducts.slice(0, 5).map((p, i) => `- ${p.ten_sp} [Màu: ${p.mau_sac_chon || 'N/A'}, Bộ nhớ: ${p.dung_luong_chon || 'N/A'}]: Bán ${p.quantity_sold} chiếc, Lợi nhuận ${new Intl.NumberFormat('vi-VN').format(p.profit)} VNĐ`).join('\n')}

Hãy nhận định dòng sản phẩm và màu sắc cụ thể nào đang đem lại lợi nhuận cao nhất để khuyến nghị quản lý nhập thêm hàng. Ngược lại, màu sắc nào bán chậm để đề xuất chạy chương trình xả tồn kho.`;
        }

        const messages = [{ role: 'user', content: prompt }];
        
        // Try Groq first (highly reliable with multiple fallback API keys)
        if (callGroqWithRetry) {
            const groqResult = await callGroqWithRetry({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.6,
                max_tokens: 600
            });
            if (groqResult.ok) {
                return groqResult.data.choices[0]?.message?.content || "Không có phản hồi từ AI.";
            }
            console.warn('[AI Report] Groq failed, trying fallback to Gemini:', groqResult.error);
        }
        
        // Fallback to Gemini
        if (callGemini) {
            const geminiResult = await callGemini(systemPrompt, messages, { temperature: 0.6, maxTokens: 600 });
            if (geminiResult.ok && geminiResult.text) {
                return geminiResult.text;
            }
        }
        
        return "Dịch vụ AI đang bận, vui lòng thử lại sau.";
    } catch (e) {
        console.error('AI analysis error:', e);
        return "Không thể tải nhận định từ AI: " + e.message;
    }
}

// ==================== ENDPOINTS ====================

// 1. GET /api/admin/reports/revenue-data
router.get('/revenue-data', checkAdmin, async (req, res) => {
    try {
        const { period = 'month', fromDate, toDate, year, month } = req.query;
        const { start, end } = getDateRange(period, fromDate, toDate, year, month);
        const periodLabel = getPeriodLabel(period, fromDate, toDate, year, month);

        // A. Summary stats
        const [[summary]] = await pool.query(`
            SELECT 
                COUNT(dh.ma_don) as total_orders,
                COALESCE(SUM(dh.tong_tien), 0) as total_revenue,
                COALESCE((
                    SELECT SUM(ct.so_luong) 
                    FROM chi_tiet_don_hang ct
                    JOIN don_hang d ON ct.ma_don = d.ma_don
                    WHERE d.thoi_gian >= ? AND d.thoi_gian <= ? AND d.trang_thai != 'cancelled'
                ), 0) as total_products_sold
            FROM don_hang dh
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ?
            AND dh.trang_thai != 'cancelled'
        `, [start, end, start, end]);

        // B. Orders list
        const [orders] = await pool.query(`
            SELECT 
                dh.ma_don,
                dh.thoi_gian as sell_date,
                COALESCE(kh.ho_ten, dh.ten_nguoi_nhan) as customer_name,
                dh.tong_tien
            FROM don_hang dh
            LEFT JOIN khach_hang kh ON dh.ma_kh = kh.ma_kh
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ?
            AND dh.trang_thai != 'cancelled'
            ORDER BY dh.thoi_gian DESC
        `, [start, end]);

        // C. Top sales employees
        const [topEmployees] = await pool.query(`
            SELECT 
                nv.ho_ten,
                COUNT(dh.ma_don) as orders_count,
                SUM(dh.tong_tien) as total_revenue
            FROM don_hang dh
            JOIN nhan_vien nv ON dh.ma_nv_xu_ly = nv.ma_nv
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ?
            AND dh.trang_thai != 'cancelled'
            GROUP BY nv.ma_nv
            ORDER BY total_revenue DESC
        `, [start, end]);

        // D. Daily/Monthly points for chart
        let chartData = [];
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 45) {
            // Group by day
            const [dailyData] = await pool.query(`
                SELECT DATE_FORMAT(MIN(thoi_gian), '%d/%m') as label, SUM(tong_tien) as value
                FROM don_hang
                WHERE thoi_gian >= ? AND thoi_gian <= ? AND trang_thai != 'cancelled'
                GROUP BY DATE(thoi_gian)
                ORDER BY DATE(thoi_gian)
            `, [start, end]);
            chartData = dailyData;
        } else {
            // Group by month
            const [monthlyData] = await pool.query(`
                SELECT DATE_FORMAT(thoi_gian, '%m/%Y') as label, SUM(tong_tien) as value
                FROM don_hang
                WHERE thoi_gian >= ? AND thoi_gian <= ? AND trang_thai != 'cancelled'
                GROUP BY DATE_FORMAT(thoi_gian, '%m/%Y')
                ORDER BY MIN(thoi_gian)
            `, [start, end]);
            chartData = monthlyData;
        }

        res.json({
            success: true,
            data: {
                period,
                periodLabel,
                summary: {
                    totalOrders: summary.total_orders,
                    totalRevenue: parseFloat(summary.total_revenue),
                    totalProductsSold: parseInt(summary.total_products_sold)
                },
                orders,
                topEmployees,
                chartData
            }
        });
    } catch (error) {
        console.error('Error fetching revenue reports:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 1.5 GET /api/admin/reports/revenue-ai-advice
router.get('/revenue-ai-advice', checkAdmin, async (req, res) => {
    try {
        const { period = 'month', fromDate, toDate, year, month } = req.query;
        const { start, end } = getDateRange(period, fromDate, toDate, year, month);
        const periodLabel = getPeriodLabel(period, fromDate, toDate, year, month);

        const [[summary]] = await pool.query(`
            SELECT 
                COUNT(dh.ma_don) as total_orders,
                COALESCE(SUM(dh.tong_tien), 0) as total_revenue,
                COALESCE((
                    SELECT SUM(ct.so_luong) 
                    FROM chi_tiet_don_hang ct
                    JOIN don_hang d ON ct.ma_don = d.ma_don
                    WHERE d.thoi_gian >= ? AND d.thoi_gian <= ? AND d.trang_thai != 'cancelled'
                ), 0) as total_products_sold
            FROM don_hang dh
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ?
            AND dh.trang_thai != 'cancelled'
        `, [start, end, start, end]);

        const [topEmployees] = await pool.query(`
            SELECT 
                nv.ho_ten,
                COUNT(dh.ma_don) as orders_count,
                SUM(dh.tong_tien) as total_revenue
            FROM don_hang dh
            JOIN nhan_vien nv ON dh.ma_nv_xu_ly = nv.ma_nv
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ?
            AND dh.trang_thai != 'cancelled'
            GROUP BY nv.ma_nv
            ORDER BY total_revenue DESC
        `, [start, end]);

        const aiAdvice = await getAiAdvice('revenue', {
            periodLabel,
            totalOrders: summary.total_orders,
            totalRevenue: summary.total_revenue,
            totalProductsSold: summary.total_products_sold,
            topEmployees
        });

        res.json({ success: true, aiAdvice });
    } catch (error) {
        console.error('Error getting revenue AI advice:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. GET /api/admin/reports/profit-data
router.get('/profit-data', checkAdmin, checkPermission('nav-profit-report'), async (req, res) => {
    try {
        const { period = 'month', fromDate, toDate, year, month } = req.query;
        const { start, end } = getDateRange(period, fromDate, toDate, year, month);
        const periodLabel = getPeriodLabel(period, fromDate, toDate, year, month);

        // A. Summary stats (Revenue vs Import COGS)
        const [[revSummary]] = await pool.query(`
            SELECT COALESCE(SUM(tong_tien), 0) as total_revenue
            FROM don_hang
            WHERE thoi_gian >= ? AND thoi_gian <= ?
            AND trang_thai != 'cancelled'
        `, [start, end]);

        const [[costSummary]] = await pool.query(`
            SELECT COALESCE(SUM(ct.so_luong * ct.gia_nhap), 0) as total_cost
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ?
            AND dh.trang_thai != 'cancelled'
        `, [start, end]);

        const totalRevenue = parseFloat(revSummary.total_revenue);
        const totalCost = parseFloat(costSummary.total_cost);
        const totalProfit = totalRevenue - totalCost;
        const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

        // B. Product-level variants profit list (Color variant-level profit report)
        const [topProducts] = await pool.query(`
            SELECT 
                sp.ten_sp,
                ct.mau_sac_chon,
                ct.dung_luong_chon,
                SUM(ct.so_luong) as quantity_sold,
                SUM(ct.so_luong * ct.gia) as revenue,
                SUM(ct.so_luong * ct.gia_nhap) as cost,
                SUM(ct.so_luong * (ct.gia - ct.gia_nhap)) as profit
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ?
            AND dh.trang_thai != 'cancelled'
            GROUP BY sp.ma_sp, ct.mau_sac_chon, ct.dung_luong_chon
            ORDER BY profit DESC, quantity_sold DESC
        `, [start, end]);

        // C. Monthly details for chart comparison (Revenue vs Cost vs Profit)
        const [monthlyFinancialsRaw] = await pool.query(`
            SELECT 
                DATE_FORMAT(dh.thoi_gian, '%m/%Y') as label,
                SUM(dh.tong_tien) as revenue,
                SUM(cost_sub.total_cost) as cost
            FROM don_hang dh
            JOIN (
                SELECT ma_don, SUM(so_luong * gia_nhap) as total_cost
                FROM chi_tiet_don_hang
                GROUP BY ma_don
            ) cost_sub ON dh.ma_don = cost_sub.ma_don
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ? AND dh.trang_thai != 'cancelled'
            GROUP BY DATE_FORMAT(dh.thoi_gian, '%m/%Y')
            ORDER BY MIN(dh.thoi_gian)
        `, [start, end]);

        const monthlyFinancials = monthlyFinancialsRaw.map(f => ({
            label: f.label,
            revenue: parseFloat(f.revenue),
            cost: parseFloat(f.cost),
            profit: parseFloat(f.revenue) - parseFloat(f.cost)
        }));

        res.json({
            success: true,
            data: {
                period,
                periodLabel,
                summary: {
                    totalRevenue,
                    totalCost,
                    totalProfit,
                    margin
                },
                topProducts,
                monthlyFinancials
            }
        });
    } catch (error) {
        console.error('Error fetching profit reports:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2.5 GET /api/admin/reports/profit-ai-advice
router.get('/profit-ai-advice', checkAdmin, checkPermission('nav-profit-report'), async (req, res) => {
    try {
        const { period = 'month', fromDate, toDate, year, month } = req.query;
        const { start, end } = getDateRange(period, fromDate, toDate, year, month);
        const periodLabel = getPeriodLabel(period, fromDate, toDate, year, month);

        const [[revSummary]] = await pool.query(`
            SELECT COALESCE(SUM(tong_tien), 0) as total_revenue
            FROM don_hang
            WHERE thoi_gian >= ? AND thoi_gian <= ?
            AND trang_thai != 'cancelled'
        `, [start, end]);

        const [[costSummary]] = await pool.query(`
            SELECT COALESCE(SUM(ct.so_luong * ct.gia_nhap), 0) as total_cost
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ?
            AND dh.trang_thai != 'cancelled'
        `, [start, end]);

        const totalRevenue = parseFloat(revSummary.total_revenue);
        const totalCost = parseFloat(costSummary.total_cost);
        const totalProfit = totalRevenue - totalCost;
        const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

        const [topProducts] = await pool.query(`
            SELECT 
                sp.ten_sp,
                ct.mau_sac_chon,
                ct.dung_luong_chon,
                SUM(ct.so_luong) as quantity_sold,
                SUM(ct.so_luong * (ct.gia - ct.gia_nhap)) as profit
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ?
            AND dh.trang_thai != 'cancelled'
            GROUP BY sp.ma_sp, ct.mau_sac_chon, ct.dung_luong_chon
            ORDER BY profit DESC
        `, [start, end]);

        const aiAdvice = await getAiAdvice('profit', {
            periodLabel,
            totalRevenue,
            totalCost,
            totalProfit,
            margin,
            topProducts
        });

        res.json({ success: true, aiAdvice });
    } catch (error) {
        console.error('Error getting profit AI advice:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. GET /api/admin/reports/export/excel
router.get('/export/excel', checkAdmin, checkPermission(['nav-revenue-report', 'nav-profit-report']), async (req, res) => {
    try {
        const { period = 'month', fromDate, toDate, year, month } = req.query;
        const { start, end } = getDateRange(period, fromDate, toDate, year, month);
        
        // Fetch sheets data
        // Sheet 1 Data: Doanh thu theo ngày
        const [revenueData] = await pool.query(`
            SELECT DATE_FORMAT(MIN(thoi_gian), '%d/%m/%Y') as date_str, COUNT(*) as orders_count, SUM(tong_tien) as revenue
            FROM don_hang
            WHERE thoi_gian >= ? AND thoi_gian <= ? AND trang_thai != 'cancelled'
            GROUP BY DATE(thoi_gian)
            ORDER BY DATE(thoi_gian)
        `, [start, end]);

        // Sheet 2 Data: Sản phẩm bán chạy
        const [bestSellers] = await pool.query(`
            SELECT sp.ten_sp, ct.mau_sac_chon, ct.dung_luong_chon, SUM(ct.so_luong) as quantity
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ? AND dh.trang_thai != 'cancelled'
            GROUP BY sp.ma_sp, ct.mau_sac_chon, ct.dung_luong_chon
            ORDER BY quantity DESC
        `, [start, end]);

        // Sheet 3 Data: Lợi nhuận theo tháng
        const [profitData] = await pool.query(`
            SELECT 
                DATE_FORMAT(dh.thoi_gian, '%m/%Y') as month_str, 
                SUM(dh.tong_tien) as revenue,
                SUM(cost_sub.total_cost) as cost
            FROM don_hang dh
            JOIN (
                SELECT ma_don, SUM(so_luong * gia_nhap) as total_cost
                FROM chi_tiet_don_hang
                GROUP BY ma_don
            ) cost_sub ON dh.ma_don = cost_sub.ma_don
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ? AND dh.trang_thai != 'cancelled'
            GROUP BY DATE_FORMAT(dh.thoi_gian, '%m/%Y')
            ORDER BY MIN(dh.thoi_gian)
        `, [start, end]);

        const workbook = new ExcelJS.Workbook();
        
        // Sheet 1
        const sheet1 = workbook.addWorksheet('Doanh thu');
        sheet1.columns = [
            { header: 'Ngày', key: 'date_str', width: 18 },
            { header: 'Số hóa đơn', key: 'orders_count', width: 15 },
            { header: 'Doanh thu (VNĐ)', key: 'revenue', width: 25 }
        ];
        sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1976D2' } };
        revenueData.forEach(row => {
            sheet1.addRow({
                date_str: row.date_str,
                orders_count: parseInt(row.orders_count),
                revenue: parseFloat(row.revenue)
            });
        });
        sheet1.getColumn('revenue').numFmt = '#,##0';

        // Sheet 2
        const sheet2 = workbook.addWorksheet('Sản phẩm bán chạy');
        sheet2.columns = [
            { header: 'Sản phẩm', key: 'ten_sp', width: 35 },
            { header: 'Màu sắc', key: 'mau_sac_chon', width: 15 },
            { header: 'Bộ nhớ', key: 'dung_luong_chon', width: 15 },
            { header: 'Số lượng bán', key: 'quantity', width: 15 }
        ];
        sheet2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF388E3C' } };
        bestSellers.forEach(row => {
            sheet2.addRow({
                ten_sp: row.ten_sp,
                mau_sac_chon: row.mau_sac_chon || 'Mặc định',
                dung_luong_chon: row.dung_luong_chon || 'Mặc định',
                quantity: parseInt(row.quantity)
            });
        });

        // Sheet 3
        const sheet3 = workbook.addWorksheet('Lợi nhuận');
        sheet3.columns = [
            { header: 'Tháng', key: 'month_str', width: 15 },
            { header: 'Doanh thu (VNĐ)', key: 'revenue', width: 25 },
            { header: 'Giá vốn (VNĐ)', key: 'cost', width: 25 },
            { header: 'Lợi nhuận (VNĐ)', key: 'profit', width: 25 }
        ];
        sheet3.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE65100' } };
        profitData.forEach(row => {
            const rev = parseFloat(row.revenue);
            const cost = parseFloat(row.cost);
            sheet3.addRow({
                month_str: row.month_str,
                revenue: rev,
                cost: cost,
                profit: rev - cost
            });
        });
        sheet3.getColumn('revenue').numFmt = '#,##0';
        sheet3.getColumn('cost').numFmt = '#,##0';
        sheet3.getColumn('profit').numFmt = '#,##0';

        // Auto width adjustments
        [sheet1, sheet2, sheet3].forEach(s => {
            s.views = [{ state: 'frozen', ySplit: 1 }];
        });

        // Build file name e.g. BaoCaoDoanhThu_2026_06.xlsx
        const now = new Date();
        const y = year || now.getFullYear();
        const m = String(month || (now.getMonth() + 1)).padStart(2, '0');
        const filename = `BaoCaoDoanhThu_${y}_${m}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Excel Export Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. GET /api/admin/reports/export/word
router.get('/export/word', checkAdmin, checkPermission(['nav-revenue-report', 'nav-profit-report']), async (req, res) => {
    try {
        const { period = 'month', fromDate, toDate, year, month } = req.query;
        const { start, end } = getDateRange(period, fromDate, toDate, year, month);
        const periodLabel = getPeriodLabel(period, fromDate, toDate, year, month);

        // Fetch Data for Word
        const [[summary]] = await pool.query(`
            SELECT 
                COUNT(dh.ma_don) as total_orders,
                COALESCE(SUM(dh.tong_tien), 0) as total_revenue,
                COALESCE((
                    SELECT SUM(ct.so_luong) 
                    FROM chi_tiet_don_hang ct
                    JOIN don_hang d ON ct.ma_don = d.ma_don
                    WHERE d.thoi_gian >= ? AND d.thoi_gian <= ? AND d.trang_thai != 'cancelled'
                ), 0) as total_products_sold
            FROM don_hang dh
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ? AND dh.trang_thai != 'cancelled'
        `, [start, end, start, end]);

        const [bestSellers] = await pool.query(`
            SELECT sp.ten_sp, ct.mau_sac_chon, ct.dung_luong_chon, SUM(ct.so_luong) as quantity, SUM(ct.so_luong * ct.gia) as revenue
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ? AND dh.trang_thai != 'cancelled'
            GROUP BY sp.ma_sp, ct.mau_sac_chon, ct.dung_luong_chon
            ORDER BY quantity DESC
            LIMIT 10
        `, [start, end]);

        const [[profitSummary]] = await pool.query(`
            SELECT 
                COALESCE(SUM(ct.so_luong * ct.gia), 0) as total_revenue,
                COALESCE(SUM(ct.so_luong * ct.gia_nhap), 0) as total_cost
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            WHERE dh.thoi_gian >= ? AND dh.thoi_gian <= ? AND dh.trang_thai != 'cancelled'
        `, [start, end]);

        const totalRevenue = parseFloat(profitSummary.total_revenue);
        const totalCost = parseFloat(profitSummary.total_cost);
        const totalProfit = totalRevenue - totalCost;

        // E. Fetch AI suggestions
        const aiAdvice = await getAiAdvice('profit', {
            periodLabel,
            totalRevenue,
            totalCost,
            totalProfit,
            margin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0',
            topProducts: bestSellers.map(b => ({
                ten_sp: b.ten_sp,
                mau_sac_chon: b.mau_sac_chon,
                dung_luong_chon: b.dung_luong_chon,
                quantity_sold: b.quantity,
                profit: b.revenue // approximating for simplification
            }))
        });

        // DOCX Generation
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    // Header
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: "CỬA HÀNG DI ĐỘNG QUANGHUNG MOBILE", bold: true, size: 24, color: "1976D2" }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: `BÁO CÁO KẾT QUẢ KINH DOANH`, bold: true, size: 36 }),
                        ],
                        spacing: { before: 200, after: 100 }
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: `Thời kỳ báo cáo: ${periodLabel}`, italic: true, size: 20 }),
                        ],
                        spacing: { after: 300 }
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')} | Đơn vị tính: VNĐ`, italic: true, size: 18 }),
                        ],
                        spacing: { after: 300 }
                    }),

                    // Section 1: Tổng quan
                    new Paragraph({
                        heading: HeadingLevel.HEADING_2,
                        children: [
                            new TextRun({ text: "1. Tổng quan tình hình kinh doanh", bold: true, color: "0D47A1" })
                        ],
                        spacing: { before: 200, after: 100 }
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `- Tổng số hóa đơn đã hoàn thành: `, bold: true }),
                            new TextRun({ text: `${summary.total_orders} đơn hàng` }),
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `- Tổng sản phẩm điện thoại bán ra: `, bold: true }),
                            new TextRun({ text: `${summary.total_products_sold} chiếc` }),
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `- Tổng doanh thu bán hàng: `, bold: true }),
                            new TextRun({ text: `${new Intl.NumberFormat('vi-VN').format(summary.total_revenue)} VNĐ` }),
                        ]
                    }),

                    // Section 2: Sản phẩm bán chạy
                    new Paragraph({
                        heading: HeadingLevel.HEADING_2,
                        children: [
                            new TextRun({ text: "2. Danh sách sản phẩm bán chạy nhất", bold: true, color: "0D47A1" })
                        ],
                        spacing: { before: 300, after: 100 }
                    }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            // Table Header
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Sản phẩm", bold: true })] })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Màu sắc", bold: true })] })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Bộ nhớ", bold: true })] })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Số lượng bán", bold: true })] })] })
                                ]
                            }),
                            // Table Body
                            ...bestSellers.map(row => new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ text: row.ten_sp })] }),
                                    new TableCell({ children: [new Paragraph({ text: row.mau_sac_chon || 'Mặc định' })] }),
                                    new TableCell({ children: [new Paragraph({ text: row.dung_luong_chon || 'Mặc định' })] }),
                                    new TableCell({ children: [new Paragraph({ text: String(row.quantity) })] })
                                ]
                            }))
                        ]
                    }),

                    // Section 3: Lợi nhuận
                    new Paragraph({
                        heading: HeadingLevel.HEADING_2,
                        children: [
                            new TextRun({ text: "3. Thống kê Chi phí & Lợi nhuận gộp", bold: true, color: "0D47A1" })
                        ],
                        spacing: { before: 300, after: 100 }
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `- Tổng doanh thu bán hàng: `, bold: true }),
                            new TextRun({ text: `${new Intl.NumberFormat('vi-VN').format(totalRevenue)} VNĐ` }),
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `- Tổng chi phí giá vốn (COGS): `, bold: true }),
                            new TextRun({ text: `${new Intl.NumberFormat('vi-VN').format(totalCost)} VNĐ` }),
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `- Tổng lợi nhuận gộp thực tế: `, bold: true }),
                            new TextRun({ text: `${new Intl.NumberFormat('vi-VN').format(totalProfit)} VNĐ` }),
                        ]
                    }),
                    new Paragraph({
                        children: [
                            new TextRun({ text: `- Tỷ suất lợi nhuận gộp: `, bold: true }),
                            new TextRun({ text: `${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%` }),
                        ]
                    }),

                    // Section 4: AI Recommendations
                    new Paragraph({
                        heading: HeadingLevel.HEADING_2,
                        children: [
                            new TextRun({ text: "4. Nhận định & Đề xuất Chiến lược từ Trợ lý AI", bold: true, color: "0D47A1" })
                        ],
                        spacing: { before: 300, after: 100 }
                    }),
                    ...aiAdvice.split('\n').filter(line => line.trim().length > 0).map(line => {
                        const cleanLine = line.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, '');
                        return new Paragraph({
                            children: [
                                new TextRun({ text: "• ", bold: true }),
                                new TextRun({ text: cleanLine })
                            ]
                        });
                    })
                ]
            }]
        });

        // Filename e.g. BaoCaoKinhDoanh_Thang06.docx
        const now = new Date();
        const m = String(month || (now.getMonth() + 1)).padStart(2, '0');
        const filename = `BaoCaoKinhDoanh_Thang${m}.docx`;

        const buffer = await Packer.toBuffer(doc);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(buffer);
    } catch (error) {
        console.error('Word Export Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
