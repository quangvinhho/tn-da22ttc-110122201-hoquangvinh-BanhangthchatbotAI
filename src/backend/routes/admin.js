// API routes cho Admin Dashboard
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs'); // Thêm bcrypt để băm mật khẩu nhân viên

// Khởi tạo bảng chi tiêu hằng ngày và loại chi tiêu nếu chưa có
async function initExpenditureTables() {
    try {
        // 1. Tạo bảng loai_chi_tieu
        await pool.query(`
            CREATE TABLE IF NOT EXISTS loai_chi_tieu (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ten_loai VARCHAR(100) NOT NULL UNIQUE,
                mo_ta VARCHAR(255),
                ngay_tao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed default categories if empty
        const [rows] = await pool.query('SELECT COUNT(*) as count FROM loai_chi_tieu');
        if (rows[0].count === 0) {
            const defaultCategories = [
                ['Tiền điện', 'Chi phí tiền điện vận hành cửa hàng'],
                ['Tiền nước', 'Chi phí tiền nước sinh hoạt'],
                ['Mặt bằng', 'Chi phí thuê mặt bằng cửa hàng'],
                ['Lương nhân viên', 'Chi phí lương và thưởng nhân viên'],
                ['Mua sắm thiết bị', 'Chi phí mua sắm thiết bị, cơ sở vật chất'],
                ['Chi phí khác', 'Các khoản chi phí vận hành khác']
            ];
            for (const cat of defaultCategories) {
                await pool.query('INSERT INTO loai_chi_tieu (ten_loai, mo_ta) VALUES (?, ?)', cat);
            }
            console.log('✅ Đã nạp danh mục chi tiêu mặc định');
        }

        // 2. Tạo bảng chi_tieu_hang_ngay
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chi_tieu_hang_ngay (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ngay DATE NOT NULL,
                so_tien DECIMAL(15, 2) NOT NULL,
                muc_dich VARCHAR(255) NOT NULL,
                loai_id INT,
                nguoi_chi VARCHAR(100),
                ghi_chu TEXT,
                ngay_tao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_chi_tieu_loai FOREIGN KEY (loai_id) REFERENCES loai_chi_tieu(id) ON DELETE SET NULL
            )
        `);

        // Kiểm tra cột loai_id đã có chưa để alter
        const [cols] = await pool.query("SHOW COLUMNS FROM chi_tieu_hang_ngay WHERE Field = 'loai_id'");
        if (cols.length === 0) {
            await pool.query("ALTER TABLE chi_tieu_hang_ngay ADD COLUMN loai_id INT");
            await pool.query("ALTER TABLE chi_tieu_hang_ngay ADD CONSTRAINT fk_chi_tieu_loai FOREIGN KEY (loai_id) REFERENCES loai_chi_tieu(id) ON DELETE SET NULL");
            console.log('✅ Đã thêm cột loai_id và khóa ngoại vào bảng chi_tieu_hang_ngay');
        }

        console.log('✅ Bảng chi_tieu_hang_ngay và loai_chi_tieu đã sẵn sàng');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo bảng chi tiêu:', err);
    }
}
initExpenditureTables();

async function initPayrollTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bang_luong (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ma_nv INT NOT NULL,
                thang VARCHAR(7) NOT NULL,
                luong_co_ban DECIMAL(15, 2) NOT NULL,
                so_ca_lam INT DEFAULT 0,
                so_phut_tre INT DEFAULT 0,
                tong_phat_tre DECIMAL(15, 2) DEFAULT 0.00,
                luong_thuc_linh DECIMAL(15, 2) NOT NULL,
                trang_thai ENUM('chua_thanh_toan', 'da_thanh_toan') DEFAULT 'chua_thanh_toan',
                ngay_tinh TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_bang_luong_nv FOREIGN KEY (ma_nv) REFERENCES nhan_vien(ma_nv) ON DELETE CASCADE,
                UNIQUE KEY unique_nv_thang (ma_nv, thang)
            )
        `);
        console.log('✅ Bảng bang_luong đã sẵn sàng');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo bảng bang_luong:', err);
    }
}
initPayrollTable();

// ==================== COLOR HELPER (dùng chung cho POST/PUT product) ====================
// Map tên màu thường dùng → hex. Dùng để auto-generate hex khi admin chỉ nhập tên.
const COLOR_NAME_TO_HEX = {
    'đen': '#1C1C1C', 'den': '#1C1C1C', 'black': '#1C1C1C',
    'trắng': '#FFFFFF', 'trang': '#FFFFFF', 'white': '#FFFFFF',
    'xanh': '#1976D2', 'xanh dương': '#1976D2', 'xanh duong': '#1976D2', 'blue': '#1976D2',
    'xanh lá': '#388E3C', 'xanh la': '#388E3C', 'green': '#388E3C',
    'xanh navy': '#1A237E', 'navy': '#1A237E',
    'xanh ngọc': '#00BCD4', 'xanh ngoc': '#00BCD4',
    'đỏ': '#D32F2F', 'do': '#D32F2F', 'red': '#D32F2F',
    'hồng': '#E91E63', 'hong': '#E91E63', 'pink': '#E91E63',
    'tím': '#7B1FA2', 'tim': '#7B1FA2', 'purple': '#7B1FA2',
    'vàng': '#FBC02D', 'vang': '#FBC02D', 'yellow': '#FBC02D',
    'cam': '#F57C00', 'orange': '#F57C00',
    'xám': '#616161', 'xam': '#616161', 'gray': '#616161', 'grey': '#616161',
    'bạc': '#C0C0C0', 'bac': '#C0C0C0', 'silver': '#C0C0C0',
    'vàng đồng': '#B8860B', 'gold': '#B8860B', 'rose gold': '#B76E79',
    'titan tự nhiên': '#A8A29E', 'titan tu nhien': '#A8A29E', 'natural titanium': '#A8A29E',
    'titan trắng': '#E8E8E8', 'titan trang': '#E8E8E8', 'white titanium': '#E8E8E8',
    'titan xanh': '#3B4B59', 'blue titanium': '#3B4B59',
    'titan đen': '#1C1C1C', 'titan den': '#1C1C1C', 'black titanium': '#1C1C1C',
    'graphite': '#2D2926',
    'cream': '#FAF0E6', 'kem': '#FAF0E6',
    'midnight': '#1C1C1C'
};

function extractColorAndHex(str) {
    if (!str) return { name: '', hex: null };
    const trimmed = String(str).trim();
    const match = trimmed.match(/^(.*?)\s*\(?\s*(#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3})\s*\)?$/i);
    if (match) {
        const namePart = match[1].trim();
        const hexPart = match[2];
        return {
            name: namePart || 'Màu tùy chỉnh',
            hex: hexPart
        };
    }
    return {
        name: trimmed,
        hex: COLOR_NAME_TO_HEX[trimmed.toLowerCase()] || null
    };
}

function colorNameToHex(name) {
    const { hex } = extractColorAndHex(name);
    return hex;
}

/**
 * Chuẩn hóa input `mau_sac` từ frontend thành cấu trúc thống nhất để lưu DB.
 *
 * Input có thể là (frontend hiện đang gửi #1):
 *   1. JSON string của mảng tên: '["Đen","Trắng"]'
 *   2. JSON string của object: '{"colorNames":["Đen"],"colors":["#000"]}'
 *   3. Mảng tên trực tiếp: ["Đen","Trắng"]
 *   4. Chuỗi đơn: "Đen, Trắng"
 *   5. null/undefined
 *
 * Output (JSON string lưu vào san_pham.mau_sac):
 *   '{"colorNames":["Đen","Trắng"],"colors":["#1C1C1C","#FFFFFF"]}'
 *   (hex có thể null nếu không khớp map → frontend tự hiển thị placeholder)
 */
function normalizeColorData(mau_sac, ten_mau_sac) {
    if (!mau_sac && !ten_mau_sac) return null;

    let parsed = null;
    if (typeof mau_sac === 'string') {
        const trimmed = mau_sac.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try { parsed = JSON.parse(trimmed); } catch (_) { parsed = trimmed; }
        } else {
            parsed = trimmed;
        }
    } else if (Array.isArray(mau_sac) || (mau_sac && typeof mau_sac === 'object')) {
        parsed = mau_sac;
    }

    let names = [];
    let hexes = [];

    if (Array.isArray(parsed)) {
        for (const item of parsed) {
            const { name, hex } = extractColorAndHex(item);
            names.push(name);
            hexes.push(hex);
        }
    } else if (parsed && typeof parsed === 'object') {
        let tempNames = [];
        let tempColors = [];
        if (Array.isArray(parsed.colorNames)) {
            tempNames = parsed.colorNames.map(s => String(s));
        }
        if (Array.isArray(parsed.colors)) {
            tempColors = parsed.colors.map(s => String(s));
        }

        if (tempNames.length === 0 && tempColors.length > 0) {
            tempNames = tempColors;
        }

        for (let i = 0; i < tempNames.length; i++) {
            const nameItem = tempNames[i];
            const colorItem = tempColors[i];
            
            const extracted = extractColorAndHex(nameItem);
            let finalName = extracted.name;
            let finalHex = extracted.hex;

            if (colorItem && colorItem.startsWith('#')) {
                finalHex = colorItem;
            } else if (colorItem) {
                const extractedColor = extractColorAndHex(colorItem);
                if (extractedColor.hex) {
                    finalHex = extractedColor.hex;
                }
            }

            names.push(finalName);
            hexes.push(finalHex);
        }
    } else if (typeof parsed === 'string') {
        const parts = parsed.split(',').map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
            const { name, hex } = extractColorAndHex(part);
            names.push(name);
            hexes.push(hex);
        }
    }

    // Override hex bằng `ten_mau_sac` nếu frontend gửi (FE cũ → hex riêng)
    if (ten_mau_sac) {
        try {
            const explicitNames = typeof ten_mau_sac === 'string' ? JSON.parse(ten_mau_sac) : ten_mau_sac;
            if (Array.isArray(explicitNames) && explicitNames.length > 0) {
                names = explicitNames.map(s => {
                    const { name } = extractColorAndHex(s);
                    return name;
                });
            }
        } catch (_) { /* ignore */ }
    }

    if (names.length === 0) return null;
    return JSON.stringify({ colorNames: names, colors: hexes });
}

// ==================== MIDDLEWARE XÁC THỰC ADMIN ====================
// Các route KHÔNG cần xác thực admin (public)
const publicPaths = [
    { method: 'POST', path: '/contacts' },     // Form liên hệ từ khách hàng
    { method: 'GET', path: '/settings/public' }, // Cài đặt hiển thị công khai
    { method: 'GET', path: '/settings' }         // Cài đặt hiển thị (non-sensitive)
];

// Middleware kiểm tra quyền admin cho TẤT CẢ routes
const checkAdmin = (req, res, next) => {
    // Bỏ qua kiểm tra cho các route public
    const isPublic = publicPaths.some(p => 
        req.method === p.method && req.path === p.path
    );
    if (isPublic) return next();

    // Kiểm tra session admin
    if (!req.session || !req.session.user) {
        if (process.env.NODE_ENV !== 'production') {
            console.log('❌ Admin auth failed: no session');
        }
        return res.status(401).json({
            success: false,
            message: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
            code: 'AUTH_REQUIRED'
        });
    }

    if (req.session.user.vai_tro !== 'admin') {
        if (process.env.NODE_ENV !== 'production') {
            console.log('❌ Admin auth failed: role =', req.session.user.vai_tro);
        }
        return res.status(403).json({
            success: false,
            message: 'Bạn không có quyền truy cập chức năng này.',
            code: 'ADMIN_REQUIRED'
        });
    }

    console.log('✅ Admin authenticated:', req.session.user.tai_khoan);
    next();
};

// Middleware kiểm tra quyền SuperAdmin (chỉ dành cho tính năng nhạy cảm)
const checkSuperAdmin = (req, res, next) => {
    if (req.session.user.quyen !== 'superadmin') {
        return res.status(403).json({ 
            success: false, 
            message: 'Chỉ Chủ cửa hàng (SuperAdmin) mới có quyền thực hiện thao tác này.',
            code: 'SUPERADMIN_REQUIRED'
        });
    }
    next();
};

// Middleware kiểm tra quyền truy cập module chi tiết (dành cho nhân viên) hoặc SuperAdmin
const checkPermission = (moduleName) => {
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

        if (Array.isArray(allowed) && allowed.includes(moduleName)) {
            return next();
        }

        return res.status(403).json({
            success: false,
            message: `Bạn không có quyền thực hiện chức năng này (yêu cầu quyền: ${moduleName}).`,
            code: 'PERMISSION_DENIED'
        });
    };
};

// Áp dụng middleware cho TẤT CẢ routes trong router này
router.use(checkAdmin);

// Cau hinh multer de upload anh
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../frontend/images/products');
        // Tao thu muc neu chua co
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Tao ten file duy nhat
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'product-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp|avif/;
        const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mime = allowedTypes.test(file.mimetype);
        if (ext && mime) {
            return cb(null, true);
        }
        cb(new Error('Chi chap nhan file anh (jpg, png, gif, webp, avif)'));
    }
});

// ==================== UPLOAD IMAGE ====================

// POST /api/admin/upload - Upload anh dai dien san pham
router.post('/upload', (req, res) => {
    upload.single('image')(req, res, function(err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            return res.status(400).json({ success: false, message: 'Loi upload: ' + err.message });
        } else if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Khong co file duoc upload' });
        }
        
        // Tra ve URL tuong doi
        const imageUrl = 'images/products/' + req.file.filename;
        console.log('Uploaded file:', imageUrl);
        res.json({ 
            success: true, 
            message: 'Upload thanh cong',
            url: imageUrl,
            filename: req.file.filename
        });
    });
});

// POST /api/admin/upload-gallery - Upload anh mo ta san pham
router.post('/upload-gallery', (req, res) => {
    upload.single('image')(req, res, async function(err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            return res.status(400).json({ success: false, message: 'Loi upload: ' + err.message });
        } else if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Khong co file duoc upload' });
        }
        
        const productId = req.body.productId;
        if (!productId) {
            return res.status(400).json({ success: false, message: 'Thieu productId' });
        }
        
        // Tra ve URL tuong doi
        const imageUrl = 'images/products/' + req.file.filename;
        console.log('Uploaded gallery image:', imageUrl, 'for product:', productId);
        
        // Luu vao bang anh_san_pham
        try {
            await pool.query(
                'INSERT INTO anh_san_pham (ma_sp, duong_dan) VALUES (?, ?)',
                [productId, imageUrl]
            );
            
            res.json({ 
                success: true, 
                message: 'Upload thanh cong',
                url: imageUrl,
                filename: req.file.filename,
                productId: productId
            });
        } catch (dbError) {
            console.error('Error saving to database:', dbError);
            res.status(500).json({ success: false, message: 'Loi luu vao database: ' + dbError.message });
        }
    });
});

// ==================== ADMIN PROFILE ====================

// GET /api/admin/profile/:id - Lấy thông tin admin từ database
router.get('/profile/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [admins] = await pool.query(
            'SELECT ma_admin, tai_khoan, ho_ten, quyen, avt FROM admin WHERE ma_admin = ?',
            [id]
        );
        
        if (admins.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy admin' });
        }
        
        res.json({ success: true, data: admins[0] });
    } catch (error) {
        console.error('Error getting admin profile:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/profile-by-account/:account - Lấy thông tin admin theo tài khoản
router.get('/profile-by-account/:account', async (req, res) => {
    try {
        const { account } = req.params;
        
        const [admins] = await pool.query(
            'SELECT ma_admin, tai_khoan, ho_ten, quyen, avt FROM admin WHERE tai_khoan = ?',
            [account]
        );
        
        if (admins.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy admin' });
        }
        
        res.json({ success: true, data: admins[0] });
    } catch (error) {
        console.error('Error getting admin profile:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/profile/:id - Cập nhật thông tin admin
router.put('/profile/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ho_ten, avt } = req.body;
        
        let updateFields = [];
        let updateValues = [];
        
        if (ho_ten) {
            updateFields.push('ho_ten = ?');
            updateValues.push(ho_ten);
        }
        if (avt !== undefined) {
            updateFields.push('avt = ?');
            updateValues.push(avt);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'Không có dữ liệu để cập nhật' });
        }
        
        updateValues.push(id);
        await pool.query(
            `UPDATE admin SET ${updateFields.join(', ')} WHERE ma_admin = ?`,
            updateValues
        );
        
        // Lấy thông tin mới
        const [admins] = await pool.query(
            'SELECT ma_admin, tai_khoan, ho_ten, quyen, avt FROM admin WHERE ma_admin = ?',
            [id]
        );
        
        res.json({ success: true, message: 'Cập nhật thành công', data: admins[0] });
    } catch (error) {
        console.error('Error updating admin profile:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ORDERS ====================

// GET /api/admin/orders - Lấy tất cả đơn hàng (bao gồm thông tin đặt cọc + nhân viên xử lý)
router.get('/orders', async (req, res) => {
    try {
        const [orders] = await pool.query(`
            SELECT dh.*, 
                   nv.ho_ten AS ten_nhan_vien_xu_ly,
                   (SELECT COUNT(*) FROM chi_tiet_don_hang WHERE ma_don = dh.ma_don) as so_san_pham
            FROM don_hang dh
            LEFT JOIN nhan_vien nv ON dh.ma_nv_xu_ly = nv.ma_nv
            ORDER BY dh.thoi_gian DESC
        `);
        
        // Lấy thông tin thanh toán cho mỗi đơn hàng (bao gồm đặt cọc)
        const ordersWithPayment = await Promise.all(orders.map(async (order) => {
            const [payments] = await pool.query(
                `SELECT * FROM thanh_toan WHERE ma_don = ? ORDER BY ma_tt ASC`,
                [order.ma_don]
            );
            
            // Xử lý thông tin đặt cọc
            let depositInfo = null;
            let mainPayment = payments[0] || null;
            
            const depositPayment = payments.find(p => p.phuong_thuc && p.phuong_thuc.includes('_DEPOSIT'));
            const remainingPayment = payments.find(p => p.phuong_thuc === 'COD_REMAINING');
            
            if (depositPayment) {
                depositInfo = {
                    isDeposit: true,
                    depositAmount: parseFloat(depositPayment.so_tien) || 0,
                    depositStatus: depositPayment.trang_thai,
                    depositMethod: depositPayment.phuong_thuc.replace('_DEPOSIT', ''),
                    remainingAmount: remainingPayment ? parseFloat(remainingPayment.so_tien) : 0,
                    remainingStatus: remainingPayment ? remainingPayment.trang_thai : null
                };
                mainPayment = depositPayment;
            }
            
            return {
                ...order,
                phuong_thuc: mainPayment?.phuong_thuc || null,
                trang_thai_thanh_toan: mainPayment?.trang_thai || null,
                depositInfo: depositInfo
            };
        }));
        
        res.json({ success: true, data: ordersWithPayment });
    } catch (error) {
        console.error('Error getting orders:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/orders/:id/status - Cập nhật trạng thái đơn hàng
router.put('/orders/:id/status', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { status } = req.body;
        
        // Lấy trạng thái cũ của đơn hàng để kiểm tra
        const [orders] = await connection.query(
            'SELECT trang_thai, ma_km, ma_kh FROM don_hang WHERE ma_don = ?',
            [id]
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        }
        
        const oldStatus = orders[0].trang_thai;
        const maKm = orders[0].ma_km;
        const maKh = orders[0].ma_kh;
        
        await connection.query('UPDATE don_hang SET trang_thai = ? WHERE ma_don = ?', [status, id]);
        
        // Gửi email cập nhật trạng thái đơn hàng (không block admin response)
        try {
            const { sendOrderStatusUpdate } = require('../services/emailService');
            sendOrderStatusUpdate(id, status).catch(err => console.error('[Email Admin] sendOrderStatusUpdate error:', err));
        } catch (e) {
            console.error('[Email Admin] Lỗi require emailService:', e);
        }

        // Tự động kích hoạt bảo hành điện tử nếu đơn hàng hoàn thành
        if (status === 'completed') {
            try {
                const { createWarrantiesForOrder } = require('../services/warrantyService');
                createWarrantiesForOrder(id).catch(err => console.error('[Warranty Admin] createWarrantiesForOrder error:', err));
            } catch (e) {
                console.error('[Warranty Admin] Lỗi require warrantyService:', e);
            }
        }
        
        // Nếu đơn hàng đã giao/hoàn thành, cập nhật tất cả thanh toán thành công
        if (status === 'delivered' || status === 'completed') {
            // Cập nhật thanh toán COD thông thường
            await connection.query(
                "UPDATE thanh_toan SET trang_thai = 'success' WHERE ma_don = ? AND phuong_thuc = 'COD'",
                [id]
            );
            
            // Cập nhật thanh toán phần còn lại (COD_REMAINING) cho đơn đặt cọc
            await connection.query(
                "UPDATE thanh_toan SET trang_thai = 'success', thoi_gian = NOW() WHERE ma_don = ? AND phuong_thuc = 'COD_REMAINING'",
                [id]
            );
            
            console.log(`Order ${id} completed - all payments marked as success`);
        }
        
        // Nếu chuyển sang trạng thái cancelled và trước đó không phải cancelled
        // => Hoàn lại số lượng tồn kho và voucher
        if (status === 'cancelled' && oldStatus !== 'cancelled') {
            // Hoàn lại số lượng tồn kho (cả product-level, variant-level và IMEI)
            const [orderItems] = await connection.query(
                'SELECT ma_ct_don, ma_sp, ma_bt, so_luong FROM chi_tiet_don_hang WHERE ma_don = ?',
                [id]
            );

            let imeiRestoredTotal = 0;
            for (const item of orderItems) {
                if (item.ma_bt) {
                    // 1. Cộng lại tồn variant-level
                    await connection.query(
                        'UPDATE bien_the_san_pham SET so_luong = so_luong + ? WHERE ma_bt = ?',
                        [item.so_luong, item.ma_bt]
                    );
                    // 2. Sync tổng tồn kho ở san_pham
                    await connection.query(
                        `UPDATE san_pham sp
                         SET so_luong_ton = (
                           SELECT COALESCE(SUM(so_luong), 0)
                           FROM bien_the_san_pham
                           WHERE ma_sp = sp.ma_sp AND trang_thai = 'active'
                         )
                         WHERE sp.ma_sp = ?`,
                        [item.ma_sp]
                    );
                } else {
                    // Không có variant -> cộng tồn kho tổng trực tiếp
                    await connection.query(
                        'UPDATE san_pham SET so_luong_ton = so_luong_ton + ? WHERE ma_sp = ?',
                        [item.so_luong, item.ma_sp]
                    );
                }

                // 3. Trả IMEI về kho (in_stock), clear liên kết đơn
                const [imeiRes] = await connection.query(
                    `UPDATE imei_san_pham
                     SET trang_thai = 'in_stock', ma_ct_don = NULL, ngay_ban = NULL
                     WHERE ma_ct_don = ? AND trang_thai = 'sold'`,
                    [item.ma_ct_don]
                );
                imeiRestoredTotal += imeiRes.affectedRows || 0;
            }
            console.log(`Order ${id} cancelled - Stock restored for ${orderItems.length} items, IMEIs restored: ${imeiRestoredTotal}`);
            
            // Hoàn lại voucher nếu có & khôi phục voucher người dùng
            if (maKm) {
                await connection.query(
                    'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
                    [maKm]
                );
                console.log(`Voucher refunded for cancelled order. Updated so_luong_da_dung for ma_km=${maKm}`);
                if (maKh) {
                    await connection.query(
                        'UPDATE voucher_nguoi_dung SET da_su_dung = 0 WHERE ma_kh = ? AND ma_km = ?',
                        [maKh, maKm]
                    );
                }
            }
            
            // Hoàn lại tất cả voucher phụ đã dùng trong đơn hàng (từ bảng lich_su_voucher)
            try {
                const [usedVouchers] = await connection.query(
                    'SELECT DISTINCT ma_km FROM lich_su_voucher WHERE ma_don = ?',
                    [id]
                );
                for (const v of usedVouchers) {
                    if (v.ma_km && v.ma_km !== maKm) {
                        await connection.query(
                            'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
                            [v.ma_km]
                        );
                        console.log(`Additional voucher refunded: ma_km=${v.ma_km}`);
                        if (maKh) {
                            await connection.query(
                                'UPDATE voucher_nguoi_dung SET da_su_dung = 0 WHERE ma_kh = ? AND ma_km = ?',
                                [maKh, v.ma_km]
                            );
                        }
                    }
                }
                // Xóa lịch sử sử dụng voucher để người dùng có thể áp dụng lại mã
                await connection.query(
                    'DELETE FROM lich_su_voucher WHERE ma_don = ?',
                    [id]
                );
            } catch (e) {
                console.log('Could not refund additional vouchers:', e.message);
            }
            
            // Cập nhật trạng thái thanh toán
            await connection.query(
                "UPDATE thanh_toan SET trang_thai = 'failed' WHERE ma_don = ?",
                [id]
            );
        }
        
        await connection.commit();
        connection.release();
        
        res.json({ success: true, message: 'Cập nhật trạng thái thành công' });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error updating order status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/orders/:id/cancel - Hủy đơn hàng với lý do
router.put('/orders/:id/cancel', async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const { id } = req.params;
        const { reason } = req.body;
        
        if (!reason) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Vui lòng nhập lý do hủy đơn' });
        }
        
        // Lấy thông tin đơn hàng
        const [orders] = await connection.query(
            'SELECT trang_thai, ma_km, ma_kh FROM don_hang WHERE ma_don = ?',
            [id]
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        }
        
        const oldStatus = orders[0].trang_thai;
        const maKm = orders[0].ma_km;
        const maKh = orders[0].ma_kh;
        
        // Kiểm tra nếu đã cancelled rồi thì không xử lý nữa
        if (oldStatus === 'cancelled') {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Đơn hàng đã bị hủy trước đó' });
        }
        
        // Cập nhật trạng thái và lý do hủy
        await connection.query(
            'UPDATE don_hang SET trang_thai = ?, ly_do_huy = ? WHERE ma_don = ?', 
            ['cancelled', reason, id]
        );
        
        // Gửi email thông báo hủy đơn hàng (không block admin response)
        try {
            const { sendOrderStatusUpdate } = require('../services/emailService');
            sendOrderStatusUpdate(id, 'cancelled').catch(err => console.error('[Email Admin] sendOrderStatusUpdate error:', err));
        } catch (e) {
            console.error('[Email Admin] Lỗi require emailService:', e);
        }
        
        // Hoàn lại số lượng tồn kho (cả product-level, variant-level và IMEI)
        const [orderItems] = await connection.query(
            'SELECT ma_ct_don, ma_sp, ma_bt, so_luong FROM chi_tiet_don_hang WHERE ma_don = ?',
            [id]
        );

        let imeiRestoredTotal = 0;
        for (const item of orderItems) {
            if (item.ma_bt) {
                // 1. Cộng lại tồn variant-level
                await connection.query(
                    'UPDATE bien_the_san_pham SET so_luong = so_luong + ? WHERE ma_bt = ?',
                    [item.so_luong, item.ma_bt]
                );
                // 2. Sync tổng tồn kho ở san_pham
                await connection.query(
                    `UPDATE san_pham sp
                     SET so_luong_ton = (
                       SELECT COALESCE(SUM(so_luong), 0)
                       FROM bien_the_san_pham
                       WHERE ma_sp = sp.ma_sp AND trang_thai = 'active'
                     )
                     WHERE sp.ma_sp = ?`,
                    [item.ma_sp]
                );
            } else {
                // Không có variant -> cộng tồn kho tổng trực tiếp
                await connection.query(
                    'UPDATE san_pham SET so_luong_ton = so_luong_ton + ? WHERE ma_sp = ?',
                    [item.so_luong, item.ma_sp]
                );
            }
            // 3. Trả IMEI về kho (in_stock), clear liên kết đơn
            const [imeiRes] = await connection.query(
                `UPDATE imei_san_pham
                 SET trang_thai = 'in_stock', ma_ct_don = NULL, ngay_ban = NULL
                 WHERE ma_ct_don = ? AND trang_thai = 'sold'`,
                [item.ma_ct_don]
            );
            imeiRestoredTotal += imeiRes.affectedRows || 0;
        }
        console.log(`Order ${id} cancelled - Stock restored for ${orderItems.length} items, IMEIs restored: ${imeiRestoredTotal}`);
        
        // Hoàn lại voucher nếu có & khôi phục voucher người dùng
        if (maKm) {
            await connection.query(
                'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
                [maKm]
            );
            console.log(`Voucher refunded for cancelled order. Updated so_luong_da_dung for ma_km=${maKm}`);
            if (maKh) {
                await connection.query(
                    'UPDATE voucher_nguoi_dung SET da_su_dung = 0 WHERE ma_kh = ? AND ma_km = ?',
                    [maKh, maKm]
                );
            }
        }
        
        // Hoàn lại tất cả voucher phụ đã dùng trong đơn hàng (từ bảng lich_su_voucher)
        try {
            const [usedVouchers] = await connection.query(
                'SELECT DISTINCT ma_km FROM lich_su_voucher WHERE ma_don = ?',
                [id]
            );
            for (const v of usedVouchers) {
                if (v.ma_km && v.ma_km !== maKm) {
                    await connection.query(
                        'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
                        [v.ma_km]
                    );
                    console.log(`Additional voucher refunded: ma_km=${v.ma_km}`);
                    if (maKh) {
                        await connection.query(
                            'UPDATE voucher_nguoi_dung SET da_su_dung = 0 WHERE ma_kh = ? AND ma_km = ?',
                            [maKh, v.ma_km]
                        );
                    }
                }
            }
            // Xóa lịch sử sử dụng voucher để người dùng có thể áp dụng lại mã
            await connection.query(
                'DELETE FROM lich_su_voucher WHERE ma_don = ?',
                [id]
            );
        } catch (e) {
            console.log('Could not refund additional vouchers:', e.message);
        }
        
        // Cập nhật trạng thái thanh toán
        await connection.query(
            "UPDATE thanh_toan SET trang_thai = 'failed' WHERE ma_don = ?",
            [id]
        );
        
        await connection.commit();
        connection.release();
        
        res.json({ success: true, message: 'Đã hủy đơn hàng thành công' });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== CUSTOMERS ====================

// GET /api/admin/customers - Lấy tất cả khách hàng
router.get('/customers', checkPermission('nav-customers'), async (req, res) => {
    try {
        const [customers] = await pool.query(`
            SELECT kh.*,
                   (SELECT COUNT(*) FROM don_hang WHERE ma_kh = kh.ma_kh) as so_don_hang,
                   (SELECT COALESCE(SUM(tong_tien), 0) FROM don_hang WHERE ma_kh = kh.ma_kh) as tong_chi_tieu
            FROM khach_hang kh
            ORDER BY kh.ma_kh DESC
        `);
        
        // Remove password from response
        const safeCustomers = customers.map(c => {
            const { mat_khau, ...customer } = c;
            return customer;
        });
        
        res.json({ success: true, data: safeCustomers });
    } catch (error) {
        console.error('Error getting customers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/customers/:id - Lấy chi tiết khách hàng
router.get('/customers/:id', checkPermission('nav-customers'), async (req, res) => {
    try {
        const { id } = req.params;
        
        const [customers] = await pool.query(`
            SELECT kh.*,
                   (SELECT COUNT(*) FROM don_hang WHERE ma_kh = kh.ma_kh) as so_don_hang,
                   (SELECT COALESCE(SUM(tong_tien), 0) FROM don_hang WHERE ma_kh = kh.ma_kh) as tong_chi_tieu
            FROM khach_hang kh
            WHERE kh.ma_kh = ?
        `, [id]);
        
        if (customers.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
        }
        
        const { mat_khau, ...customer } = customers[0];
        
        // Get customer orders
        const [orders] = await pool.query(`
            SELECT * FROM don_hang WHERE ma_kh = ? ORDER BY thoi_gian DESC LIMIT 10
        `, [id]);
        
        res.json({ success: true, data: { ...customer, orders } });
    } catch (error) {
        console.error('Error getting customer:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/customers/:id/status - Khóa/Mở khóa tài khoản khách hàng
router.put('/customers/:id/status', checkPermission('nav-customers'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['active', 'locked'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
        }
        
        // Kiểm tra khách hàng tồn tại
        const [customers] = await pool.query('SELECT ma_kh, ho_ten FROM khach_hang WHERE ma_kh = ?', [id]);
        if (customers.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
        }
        
        await pool.query('UPDATE khach_hang SET trang_thai = ? WHERE ma_kh = ?', [status, id]);
        
        const action = status === 'locked' ? 'khóa' : 'mở khóa';
        console.log(`Customer ${id} (${customers[0].ho_ten}) has been ${action}`);
        
        res.json({ 
            success: true, 
            message: `Đã ${action} tài khoản thành công`,
            data: { ma_kh: id, trang_thai: status }
        });
    } catch (error) {
        console.error('Error updating customer status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/customers/:id - Xóa khách hàng
router.delete('/customers/:id', checkPermission('nav-customers'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Kiểm tra khách hàng tồn tại
        const [customers] = await pool.query('SELECT ma_kh, ho_ten FROM khach_hang WHERE ma_kh = ?', [id]);
        if (customers.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng' });
        }
        
        // Kiểm tra xem có đơn hàng không
        const [orders] = await pool.query('SELECT COUNT(*) as count FROM don_hang WHERE ma_kh = ?', [id]);
        if (orders[0].count > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Không thể xóa khách hàng này vì đã có ${orders[0].count} đơn hàng. Hãy khóa tài khoản thay vì xóa.` 
            });
        }
        
        // Xóa các dữ liệu liên quan trước
        await pool.query('DELETE FROM gio_hang WHERE ma_kh = ?', [id]);
        await pool.query('DELETE FROM danh_gia WHERE ma_kh = ?', [id]);
        await pool.query('DELETE FROM dia_chi WHERE ma_kh = ?', [id]);
        
        // Xóa khách hàng
        await pool.query('DELETE FROM khach_hang WHERE ma_kh = ?', [id]);
        
        console.log(`Customer ${id} (${customers[0].ho_ten}) has been deleted`);
        
        res.json({ success: true, message: 'Đã xóa khách hàng thành công' });
    } catch (error) {
        console.error('Error deleting customer:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== REVIEWS ====================

// GET /api/admin/reviews - Lấy tất cả đánh giá
router.get('/reviews', async (req, res) => {
    try {
        const [reviews] = await pool.query(`
            SELECT dg.*, kh.ho_ten, kh.avt, sp.ten_sp
            FROM danh_gia dg
            LEFT JOIN khach_hang kh ON dg.ma_kh = kh.ma_kh
            LEFT JOIN san_pham sp ON dg.ma_sp = sp.ma_sp
            ORDER BY dg.ngay_danh_gia DESC
        `);
        
        res.json({ success: true, data: reviews });
    } catch (error) {
        console.error('Error getting reviews:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/reviews/:id - Xóa đánh giá
router.delete('/reviews/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM danh_gia WHERE ma_dg = ?', [id]);
        res.json({ success: true, message: 'Đã xóa đánh giá' });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== STATISTICS ====================

// GET /api/admin/stats - Lấy thống kê tổng quan
router.get('/stats', async (req, res) => {
    try {
        // Total revenue
        const [[{ total_revenue }]] = await pool.query(
            "SELECT COALESCE(SUM(tong_tien), 0) as total_revenue FROM don_hang WHERE trang_thai != 'cancelled'"
        );
        
        // Total orders
        const [[{ total_orders }]] = await pool.query('SELECT COUNT(*) as total_orders FROM don_hang');
        
        // Total customers
        const [[{ total_customers }]] = await pool.query('SELECT COUNT(*) as total_customers FROM khach_hang');
        
        // Total products
        const [[{ total_products }]] = await pool.query('SELECT COUNT(*) as total_products FROM san_pham');
        
        // Pending orders
        const [[{ pending_orders }]] = await pool.query(
            "SELECT COUNT(*) as pending_orders FROM don_hang WHERE trang_thai = 'pending'"
        );
        
        // Monthly revenue
        const [monthlyRevenue] = await pool.query(`
            SELECT MONTH(thoi_gian) as month, SUM(tong_tien) as revenue
            FROM don_hang
            WHERE YEAR(thoi_gian) = YEAR(CURDATE()) AND trang_thai != 'cancelled'
            GROUP BY MONTH(thoi_gian)
            ORDER BY month
        `);
        
        // Orders by status
        const [ordersByStatus] = await pool.query(`
            SELECT trang_thai, COUNT(*) as count
            FROM don_hang
            GROUP BY trang_thai
        `);
        
        res.json({
            success: true,
            data: {
                total_revenue,
                total_orders,
                total_customers,
                total_products,
                pending_orders,
                monthly_revenue: monthlyRevenue,
                orders_by_status: ordersByStatus
            }
        });
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/stats/top-products - Top sản phẩm bán chạy
router.get('/stats/top-products', async (req, res) => {
    try {
        const [products] = await pool.query(`
            SELECT sp.*, hsx.ten_hang, COALESCE(SUM(ct.so_luong), 0) as total_sold
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            LEFT JOIN chi_tiet_don_hang ct ON sp.ma_sp = ct.ma_sp
            LEFT JOIN don_hang dh ON ct.ma_don = dh.ma_don AND dh.trang_thai != 'cancelled'
            GROUP BY sp.ma_sp
            ORDER BY total_sold DESC
            LIMIT 10
        `);
        
        res.json({ success: true, data: products });
    } catch (error) {
        console.error('Error getting top products:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== PRODUCTS MANAGEMENT ====================

// Gọi sang RAG Service để đồng bộ dữ liệu sản phẩm tự động
async function syncRAGProducts() {
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (process.env.ADMIN_TOKEN) {
            headers['X-Admin-Token'] = process.env.ADMIN_TOKEN;
        }
        await fetch('http://127.0.0.1:8000/api/reload-vectorstore', { 
            method: 'POST',
            headers
        });
        console.log('Đã tự động đồng bộ RAG Vectorstore sau khi cập nhật sản phẩm');
    } catch (error) {
        console.log('RAG service hiện không chạy, bỏ qua đồng bộ tự động.');
    }
}

// GET /api/admin/products - Lấy tất cả sản phẩm với thông tin chi tiết
router.get('/products', async (req, res) => {
    try {
        const [products] = await pool.query(`
            SELECT sp.*, hsx.ten_hang as brand,
                   bh.thoi_gian_bh, bh.dieu_kien as dieu_kien_bh,
                   (SELECT COUNT(*) FROM danh_gia WHERE ma_sp = sp.ma_sp) as review_count,
                   (SELECT AVG(so_sao) FROM danh_gia WHERE ma_sp = sp.ma_sp) as avg_rating
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            LEFT JOIN bao_hanh_san_pham bh ON sp.ma_sp = bh.ma_sp
            ORDER BY sp.ma_sp DESC
        `);
        
        // Fetch all variants to map them to products for instant frontend filtering & warning badges
        const [variants] = await pool.query(`
            SELECT ma_bt, ma_sp, mau_sac, mau_hex, dung_luong, so_luong, gia_chenh, sku, trang_thai
            FROM bien_the_san_pham
        `);
        
        // Group variants by product ID
        const variantsByProduct = {};
        variants.forEach(v => {
            if (!variantsByProduct[v.ma_sp]) {
                variantsByProduct[v.ma_sp] = [];
            }
            variantsByProduct[v.ma_sp].push(v);
        });
        
        // Attach variants to products
        products.forEach(p => {
            p.variants = variantsByProduct[p.ma_sp] || [];
        });
        
        res.json({ success: true, data: products });
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/products - Thêm sản phẩm mới (kèm thông số kỹ thuật)
router.post('/products', async (req, res) => {
    try {
        const { ten_sp, ma_hang, gia, gia_nhap, gia_giam, bo_nho, so_luong_ton, mau_sac, ten_mau_sac, mo_ta_ngan, mo_ta, anh_dai_dien, cau_hinh, trang_thai, bao_hanh } = req.body;

        // Validation
        if (!ten_sp || !ten_sp.trim()) {
            return res.status(400).json({ success: false, message: 'Tên sản phẩm không được để trống' });
        }

        const price = parseFloat(gia);
        if (price === undefined || isNaN(price) || price <= 0) {
            return res.status(400).json({ success: false, message: 'Giá sản phẩm phải lớn hơn 0' });
        }

        const importPrice = (gia_nhap !== undefined && gia_nhap !== null && gia_nhap !== '') ? parseFloat(gia_nhap) : (price * 0.7);
        if (importPrice < 0) {
            return res.status(400).json({ success: false, message: 'Giá nhập không được âm' });
        }

        const discountPrice = (gia_giam !== undefined && gia_giam !== null && gia_giam !== '') ? parseFloat(gia_giam) : null;
        if (discountPrice !== null && discountPrice < 0) {
            return res.status(400).json({ success: false, message: 'Giá giảm không được âm' });
        }
        if (discountPrice && discountPrice >= price) {
            return res.status(400).json({ success: false, message: 'Giá giảm phải nhỏ hơn giá gốc' });
        }

        const stock = parseInt(so_luong_ton) || 0;
        if (stock < 0) {
            return res.status(400).json({ success: false, message: 'Số lượng tồn kho không được âm' });
        }

        // Validate trạng thái (chỉ 3 mức được phép)
        const validStatuses = ['active', 'out_of_stock', 'discontinued'];
        const status = validStatuses.includes(trang_thai) ? trang_thai : 'active';

        // Chuẩn hóa dữ liệu màu: lưu đồng nhất {colorNames:[], colors:[hex]}
        const colorData = normalizeColorData(mau_sac, ten_mau_sac);

        // Thêm sản phẩm (ngay_cap_nhat sẽ tự động set bởi MySQL DEFAULT CURRENT_TIMESTAMP)
        const [result] = await pool.query(
            `INSERT INTO san_pham (ten_sp, ma_hang, gia, gia_nhap, gia_giam, bo_nho, so_luong_ton, mau_sac, mo_ta_ngan, mo_ta, anh_dai_dien, trang_thai)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ten_sp, ma_hang, gia, importPrice, discountPrice, bo_nho || '128GB', stock, colorData, mo_ta_ngan, mo_ta, anh_dai_dien, status]
        );
        
        const productId = result.insertId;

        // Thêm thông tin bảo hành sản phẩm
        const warrantyMonths = (bao_hanh && bao_hanh.thoi_gian_bh !== undefined) ? parseInt(bao_hanh.thoi_gian_bh) : 12;
        const warrantyConditions = (bao_hanh && bao_hanh.dieu_kien !== undefined) ? bao_hanh.dieu_kien : null;
        await pool.query(
            `INSERT INTO bao_hanh_san_pham (ma_sp, thoi_gian_bh, dieu_kien) VALUES (?, ?, ?)`,
            [productId, warrantyMonths, warrantyConditions]
        );
        
        // Thêm thông số kỹ thuật vào bảng cau_hinh nếu có
        if (cau_hinh && (cau_hinh.ram || cau_hinh.chip || cau_hinh.man_hinh || cau_hinh.camera || cau_hinh.pin || cau_hinh.he_dieu_hanh)) {
            await pool.query(
                `INSERT INTO cau_hinh (ma_sp, ram, chip, man_hinh, camera, pin, he_dieu_hanh) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [productId, cau_hinh.ram || null, cau_hinh.chip || null, cau_hinh.man_hinh || null, 
                 cau_hinh.camera || null, cau_hinh.pin || null, cau_hinh.he_dieu_hanh || null]
            );
        }
        
        syncRAGProducts(); // Tự động đồng bộ RAG

        // [MỚI] Auto: gửi email "Sản phẩm mới phù hợp" cho top 50 KH match (chạy nền, không block response)
        setImmediate(async () => {
            try {
                const { notifyMatchingCustomers } = require('../services/emailService');
                const result = await notifyMatchingCustomers(productId, { limit: 50, sendImmediate: true });
                console.log(`[Admin] Auto-notify new product #${productId}:`, result);
            } catch (e) {
                console.error('[Admin] Auto-notify error:', e.message);
            }
        });

        res.json({ success: true, message: 'Thêm sản phẩm thành công', data: { id: productId } });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/products/:id/notify-customers - Trigger manual hoặc dryRun để preview KH match
router.post('/products/:id/notify-customers', async (req, res) => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.body?.limit) || 50;
        const dryRun = req.body?.dryRun === true || req.body?.dryRun === 'true';

        const { notifyMatchingCustomers, findMatchingCustomers } = require('../services/emailService');

        if (dryRun) {
            const data = await findMatchingCustomers(id, { limit });
            return res.json({ success: true, dryRun: true, data });
        }

        const result = await notifyMatchingCustomers(id, { limit, sendImmediate: true });
        res.json({ success: true, dryRun: false, data: result });
    } catch (error) {
        console.error('Error notify-customers endpoint:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/email-logs - Liệt kê lịch sử email đã gửi
router.get('/email-logs', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const wheres = [];
        const params = [];

        if (req.query.loai_email) {
            wheres.push('el.loai_email = ?');
            params.push(req.query.loai_email);
        }
        if (req.query.ma_sp) {
            wheres.push('el.ma_sp = ?');
            params.push(parseInt(req.query.ma_sp));
        }
        if (req.query.ma_kh) {
            wheres.push('el.ma_kh = ?');
            params.push(parseInt(req.query.ma_kh));
        }
        if (req.query.trang_thai) {
            wheres.push('el.trang_thai = ?');
            params.push(req.query.trang_thai);
        }
        if (req.query.from) {
            wheres.push('el.ngay_gui >= ?');
            params.push(req.query.from);
        }
        if (req.query.to) {
            wheres.push('el.ngay_gui <= ?');
            params.push(req.query.to);
        }

        const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

        const [totalRows] = await pool.query(
            `SELECT COUNT(*) AS total FROM email_log el ${whereSql}`,
            params
        );
        const total = totalRows[0].total;

        const [rows] = await pool.query(
            `SELECT el.ma_log, el.email_nhan, el.loai_email, el.ma_kh, el.ma_sp, el.ma_don,
                    el.tieu_de, el.trang_thai, el.error_msg, el.ngay_gui,
                    kh.ho_ten AS ten_kh,
                    sp.ten_sp
             FROM email_log el
             LEFT JOIN khach_hang kh ON el.ma_kh = kh.ma_kh
             LEFT JOIN san_pham sp ON el.ma_sp = sp.ma_sp
             ${whereSql}
             ORDER BY el.ngay_gui DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({
            success: true,
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        console.error('Error /email-logs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/products/:id/specs - Lấy thông số kỹ thuật của sản phẩm
router.get('/products/:id/specs', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM cau_hinh WHERE ma_sp = ?', [id]);
        
        // Lấy thêm thông tin bảo hành
        const [warrantyRows] = await pool.query('SELECT * FROM bao_hanh_san_pham WHERE ma_sp = ?', [id]);
        
        const data = rows.length > 0 ? rows[0] : {};
        if (warrantyRows.length > 0) {
            data.thoi_gian_bh = warrantyRows[0].thoi_gian_bh;
            data.dieu_kien_bh = warrantyRows[0].dieu_kien;
        } else {
            data.thoi_gian_bh = 12; // default
            data.dieu_kien_bh = '';
        }
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error getting product specs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/products/:id/gallery - Lấy danh sách ảnh mô tả sản phẩm
router.get('/products/:id/gallery', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT ma_anh, duong_dan FROM anh_san_pham WHERE ma_sp = ?', [id]);
        
        const images = rows.map(row => row.duong_dan.startsWith('images/') ? row.duong_dan : `images/${row.duong_dan}`);
        
        res.json({ success: true, images: images });
    } catch (error) {
        console.error('Error getting product gallery:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/products/:id/gallery - Xóa tất cả ảnh gallery của sản phẩm
router.delete('/products/:id/gallery', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM anh_san_pham WHERE ma_sp = ?', [id]);
        res.json({ success: true, message: 'Đã xóa tất cả ảnh gallery' });
    } catch (error) {
        console.error('Error deleting product gallery:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/products/:id/gallery - Cập nhật danh sách ảnh gallery
router.put('/products/:id/gallery', async (req, res) => {
    try {
        const { id } = req.params;
        const { images } = req.body; // Mảng các URL ảnh cần giữ lại
        
        // Xóa tất cả ảnh cũ
        await pool.query('DELETE FROM anh_san_pham WHERE ma_sp = ?', [id]);
        
        // Thêm lại các ảnh được giữ
        if (images && images.length > 0) {
            for (const imgUrl of images) {
                await pool.query('INSERT INTO anh_san_pham (ma_sp, duong_dan) VALUES (?, ?)', [id, imgUrl]);
            }
        }
        
        res.json({ success: true, message: 'Cập nhật gallery thành công' });
    } catch (error) {
        console.error('Error updating product gallery:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/products/:id/specs - Cập nhật thông số kỹ thuật riêng
router.put('/products/:id/specs', async (req, res) => {
    try {
        const { id } = req.params;
        const { ram, chip, man_hinh, camera, pin, he_dieu_hanh, thoi_gian_bh, dieu_kien_bh } = req.body;

        // Kiểm tra đã có cấu hình chưa
        const [existing] = await pool.query('SELECT * FROM cau_hinh WHERE ma_sp = ?', [id]);

        if (existing.length > 0) {
            // Update cấu hình hiện có
            await pool.query(
                `UPDATE cau_hinh SET ram = ?, chip = ?, man_hinh = ?, camera = ?, pin = ?, he_dieu_hanh = ? WHERE ma_sp = ?`,
                [ram || null, chip || null, man_hinh || null, camera || null, pin || null, he_dieu_hanh || null, id]
            );
        } else {
            // Insert cấu hình mới
            await pool.query(
                `INSERT INTO cau_hinh (ma_sp, ram, chip, man_hinh, camera, pin, he_dieu_hanh)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, ram || null, chip || null, man_hinh || null, camera || null, pin || null, he_dieu_hanh || null]
            );
        }

        // Cập nhật bảo hành nếu thoi_gian_bh được gửi lên
        if (thoi_gian_bh !== undefined) {
            const [existingWarranty] = await pool.query('SELECT * FROM bao_hanh_san_pham WHERE ma_sp = ?', [id]);
            if (existingWarranty.length > 0) {
                await pool.query(
                    `UPDATE bao_hanh_san_pham SET thoi_gian_bh = ?, dieu_kien = ? WHERE ma_sp = ?`,
                    [parseInt(thoi_gian_bh) || 12, dieu_kien_bh || null, id]
                );
            } else {
                await pool.query(
                    `INSERT INTO bao_hanh_san_pham (ma_sp, thoi_gian_bh, dieu_kien) VALUES (?, ?, ?)`,
                    [id, parseInt(thoi_gian_bh) || 12, dieu_kien_bh || null]
                );
            }
        }

        res.json({ success: true, message: 'Cập nhật cấu hình thành công' });
    } catch (error) {
        console.error('Error updating product specs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================================
// BIẾN THỂ SẢN PHẨM (variant: màu × dung lượng × tồn kho riêng)
// ============================================================================

// GET /api/admin/products/:id/variants - Lấy tất cả biến thể của 1 sản phẩm
router.get('/products/:id/variants', async (req, res) => {
    try {
        const { id } = req.params;
        const [variants] = await pool.query(
            `SELECT ma_bt, ma_sp, mau_sac, mau_hex, dung_luong, so_luong, gia_chenh, sku, trang_thai
             FROM bien_the_san_pham
             WHERE ma_sp = ?
             ORDER BY mau_sac ASC, dung_luong ASC`,
            [id]
        );
        res.json({ success: true, data: variants });
    } catch (error) {
        console.error('Error fetching variants:', error && error.message);
        res.status(500).json({ success: false, message: 'Lỗi tải biến thể' });
    }
});

// PUT /api/admin/products/:id/variants - Ghi đè TOÀN BỘ biến thể của sản phẩm
// Body: { variants: [{mau_sac, mau_hex, dung_luong, so_luong, gia_chenh, sku, trang_thai}], syncStock: true }
// Nếu syncStock=true → cập nhật san_pham.so_luong_ton = SUM(variants.so_luong)
router.put('/products/:id/variants', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;
        const { variants, syncStock } = req.body;

        if (!Array.isArray(variants)) {
            return res.status(400).json({ success: false, message: 'variants phải là mảng' });
        }

        // Validate
        const cleaned = [];
        const seen = new Set();
        for (const v of variants) {
            const mau = String(v.mau_sac || '').trim();
            const dl = String(v.dung_luong || '').trim();
            if (!mau || !dl) {
                return res.status(400).json({ success: false, message: 'mau_sac và dung_luong bắt buộc cho mỗi biến thể' });
            }

            // Extract clean name and hex if name contains hex pattern
            const extracted = extractColorAndHex(mau);
            const finalMauSac = extracted.name;
            let finalMauHex = v.mau_hex ? String(v.mau_hex).trim() : null;
            if (!finalMauHex || finalMauHex === 'null') {
                finalMauHex = extracted.hex;
            }

            const key = `${finalMauSac.toLowerCase()}__${dl.toLowerCase()}`;
            if (seen.has(key)) {
                return res.status(400).json({ success: false, message: `Biến thể trùng: ${finalMauSac} - ${dl}` });
            }
            seen.add(key);

            const sl = parseInt(v.so_luong);
            if (Number.isNaN(sl) || sl < 0) {
                return res.status(400).json({ success: false, message: `Số lượng không hợp lệ cho ${finalMauSac} - ${dl}` });
            }
            cleaned.push({
                mau_sac: finalMauSac,
                mau_hex: finalMauHex ? finalMauHex.slice(0, 20) : null,
                dung_luong: dl,
                so_luong: sl,
                gia_chenh: parseFloat(v.gia_chenh) || 0,
                sku: v.sku ? String(v.sku).slice(0, 80) : null,
                trang_thai: v.trang_thai === 'inactive' ? 'inactive' : 'active'
            });
        }

        // Kiểm tra san_pham tồn tại
        const [check] = await connection.query('SELECT ma_sp FROM san_pham WHERE ma_sp = ?', [id]);
        if (check.length === 0) {
            return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });
        }

        await connection.beginTransaction();

        // Xoá cũ, insert lại — đơn giản và chắc chắn
        await connection.query('DELETE FROM bien_the_san_pham WHERE ma_sp = ?', [id]);

        if (cleaned.length > 0) {
            const values = cleaned.map(v => [
                id, v.mau_sac, v.mau_hex, v.dung_luong, v.so_luong, v.gia_chenh, v.sku, v.trang_thai
            ]);
            await connection.query(
                `INSERT INTO bien_the_san_pham (ma_sp, mau_sac, mau_hex, dung_luong, so_luong, gia_chenh, sku, trang_thai) VALUES ?`,
                [values]
            );
        }

        // Sync san_pham.so_luong_ton = SUM(variants.so_luong active)
        if (syncStock !== false) {
            const totalStock = cleaned
                .filter(v => v.trang_thai === 'active')
                .reduce((s, v) => s + v.so_luong, 0);
            await connection.query(
                'UPDATE san_pham SET so_luong_ton = ? WHERE ma_sp = ?',
                [totalStock, id]
            );
        }

        // Sync san_pham.mau_sac based on variants
        let colorNames = [];
        let colors = [];
        const seenColors = new Set();
        for (const v of cleaned) {
            if (v.trang_thai === 'active') {
                const colorKey = v.mau_sac.toLowerCase();
                if (!seenColors.has(colorKey)) {
                    seenColors.add(colorKey);
                    colorNames.push(v.mau_sac);
                    const hexValue = v.mau_hex || colorNameToHex(v.mau_sac) || '#1C1C1C';
                    colors.push(hexValue);
                }
            }
        }
        
        const mauSacJson = colorNames.length > 0 ? JSON.stringify({ colorNames, colors }) : null;
        await connection.query(
            'UPDATE san_pham SET mau_sac = ? WHERE ma_sp = ?',
            [mauSacJson, id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Cập nhật biến thể thành công',
            data: { count: cleaned.length }
        });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        console.error('Error saving variants:', error && error.message);
        res.status(500).json({ success: false, message: 'Lỗi lưu biến thể' });
    } finally {
        connection.release();
    }
});

// PATCH /api/admin/products/:id/variants/:variantId/stock - Điều chỉnh tồn kho 1 biến thể (nhập/xuất)
// Body: { delta: number (có thể âm), reason: string }
router.patch('/products/:id/variants/:variantId/stock', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { id, variantId } = req.params;
        const delta = parseInt(req.body.delta);
        if (Number.isNaN(delta)) {
            return res.status(400).json({ success: false, message: 'delta phải là số' });
        }
        await connection.beginTransaction();

        const [rows] = await connection.query(
            'SELECT so_luong FROM bien_the_san_pham WHERE ma_bt = ? AND ma_sp = ? FOR UPDATE',
            [variantId, id]
        );
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Biến thể không tồn tại' });
        }
        const newStock = Math.max(0, rows[0].so_luong + delta);
        await connection.query(
            'UPDATE bien_the_san_pham SET so_luong = ? WHERE ma_bt = ?',
            [newStock, variantId]
        );

        // Sync tổng tồn kho sản phẩm
        const [sumRow] = await connection.query(
            'SELECT COALESCE(SUM(so_luong), 0) AS total FROM bien_the_san_pham WHERE ma_sp = ? AND trang_thai = "active"',
            [id]
        );
        await connection.query(
            'UPDATE san_pham SET so_luong_ton = ? WHERE ma_sp = ?',
            [sumRow[0].total, id]
        );

        await connection.commit();
        res.json({ success: true, data: { newStock, totalStock: sumRow[0].total } });
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        console.error('Error patching variant stock:', error && error.message);
        res.status(500).json({ success: false, message: 'Lỗi cập nhật tồn kho biến thể' });
    } finally {
        connection.release();
    }
});

// ==================== COLOR IMAGES (ảnh theo màu cho mỗi sản phẩm) ====================

// GET /api/admin/products/:id/color-images?color=Titan%20Đen
router.get('/products/:id/color-images', async (req, res) => {
    try {
        const { id } = req.params;
        const color = req.query.color;
        let rows;
        if (color) {
            [rows] = await pool.query(
                'SELECT ma_anh, ma_sp, mau_sac, duong_dan, thu_tu FROM hinh_anh_bien_the WHERE ma_sp = ? AND mau_sac = ? ORDER BY thu_tu ASC, ma_anh ASC',
                [id, color]
            );
        } else {
            [rows] = await pool.query(
                'SELECT ma_anh, ma_sp, mau_sac, duong_dan, thu_tu FROM hinh_anh_bien_the WHERE ma_sp = ? ORDER BY mau_sac, thu_tu ASC, ma_anh ASC',
                [id]
            );
        }
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error getting color images:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/products/:id/color-images - upload 1 ảnh cho 1 màu
// Form-data: image=<file>, color=<tên màu>
router.post('/products/:id/color-images', (req, res) => {
    upload.single('image')(req, res, async function (err) {
        if (err) {
            console.error('Color image upload error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Không có file' });
        }
        const { id } = req.params;
        const color = (req.body.color || '').trim();
        if (!color) {
            return res.status(400).json({ success: false, message: 'Thiếu tên màu' });
        }
        const imageUrl = 'images/products/' + req.file.filename;
        try {
            const [result] = await pool.query(
                'INSERT INTO hinh_anh_bien_the (ma_sp, mau_sac, duong_dan) VALUES (?, ?, ?)',
                [id, color, imageUrl]
            );
            res.json({
                success: true,
                data: { ma_anh: result.insertId, ma_sp: Number(id), mau_sac: color, duong_dan: imageUrl }
            });
        } catch (dbError) {
            console.error('Error saving color image:', dbError);
            res.status(500).json({ success: false, message: dbError.message });
        }
    });
});

// DELETE /api/admin/products/:id/color-images/:imageId
router.delete('/products/:id/color-images/:imageId', async (req, res) => {
    try {
        const { id, imageId } = req.params;
        const [rows] = await pool.query(
            'SELECT duong_dan FROM hinh_anh_bien_the WHERE ma_anh = ? AND ma_sp = ?',
            [imageId, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh' });
        }
        await pool.query('DELETE FROM hinh_anh_bien_the WHERE ma_anh = ?', [imageId]);
        // Xóa file vật lý (best-effort, không block response)
        try {
            const filePath = path.join(__dirname, '../../frontend', rows[0].duong_dan);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {}
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting color image:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/products/:id - Cập nhật sản phẩm (kèm thông số kỹ thuật)
router.put('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_sp, ma_hang, gia, gia_nhap, gia_giam, bo_nho, so_luong_ton, mau_sac, ten_mau_sac, mo_ta_ngan, mo_ta, anh_dai_dien, cau_hinh, trang_thai, bao_hanh } = req.body;

        // Validation
        if (!ten_sp || !ten_sp.trim()) {
            return res.status(400).json({ success: false, message: 'Tên sản phẩm không được để trống' });
        }

        const price = parseFloat(gia);
        if (price === undefined || isNaN(price) || price <= 0) {
            return res.status(400).json({ success: false, message: 'Giá sản phẩm phải lớn hơn 0' });
        }

        const importPrice = (gia_nhap !== undefined && gia_nhap !== null && gia_nhap !== '') ? parseFloat(gia_nhap) : (price * 0.7);
        if (importPrice < 0) {
            return res.status(400).json({ success: false, message: 'Giá nhập không được âm' });
        }

        const discountPrice = (gia_giam !== undefined && gia_giam !== null && gia_giam !== '') ? parseFloat(gia_giam) : null;
        if (discountPrice !== null && discountPrice < 0) {
            return res.status(400).json({ success: false, message: 'Giá giảm không được âm' });
        }
        if (discountPrice && discountPrice >= price) {
            return res.status(400).json({ success: false, message: 'Giá giảm phải nhỏ hơn giá gốc' });
        }

        const stock = parseInt(so_luong_ton) || 0;
        if (stock < 0) {
            return res.status(400).json({ success: false, message: 'Số lượng tồn kho không được âm' });
        }

        // Validate trạng thái — nếu client không gửi → giữ nguyên giá trị cũ (không ép default)
        const validStatuses = ['active', 'out_of_stock', 'discontinued'];
        const status = validStatuses.includes(trang_thai) ? trang_thai : null;

        // Chuẩn hóa dữ liệu màu (xem normalizeColorData ở đầu file)
        const colorData = normalizeColorData(mau_sac, ten_mau_sac);

        // [MỚI] Đọc tồn kho cũ để detect back-in-stock (0 → >0)
        let oldStock = 0;
        try {
            const [oldRows] = await pool.query('SELECT so_luong_ton FROM san_pham WHERE ma_sp = ?', [id]);
            oldStock = parseInt(oldRows[0]?.so_luong_ton) || 0;
        } catch (e) { /* ignore */ }

        // Cập nhật sản phẩm — nếu status null thì không sửa trang_thai cũ
        if (status) {
            await pool.query(
                `UPDATE san_pham SET ten_sp = ?, ma_hang = ?, gia = ?, gia_nhap = ?, gia_giam = ?, bo_nho = ?,
                 so_luong_ton = ?, mau_sac = ?, mo_ta_ngan = ?, mo_ta = ?, anh_dai_dien = ?, trang_thai = ? WHERE ma_sp = ?`,
                [ten_sp, ma_hang, gia, importPrice, discountPrice, bo_nho, so_luong_ton, colorData, mo_ta_ngan, mo_ta, anh_dai_dien, status, id]
            );
        } else {
            await pool.query(
                `UPDATE san_pham SET ten_sp = ?, ma_hang = ?, gia = ?, gia_nhap = ?, gia_giam = ?, bo_nho = ?,
                 so_luong_ton = ?, mau_sac = ?, mo_ta_ngan = ?, mo_ta = ?, anh_dai_dien = ? WHERE ma_sp = ?`,
                [ten_sp, ma_hang, gia, importPrice, discountPrice, bo_nho, so_luong_ton, colorData, mo_ta_ngan, mo_ta, anh_dai_dien, id]
            );
        }

        // [AUTO] Back-in-stock trigger: 0 → >0
        if (oldStock === 0 && stock > 0) {
            setImmediate(async () => {
                try {
                    const { notifyBackInStock } = require('../services/emailService');
                    const r = await notifyBackInStock(id);
                    console.log(`[Back-in-stock] product=${id}:`, r);
                } catch (e) {
                    console.error('[Back-in-stock] error:', e.message);
                }
            });
        }

        // Cập nhật bảo hành
        if (bao_hanh) {
            const thoi_gian_bh = bao_hanh.thoi_gian_bh !== undefined ? parseInt(bao_hanh.thoi_gian_bh) : 12;
            const dieu_kien_bh = bao_hanh.dieu_kien !== undefined ? bao_hanh.dieu_kien : null;

            // Kiểm tra đã có bảo hành chưa
            const [existingWarranty] = await pool.query('SELECT * FROM bao_hanh_san_pham WHERE ma_sp = ?', [id]);
            if (existingWarranty.length > 0) {
                await pool.query(
                    `UPDATE bao_hanh_san_pham SET thoi_gian_bh = ?, dieu_kien = ? WHERE ma_sp = ?`,
                    [thoi_gian_bh, dieu_kien_bh, id]
                );
            } else {
                await pool.query(
                    `INSERT INTO bao_hanh_san_pham (ma_sp, thoi_gian_bh, dieu_kien) VALUES (?, ?, ?)`,
                    [id, thoi_gian_bh, dieu_kien_bh]
                );
            }
        }
        
        // Cập nhật thông số kỹ thuật nếu có
        if (cau_hinh) {
            // Kiểm tra đã có cấu hình chưa
            const [existing] = await pool.query('SELECT * FROM cau_hinh WHERE ma_sp = ?', [id]);
            
            if (existing.length > 0) {
                // Update cấu hình hiện có
                await pool.query(
                    `UPDATE cau_hinh SET ram = ?, chip = ?, man_hinh = ?, camera = ?, pin = ?, he_dieu_hanh = ? WHERE ma_sp = ?`,
                    [cau_hinh.ram || null, cau_hinh.chip || null, cau_hinh.man_hinh || null, 
                     cau_hinh.camera || null, cau_hinh.pin || null, cau_hinh.he_dieu_hanh || null, id]
                );
            } else if (cau_hinh.ram || cau_hinh.chip || cau_hinh.man_hinh || cau_hinh.camera || cau_hinh.pin || cau_hinh.he_dieu_hanh) {
                // Insert cấu hình mới
                await pool.query(
                    `INSERT INTO cau_hinh (ma_sp, ram, chip, man_hinh, camera, pin, he_dieu_hanh) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [id, cau_hinh.ram || null, cau_hinh.chip || null, cau_hinh.man_hinh || null, 
                     cau_hinh.camera || null, cau_hinh.pin || null, cau_hinh.he_dieu_hanh || null]
                );
            }
        }
        
        syncRAGProducts(); // Tự động đồng bộ RAG
        
        res.json({ success: true, message: 'Cập nhật sản phẩm thành công' });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/products/:id - Xóa sản phẩm
router.delete('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Kiểm tra sản phẩm có trong đơn hàng không
        const [orders] = await pool.query('SELECT COUNT(*) as count FROM chi_tiet_don_hang WHERE ma_sp = ?', [id]);
        if (orders[0].count > 0) {
            return res.status(400).json({ success: false, message: 'Không thể xóa sản phẩm đã có trong đơn hàng' });
        }
        
        // Xóa cấu hình của sản phẩm
        await pool.query('DELETE FROM cau_hinh WHERE ma_sp = ?', [id]);
        // Xóa ảnh sản phẩm
        await pool.query('DELETE FROM anh_san_pham WHERE ma_sp = ?', [id]);
        // Xóa đánh giá của sản phẩm
        await pool.query('DELETE FROM danh_gia WHERE ma_sp = ?', [id]);
        // Xóa sản phẩm
        await pool.query('DELETE FROM san_pham WHERE ma_sp = ?', [id]);
        
        syncRAGProducts(); // Tự động đồng bộ RAG
        
        res.json({ success: true, message: 'Xóa sản phẩm thành công' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== BRANDS ====================

// GET /api/admin/brands - Lấy danh sách hãng sản xuất
router.get('/brands', async (req, res) => {
    try {
        const [brands] = await pool.query(`
            SELECT h.*, q.ten_quoc_gia, 
                   (SELECT COUNT(*) FROM san_pham WHERE ma_hang = h.ma_hang) as so_san_pham
            FROM hang_san_xuat h
            LEFT JOIN quoc_gia q ON h.ma_quoc_gia = q.ma_quoc_gia
            ORDER BY h.ten_hang
        `);
        res.json({ success: true, data: brands });
    } catch (error) {
        console.error('Error getting brands:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/countries - Lấy danh sách quốc gia
router.get('/countries', async (req, res) => {
    try {
        const [countries] = await pool.query('SELECT * FROM quoc_gia ORDER BY ten_quoc_gia');
        res.json({ success: true, data: countries });
    } catch (error) {
        console.error('Error getting countries:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/brands - Thêm hãng sản xuất mới
router.post('/brands', async (req, res) => {
    try {
        const { ten_hang, ma_quoc_gia } = req.body;
        
        if (!ten_hang) {
            return res.status(400).json({ success: false, message: 'Tên hãng không được để trống' });
        }
        
        const [result] = await pool.query(
            'INSERT INTO hang_san_xuat (ten_hang, ma_quoc_gia) VALUES (?, ?)',
            [ten_hang, ma_quoc_gia || null]
        );
        
        res.json({ 
            success: true, 
            message: 'Thêm hãng thành công',
            data: { id: result.insertId, ten_hang, ma_quoc_gia }
        });
    } catch (error) {
        console.error('Error adding brand:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/brands/:id - Cập nhật hãng sản xuất
router.put('/brands/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_hang, ma_quoc_gia } = req.body;
        
        if (!ten_hang) {
            return res.status(400).json({ success: false, message: 'Tên hãng không được để trống' });
        }
        
        await pool.query(
            'UPDATE hang_san_xuat SET ten_hang = ?, ma_quoc_gia = ? WHERE ma_hang = ?',
            [ten_hang, ma_quoc_gia || null, id]
        );
        
        res.json({ success: true, message: 'Cập nhật hãng thành công' });
    } catch (error) {
        console.error('Error updating brand:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/brands/:id - Xóa hãng sản xuất
router.delete('/brands/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Kiểm tra có sản phẩm nào đang dùng hãng này không
        const [products] = await pool.query('SELECT COUNT(*) as count FROM san_pham WHERE ma_hang = ?', [id]);
        
        if (products[0].count > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Không thể xóa hãng này vì đang có ${products[0].count} sản phẩm thuộc hãng` 
            });
        }
        
        await pool.query('DELETE FROM hang_san_xuat WHERE ma_hang = ?', [id]);
        
        res.json({ success: true, message: 'Xóa hãng thành công' });
    } catch (error) {
        console.error('Error deleting brand:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ORDER DETAILS ====================

// GET /api/admin/orders/:id - Lấy chi tiết đơn hàng (bao gồm thông tin đặt cọc)
router.get('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [orders] = await pool.query(`
            SELECT dh.*, kh.ho_ten as ten_khach_hang, kh.email
            FROM don_hang dh
            LEFT JOIN khach_hang kh ON dh.ma_kh = kh.ma_kh
            WHERE dh.ma_don = ?
        `, [id]);
        
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        }
        
        // Lấy tất cả bản ghi thanh toán của đơn hàng (có thể có nhiều nếu là đặt cọc)
        const [payments] = await pool.query(
            `SELECT * FROM thanh_toan WHERE ma_don = ? ORDER BY ma_tt ASC`,
            [id]
        );
        
        // Xử lý thông tin đặt cọc
        let depositInfo = null;
        let mainPayment = payments[0] || null;
        
        const depositPayment = payments.find(p => p.phuong_thuc && p.phuong_thuc.includes('_DEPOSIT'));
        const remainingPayment = payments.find(p => p.phuong_thuc === 'COD_REMAINING');
        
        if (depositPayment) {
            depositInfo = {
                isDeposit: true,
                depositAmount: parseFloat(depositPayment.so_tien) || 0,
                depositStatus: depositPayment.trang_thai,
                depositMethod: depositPayment.phuong_thuc.replace('_DEPOSIT', ''),
                remainingAmount: remainingPayment ? parseFloat(remainingPayment.so_tien) : 0,
                remainingStatus: remainingPayment ? remainingPayment.trang_thai : null
            };
            mainPayment = depositPayment;
        }
        
        const [items] = await pool.query(`
            SELECT ct.*, sp.ten_sp, sp.anh_dai_dien, sp.mau_sac
            FROM chi_tiet_don_hang ct
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            WHERE ct.ma_don = ?
        `, [id]);
        
        res.json({ 
            success: true, 
            data: { 
                ...orders[0], 
                phuong_thuc: mainPayment?.phuong_thuc || null,
                trang_thai_thanh_toan: mainPayment?.trang_thai || null,
                depositInfo: depositInfo,
                items 
            } 
        });
    } catch (error) {
        console.error('Error getting order detail:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/orders/:id - Xóa đơn hàng
router.delete('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Xóa chi tiết đơn hàng
        await pool.query('DELETE FROM chi_tiet_don_hang WHERE ma_don = ?', [id]);
        // Xóa thanh toán
        await pool.query('DELETE FROM thanh_toan WHERE ma_don = ?', [id]);
        // Xóa đơn hàng
        await pool.query('DELETE FROM don_hang WHERE ma_don = ?', [id]);
        
        res.json({ success: true, message: 'Xóa đơn hàng thành công' });
    } catch (error) {
        console.error('Error deleting order:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== DASHBOARD STATS ====================

// GET /api/admin/dashboard - Lấy dữ liệu dashboard tổng hợp
router.get('/dashboard', async (req, res) => {
    try {
        // Thống kê tổng quan
        const [[stats]] = await pool.query(`
            SELECT 
                (SELECT COALESCE(SUM(tong_tien), 0) FROM don_hang WHERE trang_thai != 'cancelled' AND MONTH(thoi_gian) = MONTH(CURDATE())) as revenue_month,
                (SELECT COUNT(*) FROM don_hang) as total_orders,
                (SELECT COUNT(*) FROM don_hang WHERE trang_thai = 'pending') as pending_orders,
                (SELECT COUNT(*) FROM khach_hang) as total_customers,
                (SELECT COUNT(*) FROM san_pham) as total_products
        `);
        
        // Đơn hàng gần đây
        const [recentOrders] = await pool.query(`
            SELECT dh.*, tt.phuong_thuc
            FROM don_hang dh
            LEFT JOIN thanh_toan tt ON dh.ma_don = tt.ma_don
            ORDER BY dh.thoi_gian DESC
            LIMIT 5
        `);
        
        // Doanh thu theo tháng (năm hiện tại)
        const [monthlyRevenue] = await pool.query(`
            SELECT MONTH(thoi_gian) as month, COALESCE(SUM(tong_tien), 0) as revenue
            FROM don_hang
            WHERE YEAR(thoi_gian) = YEAR(CURDATE()) AND trang_thai != 'cancelled'
            GROUP BY MONTH(thoi_gian)
            ORDER BY month
        `);
        
        // Đơn hàng theo trạng thái
        const [ordersByStatus] = await pool.query(`
            SELECT trang_thai, COUNT(*) as count
            FROM don_hang
            GROUP BY trang_thai
        `);
        
        res.json({
            success: true,
            data: {
                stats,
                recentOrders,
                monthlyRevenue,
                ordersByStatus
            }
        });
    } catch (error) {
        console.error('Error getting dashboard:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ADVANCED DASHBOARD ANALYTICS ====================

// GET /api/admin/dashboard/revenue - Doanh thu theo khoảng thời gian (tuần/tháng/năm)
router.get('/dashboard/revenue', checkSuperAdmin, async (req, res) => {
    try {
        const { period = 'week', year, month } = req.query;
        const currentYear = year || new Date().getFullYear();
        const currentMonth = month || new Date().getMonth() + 1;
        
        let revenueData = [];
        let labels = [];
        let comparison = { current: 0, previous: 0, change: 0 };
        
        if (period === 'week') {
            // Doanh thu 7 ngày gần nhất
            const [dailyRevenue] = await pool.query(`
                SELECT DATE(thoi_gian) as date, 
                       COALESCE(SUM(tong_tien), 0) as revenue,
                       COALESCE(SUM((SELECT SUM(gia_nhap * so_luong) FROM chi_tiet_don_hang WHERE ma_don = dh.ma_don)), 0) as import_cost,
                       COUNT(*) as orders
                FROM don_hang dh
                WHERE thoi_gian >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                AND trang_thai NOT IN ('cancelled')
                GROUP BY DATE(thoi_gian)
                ORDER BY date
            `);

            // Chi tiêu hằng ngày 7 ngày gần nhất
            const [dailyExpenses] = await pool.query(`
                SELECT DATE(ngay) as date, SUM(so_tien) as total_expense
                FROM chi_tieu_hang_ngay
                WHERE ngay >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY DATE(ngay)
            `);
            
            // Tạo mảng 7 ngày
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const found = dailyRevenue.find(d => d.date.toISOString().split('T')[0] === dateStr);
                const foundExpense = dailyExpenses.find(e => e.date.toISOString().split('T')[0] === dateStr);
                const expense = foundExpense ? parseFloat(foundExpense.total_expense) : 0;
                labels.push(date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }));
                revenueData.push({
                    date: dateStr,
                    revenue: found ? parseFloat(found.revenue) : 0,
                    profit: found ? parseFloat(found.revenue) - parseFloat(found.import_cost || 0) - expense : -expense,
                    orders: found ? found.orders : 0
                });
            }
            
            // So sánh với tuần trước
            const [[currentWeek]] = await pool.query(`
                SELECT COALESCE(SUM(tong_tien), 0) as total
                FROM don_hang 
                WHERE thoi_gian >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                AND trang_thai NOT IN ('cancelled')
            `);
            const [[previousWeek]] = await pool.query(`
                SELECT COALESCE(SUM(tong_tien), 0) as total
                FROM don_hang 
                WHERE thoi_gian >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
                AND thoi_gian < DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                AND trang_thai NOT IN ('cancelled')
            `);
            comparison = {
                current: parseFloat(currentWeek.total),
                previous: parseFloat(previousWeek.total),
                change: previousWeek.total > 0 ? ((currentWeek.total - previousWeek.total) / previousWeek.total * 100).toFixed(1) : 0
            };
            
        } else if (period === 'month') {
            // Doanh thu theo ngày trong tháng
            const [dailyRevenue] = await pool.query(`
                SELECT DAY(thoi_gian) as day, 
                       COALESCE(SUM(tong_tien), 0) as revenue,
                       COALESCE(SUM((SELECT SUM(gia_nhap * so_luong) FROM chi_tiet_don_hang WHERE ma_don = dh.ma_don)), 0) as import_cost,
                       COUNT(*) as orders
                FROM don_hang dh
                WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
                AND trang_thai NOT IN ('cancelled')
                GROUP BY DAY(thoi_gian)
                ORDER BY day
            `, [currentYear, currentMonth]);

            // Chi tiêu trong tháng
            const [dailyExpenses] = await pool.query(`
                SELECT DAY(ngay) as day, SUM(so_tien) as total_expense
                FROM chi_tieu_hang_ngay
                WHERE YEAR(ngay) = ? AND MONTH(ngay) = ?
                GROUP BY DAY(ngay)
            `, [currentYear, currentMonth]);
            
            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            for (let i = 1; i <= daysInMonth; i++) {
                const found = dailyRevenue.find(d => d.day === i);
                const foundExpense = dailyExpenses.find(e => e.day === i);
                const expense = foundExpense ? parseFloat(foundExpense.total_expense) : 0;
                labels.push(i.toString());
                revenueData.push({
                    day: i,
                    revenue: found ? parseFloat(found.revenue) : 0,
                    profit: found ? parseFloat(found.revenue) - parseFloat(found.import_cost || 0) - expense : -expense,
                    orders: found ? found.orders : 0
                });
            }
            
            // So sánh với tháng trước
            const [[currentMonthTotal]] = await pool.query(`
                SELECT COALESCE(SUM(tong_tien), 0) as total
                FROM don_hang 
                WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
                AND trang_thai NOT IN ('cancelled')
            `, [currentYear, currentMonth]);
            
            const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
            const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
            const [[previousMonthTotal]] = await pool.query(`
                SELECT COALESCE(SUM(tong_tien), 0) as total
                FROM don_hang 
                WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
                AND trang_thai NOT IN ('cancelled')
            `, [prevYear, prevMonth]);
            
            comparison = {
                current: parseFloat(currentMonthTotal.total),
                previous: parseFloat(previousMonthTotal.total),
                change: previousMonthTotal.total > 0 ? ((currentMonthTotal.total - previousMonthTotal.total) / previousMonthTotal.total * 100).toFixed(1) : 0
            };
            
        } else if (period === 'year') {
            // Doanh thu theo tháng trong năm
            const [monthlyRevenue] = await pool.query(`
                SELECT MONTH(thoi_gian) as month, 
                       COALESCE(SUM(tong_tien), 0) as revenue,
                       COALESCE(SUM((SELECT SUM(gia_nhap * so_luong) FROM chi_tiet_don_hang WHERE ma_don = dh.ma_don)), 0) as import_cost,
                       COUNT(*) as orders
                FROM don_hang dh
                WHERE YEAR(thoi_gian) = ?
                AND trang_thai NOT IN ('cancelled')
                GROUP BY MONTH(thoi_gian)
                ORDER BY month
            `, [currentYear]);

            // Chi tiêu trong năm
            const [monthlyExpenses] = await pool.query(`
                SELECT MONTH(ngay) as month, SUM(so_tien) as total_expense
                FROM chi_tieu_hang_ngay
                WHERE YEAR(ngay) = ?
                GROUP BY MONTH(ngay)
            `, [currentYear]);
            
            const monthNames = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
            for (let i = 1; i <= 12; i++) {
                const found = monthlyRevenue.find(d => d.month === i);
                const foundExpense = monthlyExpenses.find(e => e.month === i);
                const expense = foundExpense ? parseFloat(foundExpense.total_expense) : 0;
                const revenue = found ? parseFloat(found.revenue) : 0;
                const import_cost = found ? parseFloat(found.import_cost || 0) : 0;
                labels.push(monthNames[i - 1]);
                revenueData.push({
                    month: i,
                    revenue: revenue,
                    profit: revenue - import_cost - expense,
                    orders: found ? found.orders : 0
                });
            }
            
            // So sánh với năm trước
            const [[currentYearTotal]] = await pool.query(`
                SELECT COALESCE(SUM(tong_tien), 0) as total
                FROM don_hang 
                WHERE YEAR(thoi_gian) = ?
                AND trang_thai NOT IN ('cancelled')
            `, [currentYear]);
            const [[previousYearTotal]] = await pool.query(`
                SELECT COALESCE(SUM(tong_tien), 0) as total
                FROM don_hang 
                WHERE YEAR(thoi_gian) = ?
                AND trang_thai NOT IN ('cancelled')
            `, [currentYear - 1]);
            
            comparison = {
                current: parseFloat(currentYearTotal.total),
                previous: parseFloat(previousYearTotal.total),
                change: previousYearTotal.total > 0 ? ((currentYearTotal.total - previousYearTotal.total) / previousYearTotal.total * 100).toFixed(1) : 0
            };
        }
        
        res.json({
            success: true,
            data: {
                period,
                labels,
                revenueData,
                comparison,
                year: currentYear,
                month: currentMonth
            }
        });
    } catch (error) {
        console.error('Error getting revenue data:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/dashboard/inventory - Thống kê tồn kho
router.get('/dashboard/inventory', checkSuperAdmin, async (req, res) => {
    try {
        // Tổng quan tồn kho
        const [[inventoryStats]] = await pool.query(`
            SELECT 
                COUNT(*) as total_products,
                SUM(so_luong_ton) as total_stock,
                SUM(CASE WHEN so_luong_ton = 0 THEN 1 ELSE 0 END) as out_of_stock,
                SUM(CASE WHEN so_luong_ton > 0 AND so_luong_ton <= 5 THEN 1 ELSE 0 END) as low_stock,
                SUM(CASE WHEN so_luong_ton > 50 THEN 1 ELSE 0 END) as high_stock,
                SUM(so_luong_ton * gia) as total_inventory_value
            FROM san_pham
        `);
        
        // Tồn kho theo thương hiệu
        const [inventoryByBrand] = await pool.query(`
            SELECT h.ten_hang as brand, 
                   COUNT(sp.ma_sp) as products,
                   COALESCE(SUM(sp.so_luong_ton), 0) as stock,
                   COALESCE(SUM(sp.so_luong_ton * sp.gia), 0) as value
            FROM hang_san_xuat h
            LEFT JOIN san_pham sp ON h.ma_hang = sp.ma_hang
            GROUP BY h.ma_hang, h.ten_hang
            ORDER BY stock DESC
        `);
        
        // Sản phẩm sắp hết hàng (<=5)
        const [lowStockProducts] = await pool.query(`
            SELECT sp.ma_sp, sp.ten_sp, sp.so_luong_ton, sp.gia, sp.anh_dai_dien, h.ten_hang as brand
            FROM san_pham sp
            LEFT JOIN hang_san_xuat h ON sp.ma_hang = h.ma_hang
            WHERE sp.so_luong_ton <= 5
            ORDER BY sp.so_luong_ton ASC
            LIMIT 10
        `);
        
        // Sản phẩm hết hàng
        const [outOfStockProducts] = await pool.query(`
            SELECT sp.ma_sp, sp.ten_sp, sp.gia, sp.anh_dai_dien, h.ten_hang as brand
            FROM san_pham sp
            LEFT JOIN hang_san_xuat h ON sp.ma_hang = h.ma_hang
            WHERE sp.so_luong_ton = 0
            ORDER BY sp.ten_sp
        `);
        
        // Top sản phẩm tồn kho nhiều nhất
        const [highStockProducts] = await pool.query(`
            SELECT sp.ma_sp, sp.ten_sp, sp.so_luong_ton, sp.gia, sp.anh_dai_dien, h.ten_hang as brand,
                   (sp.so_luong_ton * sp.gia) as inventory_value
            FROM san_pham sp
            LEFT JOIN hang_san_xuat h ON sp.ma_hang = h.ma_hang
            ORDER BY sp.so_luong_ton DESC
            LIMIT 10
        `);
        
        res.json({
            success: true,
            data: {
                stats: inventoryStats,
                byBrand: inventoryByBrand,
                lowStock: lowStockProducts,
                outOfStock: outOfStockProducts,
                highStock: highStockProducts
            }
        });
    } catch (error) {
        console.error('Error getting inventory data:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/dashboard/sales-analytics - Phân tích bán hàng chi tiết
router.get('/dashboard/sales-analytics', checkSuperAdmin, async (req, res) => {
    try {
        // Top sản phẩm bán chạy
        const [topProducts] = await pool.query(`
            SELECT sp.ma_sp, sp.ten_sp, sp.anh_dai_dien, sp.gia, h.ten_hang as brand,
                   COALESCE(SUM(ct.so_luong), 0) as total_sold,
                   COALESCE(SUM(ct.so_luong * ct.gia), 0) as total_revenue
            FROM san_pham sp
            LEFT JOIN hang_san_xuat h ON sp.ma_hang = h.ma_hang
            LEFT JOIN chi_tiet_don_hang ct ON sp.ma_sp = ct.ma_sp
            LEFT JOIN don_hang dh ON ct.ma_don = dh.ma_don AND dh.trang_thai NOT IN ('cancelled')
            GROUP BY sp.ma_sp
            ORDER BY total_sold DESC
            LIMIT 10
        `);
        
        // Doanh thu theo thương hiệu
        const [revenueByBrand] = await pool.query(`
            SELECT h.ten_hang as brand,
                   COALESCE(SUM(ct.so_luong * ct.gia), 0) as revenue,
                   COALESCE(SUM(ct.so_luong), 0) as quantity
            FROM hang_san_xuat h
            LEFT JOIN san_pham sp ON h.ma_hang = sp.ma_hang
            LEFT JOIN chi_tiet_don_hang ct ON sp.ma_sp = ct.ma_sp
            LEFT JOIN don_hang dh ON ct.ma_don = dh.ma_don AND dh.trang_thai NOT IN ('cancelled')
            GROUP BY h.ma_hang, h.ten_hang
            ORDER BY revenue DESC
        `);
        
        // Đơn hàng theo trạng thái
        const [ordersByStatus] = await pool.query(`
            SELECT trang_thai, COUNT(*) as count, COALESCE(SUM(tong_tien), 0) as total
            FROM don_hang
            GROUP BY trang_thai
        `);
        
        // Phương thức thanh toán
        const [paymentMethods] = await pool.query(`
            SELECT tt.phuong_thuc, COUNT(*) as count, COALESCE(SUM(tt.so_tien), 0) as total
            FROM thanh_toan tt
            JOIN don_hang dh ON tt.ma_don = dh.ma_don
            WHERE dh.trang_thai NOT IN ('cancelled')
            GROUP BY tt.phuong_thuc
            ORDER BY count DESC
        `);
        
        // Khách hàng mới theo tháng (12 tháng gần nhất)
        const [newCustomers] = await pool.query(`
            SELECT YEAR(ngay_tao) as year, MONTH(ngay_tao) as month, COUNT(*) as count
            FROM khach_hang
            WHERE ngay_tao >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
            GROUP BY YEAR(ngay_tao), MONTH(ngay_tao)
            ORDER BY year, month
        `);
        
        // Giá trị đơn hàng trung bình
        const [[avgOrderValue]] = await pool.query(`
            SELECT 
                AVG(tong_tien) as avg_value,
                MAX(tong_tien) as max_value,
                MIN(tong_tien) as min_value
            FROM don_hang
            WHERE trang_thai NOT IN ('cancelled') AND tong_tien > 0
        `);
        
        res.json({
            success: true,
            data: {
                topProducts,
                revenueByBrand,
                ordersByStatus,
                paymentMethods,
                newCustomers,
                avgOrderValue
            }
        });
    } catch (error) {
        console.error('Error getting sales analytics:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/dashboard/overview - Tổng quan dashboard với so sánh
router.get('/dashboard/overview', checkSuperAdmin, async (req, res) => {
    try {
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();
        
        // Luôn dùng tháng thực tế làm "tháng hiện tại" để hiển thị
        let displayMonth = currentMonth;
        let displayYear = currentYear;
        
        // Tháng trước của tháng hiện tại (xử lý chuyển năm đúng cách)
        const prevMonth = displayMonth === 1 ? 12 : displayMonth - 1;
        const prevYear = displayMonth === 1 ? displayYear - 1 : displayYear;
        
        // Doanh thu tháng hiển thị vs tháng trước
        const [[revenueThisMonth]] = await pool.query(`
            SELECT 
                COALESCE(SUM(tong_tien), 0) as total,
                COALESCE(SUM((SELECT SUM(gia_nhap * so_luong) FROM chi_tiet_don_hang WHERE ma_don = dh.ma_don)), 0) as import_cost
            FROM don_hang dh
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
            AND trang_thai NOT IN ('cancelled')
        `, [displayYear, displayMonth]);
        
        const [[revenueLastMonth]] = await pool.query(`
            SELECT 
                COALESCE(SUM(tong_tien), 0) as total,
                COALESCE(SUM((SELECT SUM(gia_nhap * so_luong) FROM chi_tiet_don_hang WHERE ma_don = dh.ma_don)), 0) as import_cost
            FROM don_hang dh
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
            AND trang_thai NOT IN ('cancelled')
        `, [prevYear, prevMonth]);
        
        // === DOANH THU TUẦN NÀY ===
        const [[revenueThisWeek]] = await pool.query(`
            SELECT 
                COALESCE(SUM(tong_tien), 0) as total, 
                COALESCE(SUM((SELECT SUM(gia_nhap * so_luong) FROM chi_tiet_don_hang WHERE ma_don = dh.ma_don)), 0) as import_cost,
                COUNT(*) as orders
            FROM don_hang dh
            WHERE thoi_gian >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            AND trang_thai NOT IN ('cancelled')
        `);
        
        // Đơn hàng tháng hiển thị vs tháng trước
        const [[ordersThisMonth]] = await pool.query(`
            SELECT COUNT(*) as total
            FROM don_hang 
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
        `, [displayYear, displayMonth]);
        
        const [[ordersLastMonth]] = await pool.query(`
            SELECT COUNT(*) as total
            FROM don_hang 
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
        `, [prevYear, prevMonth]);
        
        // Khách hàng mới tháng hiển thị vs tháng trước
        const [[customersThisMonth]] = await pool.query(`
            SELECT COUNT(*) as total
            FROM khach_hang 
            WHERE YEAR(ngay_tao) = ? AND MONTH(ngay_tao) = ?
        `, [displayYear, displayMonth]);
        
        const [[customersLastMonth]] = await pool.query(`
            SELECT COUNT(*) as total
            FROM khach_hang 
            WHERE YEAR(ngay_tao) = ? AND MONTH(ngay_tao) = ?
        `, [prevYear, prevMonth]);
        
        // Sản phẩm đã bán tháng hiển thị vs tháng trước
        const [[soldThisMonth]] = await pool.query(`
            SELECT COALESCE(SUM(ct.so_luong), 0) as total
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            WHERE YEAR(dh.thoi_gian) = ? AND MONTH(dh.thoi_gian) = ?
            AND dh.trang_thai NOT IN ('cancelled')
        `, [displayYear, displayMonth]);
        
        const [[soldLastMonth]] = await pool.query(`
            SELECT COALESCE(SUM(ct.so_luong), 0) as total
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            WHERE YEAR(dh.thoi_gian) = ? AND MONTH(dh.thoi_gian) = ?
            AND dh.trang_thai NOT IN ('cancelled')
        `, [prevYear, prevMonth]);
        
        // Tổng số liệu
        const [[totals]] = await pool.query(`
            SELECT 
                (SELECT COALESCE(SUM(tong_tien), 0) FROM don_hang WHERE trang_thai NOT IN ('cancelled')) as total_revenue,
                (SELECT COALESCE(SUM(gia_nhap * so_luong), 0) FROM chi_tiet_don_hang ct JOIN don_hang dh ON ct.ma_don = dh.ma_don WHERE dh.trang_thai NOT IN ('cancelled')) as total_import_cost,
                (SELECT COUNT(*) FROM don_hang) as total_orders,
                (SELECT COUNT(*) FROM khach_hang) as total_customers,
                (SELECT COUNT(*) FROM san_pham) as total_products,
                (SELECT COUNT(*) FROM don_hang WHERE trang_thai = 'pending') as pending_orders
        `);
        
        // Đơn hàng gần đây
        const [recentOrders] = await pool.query(`
            SELECT dh.*, tt.phuong_thuc, kh.ho_ten as customer_name
            FROM don_hang dh
            LEFT JOIN thanh_toan tt ON dh.ma_don = tt.ma_don
            LEFT JOIN khach_hang kh ON dh.ma_kh = kh.ma_kh
            ORDER BY dh.thoi_gian DESC
            LIMIT 10
        `);
        
        // === SẢN PHẨM ĐÃ BÁN TRONG THÁNG (chi tiết) ===
        const [productsSoldThisMonth] = await pool.query(`
            SELECT sp.ten_sp, sp.anh_dai_dien, h.ten_hang as brand,
                   SUM(ct.so_luong) as quantity, 
                   SUM(ct.so_luong * ct.gia) as revenue
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            LEFT JOIN hang_san_xuat h ON sp.ma_hang = h.ma_hang
            WHERE YEAR(dh.thoi_gian) = ? AND MONTH(dh.thoi_gian) = ?
            AND dh.trang_thai NOT IN ('cancelled')
            GROUP BY ct.ma_sp, sp.ten_sp, sp.anh_dai_dien, h.ten_hang
            ORDER BY revenue DESC
            LIMIT 10
        `, [displayYear, displayMonth]);
        
        // === SẢN PHẨM ĐÃ BÁN THÁNG TRƯỚC (chi tiết) ===
        console.log('Query tháng trước:', prevYear, prevMonth);
        let [productsSoldLastMonth] = await pool.query(`
            SELECT sp.ten_sp, sp.anh_dai_dien, h.ten_hang as brand,
                   SUM(ct.so_luong) as quantity, 
                   SUM(ct.so_luong * ct.gia) as revenue
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            LEFT JOIN hang_san_xuat h ON sp.ma_hang = h.ma_hang
            WHERE YEAR(dh.thoi_gian) = ? AND MONTH(dh.thoi_gian) = ?
            AND dh.trang_thai NOT IN ('cancelled')
            GROUP BY ct.ma_sp, sp.ten_sp, sp.anh_dai_dien, h.ten_hang
            ORDER BY revenue DESC
            LIMIT 10
        `, [prevYear, prevMonth]);
        console.log('Kết quả tháng trước:', productsSoldLastMonth.length, 'sản phẩm');
        
        // Nếu tháng trước không có dữ liệu, lấy từ tháng gần nhất có đơn hàng
        let lastMonthLabel = { month: prevMonth, year: prevYear };
        if (productsSoldLastMonth.length === 0) {
            const [latestMonth] = await pool.query(`
                SELECT YEAR(dh.thoi_gian) as year, MONTH(dh.thoi_gian) as month
                FROM don_hang dh
                WHERE dh.trang_thai NOT IN ('cancelled')
                AND (YEAR(dh.thoi_gian) < ? OR (YEAR(dh.thoi_gian) = ? AND MONTH(dh.thoi_gian) < ?))
                ORDER BY dh.thoi_gian DESC
                LIMIT 1
            `, [displayYear, displayYear, displayMonth]);
            
            if (latestMonth.length > 0) {
                lastMonthLabel = { month: latestMonth[0].month, year: latestMonth[0].year };
                [productsSoldLastMonth] = await pool.query(`
                    SELECT sp.ten_sp, sp.anh_dai_dien, h.ten_hang as brand,
                           SUM(ct.so_luong) as quantity, 
                           SUM(ct.so_luong * ct.gia) as revenue
                    FROM chi_tiet_don_hang ct
                    JOIN don_hang dh ON ct.ma_don = dh.ma_don
                    JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
                    LEFT JOIN hang_san_xuat h ON sp.ma_hang = h.ma_hang
                    WHERE YEAR(dh.thoi_gian) = ? AND MONTH(dh.thoi_gian) = ?
                    AND dh.trang_thai NOT IN ('cancelled')
                    GROUP BY ct.ma_sp, sp.ten_sp, sp.anh_dai_dien, h.ten_hang
                    ORDER BY revenue DESC
                    LIMIT 10
                `, [lastMonthLabel.year, lastMonthLabel.month]);
            }
        }
        
        const calcChange = (current, previous) => {
            const curr = parseFloat(current) || 0;
            const prev = parseFloat(previous) || 0;
            if (prev === 0) return curr > 0 ? 100 : 0;
            return ((curr - prev) / prev * 100).toFixed(1);
        };
        
        res.json({
            success: true,
            data: {
                revenue: {
                    current: parseFloat(revenueThisMonth.total),
                    previous: parseFloat(revenueLastMonth.total),
                    change: calcChange(revenueThisMonth.total, revenueLastMonth.total),
                    total: parseFloat(totals.total_revenue),
                    // Thêm doanh thu tuần
                    week: parseFloat(revenueThisWeek.total),
                    weekOrders: revenueThisWeek.orders
                },
                profit: {
                    current: parseFloat(revenueThisMonth.total) - parseFloat(revenueThisMonth.import_cost || 0),
                    previous: parseFloat(revenueLastMonth.total) - parseFloat(revenueLastMonth.import_cost || 0),
                    change: calcChange(
                        parseFloat(revenueThisMonth.total) - parseFloat(revenueThisMonth.import_cost || 0), 
                        parseFloat(revenueLastMonth.total) - parseFloat(revenueLastMonth.import_cost || 0)
                    ),
                    total: parseFloat(totals.total_revenue) - parseFloat(totals.total_import_cost || 0)
                },
                orders: {
                    current: ordersThisMonth.total,
                    previous: ordersLastMonth.total,
                    change: calcChange(ordersThisMonth.total, ordersLastMonth.total),
                    total: totals.total_orders,
                    pending: totals.pending_orders
                },
                customers: {
                    current: customersThisMonth.total,
                    previous: customersLastMonth.total,
                    change: calcChange(customersThisMonth.total, customersLastMonth.total),
                    total: totals.total_customers
                },
                products: {
                    sold_current: soldThisMonth.total,
                    sold_previous: soldLastMonth.total,
                    change: calcChange(soldThisMonth.total, soldLastMonth.total),
                    total: totals.total_products
                },
                // Thêm chi tiết sản phẩm đã bán
                productsSoldThisMonth,
                productsSoldLastMonth,
                // Label tháng hiển thị
                currentMonthLabel: { month: displayMonth, year: displayYear },
                lastMonthLabel,
                recentOrders
            }
        });
    } catch (error) {
        console.error('Error getting dashboard overview:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== MONTHLY STATS FILTER ====================

// GET /api/admin/dashboard/monthly-stats - Lấy thống kê theo tháng cụ thể
router.get('/dashboard/monthly-stats', checkSuperAdmin, async (req, res) => {
    try {
        const { month, year } = req.query;
        
        if (!month || !year) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn tháng và năm' });
        }
        
        const selectedMonth = parseInt(month);
        const selectedYear = parseInt(year);
        
        // Doanh thu tháng được chọn
        const [[revenueData]] = await pool.query(`
            SELECT COALESCE(SUM(tong_tien), 0) as total
            FROM don_hang 
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
            AND trang_thai NOT IN ('cancelled')
        `, [selectedYear, selectedMonth]);
        
        // Số đơn hàng tháng được chọn
        const [[ordersData]] = await pool.query(`
            SELECT COUNT(*) as total
            FROM don_hang 
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
        `, [selectedYear, selectedMonth]);
        
        // Số đơn hoàn thành
        const [[completedOrders]] = await pool.query(`
            SELECT COUNT(*) as total
            FROM don_hang 
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
            AND trang_thai IN ('completed', 'delivered')
        `, [selectedYear, selectedMonth]);
        
        // Số đơn bị hủy
        const [[cancelledOrders]] = await pool.query(`
            SELECT COUNT(*) as total
            FROM don_hang 
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
            AND trang_thai = 'cancelled'
        `, [selectedYear, selectedMonth]);
        
        // Sản phẩm đã bán trong tháng
        const [[productsSold]] = await pool.query(`
            SELECT COALESCE(SUM(ct.so_luong), 0) as total
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            WHERE YEAR(dh.thoi_gian) = ? AND MONTH(dh.thoi_gian) = ?
            AND dh.trang_thai NOT IN ('cancelled')
        `, [selectedYear, selectedMonth]);
        
        // Giá trị trung bình mỗi đơn
        const [[avgOrder]] = await pool.query(`
            SELECT COALESCE(AVG(tong_tien), 0) as avg_value
            FROM don_hang 
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
            AND trang_thai NOT IN ('cancelled') AND tong_tien > 0
        `, [selectedYear, selectedMonth]);
        
        // Top sản phẩm bán chạy trong tháng
        const [topProducts] = await pool.query(`
            SELECT sp.ten_sp, sp.anh_dai_dien, h.ten_hang as brand,
                   SUM(ct.so_luong) as quantity, 
                   SUM(ct.so_luong * ct.gia) as revenue
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            LEFT JOIN hang_san_xuat h ON sp.ma_hang = h.ma_hang
            WHERE YEAR(dh.thoi_gian) = ? AND MONTH(dh.thoi_gian) = ?
            AND dh.trang_thai NOT IN ('cancelled')
            GROUP BY ct.ma_sp, sp.ten_sp, sp.anh_dai_dien, h.ten_hang
            ORDER BY revenue DESC
            LIMIT 15
        `, [selectedYear, selectedMonth]);
        
        // Doanh thu theo ngày trong tháng (để vẽ biểu đồ)
        const [dailyRevenue] = await pool.query(`
            SELECT DAY(thoi_gian) as day, 
                   COALESCE(SUM(tong_tien), 0) as revenue,
                   COUNT(*) as orders
            FROM don_hang 
            WHERE YEAR(thoi_gian) = ? AND MONTH(thoi_gian) = ?
            AND trang_thai NOT IN ('cancelled')
            GROUP BY DAY(thoi_gian)
            ORDER BY day
        `, [selectedYear, selectedMonth]);
        
        // Khách hàng mới trong tháng
        const [[newCustomers]] = await pool.query(`
            SELECT COUNT(*) as total
            FROM khach_hang 
            WHERE YEAR(ngay_tao) = ? AND MONTH(ngay_tao) = ?
        `, [selectedYear, selectedMonth]);
        
        res.json({
            success: true,
            data: {
                month: selectedMonth,
                year: selectedYear,
                revenue: parseFloat(revenueData.total),
                orders: ordersData.total,
                completedOrders: completedOrders.total,
                cancelledOrders: cancelledOrders.total,
                productsSold: productsSold.total,
                avgOrderValue: parseFloat(avgOrder.avg_value),
                newCustomers: newCustomers.total,
                topProducts,
                dailyRevenue
            }
        });
    } catch (error) {
        console.error('Error getting monthly stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/dashboard/custom-stats - Lấy thống kê theo khoảng ngày
router.get('/dashboard/custom-stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp startDate và endDate' });
        }
        
        // Doanh thu và lợi nhuận
        const [[revenueData]] = await pool.query(`
            SELECT COALESCE(SUM(tong_tien), 0) as revenue,
                   COALESCE(SUM((SELECT SUM(gia_nhap * so_luong) FROM chi_tiet_don_hang WHERE ma_don = dh.ma_don)), 0) as import_cost,
                   COUNT(*) as orders
            FROM don_hang dh
            WHERE DATE(thoi_gian) >= ? AND DATE(thoi_gian) <= ?
            AND trang_thai NOT IN ('cancelled')
        `, [startDate, endDate]);
        
        const [[completedOrders]] = await pool.query(`
            SELECT COUNT(*) as total FROM don_hang 
            WHERE DATE(thoi_gian) >= ? AND DATE(thoi_gian) <= ? AND trang_thai IN ('completed', 'delivered')
        `, [startDate, endDate]);
        
        const [[cancelledOrders]] = await pool.query(`
            SELECT COUNT(*) as total FROM don_hang 
            WHERE DATE(thoi_gian) >= ? AND DATE(thoi_gian) <= ? AND trang_thai = 'cancelled'
        `, [startDate, endDate]);
        
        // Sản phẩm đã bán
        const [[productsSold]] = await pool.query(`
            SELECT COALESCE(SUM(ct.so_luong), 0) as total
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            WHERE DATE(dh.thoi_gian) >= ? AND DATE(dh.thoi_gian) <= ?
            AND dh.trang_thai NOT IN ('cancelled')
        `, [startDate, endDate]);
        
        const [[avgOrder]] = await pool.query(`
            SELECT COALESCE(AVG(tong_tien), 0) as avg_value
            FROM don_hang 
            WHERE DATE(thoi_gian) >= ? AND DATE(thoi_gian) <= ? AND trang_thai NOT IN ('cancelled') AND tong_tien > 0
        `, [startDate, endDate]);
        
        // Top sản phẩm
        const [topProducts] = await pool.query(`
            SELECT sp.ten_sp, sp.anh_dai_dien, h.ten_hang as brand,
                   SUM(ct.so_luong) as quantity, 
                   SUM(ct.so_luong * ct.gia) as revenue,
                   SUM(ct.so_luong * ct.gia_nhap) as import_cost
            FROM chi_tiet_don_hang ct
            JOIN don_hang dh ON ct.ma_don = dh.ma_don
            JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
            LEFT JOIN hang_san_xuat h ON sp.ma_hang = h.ma_hang
            WHERE DATE(dh.thoi_gian) >= ? AND DATE(dh.thoi_gian) <= ?
            AND dh.trang_thai NOT IN ('cancelled')
            GROUP BY ct.ma_sp, sp.ten_sp, sp.anh_dai_dien, h.ten_hang
            ORDER BY revenue DESC
            LIMIT 15
        `, [startDate, endDate]);
        
        const isSuperAdmin = req.session.user.quyen === 'superadmin';

        res.json({
            success: true,
            data: {
                startDate,
                endDate,
                revenue: parseFloat(revenueData.revenue),
                profit: isSuperAdmin ? parseFloat(revenueData.revenue) - parseFloat(revenueData.import_cost || 0) : undefined,
                orders: revenueData.orders,
                completedOrders: completedOrders.total,
                cancelledOrders: cancelledOrders.total,
                productsSold: productsSold.total,
                avgOrderValue: parseFloat(avgOrder.avg_value),
                topProducts: topProducts.map(p => ({
                    ...p,
                    profit: isSuperAdmin ? parseFloat(p.revenue) - parseFloat(p.import_cost || 0) : undefined,
                    import_cost: undefined // Ẩn import_cost
                }))
            }
        });
    } catch (error) {
        console.error('Error getting custom stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/dashboard/available-months - Lấy danh sách các tháng có dữ liệu
router.get('/dashboard/available-months', async (req, res) => {
    try {
        const [months] = await pool.query(`
            SELECT DISTINCT YEAR(thoi_gian) as year, MONTH(thoi_gian) as month
            FROM don_hang
            ORDER BY year DESC, month DESC
        `);
        
        // Lấy năm hiện tại và 5 năm trước
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let y = currentYear; y >= currentYear - 5; y--) {
            years.push(y);
        }
        
        res.json({
            success: true,
            data: {
                availableMonths: months,
                years
            }
        });
    } catch (error) {
        console.error('Error getting available months:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== NEWS MANAGEMENT ====================

// Hàm đảm bảo cột video_url tồn tại trong bảng tin_tuc
async function ensureVideoUrlColumn() {
    try {
        // Kiểm tra cột có tồn tại không
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tin_tuc' AND COLUMN_NAME = 'video_url'
        `);
        
        if (columns.length === 0) {
            // Cột chưa tồn tại, thêm vào
            await pool.query('ALTER TABLE tin_tuc ADD COLUMN video_url VARCHAR(500) DEFAULT NULL');
            console.log('Added video_url column to tin_tuc table');
        }
    } catch (err) {
        console.error('Error checking/adding video_url column:', err.message);
    }
}

// Gọi hàm khi module được load
ensureVideoUrlColumn();

// GET /api/admin/news - Lấy tất cả tin tức
router.get('/news', checkSuperAdmin, async (req, res) => {
    try {
        // Đảm bảo cột video_url tồn tại
        await ensureVideoUrlColumn();
        
        const [news] = await pool.query(`
            SELECT tt.*, a.ho_ten as ten_admin
            FROM tin_tuc tt
            LEFT JOIN admin a ON tt.ma_admin = a.ma_admin
            ORDER BY tt.thu_tu DESC, tt.ngay_dang DESC
        `);
        res.json({ success: true, data: news });
    } catch (error) {
        console.error('Error getting news:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/news - Thêm tin tức mới
router.post('/news', checkSuperAdmin, async (req, res) => {
    try {
        const { tieu_de, noi_dung, anh_dai_dien, video_url, ma_admin, loai_tin, mo_ta_ngan, thu_tu, trang_thai } = req.body;
        
        // Validation
        if (!tieu_de || !tieu_de.trim()) {
            return res.status(400).json({ success: false, message: 'Tiêu đề không được để trống' });
        }
        if (!noi_dung || !noi_dung.trim()) {
            return res.status(400).json({ success: false, message: 'Nội dung không được để trống' });
        }
        
        // Đảm bảo cột video_url tồn tại
        await ensureVideoUrlColumn();
        
        const [result] = await pool.query(
            `INSERT INTO tin_tuc (tieu_de, noi_dung, anh_dai_dien, video_url, ma_admin, loai_tin, mo_ta_ngan, thu_tu, trang_thai) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                tieu_de.trim(), 
                noi_dung.trim(), 
                anh_dai_dien || null, 
                video_url || null, 
                ma_admin || null,
                loai_tin || 'thuong',
                mo_ta_ngan || null,
                thu_tu || 0,
                trang_thai || 'hien_thi'
            ]
        );
        res.json({ success: true, message: 'Thêm tin tức thành công', data: { id: result.insertId } });
    } catch (error) {
        console.error('Error adding news:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/news/:id - Cập nhật tin tức
router.put('/news/:id', checkSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { tieu_de, noi_dung, anh_dai_dien, video_url, loai_tin, mo_ta_ngan, thu_tu, trang_thai } = req.body;
        
        // Validation
        if (!tieu_de || !tieu_de.trim()) {
            return res.status(400).json({ success: false, message: 'Tiêu đề không được để trống' });
        }
        if (!noi_dung || !noi_dung.trim()) {
            return res.status(400).json({ success: false, message: 'Nội dung không được để trống' });
        }
        
        // Đảm bảo cột video_url tồn tại
        await ensureVideoUrlColumn();
        
        await pool.query(
            `UPDATE tin_tuc SET 
                tieu_de = ?, noi_dung = ?, anh_dai_dien = ?, video_url = ?,
                loai_tin = ?, mo_ta_ngan = ?, thu_tu = ?, trang_thai = ?
             WHERE ma_tintuc = ?`,
            [
                tieu_de.trim(), 
                noi_dung.trim(), 
                anh_dai_dien || null, 
                video_url || null,
                loai_tin || 'thuong',
                mo_ta_ngan || null,
                thu_tu || 0,
                trang_thai || 'hien_thi',
                id
            ]
        );
        res.json({ success: true, message: 'Cập nhật tin tức thành công' });
    } catch (error) {
        console.error('Error updating news:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/news/:id - Xóa tin tức
router.delete('/news/:id', checkSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM tin_tuc WHERE ma_tintuc = ?', [id]);
        res.json({ success: true, message: 'Xóa tin tức thành công' });
    } catch (error) {
        console.error('Error deleting news:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== CONTACT MANAGEMENT ====================

// GET /api/admin/contacts - Lấy tất cả liên hệ
router.get('/contacts', checkSuperAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        let query = 'SELECT * FROM lien_he';
        let params = [];
        
        if (status) {
            query += ' WHERE trang_thai = ?';
            params.push(status);
        }
        
        query += ' ORDER BY ngay_gui DESC';
        
        const [contacts] = await pool.query(query, params);
        res.json({ success: true, data: contacts });
    } catch (error) {
        console.error('Error getting contacts:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/contacts/stats - Thống kê liên hệ
router.get('/contacts/stats', checkSuperAdmin, async (req, res) => {
    try {
        const [[stats]] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN trang_thai = 'new' THEN 1 ELSE 0 END) as new_count,
                SUM(CASE WHEN trang_thai = 'read' THEN 1 ELSE 0 END) as read_count,
                SUM(CASE WHEN trang_thai = 'replied' THEN 1 ELSE 0 END) as replied_count
            FROM lien_he
        `);
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error getting contact stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/contacts/:id - Lấy chi tiết liên hệ
router.get('/contacts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [contacts] = await pool.query('SELECT * FROM lien_he WHERE ma_lien_he = ?', [id]);
        
        if (contacts.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy liên hệ' });
        }
        
        // Tự động cập nhật trạng thái thành 'read' nếu đang là 'new'
        if (contacts[0].trang_thai === 'new') {
            await pool.query("UPDATE lien_he SET trang_thai = 'read' WHERE ma_lien_he = ?", [id]);
            contacts[0].trang_thai = 'read';
        }
        
        res.json({ success: true, data: contacts[0] });
    } catch (error) {
        console.error('Error getting contact:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/contacts/:id/status - Cập nhật trạng thái liên hệ
router.put('/contacts/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['new', 'read', 'replied'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
        }
        
        await pool.query('UPDATE lien_he SET trang_thai = ? WHERE ma_lien_he = ?', [status, id]);
        res.json({ success: true, message: 'Cập nhật trạng thái thành công' });
    } catch (error) {
        console.error('Error updating contact status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/contacts/:id - Xóa liên hệ
router.delete('/contacts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM lien_he WHERE ma_lien_he = ?', [id]);
        res.json({ success: true, message: 'Xóa liên hệ thành công' });
    } catch (error) {
        console.error('Error deleting contact:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Cấu hình multer cho upload ảnh liên hệ
const contactStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../frontend/images/contacts');
        // Tạo thư mục nếu chưa tồn tại
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'contact-' + uniqueSuffix + ext);
    }
});

const contactUpload = multer({
    storage: contactStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, gif, webp)!'));
    }
});

// POST /api/admin/contacts - Tạo liên hệ mới (từ form frontend) - Có hỗ trợ upload ảnh
router.post('/contacts', (req, res) => {
    contactUpload.array('images', 5)(req, res, async function(err) {
        // Xử lý lỗi multer
        if (err instanceof multer.MulterError) {
            console.error('Multer error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: 'Ảnh không được vượt quá 5MB!' });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({ success: false, message: 'Chỉ được upload tối đa 5 ảnh!' });
            }
            return res.status(400).json({ success: false, message: 'Lỗi upload: ' + err.message });
        } else if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ success: false, message: err.message });
        }
        
        try {
            const { ho_ten, email, so_dien_thoai, tieu_de, noi_dung } = req.body;
            
            // Log để debug
            console.log('=== CONTACT FORM SUBMISSION ===');
            console.log('Body:', req.body);
            console.log('Contact form data:', { ho_ten, email, so_dien_thoai, tieu_de, noi_dung });
            console.log('Files:', req.files);
            
            // Kiểm tra thông tin bắt buộc
            if (!ho_ten || !ho_ten.trim()) {
                return res.status(400).json({ success: false, message: 'Vui lòng nhập họ và tên!' });
            }
            if (!email || !email.trim()) {
                return res.status(400).json({ success: false, message: 'Vui lòng nhập email!' });
            }
            if (!noi_dung || !noi_dung.trim()) {
                return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung tin nhắn!' });
            }
            
            // Xử lý ảnh đính kèm
            let imageUrls = [];
            if (req.files && req.files.length > 0) {
                imageUrls = req.files.map(file => `images/contacts/${file.filename}`);
            }
            
            // Kiểm tra xem bảng có cột hinh_anh không, nếu không thì insert không có cột đó
            try {
                const [result] = await pool.query(
                    `INSERT INTO lien_he (ho_ten, email, so_dien_thoai, tieu_de, noi_dung, hinh_anh, trang_thai) 
                     VALUES (?, ?, ?, ?, ?, ?, 'new')`,
                    [ho_ten.trim(), email.trim(), so_dien_thoai || null, tieu_de || null, noi_dung.trim(), JSON.stringify(imageUrls)]
                );
                
                res.json({ 
                    success: true, 
                    message: 'Gửi liên hệ thành công', 
                    data: { 
                        id: result.insertId,
                        images: imageUrls 
                    } 
                });
            } catch (dbError) {
                // Nếu lỗi do cột hinh_anh không tồn tại, thử insert không có cột đó
                if (dbError.code === 'ER_BAD_FIELD_ERROR') {
                    console.log('Column hinh_anh not found, inserting without it...');
                    const [result] = await pool.query(
                        `INSERT INTO lien_he (ho_ten, email, so_dien_thoai, tieu_de, noi_dung, trang_thai) 
                         VALUES (?, ?, ?, ?, ?, 'new')`,
                        [ho_ten.trim(), email.trim(), so_dien_thoai || null, tieu_de || null, noi_dung.trim()]
                    );
                    
                    res.json({ 
                        success: true, 
                        message: 'Gửi liên hệ thành công', 
                        data: { 
                            id: result.insertId,
                            images: [] 
                        } 
                    });
                } else {
                    throw dbError;
                }
            }
        } catch (error) {
            console.error('Error creating contact:', error);
            res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
        }
    });
});

// ==================== CONTACT RESPONSE (PHẢN HỒI LIÊN HỆ) ====================

// POST /api/admin/contacts/:id/response - Admin gửi phản hồi cho liên hệ
router.post('/contacts/:id/response', async (req, res) => {
    try {
        const { id } = req.params;
        const { noi_dung_phan_hoi, ma_admin } = req.body;
        
        if (!noi_dung_phan_hoi) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung phản hồi' });
        }
        
        // Lấy thông tin liên hệ
        const [contacts] = await pool.query('SELECT * FROM lien_he WHERE ma_lien_he = ?', [id]);
        if (contacts.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy liên hệ' });
        }
        const contact = contacts[0];
        
        // Cập nhật phản hồi trực tiếp vào bảng lien_he
        await pool.query(
            `UPDATE lien_he SET 
                noi_dung_phan_hoi = ?, 
                ngay_phan_hoi = NOW(), 
                ma_admin = ?,
                trang_thai = 'replied' 
             WHERE ma_lien_he = ?`,
            [noi_dung_phan_hoi, ma_admin || null, id]
        );
        
        // Tìm khách hàng theo email để gửi thông báo
        const [customers] = await pool.query('SELECT ma_kh FROM khach_hang WHERE email = ?', [contact.email]);
        
        // Tạo thông báo cho người dùng
        const tieuDeThongBao = 'Phản hồi từ QuangHưngShop';
        const noiDungThongBao = `Liên hệ của bạn về "${contact.tieu_de || 'Hỗ trợ'}" đã được phản hồi: ${noi_dung_phan_hoi.substring(0, 100)}${noi_dung_phan_hoi.length > 100 ? '...' : ''}`;
        
        await pool.query(
            `INSERT INTO thong_bao (ma_kh, email_nguoi_nhan, tieu_de, noi_dung, loai, lien_ket) 
             VALUES (?, ?, ?, ?, 'contact_response', ?)`,
            [
                customers.length > 0 ? customers[0].ma_kh : null,
                contact.email,
                tieuDeThongBao,
                noi_dung_phan_hoi,
                '/contact.html'
            ]
        );
        
        res.json({ 
            success: true, 
            message: 'Phản hồi đã được gửi thành công',
            data: { id: id }
        });
    } catch (error) {
        console.error('Error creating contact response:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/contacts/:id/responses - Lấy phản hồi của liên hệ (từ bảng lien_he)
router.get('/contacts/:id/responses', async (req, res) => {
    try {
        const { id } = req.params;
        const [contacts] = await pool.query(`
            SELECT lh.noi_dung_phan_hoi, lh.ngay_phan_hoi, lh.ma_admin,
                   a.ho_ten as admin_name, a.avt as admin_avatar
            FROM lien_he lh
            LEFT JOIN admin a ON lh.ma_admin = a.ma_admin
            WHERE lh.ma_lien_he = ? AND lh.noi_dung_phan_hoi IS NOT NULL
        `, [id]);
        
        // Chuyển đổi thành mảng responses
        const responses = contacts.length > 0 && contacts[0].noi_dung_phan_hoi ? [{
            noi_dung_phan_hoi: contacts[0].noi_dung_phan_hoi,
            ngay_phan_hoi: contacts[0].ngay_phan_hoi,
            admin_name: contacts[0].admin_name,
            admin_avatar: contacts[0].admin_avatar
        }] : [];
        
        res.json({ success: true, data: responses });
    } catch (error) {
        console.error('Error getting contact responses:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== NOTIFICATIONS (THÔNG BÁO) ====================

// GET /api/admin/notifications - Lấy tất cả thông báo (cho admin xem)
router.get('/notifications', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const [notifications] = await pool.query(`
            SELECT * FROM thong_bao 
            ORDER BY ngay_tao DESC 
            LIMIT ?
        `, [parseInt(limit)]);
        
        res.json({ success: true, data: notifications });
    } catch (error) {
        console.error('Error getting notifications:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== KHUYẾN MÃI (PROMOTIONS) ====================

// GET /api/admin/promotions - Lấy tất cả khuyến mãi
router.get('/promotions', checkSuperAdmin, async (req, res) => {
    try {
        const [promotions] = await pool.query(`
            SELECT km.*,
                   CASE 
                       WHEN NOW() < km.ngay_bat_dau THEN 'upcoming'
                       WHEN NOW() > km.ngay_ket_thuc THEN 'expired'
                       WHEN km.so_luong_da_dung >= km.so_luong THEN 'sold_out'
                       ELSE km.trang_thai
                   END as trang_thai_hien_tai,
                   (km.so_luong - km.so_luong_da_dung) as so_luong_con_lai,
                   DATEDIFF(km.ngay_ket_thuc, NOW()) as so_ngay_con_lai
            FROM khuyen_mai km
            ORDER BY km.ngay_tao DESC
        `);
        
        res.json({ success: true, data: promotions });
    } catch (error) {
        console.error('Error getting promotions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/promotions/stats - Thống kê khuyến mãi
router.get('/promotions/stats', async (req, res) => {
    try {
        // Tổng số khuyến mãi
        const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM khuyen_mai');
        
        // Đang hoạt động
        const [[{ active }]] = await pool.query(`
            SELECT COUNT(*) as active FROM khuyen_mai 
            WHERE trang_thai = 'active' 
            AND ngay_bat_dau <= NOW() 
            AND ngay_ket_thuc >= NOW()
            AND so_luong_da_dung < so_luong
        `);
        
        // Sắp diễn ra
        const [[{ upcoming }]] = await pool.query(`
            SELECT COUNT(*) as upcoming FROM khuyen_mai 
            WHERE ngay_bat_dau > NOW()
        `);
        
        // Đã hết hạn
        const [[{ expired }]] = await pool.query(`
            SELECT COUNT(*) as expired FROM khuyen_mai 
            WHERE ngay_ket_thuc < NOW() OR trang_thai = 'expired'
        `);
        
        // Tổng lượt sử dụng
        const [[{ total_used }]] = await pool.query('SELECT COALESCE(SUM(so_luong_da_dung), 0) as total_used FROM khuyen_mai');
        
        res.json({
            success: true,
            data: { total, active, upcoming, expired, total_used }
        });
    } catch (error) {
        console.error('Error getting promotion stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/promotions/:id - Lấy chi tiết khuyến mãi
router.get('/promotions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [promotions] = await pool.query(`
            SELECT * FROM khuyen_mai WHERE ma_km = ?
        `, [id]);
        
        if (promotions.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy khuyến mãi' });
        }
        
        // Lấy lịch sử sử dụng
        const [history] = await pool.query(`
            SELECT ls.*, kh.ho_ten, dh.ma_don
            FROM lich_su_voucher ls
            LEFT JOIN khach_hang kh ON ls.ma_kh = kh.ma_kh
            LEFT JOIN don_hang dh ON ls.ma_don = dh.ma_don
            WHERE ls.ma_km = ?
            ORDER BY ls.ngay_su_dung DESC
            LIMIT 20
        `, [id]);
        
        res.json({ success: true, data: { ...promotions[0], history } });
    } catch (error) {
        console.error('Error getting promotion:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/promotions - Thêm khuyến mãi mới
router.post('/promotions', checkSuperAdmin, async (req, res) => {
    try {
        const {
            code, loai_km, loai, gia_tri, mo_ta,
            dieu_kien_toi_thieu, dieu_kien_toi_da,
            so_luong, ngay_bat_dau, ngay_ket_thuc, trang_thai,
            ma_sp
        } = req.body;
        
        console.log('Adding promotion:', req.body);
        
        if (!code || !gia_tri || !ngay_bat_dau || !ngay_ket_thuc) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng điền đầy đủ thông tin bắt buộc' 
            });
        }

        if (parseFloat(gia_tri) < 0 || parseFloat(dieu_kien_toi_thieu) < 0 || (dieu_kien_toi_da && parseFloat(dieu_kien_toi_da) < 0) || parseInt(so_luong) < 0) {
            return res.status(400).json({ success: false, message: 'Giá trị KM, điều kiện tối thiểu, điều kiện tối đa và số lượng không được là số âm' });
        }
        
        // Kiểm tra code đã tồn tại chưa
        const [existing] = await pool.query('SELECT ma_km FROM khuyen_mai WHERE code = ?', [code.toUpperCase()]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Mã khuyến mãi đã tồn tại' });
        }
        
        // Chuyển đổi datetime-local sang MySQL datetime format
        const formatDateTime = (dt) => {
            if (!dt) return null;
            // Nếu đã có format đúng thì giữ nguyên
            if (dt.includes(' ')) return dt;
            // Chuyển từ YYYY-MM-DDTHH:mm sang YYYY-MM-DD HH:mm:ss
            return dt.replace('T', ' ') + ':00';
        };
        
        const startDate = formatDateTime(ngay_bat_dau);
        const endDate = formatDateTime(ngay_ket_thuc);
        
        console.log('Formatted dates:', { startDate, endDate });
        
        const [result] = await pool.query(`
            INSERT INTO khuyen_mai
            (code, loai_km, loai, gia_tri, mo_ta, dieu_kien_toi_thieu, dieu_kien_toi_da, so_luong, ngay_bat_dau, ngay_ket_thuc, trang_thai, ma_sp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            code.toUpperCase(),
            loai_km || 'voucher',
            loai || 'percent',
            gia_tri,
            mo_ta || '',
            dieu_kien_toi_thieu || 0,
            dieu_kien_toi_da || null,
            so_luong || 100,
            startDate,
            endDate,
            trang_thai || 'active',
            ma_sp ? parseInt(ma_sp) : null
        ]);

        console.log('Promotion added with ID:', result.insertId, 'ma_sp=', ma_sp || 'broadcast');

        // [AUTO] Notify KH phù hợp (in-app + email) — chạy ngầm
        setImmediate(async () => {
            try {
                const { notifyPromotionToCustomers } = require('../services/emailService');
                const r = await notifyPromotionToCustomers(result.insertId);
                console.log('[Promotion auto-notify]', r);
            } catch (e) {
                console.error('[Promotion auto-notify error]', e.message);
            }
        });

        res.json({
            success: true,
            message: 'Thêm khuyến mãi thành công',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Error adding promotion:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/promotions/:id - Cập nhật khuyến mãi
router.put('/promotions/:id', checkSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            code, loai_km, loai, gia_tri, mo_ta, 
            dieu_kien_toi_thieu, dieu_kien_toi_da, 
            so_luong, ngay_bat_dau, ngay_ket_thuc, trang_thai 
        } = req.body;

        if (gia_tri !== undefined && parseFloat(gia_tri) < 0) {
            return res.status(400).json({ success: false, message: 'Giá trị KM không được là số âm' });
        }
        if (dieu_kien_toi_thieu !== undefined && parseFloat(dieu_kien_toi_thieu) < 0) {
            return res.status(400).json({ success: false, message: 'Điều kiện tối thiểu không được là số âm' });
        }
        if (dieu_kien_toi_da !== undefined && dieu_kien_toi_da !== null && parseFloat(dieu_kien_toi_da) < 0) {
            return res.status(400).json({ success: false, message: 'Điều kiện tối đa không được là số âm' });
        }
        if (so_luong !== undefined && parseInt(so_luong) < 0) {
            return res.status(400).json({ success: false, message: 'Số lượng voucher không được là số âm' });
        }
        
        // Kiểm tra code trùng (trừ chính nó)
        if (code) {
            const [existing] = await pool.query(
                'SELECT ma_km FROM khuyen_mai WHERE code = ? AND ma_km != ?', 
                [code, id]
            );
            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: 'Mã khuyến mãi đã tồn tại' });
            }
        }
        
        await pool.query(`
            UPDATE khuyen_mai SET
                code = COALESCE(?, code),
                loai_km = COALESCE(?, loai_km),
                loai = COALESCE(?, loai),
                gia_tri = COALESCE(?, gia_tri),
                mo_ta = COALESCE(?, mo_ta),
                dieu_kien_toi_thieu = COALESCE(?, dieu_kien_toi_thieu),
                dieu_kien_toi_da = ?,
                so_luong = COALESCE(?, so_luong),
                ngay_bat_dau = COALESCE(?, ngay_bat_dau),
                ngay_ket_thuc = COALESCE(?, ngay_ket_thuc),
                trang_thai = COALESCE(?, trang_thai)
            WHERE ma_km = ?
        `, [
            code ? code.toUpperCase() : null, 
            loai_km, loai, gia_tri, mo_ta, 
            dieu_kien_toi_thieu, dieu_kien_toi_da, 
            so_luong, ngay_bat_dau, ngay_ket_thuc, trang_thai, id
        ]);
        
        res.json({ success: true, message: 'Cập nhật khuyến mãi thành công' });
    } catch (error) {
        console.error('Error updating promotion:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/promotions/:id - Xóa khuyến mãi
router.delete('/promotions/:id', checkSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Kiểm tra đã có lịch sử sử dụng chưa
        const [history] = await pool.query('SELECT COUNT(*) as count FROM lich_su_voucher WHERE ma_km = ?', [id]);
        
        if (history[0].count > 0) {
            // Chỉ đánh dấu inactive thay vì xóa
            await pool.query("UPDATE khuyen_mai SET trang_thai = 'inactive' WHERE ma_km = ?", [id]);
            return res.json({ success: true, message: 'Đã vô hiệu hóa khuyến mãi (có lịch sử sử dụng)' });
        }
        
        // Xóa voucher đã lưu của người dùng
        await pool.query('DELETE FROM voucher_nguoi_dung WHERE ma_km = ?', [id]);
        // Xóa khuyến mãi
        await pool.query('DELETE FROM khuyen_mai WHERE ma_km = ?', [id]);
        
        res.json({ success: true, message: 'Xóa khuyến mãi thành công' });
    } catch (error) {
        console.error('Error deleting promotion:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/promotions/:id/status - Cập nhật trạng thái khuyến mãi
router.put('/promotions/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { trang_thai } = req.body;
        
        await pool.query('UPDATE khuyen_mai SET trang_thai = ? WHERE ma_km = ?', [trang_thai, id]);
        
        res.json({ success: true, message: 'Cập nhật trạng thái thành công' });
    } catch (error) {
        console.error('Error updating promotion status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/promotions/sync-usage - Đồng bộ số lượng đã dùng từ đơn hàng
router.post('/promotions/sync-usage', async (req, res) => {
    try {
        // Cập nhật so_luong_da_dung dựa trên số đơn hàng đã sử dụng voucher (không bị hủy)
        await pool.query(`
            UPDATE khuyen_mai km
            SET so_luong_da_dung = (
                SELECT COUNT(*)
                FROM don_hang dh
                WHERE dh.ma_km = km.ma_km
                AND dh.trang_thai != 'cancelled'
            )
        `);
        
        // Lấy kết quả sau khi cập nhật
        const [result] = await pool.query(`
            SELECT ma_km, code, so_luong, so_luong_da_dung, 
                   (so_luong - so_luong_da_dung) as so_luong_con_lai
            FROM khuyen_mai
        `);
        
        console.log('Synced voucher usage:', result);
        
        res.json({ 
            success: true, 
            message: 'Đã đồng bộ số lượng đã dùng thành công',
            data: result
        });
    } catch (error) {
        console.error('Error syncing promotion usage:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== FLASH SALE ====================

// GET /api/admin/flash-sales - Lấy tất cả flash sale
router.get('/flash-sales', async (req, res) => {
    try {
        const [flashSales] = await pool.query(`
            SELECT fs.*,
                   COUNT(ctfs.ma_ct_flash) as so_san_pham,
                   COALESCE(SUM(ctfs.so_luong_da_ban), 0) as tong_da_ban,
                   CASE 
                       WHEN NOW() < fs.ngay_bat_dau THEN 'upcoming'
                       WHEN NOW() > fs.ngay_ket_thuc THEN 'ended'
                       ELSE fs.trang_thai
                   END as trang_thai_hien_tai
            FROM flash_sale fs
            LEFT JOIN chi_tiet_flash_sale ctfs ON fs.ma_flash_sale = ctfs.ma_flash_sale
            GROUP BY fs.ma_flash_sale
            ORDER BY fs.ngay_bat_dau DESC
        `);
        
        res.json({ success: true, data: flashSales });
    } catch (error) {
        console.error('Error getting flash sales:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/flash-sales/:id - Lấy chi tiết flash sale
router.get('/flash-sales/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [flashSales] = await pool.query('SELECT * FROM flash_sale WHERE ma_flash_sale = ?', [id]);
        
        if (flashSales.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy Flash Sale' });
        }
        
        // Lấy sản phẩm trong flash sale
        const [products] = await pool.query(`
            SELECT ctfs.*, sp.ten_sp, sp.anh_dai_dien
            FROM chi_tiet_flash_sale ctfs
            JOIN san_pham sp ON ctfs.ma_sp = sp.ma_sp
            WHERE ctfs.ma_flash_sale = ?
        `, [id]);
        
        res.json({ success: true, data: { ...flashSales[0], products } });
    } catch (error) {
        console.error('Error getting flash sale:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/flash-sales - Thêm flash sale mới
router.post('/flash-sales', async (req, res) => {
    try {
        const { ten_su_kien, mo_ta, ngay_bat_dau, ngay_ket_thuc, trang_thai, products } = req.body;
        
        if (!ten_su_kien || !ngay_bat_dau || !ngay_ket_thuc) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin' });
        }
        
        const [result] = await pool.query(`
            INSERT INTO flash_sale (ten_su_kien, mo_ta, ngay_bat_dau, ngay_ket_thuc, trang_thai)
            VALUES (?, ?, ?, ?, ?)
        `, [ten_su_kien, mo_ta || '', ngay_bat_dau, ngay_ket_thuc, trang_thai || 'upcoming']);
        
        const flashSaleId = result.insertId;
        
        // Thêm sản phẩm vào flash sale nếu có
        if (products && products.length > 0) {
            for (const p of products) {
                await pool.query(`
                    INSERT INTO chi_tiet_flash_sale (ma_flash_sale, ma_sp, gia_goc, gia_flash, so_luong_flash)
                    VALUES (?, ?, ?, ?, ?)
                `, [flashSaleId, p.ma_sp, p.gia_goc, p.gia_flash, p.so_luong_flash || 10]);
            }
        }
        
        res.json({ success: true, message: 'Thêm Flash Sale thành công', data: { id: flashSaleId } });
    } catch (error) {
        console.error('Error adding flash sale:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/flash-sales/:id - Cập nhật flash sale
router.put('/flash-sales/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_su_kien, mo_ta, ngay_bat_dau, ngay_ket_thuc, trang_thai } = req.body;
        
        await pool.query(`
            UPDATE flash_sale SET
                ten_su_kien = COALESCE(?, ten_su_kien),
                mo_ta = COALESCE(?, mo_ta),
                ngay_bat_dau = COALESCE(?, ngay_bat_dau),
                ngay_ket_thuc = COALESCE(?, ngay_ket_thuc),
                trang_thai = COALESCE(?, trang_thai)
            WHERE ma_flash_sale = ?
        `, [ten_su_kien, mo_ta, ngay_bat_dau, ngay_ket_thuc, trang_thai, id]);
        
        res.json({ success: true, message: 'Cập nhật Flash Sale thành công' });
    } catch (error) {
        console.error('Error updating flash sale:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/flash-sales/:id - Xóa flash sale
router.delete('/flash-sales/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Xóa chi tiết flash sale trước
        await pool.query('DELETE FROM chi_tiet_flash_sale WHERE ma_flash_sale = ?', [id]);
        // Xóa flash sale
        await pool.query('DELETE FROM flash_sale WHERE ma_flash_sale = ?', [id]);
        
        res.json({ success: true, message: 'Xóa Flash Sale thành công' });
    } catch (error) {
        console.error('Error deleting flash sale:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/flash-sales/:id/products - Thêm sản phẩm vào flash sale
router.post('/flash-sales/:id/products', async (req, res) => {
    try {
        const { id } = req.params;
        const { ma_sp, gia_goc, gia_flash, so_luong_flash } = req.body;
        
        await pool.query(`
            INSERT INTO chi_tiet_flash_sale (ma_flash_sale, ma_sp, gia_goc, gia_flash, so_luong_flash)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE gia_goc = ?, gia_flash = ?, so_luong_flash = ?
        `, [id, ma_sp, gia_goc, gia_flash, so_luong_flash || 10, gia_goc, gia_flash, so_luong_flash || 10]);
        
        res.json({ success: true, message: 'Thêm sản phẩm vào Flash Sale thành công' });
    } catch (error) {
        console.error('Error adding product to flash sale:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/flash-sales/:id/products/:productId - Xóa sản phẩm khỏi flash sale
router.delete('/flash-sales/:id/products/:productId', async (req, res) => {
    try {
        const { id, productId } = req.params;
        
        await pool.query('DELETE FROM chi_tiet_flash_sale WHERE ma_flash_sale = ? AND ma_sp = ?', [id, productId]);
        
        res.json({ success: true, message: 'Xóa sản phẩm khỏi Flash Sale thành công' });
    } catch (error) {
        console.error('Error removing product from flash sale:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DEBUG: API kiểm tra dữ liệu đơn hàng theo tháng
router.get('/debug/orders-by-month', async (req, res) => {
    try {
        const [orders] = await pool.query(`
            SELECT 
                YEAR(thoi_gian) as year,
                MONTH(thoi_gian) as month,
                COUNT(*) as total_orders,
                SUM(CASE WHEN trang_thai != 'cancelled' THEN 1 ELSE 0 END) as valid_orders,
                COALESCE(SUM(CASE WHEN trang_thai != 'cancelled' THEN tong_tien ELSE 0 END), 0) as revenue
            FROM don_hang
            GROUP BY YEAR(thoi_gian), MONTH(thoi_gian)
            ORDER BY year DESC, month DESC
        `);
        
        const [recentOrders] = await pool.query(`
            SELECT ma_don, thoi_gian, trang_thai, tong_tien
            FROM don_hang
            ORDER BY thoi_gian DESC
            LIMIT 20
        `);
        
        res.json({
            success: true,
            ordersByMonth: orders,
            recentOrders: recentOrders
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== SETTINGS ====================

// Biến lưu cài đặt trong memory
let shopSettings = {
    hideStockFromCustomer: false // Mặc định hiển thị tồn kho
};

// GET /api/admin/settings - Lấy cài đặt shop
router.get('/settings', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT `key`, value FROM cau_hinh_shop');
        const settingsMap = {};
        rows.forEach(r => {
            settingsMap[r.key] = r.value;
        });

        const mergedSettings = {
            hideStockFromCustomer: settingsMap['hide_stock'] === '1' || settingsMap['hide_stock'] === 'true' || shopSettings.hideStockFromCustomer,
            shop_lat: settingsMap['shop_lat'] || '9.920170',
            shop_lng: settingsMap['shop_lng'] || '106.347510',
            shop_attendance_radius: settingsMap['shop_attendance_radius'] || '150'
        };

        res.json({ success: true, data: mergedSettings });
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/settings - Cập nhật cài đặt shop
router.put('/settings', checkSuperAdmin, async (req, res) => {
    try {
        const { hideStockFromCustomer, shop_lat, shop_lng, shop_attendance_radius } = req.body;
        
        if (typeof hideStockFromCustomer === 'boolean') {
            shopSettings.hideStockFromCustomer = hideStockFromCustomer;
            await pool.query(
                "INSERT INTO cau_hinh_shop (`key`, value, mo_ta) VALUES ('hide_stock', ?, 'Ẩn số lượng tồn kho khỏi khách (0/1)') ON DUPLICATE KEY UPDATE value = ?",
                [hideStockFromCustomer ? '1' : '0', hideStockFromCustomer ? '1' : '0']
            );
        }
        
        if (shop_lat !== undefined && shop_lat !== null) {
            await pool.query(
                "INSERT INTO cau_hinh_shop (`key`, value, mo_ta) VALUES ('shop_lat', ?, 'Vĩ độ GPS của cửa hàng/chi nhánh') ON DUPLICATE KEY UPDATE value = ?",
                [shop_lat.toString(), shop_lat.toString()]
            );
        }
        
        if (shop_lng !== undefined && shop_lng !== null) {
            await pool.query(
                "INSERT INTO cau_hinh_shop (`key`, value, mo_ta) VALUES ('shop_lng', ?, 'Kinh độ GPS của cửa hàng/chi nhánh') ON DUPLICATE KEY UPDATE value = ?",
                [shop_lng.toString(), shop_lng.toString()]
            );
        }
        
        if (shop_attendance_radius !== undefined && shop_attendance_radius !== null) {
            await pool.query(
                "INSERT INTO cau_hinh_shop (`key`, value, mo_ta) VALUES ('shop_attendance_radius', ?, 'Bán kính chấm công cho phép (mét)') ON DUPLICATE KEY UPDATE value = ?",
                [shop_attendance_radius.toString(), shop_attendance_radius.toString()]
            );
        }

        // Fetch fresh settings from DB to return
        const [rows] = await pool.query('SELECT `key`, value FROM cau_hinh_shop');
        const settingsMap = {};
        rows.forEach(r => {
            settingsMap[r.key] = r.value;
        });

        const mergedSettings = {
            hideStockFromCustomer: settingsMap['hide_stock'] === '1' || settingsMap['hide_stock'] === 'true' || shopSettings.hideStockFromCustomer,
            shop_lat: settingsMap['shop_lat'] || '9.920170',
            shop_lng: settingsMap['shop_lng'] || '106.347510',
            shop_attendance_radius: settingsMap['shop_attendance_radius'] || '150'
        };
        
        res.json({ success: true, message: 'Cập nhật cài đặt thành công', data: mergedSettings });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/settings/public - API công khai để frontend lấy cài đặt hiển thị
router.get('/settings/public', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT value FROM cau_hinh_shop WHERE `key` = 'hide_stock'");
        let hideVal = shopSettings.hideStockFromCustomer;
        if (rows.length > 0) {
            hideVal = rows[0].value === '1' || rows[0].value === 'true';
        }
        res.json({ 
            success: true, 
            data: {
                hideStockFromCustomer: hideVal
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== EMPLOYEE MANAGEMENT ====================

// GET /api/admin/employees - Lấy danh sách nhân viên
router.get('/employees', async (req, res) => {
    try {
        const [employees] = await pool.query(`
            SELECT nv.ma_nv as ma_admin, nv.ma_nv as ma_tai_khoan, nv.tai_khoan, nv.ho_ten, nv.email, nv.so_dt, nv.luong_co_ban, nv.trang_thai, nv.quyen, nv.ngay_sinh, nv.dia_chi, nv.chuc_vu, nv.ngay_vao_lam, nv.cccd_truoc, nv.cccd_sau, nv.anh_dai_dien, nv.allowed_modules,
                   CASE WHEN fe.ma_tai_khoan IS NOT NULL THEN 1 ELSE 0 END as has_face_data
            FROM nhan_vien nv
            LEFT JOIN face_embeddings fe ON nv.ma_nv = fe.ma_tai_khoan
            ORDER BY nv.ma_nv DESC
        `);
        res.json({ success: true, data: employees, employees });
    } catch (error) {
        console.error('Error getting employees:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/employees - Tạo nhân viên mới
router.post('/employees', checkSuperAdmin, async (req, res) => {
    try {
        const { tai_khoan, mat_khau, ho_ten, email, so_dt, luong_co_ban, trang_thai, quyen, ngay_sinh, dia_chi, chuc_vu, ngay_vao_lam, cccd_truoc, cccd_sau, anh_dai_dien } = req.body;
        
        if (!tai_khoan || !mat_khau || !ho_ten) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin bắt buộc' });
        }
        
        // Kiểm tra tài khoản hoặc email đã tồn tại trong nhan_vien và admin
        const [existingAdmin] = await pool.query('SELECT ma_admin FROM admin WHERE tai_khoan = ? OR (email = ? AND email IS NOT NULL AND email != "")', [tai_khoan, email || '']);
        const [existingNv] = await pool.query('SELECT ma_nv FROM nhan_vien WHERE tai_khoan = ? OR (email = ? AND email IS NOT NULL AND email != "")', [tai_khoan, email || '']);
        
        if (existingAdmin.length > 0 || existingNv.length > 0) {
            return res.status(400).json({ success: false, message: 'Tài khoản hoặc email đã tồn tại trong hệ thống' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashed_mat_khau = await bcrypt.hash(mat_khau, salt);
        
        const [result] = await pool.query(
            'INSERT INTO nhan_vien (tai_khoan, mat_khau, ho_ten, email, so_dt, luong_co_ban, trang_thai, quyen, ngay_sinh, dia_chi, chuc_vu, ngay_vao_lam, cccd_truoc, cccd_sau, anh_dai_dien) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [tai_khoan, hashed_mat_khau, ho_ten, email || null, so_dt || null, luong_co_ban || 0, trang_thai || 'hoat_dong', quyen || 'nhanvien', ngay_sinh || null, dia_chi || null, chuc_vu || null, ngay_vao_lam || null, cccd_truoc || null, cccd_sau || null, anh_dai_dien || null]
        );
        res.json({ success: true, message: 'Tạo tài khoản nhân viên thành công', id: result.insertId });
    } catch (error) {
        console.error('Error creating employee:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/employees/:id - Sửa nhân viên
router.put('/employees/:id', checkSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { tai_khoan, mat_khau, ho_ten, email, so_dt, luong_co_ban, trang_thai, quyen, ngay_sinh, dia_chi, chuc_vu, ngay_vao_lam, cccd_truoc, cccd_sau, anh_dai_dien } = req.body;
        
        if (!tai_khoan || !ho_ten) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin bắt buộc' });
        }
        
        // Kiểm tra xem ID có tồn tại trong nhan_vien không
        const [existing] = await pool.query('SELECT ma_nv, mat_khau FROM nhan_vien WHERE ma_nv = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });
        }

        // Kiểm tra tài khoản/email trùng lặp (ngoại trừ chính nó)
        const [existingNv] = await pool.query('SELECT ma_nv FROM nhan_vien WHERE (tai_khoan = ? OR (email = ? AND email IS NOT NULL AND email != "")) AND ma_nv != ?', [tai_khoan, email || '', id]);
        if (existingNv.length > 0) {
            return res.status(400).json({ success: false, message: 'Tài khoản hoặc email đã tồn tại trong hệ thống' });
        }
        
        let finalMatKhau = existing[0].mat_khau;
        if (mat_khau && mat_khau.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            finalMatKhau = await bcrypt.hash(mat_khau, salt);
        }
        
        await pool.query(
            'UPDATE nhan_vien SET tai_khoan=?, mat_khau=?, ho_ten=?, email=?, so_dt=?, luong_co_ban=?, trang_thai=?, quyen=?, ngay_sinh=?, dia_chi=?, chuc_vu=?, ngay_vao_lam=?, cccd_truoc=?, cccd_sau=?, anh_dai_dien=? WHERE ma_nv=?',
            [tai_khoan, finalMatKhau, ho_ten, email || null, so_dt || null, luong_co_ban || 0, trang_thai || 'hoat_dong', quyen || 'nhanvien', ngay_sinh || null, dia_chi || null, chuc_vu || null, ngay_vao_lam || null, cccd_truoc || null, cccd_sau || null, anh_dai_dien || existing[0].anh_dai_dien, id]
        );
        res.json({ success: true, message: 'Cập nhật tài khoản nhân viên thành công' });
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/employees/:id - Xóa/Nghỉ việc nhân viên
router.delete('/employees/:id', checkSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query('DELETE FROM nhan_vien WHERE ma_nv = ?', [id]);
        res.json({ success: true, message: 'Đã xóa tài khoản nhân viên thành công' });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/employees/:id/cccd - Cập nhật ảnh CCCD mặt trước & mặt sau
router.put('/employees/:id/cccd', checkSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { cccd_truoc, cccd_sau } = req.body;
        
        await pool.query(
            'UPDATE nhan_vien SET cccd_truoc = ?, cccd_sau = ? WHERE ma_nv = ?',
            [cccd_truoc || null, cccd_sau || null, id]
        );
        res.json({ success: true, message: 'Đã cập nhật ảnh CCCD thành công' });
    } catch (error) {
        console.error('Error updating CCCD:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/employees/:id/register-face - Đăng ký/Training khuôn mặt cho nhân viên
router.post('/employees/:id/register-face', checkSuperAdmin, async (req, res) => {
    try {
        const axios = require('axios');
        const { id } = req.params;
        const { images } = req.body;
        
        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({ success: false, message: 'Thiếu dữ liệu hình ảnh khuôn mặt' });
        }
        
        const pyRes = await axios.post('http://localhost:5001/register_multi', {
            emp_id: id,
            images: images
        });
        
        res.json(pyRes.data);
    } catch (error) {
        console.error('Error registering face in backend:', error.message);
        const status = error.response ? error.response.status : 500;
        const msg = error.response && error.response.data ? error.response.data.message : 'Không thể kết nối đến dịch vụ nhận diện khuôn mặt.';
        res.status(status).json({ success: false, message: msg });
    }
});

// PUT /api/admin/employees/:id/permissions - Cập nhật phân quyền chi tiết cho nhân viên
router.put('/employees/:id/permissions', checkSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;
        
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ success: false, error: 'Danh sách quyền không hợp lệ' });
        }
        
        // Convert array to JSON string
        const permissionsJson = JSON.stringify(permissions);
        
        // Update allowed_modules in nhan_vien table
        await pool.query(
            'UPDATE nhan_vien SET allowed_modules = ? WHERE ma_nv = ?',
            [permissionsJson, id]
        );
        
        // Log action
        await logAdminAction(req, 'Cập nhật phân quyền', 'nhan_vien', id, `Cập nhật quyền: ${permissions.join(', ')}`);
        
        res.json({ 
            success: true, 
            message: 'Cập nhật phân quyền thành công',
            permissions: permissions
        });
    } catch (error) {
        console.error('Error updating permissions:', error);
        res.status(500).json({ success: false, error: 'Lỗi cập nhật phân quyền' });
    }
});

// ==================== AUDIT LOG HELPER ====================

/**
 * Ghi nhận hành động của admin/nhân viên vào bảng lich_su_admin.
 * @param {object} req - Express request (lấy session, IP, user-agent)
 * @param {string} action - Tên hành động (ví dụ: 'Thêm sản phẩm', 'Cập nhật đơn hàng')
 * @param {string} doi_tuong - Đối tượng bị tác động ('san_pham', 'don_hang', 'danh_gia', ...)
 * @param {string|number} doi_tuong_id - ID đối tượng
 * @param {string} chi_tiet - Mô tả chi tiết
 */
async function logAdminAction(req, action, doi_tuong, doi_tuong_id, chi_tiet) {
    try {
        const user = req.session?.user || {};
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        const userAgent = (req.headers['user-agent'] || '').substring(0, 255);
        
        await pool.query(
            `INSERT INTO lich_su_admin (ma_admin, ho_ten, vai_tro, action, doi_tuong, doi_tuong_id, method, path, ip, user_agent, chi_tiet)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                user.ma_admin || user.ma_nv || null,
                user.ho_ten || 'Unknown',
                user.isEmployee ? 'nhanvien' : (user.quyen || 'admin'),
                action,
                doi_tuong || null,
                doi_tuong_id ? String(doi_tuong_id) : null,
                req.method || 'UNKNOWN',
                (req.originalUrl || req.path || '').substring(0, 255),
                ip,
                userAgent,
                chi_tiet ? String(chi_tiet).substring(0, 500) : null
            ]
        );
    } catch (err) {
        console.error('[AUDIT LOG] Lỗi ghi log:', err.message);
    }
}

// ==================== AUDIT LOG ROUTES ====================

// GET /api/admin/audit-logs - Lấy danh sách lịch sử hoạt động (phân trang, lọc)
router.get('/audit-logs', async (req, res) => {
    try {
        // Chỉ admin/superadmin mới được xem audit logs
        if (req.session.user.isEmployee) {
            return res.status(403).json({ success: false, message: 'Nhân viên không có quyền xem lịch sử hoạt động.' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = (page - 1) * limit;
        const { action, vai_tro, search } = req.query;

        let where = '1=1';
        const params = [];

        if (action) {
            where += ' AND la.action LIKE ?';
            params.push(`%${action}%`);
        }
        if (vai_tro) {
            where += ' AND la.vai_tro = ?';
            params.push(vai_tro);
        }
        if (search) {
            where += ' AND (la.ho_ten LIKE ? OR la.chi_tiet LIKE ? OR la.doi_tuong_id LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM lich_su_admin la WHERE ${where}`,
            params
        );

        const [logs] = await pool.query(
            `SELECT la.* FROM lich_su_admin la WHERE ${where} ORDER BY la.thoi_gian DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({
            success: true,
            data: logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error getting audit logs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ORDER ASSIGNMENT ====================

// PUT /api/admin/orders/:id/assign - Gán nhân viên xử lý đơn hàng
router.put('/orders/:id/assign', async (req, res) => {
    try {
        if (req.session.user && req.session.user.isEmployee) {
            return res.status(403).json({ success: false, message: 'Nhân viên không có quyền thực hiện phân công đơn hàng.' });
        }
        const { id } = req.params;
        const { ma_nv_xu_ly, ghi_chu_noi_bo } = req.body;

        // Kiểm tra đơn hàng tồn tại
        const [orders] = await pool.query('SELECT ma_don, trang_thai FROM don_hang WHERE ma_don = ?', [id]);
        if (orders.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        }

        // Kiểm tra nhân viên tồn tại (nếu gán)
        let tenNhanVien = null;
        if (ma_nv_xu_ly) {
            const [employees] = await pool.query('SELECT ma_nv, ho_ten FROM nhan_vien WHERE ma_nv = ?', [ma_nv_xu_ly]);
            if (employees.length === 0) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên' });
            }
            tenNhanVien = employees[0].ho_ten;
        }

        // Cập nhật đơn hàng
        await pool.query(
            `UPDATE don_hang SET ma_nv_xu_ly = ?, ngay_gan_nv = NOW(), ghi_chu_noi_bo = ? WHERE ma_don = ?`,
            [ma_nv_xu_ly || null, ghi_chu_noi_bo || null, id]
        );

        // Ghi audit log
        const chiTiet = ma_nv_xu_ly
            ? `Gán đơn hàng #${id} cho nhân viên ${tenNhanVien} (ID: ${ma_nv_xu_ly})`
            : `Bỏ gán nhân viên cho đơn hàng #${id}`;
        logAdminAction(req, 'Phân công đơn hàng', 'don_hang', id, chiTiet);

        res.json({
            success: true,
            message: ma_nv_xu_ly ? `Đã gán đơn hàng cho ${tenNhanVien}` : 'Đã bỏ gán nhân viên',
            data: { ma_don: id, ma_nv_xu_ly, ten_nhan_vien: tenNhanVien, ghi_chu_noi_bo }
        });
    } catch (error) {
        console.error('Error assigning order:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== REVIEWS MANAGEMENT (P1.6) ====================

// PUT /api/admin/reviews/:id/reply - Phản hồi đánh giá của khách hàng
router.put('/reviews/:id/reply', async (req, res) => {
    try {
        const { id } = req.params;
        const { phan_hoi } = req.body;

        if (!phan_hoi || !phan_hoi.trim()) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung phản hồi' });
        }

        // Kiểm tra đánh giá tồn tại
        const [reviews] = await pool.query('SELECT ma_dg FROM danh_gia WHERE ma_dg = ?', [id]);
        if (reviews.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
        }

        await pool.query(
            'UPDATE danh_gia SET phan_hoi_shop = ?, ngay_phan_hoi = NOW() WHERE ma_dg = ?',
            [phan_hoi.trim(), id]
        );

        // Ghi audit log
        logAdminAction(req, 'Phản hồi đánh giá', 'danh_gia', id, `Phản hồi: "${phan_hoi.trim().substring(0, 100)}..."`);

        res.json({ success: true, message: 'Đã gửi phản hồi đánh giá thành công' });
    } catch (error) {
        console.error('Error replying review:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/reviews/:id/hide - Ẩn/Hiện đánh giá
router.put('/reviews/:id/hide', async (req, res) => {
    try {
        const { id } = req.params;
        const { an } = req.body; // true = ẩn, false = hiện

        const [reviews] = await pool.query('SELECT ma_dg, an FROM danh_gia WHERE ma_dg = ?', [id]);
        if (reviews.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đánh giá' });
        }

        const newStatus = an !== undefined ? (an ? 1 : 0) : (reviews[0].an ? 0 : 1);
        await pool.query('UPDATE danh_gia SET an = ? WHERE ma_dg = ?', [newStatus, id]);

        const action = newStatus ? 'Ẩn đánh giá' : 'Hiện đánh giá';
        logAdminAction(req, action, 'danh_gia', id, `${action} ID: ${id}`);

        res.json({ success: true, message: newStatus ? 'Đã ẩn đánh giá' : 'Đã hiện đánh giá', data: { an: newStatus } });
    } catch (error) {
        console.error('Error toggling review visibility:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== DASHBOARD COUNTS ====================

// GET /api/admin/dashboard/counts - Tổng đơn hàng, KH, SP, NV
router.get('/dashboard/counts', async (req, res) => {
    try {
        const [[orders]] = await pool.query('SELECT COUNT(*) as cnt FROM don_hang');
        const [[customers]] = await pool.query('SELECT COUNT(*) as cnt FROM khach_hang');
        const [[products]] = await pool.query('SELECT COUNT(*) as cnt FROM san_pham WHERE trang_thai != "deleted"');
        const [[employees]] = await pool.query('SELECT COUNT(*) as cnt FROM nhan_vien WHERE trang_thai != "da_nghi_viec"');

        res.json({
            success: true,
            data: {
                totalOrders: orders.cnt,
                totalCustomers: customers.cnt,
                totalProducts: products.cnt,
                totalEmployees: employees.cnt
            }
        });
    } catch (error) {
        console.error('Error loading counts:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/dashboard/financial?period=today|month|year
router.get('/dashboard/financial', async (req, res) => {
    try {
        const { period = 'month' } = req.query;

        let dateCondition = '';
        let prevDateCondition = '';
        let expenseCond = '';
        let prevExpenseCond = '';

        if (period === 'today') {
            dateCondition = "DATE(dh.thoi_gian) = CURDATE()";
            prevDateCondition = "DATE(dh.thoi_gian) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
            expenseCond = "DATE(ngay) = CURDATE()";
            prevExpenseCond = "DATE(ngay) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
        } else if (period === 'month') {
            dateCondition = "YEAR(dh.thoi_gian) = YEAR(NOW()) AND MONTH(dh.thoi_gian) = MONTH(NOW())";
            prevDateCondition = "YEAR(dh.thoi_gian) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH)) AND MONTH(dh.thoi_gian) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH))";
            expenseCond = "YEAR(ngay) = YEAR(NOW()) AND MONTH(ngay) = MONTH(NOW())";
            prevExpenseCond = "YEAR(ngay) = YEAR(DATE_SUB(NOW(), INTERVAL 1 MONTH)) AND MONTH(ngay) = MONTH(DATE_SUB(NOW(), INTERVAL 1 MONTH))";
        } else if (period === 'year') {
            dateCondition = "YEAR(dh.thoi_gian) = YEAR(NOW())";
            prevDateCondition = "YEAR(dh.thoi_gian) = YEAR(NOW()) - 1";
            expenseCond = "YEAR(ngay) = YEAR(NOW())";
            prevExpenseCond = "YEAR(ngay) = YEAR(NOW()) - 1";
        }

        const query = (cond) => `
            SELECT
                COALESCE(SUM(dh.tong_tien), 0) AS revenue,
                COALESCE(SUM(
                    (SELECT COALESCE(SUM(ct.so_luong * ct.gia_nhap), 0)
                     FROM chi_tiet_don_hang ct
                     WHERE ct.ma_don = dh.ma_don)
                ), 0) AS cost
            FROM don_hang dh
            WHERE dh.trang_thai NOT IN ('cancelled') AND ${cond}
        `;

        const expenseQuery = (cond) => `
            SELECT COALESCE(SUM(so_tien), 0) AS total_expense
            FROM chi_tieu_hang_ngay
            WHERE ${cond}
        `;

        const [[cur]] = await pool.query(query(dateCondition));
        const [[prev]] = await pool.query(query(prevDateCondition));
        
        const [[curExpenseRow]] = await pool.query(expenseQuery(expenseCond));
        const [[prevExpenseRow]] = await pool.query(expenseQuery(prevExpenseCond));

        const revenue = parseFloat(cur.revenue) || 0;
        const cost = parseFloat(cur.cost) || 0;
        const expense = parseFloat(curExpenseRow ? curExpenseRow.total_expense : 0) || 0;
        const profit = revenue - cost - expense;

        const prevRevenue = parseFloat(prev.revenue) || 0;
        const prevCost = parseFloat(prev.cost) || 0;
        const prevExpense = parseFloat(prevExpenseRow ? prevExpenseRow.total_expense : 0) || 0;
        const prevProfit = prevRevenue - prevCost - prevExpense;

        const revenueChange = prevRevenue ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
        const profitChange = prevProfit ? ((profit - prevProfit) / prevProfit) * 100 : 0;

        res.json({
            success: true,
            data: { revenue, profit, prevRevenue, prevProfit, revenueChange, profitChange }
        });
    } catch (error) {
        console.error('Error loading financial:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== SHIFTS (CA LÀM VIỆC) ====================

// GET /api/admin/shifts
router.get('/shifts', async (req, res) => {
    try {
        // Tạo bảng nếu chưa có
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ca_lam_viec (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ten_ca VARCHAR(100) NOT NULL,
                gio_bat_dau TIME NOT NULL,
                gio_ket_thuc TIME NOT NULL,
                mo_ta VARCHAR(255),
                ngay_tao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const [rows] = await pool.query('SELECT * FROM ca_lam_viec ORDER BY gio_bat_dau');
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/shifts
router.post('/shifts', async (req, res) => {
    try {
        const { ten_ca, gio_bat_dau, gio_ket_thuc, mo_ta } = req.body;
        if (!ten_ca || !gio_bat_dau || !gio_ket_thuc) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin ca làm việc' });
        }
        const [result] = await pool.query(
            'INSERT INTO ca_lam_viec (ten_ca, gio_bat_dau, gio_ket_thuc, mo_ta) VALUES (?, ?, ?, ?)',
            [ten_ca, gio_bat_dau, gio_ket_thuc, mo_ta || null]
        );
        res.json({ success: true, message: 'Tạo ca thành công', id: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/shifts/:id
router.put('/shifts/:id', async (req, res) => {
    try {
        const { ten_ca, gio_bat_dau, gio_ket_thuc, mo_ta } = req.body;
        await pool.query(
            'UPDATE ca_lam_viec SET ten_ca=?, gio_bat_dau=?, gio_ket_thuc=?, mo_ta=? WHERE id=?',
            [ten_ca, gio_bat_dau, gio_ket_thuc, mo_ta || null, req.params.id]
        );
        res.json({ success: true, message: 'Cập nhật ca thành công' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/shifts/:id
router.delete('/shifts/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM ca_lam_viec WHERE id=?', [req.params.id]);
        res.json({ success: true, message: 'Đã xóa ca' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== SCHEDULES (PHÂN CÔNG CA) ====================

// GET /api/admin/schedules?date=YYYY-MM-DD
router.get('/schedules', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS phan_cong_ca (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ma_tai_khoan INT NOT NULL,
                ca_id INT NOT NULL,
                ngay_lam DATE NOT NULL,
                ngay_tao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_assign (ma_tai_khoan, ca_id, ngay_lam)
            )
        `);
        const { date } = req.query;
        let query = `
            SELECT pc.*, nv.ho_ten, nv.tai_khoan, clv.ten_ca, clv.gio_bat_dau, clv.gio_ket_thuc
            FROM phan_cong_ca pc
            JOIN nhan_vien nv ON pc.ma_tai_khoan = nv.ma_nv
            JOIN ca_lam_viec clv ON pc.ca_id = clv.id
        `;
        const params = [];
        if (date) {
            query += ' WHERE pc.ngay_lam = ?';
            params.push(date);
        }
        query += ' ORDER BY pc.ngay_lam DESC, clv.gio_bat_dau ASC';
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/schedules
router.post('/schedules', async (req, res) => {
    try {
        const { ma_tai_khoan, ngay_lam, ca_id } = req.body;
        if (!ma_tai_khoan || !ngay_lam || !ca_id) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin phân công' });
        }
        await pool.query(
            'INSERT INTO phan_cong_ca (ma_tai_khoan, ca_id, ngay_lam) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE ngay_tao=NOW()',
            [ma_tai_khoan, ca_id, ngay_lam]
        );
        res.json({ success: true, message: 'Phân công thành công' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/schedules/:id
router.delete('/schedules/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM phan_cong_ca WHERE id=?', [req.params.id]);
        res.json({ success: true, message: 'Đã xóa phân công' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ATTENDANCE (CHẤM CÔNG) ====================

// GET /api/admin/attendance?date=YYYY-MM-DD
router.get('/attendance', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cham_cong (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ma_tai_khoan INT NOT NULL,
                ca_id INT NOT NULL,
                ngay DATE NOT NULL,
                gio_checkin DATETIME,
                lat DECIMAL(10,8),
                lng DECIMAL(11,8),
                trang_thai ENUM('on_time','late','absent') DEFAULT 'on_time',
                phut_tre INT DEFAULT 0,
                ghi_chu VARCHAR(255),
                ngay_tao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        const { date } = req.query;
        const filterDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

        // Lấy danh sách phân công ngày đó
        const [schedules] = await pool.query(`
            SELECT pc.*, nv.ho_ten, nv.tai_khoan, clv.ten_ca, clv.gio_bat_dau, clv.gio_ket_thuc
            FROM phan_cong_ca pc
            JOIN nhan_vien nv ON pc.ma_tai_khoan = nv.ma_nv
            JOIN ca_lam_viec clv ON pc.ca_id = clv.id
            WHERE pc.ngay_lam = ?
        `, [filterDate]);

        // Lấy records chấm công
        const [records] = await pool.query(`
            SELECT cc.*, nv.ho_ten, nv.tai_khoan, clv.ten_ca, clv.gio_bat_dau, clv.gio_ket_thuc
            FROM cham_cong cc
            JOIN nhan_vien nv ON cc.ma_tai_khoan = nv.ma_nv
            JOIN ca_lam_viec clv ON cc.ca_id = clv.id
            WHERE cc.ngay = ?
            ORDER BY cc.gio_checkin DESC
        `, [filterDate]);

        // Tính số vắng: nhân viên được phân công nhưng chưa chấm công
        const checkedIds = new Set(records.map(r => `${r.ma_tai_khoan}-${r.ca_id}`));
        const absentCount = schedules.filter(s => !checkedIds.has(`${s.ma_tai_khoan}-${s.ca_id}`)).length;

        res.json({ success: true, data: records, absentCount, schedules });
    } catch (error) {
        console.error('Error loading attendance:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/attendance/checkin — Nhân viên chấm công (gọi từ trang employee-attendance.html)
router.post('/attendance/checkin', async (req, res) => {
    try {
        const { ma_tai_khoan, ca_id, lat, lng, face_verified, action = 'checkin' } = req.body;
        if (!ma_tai_khoan || !ca_id) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin chấm công' });
        }

        // GPS Distance Verification
        let storeLat = 10.7700;
        let storeLng = 106.6600;
        let maxRadius = 50.0; // 50 meters

        try {
            const [latRow] = await pool.query("SELECT value FROM cau_hinh_shop WHERE `key` = 'shop_lat'");
            const [lngRow] = await pool.query("SELECT value FROM cau_hinh_shop WHERE `key` = 'shop_lng'");
            const [radRow] = await pool.query("SELECT value FROM cau_hinh_shop WHERE `key` = 'shop_attendance_radius'");
            if (latRow.length > 0 && latRow[0].value) storeLat = parseFloat(latRow[0].value);
            if (lngRow.length > 0 && lngRow[0].value) storeLng = parseFloat(lngRow[0].value);
            if (radRow.length > 0 && radRow[0].value) maxRadius = parseFloat(radRow[0].value);
        } catch (dbErr) {
            console.log("Could not load shop GPS settings, using defaults");
        }

        if (lat && lng) {
            const lat1 = parseFloat(lat);
            const lon1 = parseFloat(lng);
            
            // Haversine distance
            const R = 6371e3; // metres
            const φ1 = lat1 * Math.PI/180;
            const φ2 = storeLat * Math.PI/180;
            const Δφ = (storeLat - lat1) * Math.PI/180;
            const Δλ = (storeLng - lon1) * Math.PI/180;

            const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                      Math.cos(φ1) * Math.cos(φ2) *
                      Math.sin(Δλ/2) * Math.sin(Δλ/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c; // in metres

            if (distance > maxRadius) {
                return res.status(400).json({
                    success: false,
                    message: `Bạn không ở trong phạm vi cửa hàng. Khoảng cách hiện tại: ${Math.round(distance)}m (Yêu cầu <= ${maxRadius}m).`
                });
            }
        } else {
            return res.status(400).json({ success: false, message: 'Yêu cầu cung cấp tọa độ GPS để chấm công.' });
        }

        // Lấy thông tin ca
        const [[shift]] = await pool.query('SELECT * FROM ca_lam_viec WHERE id = ?', [ca_id]);
        if (!shift) return res.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc' });

        const now = new Date();
        const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

        // Kiểm tra ca trực và phân công hôm nay của nhân viên
        const [assignRows] = await pool.query(
            'SELECT id FROM phan_cong_ca WHERE ma_tai_khoan=? AND ca_id=? AND ngay_lam=?',
            [ma_tai_khoan, ca_id, today]
        );
        if (assignRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `Lỗi ca trực: Hôm nay bạn không được phân công ca trực này!`
            });
        }

        // Kiểm tra đã chấm công chưa
        const [existing] = await pool.query(
            'SELECT id, gio_checkout FROM cham_cong WHERE ma_tai_khoan=? AND ca_id=? AND ngay=?',
            [ma_tai_khoan, ca_id, today]
        );

        if (action === 'checkin') {
            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: 'Bạn đã check-in ca này rồi!' });
            }

            // Tính số phút trễ (timezone-safe)
            const shiftStart = new Date(`${today}T${shift.gio_bat_dau}:00+07:00`);
            const diffMs = now - shiftStart;
            const phut_tre = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
            const trang_thai = phut_tre > 5 ? 'late' : 'on_time';

            // Lưu chấm công
            await pool.query(
                'INSERT INTO cham_cong (ma_tai_khoan, ca_id, ngay, gio_checkin, lat, lng, trang_thai, phut_tre) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?)',
                [ma_tai_khoan, ca_id, today, lat || null, lng || null, trang_thai, phut_tre]
            );

            // Nếu đi trễ → ghi log (thông báo admin)
            if (trang_thai === 'late') {
                const [[emp]] = await pool.query('SELECT ho_ten, tai_khoan FROM nhan_vien WHERE ma_nv=?', [ma_tai_khoan]);
                console.log(`⚠️ [Chấm công] ${emp?.ho_ten || 'NV'} đi trễ ${phut_tre} phút — Ca: ${shift.ten_ca}`);
            }

            res.json({
                success: true,
                message: trang_thai === 'late'
                    ? `Chấm công vào ca thành công! Bạn đi trễ ${phut_tre} phút.`
                    : 'Chấm công vào ca thành công! Đúng giờ.',
                data: { trang_thai, phut_tre }
            });
        } else {
            // action === 'checkout'
            if (existing.length === 0) {
                return res.status(400).json({ success: false, message: 'Bạn chưa check-in vào ca này hôm nay!' });
            }
            if (existing[0].gio_checkout) {
                return res.status(400).json({ success: false, message: 'Bạn đã check-out ra ca này hôm nay rồi!' });
            }

            await pool.query(
                'UPDATE cham_cong SET gio_checkout = NOW(), lat_checkout = ?, lng_checkout = ? WHERE id = ?',
                [lat || null, lng || null, existing[0].id]
            );

            res.json({
                success: true,
                message: 'Chấm công ra ca thành công! Hẹn gặp lại bạn.'
            });
        }
    } catch (error) {
        console.error('Error checkin:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== DAILY EXPENDITURE MANAGEMENT (QUẢN LÝ CHI TIÊU HẰNG NGÀY) ====================

// GET /api/admin/expenses — Lấy danh sách chi tiêu hằng ngày
router.get('/expenses', async (req, res) => {
    try {
        const { from_date, to_date } = req.query;
        let query = `
            SELECT c.*, l.ten_loai 
            FROM chi_tieu_hang_ngay c
            LEFT JOIN loai_chi_tieu l ON c.loai_id = l.id
        `;
        let params = [];
        if (from_date && to_date) {
            query += ' WHERE c.ngay >= ? AND c.ngay <= ?';
            params = [from_date, to_date];
        } else if (from_date) {
            query += ' WHERE c.ngay >= ?';
            params = [from_date];
        } else if (to_date) {
            query += ' WHERE c.ngay <= ?';
            params = [to_date];
        }
        query += ' ORDER BY c.ngay DESC, c.id DESC';
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/expenses — Thêm chi tiêu mới
router.post('/expenses', async (req, res) => {
    try {
        const { ngay, so_tien, muc_dich, loai_id, nguoi_chi, ghi_chu } = req.body;
        if (!ngay || !so_tien || !muc_dich) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc!' });
        }
        const [result] = await pool.query(
            'INSERT INTO chi_tieu_hang_ngay (ngay, so_tien, muc_dich, loai_id, nguoi_chi, ghi_chu) VALUES (?, ?, ?, ?, ?, ?)',
            [ngay, so_tien, muc_dich, loai_id || null, nguoi_chi || null, ghi_chu || null]
        );
        res.json({ success: true, data: { id: result.insertId, ngay, so_tien, muc_dich, loai_id, nguoi_chi, ghi_chu } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/expenses/:id — Cập nhật chi tiêu
router.put('/expenses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ngay, so_tien, muc_dich, loai_id, nguoi_chi, ghi_chu } = req.body;
        if (!ngay || !so_tien || !muc_dich) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc!' });
        }
        await pool.query(
            'UPDATE chi_tieu_hang_ngay SET ngay = ?, so_tien = ?, muc_dich = ?, loai_id = ?, nguoi_chi = ?, ghi_chu = ? WHERE id = ?',
            [ngay, so_tien, muc_dich, loai_id || null, nguoi_chi || null, ghi_chu || null, id]
        );
        res.json({ success: true, message: 'Cập nhật chi tiêu thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/expenses/:id — Xóa chi tiêu
router.delete('/expenses/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM chi_tieu_hang_ngay WHERE id = ?', [id]);
        res.json({ success: true, message: 'Xóa chi tiêu thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== EXPENSE CATEGORY MANAGEMENT (QUẢN LÝ LOẠI CHI TIÊU) ====================

// GET /api/admin/expense-categories — Lấy danh sách loại chi tiêu kèm đếm số lượng khoản chi
router.get('/expense-categories', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT l.*, COUNT(c.id) as count_expenses
            FROM loai_chi_tieu l
            LEFT JOIN chi_tieu_hang_ngay c ON l.id = c.loai_id
            GROUP BY l.id
            ORDER BY l.ten_loai ASC
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/expense-categories — Thêm loại chi tiêu mới
router.post('/expense-categories', async (req, res) => {
    try {
        const { ten_loai, mo_ta } = req.body;
        if (!ten_loai) {
            return res.status(400).json({ success: false, message: 'Tên loại chi tiêu là bắt buộc!' });
        }
        
        // Kiểm tra xem đã tồn tại chưa
        const [existing] = await pool.query('SELECT id FROM loai_chi_tieu WHERE ten_loai = ?', [ten_loai]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Tên loại chi tiêu này đã tồn tại!' });
        }

        const [result] = await pool.query(
            'INSERT INTO loai_chi_tieu (ten_loai, mo_ta) VALUES (?, ?)',
            [ten_loai, mo_ta || null]
        );
        res.json({ success: true, data: { id: result.insertId, ten_loai, mo_ta } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/expense-categories/:id — Cập nhật loại chi tiêu
router.put('/expense-categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_loai, mo_ta } = req.body;
        if (!ten_loai) {
            return res.status(400).json({ success: false, message: 'Tên loại chi tiêu là bắt buộc!' });
        }

        // Kiểm tra xem tên loại có bị trùng với loại khác không
        const [existing] = await pool.query('SELECT id FROM loai_chi_tieu WHERE ten_loai = ? AND id != ?', [ten_loai, id]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Tên loại chi tiêu này đã được sử dụng!' });
        }

        await pool.query(
            'UPDATE loai_chi_tieu SET ten_loai = ?, mo_ta = ? WHERE id = ?',
            [ten_loai, mo_ta || null, id]
        );
        res.json({ success: true, message: 'Cập nhật loại chi tiêu thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/expense-categories/:id — Xóa loại chi tiêu
router.delete('/expense-categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM loai_chi_tieu WHERE id = ?', [id]);
        res.json({ success: true, message: 'Xóa loại chi tiêu thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== ATTENDANCE & PAYROLL EXTENSION ====================

// GET /api/admin/schedules/my-today — Lấy ca làm việc hôm nay của nhân viên đang đăng nhập
router.get('/schedules/my-today', async (req, res) => {
    try {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập!' });
        }
        const ma_nv = req.session.user.ma_nv;
        if (!ma_nv) {
            return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập tài khoản nhân viên!' });
        }
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        const [rows] = await pool.query(`
            SELECT pc.*, clv.ten_ca, clv.gio_bat_dau, clv.gio_ket_thuc
            FROM phan_cong_ca pc
            JOIN ca_lam_viec clv ON pc.ca_id = clv.id
            WHERE pc.ma_tai_khoan = ? AND pc.ngay_lam = ?
        `, [ma_nv, today]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/attendance/face-checkin — Chấm công khuôn mặt (kết hợp GPS và Ca trực hôm nay)
router.post('/attendance/face-checkin', async (req, res) => {
    try {
        const { image, ca_id, lat, lng, action = 'checkin' } = req.body;
        if (!image || !ca_id) {
            return res.status(400).json({ success: false, message: 'Thiếu hình ảnh hoặc ca làm việc!' });
        }

        const sessionUser = req.session.user;
        if (!sessionUser) {
            return res.status(401).json({ success: false, message: 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại.' });
        }

        // 1. Gọi dịch vụ nhận diện khuôn mặt Python
        const axios = require('axios');
        let recognizeResult;
        try {
            const pythonRes = await axios.post('http://localhost:5001/recognize', { image });
            recognizeResult = pythonRes.data;
        } catch (pyErr) {
            console.error('Lỗi gọi service khuôn mặt:', pyErr.message);
            if (pyErr.response && pyErr.response.data && pyErr.response.data.message) {
                return res.status(pyErr.response.status).json({
                    success: false,
                    message: pyErr.response.data.message
                });
            }
            return res.status(500).json({ success: false, message: 'Không thể kết nối tới dịch vụ nhận diện khuôn mặt. Vui lòng liên hệ kỹ thuật.' });
        }

        if (!recognizeResult.success || !recognizeResult.matched) {
            return res.status(400).json({ 
                success: false, 
                message: recognizeResult.message || 'Không nhận diện được khuôn mặt. Vui lòng điều chỉnh góc chụp hoặc ánh sáng!' 
            });
        }

        const matchedEmpId = recognizeResult.ma_tai_khoan;
        const matchedName = recognizeResult.ho_ten;

        // 2. Kiểm tra phân quyền và chống chấm công hộ
        let finalEmpId = matchedEmpId;
        if (sessionUser.quyen !== 'superadmin') {
            // Nhân viên tự chấm công → Phải trùng khớp khuôn mặt với tài khoản đăng nhập
            if (sessionUser.ma_nv !== matchedEmpId) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Phát hiện sai lệch khuôn mặt! Khuôn mặt nhận diện là "${matchedName}", nhưng tài khoản đăng nhập là "${sessionUser.ho_ten}".` 
                });
            }
            finalEmpId = sessionUser.ma_nv;
        }

        // 3. Định vị GPS kiểm tra khoảng cách cửa hàng
        let storeLat = 10.7700;
        let storeLng = 106.6600;
        let maxRadius = 50.0; // 50m

        try {
            const [latRow] = await pool.query("SELECT value FROM cau_hinh_shop WHERE `key` = 'shop_lat'");
            const [lngRow] = await pool.query("SELECT value FROM cau_hinh_shop WHERE `key` = 'shop_lng'");
            const [radRow] = await pool.query("SELECT value FROM cau_hinh_shop WHERE `key` = 'shop_attendance_radius'");
            if (latRow.length > 0 && latRow[0].value) storeLat = parseFloat(latRow[0].value);
            if (lngRow.length > 0 && lngRow[0].value) storeLng = parseFloat(lngRow[0].value);
            if (radRow.length > 0 && radRow[0].value) maxRadius = parseFloat(radRow[0].value);
        } catch (dbErr) {
            console.log("Using default shop GPS config");
        }

        if (lat && lng) {
            const lat1 = parseFloat(lat);
            const lon1 = parseFloat(lng);
            
            // Haversine distance
            const R = 6371e3; // m
            const φ1 = lat1 * Math.PI/180;
            const φ2 = storeLat * Math.PI/180;
            const Δφ = (storeLat - lat1) * Math.PI/180;
            const Δλ = (storeLng - lon1) * Math.PI/180;

            const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                      Math.cos(φ1) * Math.cos(φ2) *
                      Math.sin(Δλ/2) * Math.sin(Δλ/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c; // m

            if (distance > maxRadius) {
                return res.status(400).json({
                    success: false,
                    message: `Lỗi GPS: Bạn không ở trong phạm vi cửa hàng. Khoảng cách hiện tại: ${Math.round(distance)}m (Yêu cầu <= ${maxRadius}m).`
                });
            }
        } else {
            return res.status(400).json({ success: false, message: 'Yêu cầu định vị GPS để xác thực vị trí chấm công.' });
        }

        // 4. Kiểm tra ca trực và phân công hôm nay của nhân viên
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        const [assignRows] = await pool.query(
            'SELECT id FROM phan_cong_ca WHERE ma_tai_khoan=? AND ca_id=? AND ngay_lam=?',
            [finalEmpId, ca_id, today]
        );
        if (assignRows.length === 0) {
            return res.status(400).json({
                success: false,
                message: `Lỗi ca trực: Hôm nay bạn không được phân công ca trực này!`
            });
        }

        // 5. Kiểm tra xem đã chấm công ca này chưa
        const [existing] = await pool.query(
            'SELECT id, gio_checkout FROM cham_cong WHERE ma_tai_khoan=? AND ca_id=? AND ngay=?',
            [finalEmpId, ca_id, today]
        );

        if (action === 'checkin') {
            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: 'Bạn đã check-in ca này trong ngày hôm nay rồi!' });
            }

            // 6. Tính số phút trễ (timezone-safe)
            const [[shift]] = await pool.query('SELECT * FROM ca_lam_viec WHERE id = ?', [ca_id]);
            if (!shift) return res.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc' });

            const now = new Date();
            const shiftStart = new Date(`${today}T${shift.gio_bat_dau}:00+07:00`);

            const diffMs = now - shiftStart;
            const phut_tre = diffMs > 0 ? Math.floor(diffMs / 60000) : 0;
            const trang_thai = phut_tre > 5 ? 'late' : 'on_time';

            // 7. Lưu chấm công
            await pool.query(
                'INSERT INTO cham_cong (ma_tai_khoan, ca_id, ngay, gio_checkin, lat, lng, trang_thai, phut_tre) VALUES (?, ?, ?, NOW(), ?, ?, ?, ?)',
                [finalEmpId, ca_id, today, lat || null, lng || null, trang_thai, phut_tre]
            );

            res.json({
                success: true,
                message: trang_thai === 'late'
                    ? `Nhận diện thành công: ${matchedName}. Chấm công vào ca hoàn tất (Đi trễ ${phut_tre} phút).`
                    : `Nhận diện thành công: ${matchedName}. Chấm công vào ca hoàn tất đúng giờ!`,
                employee: matchedName,
                data: { trang_thai, phut_tre }
            });
        } else {
            // action === 'checkout'
            if (existing.length === 0) {
                return res.status(400).json({ success: false, message: 'Bạn chưa check-in vào ca này ngày hôm nay!' });
            }
            if (existing[0].gio_checkout) {
                return res.status(400).json({ success: false, message: 'Bạn đã check-out ra ca này hôm nay rồi!' });
            }

            // Cập nhật thông tin checkout
            await pool.query(
                'UPDATE cham_cong SET gio_checkout = NOW(), lat_checkout = ?, lng_checkout = ? WHERE id = ?',
                [lat || null, lng || null, existing[0].id]
            );

            res.json({
                success: true,
                message: `Nhận diện thành công: ${matchedName}. Chấm công ra ca hoàn tất! Hẹn gặp lại bạn.`,
                employee: matchedName
            });
        }
    } catch (error) {
        console.error('Error face checkin:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/payroll — Lấy danh sách bảng lương của tháng
router.get('/payroll', async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tham số tháng (YYYY-MM)!' });
        }
        const [rows] = await pool.query(`
            SELECT bl.*, nv.ho_ten, nv.tai_khoan, nv.chuc_vu
            FROM bang_luong bl
            JOIN nhan_vien nv ON bl.ma_nv = nv.ma_nv
            WHERE bl.thang = ?
            ORDER BY nv.ho_ten ASC
        `, [month]);
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/payroll/calculate — Tính toán/Cập nhật bảng lương cho tháng
router.post('/payroll/calculate', async (req, res) => {
    try {
        const { month } = req.body;
        if (!month) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập tháng cần tính lương!' });
        }
        
        // Lấy danh sách toàn bộ nhân viên hoạt động
        const [employees] = await pool.query('SELECT ma_nv, ho_ten, luong_co_ban FROM nhan_vien WHERE trang_thai = "hoat_dong"');
        
        for (const emp of employees) {
            // Đếm số ca đã chấm công trong tháng
            const [attRows] = await pool.query(`
                SELECT COUNT(id) as so_ca, COALESCE(SUM(phut_tre), 0) as total_late
                FROM cham_cong
                WHERE ma_tai_khoan = ? AND DATE_FORMAT(ngay, '%Y-%m') = ? AND trang_thai IN ('on_time', 'late')
            `, [emp.ma_nv, month]);
            
            const so_ca_lam = attRows[0].so_ca || 0;
            const so_phut_tre = attRows[0].total_late || 0;
            
            // Tiền phạt trễ: 5,000đ mỗi phút trễ
            const tong_phat_tre = so_phut_tre * 5000;
            
            // Lương thực lĩnh = (so_ca_lam * (luong_co_ban / 26)) - tong_phat_tre
            const luong_theo_ca = emp.luong_co_ban / 26;
            let luong_thuc_linh = (so_ca_lam * luong_theo_ca) - tong_phat_tre;
            if (luong_thuc_linh < 0) luong_thuc_linh = 0;
            
            // Chèn hoặc cập nhật bảng lương
            await pool.query(`
                INSERT INTO bang_luong (ma_nv, thang, luong_co_ban, so_ca_lam, so_phut_tre, tong_phat_tre, luong_thuc_linh, trang_thai)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'chua_thanh_toan')
                ON DUPLICATE KEY UPDATE
                    luong_co_ban = VALUES(luong_co_ban),
                    so_ca_lam = VALUES(so_ca_lam),
                    so_phut_tre = VALUES(so_phut_tre),
                    tong_phat_tre = VALUES(tong_phat_tre),
                    luong_thuc_linh = VALUES(luong_thuc_linh)
            `, [emp.ma_nv, month, emp.luong_co_ban, so_ca_lam, so_phut_tre, tong_phat_tre, luong_thuc_linh]);
        }
        
        res.json({ success: true, message: `Đã tính toán bảng lương tháng ${month} thành công!` });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/payroll/:id/status — Cập nhật trạng thái thanh toán bảng lương
router.put('/payroll/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { trang_thai } = req.body;
        if (!trang_thai) {
            return res.status(400).json({ success: false, message: 'Thiếu trạng thái thanh toán!' });
        }
        await pool.query('UPDATE bang_luong SET trang_thai = ? WHERE id = ?', [trang_thai, id]);
        res.json({ success: true, message: 'Cập nhật trạng thái thanh toán thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/payroll/:id — Xóa bản ghi bảng lương
router.delete('/payroll/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM bang_luong WHERE id = ?', [id]);
        res.json({ success: true, message: 'Xóa bản ghi bảng lương thành công!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================================
// CATALOG MÀU SẮC (dùng chung cho mọi sản phẩm)
// ============================================================================

// GET /api/admin/colors - Lấy toàn bộ màu trong catalog
router.get('/colors', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT ma_mau, ten_mau, ma_hex, mo_ta, trang_thai,
                    (SELECT COUNT(*) FROM bien_the_san_pham WHERE ma_mau = mau_sac.ma_mau) AS so_bien_the
             FROM mau_sac
             ORDER BY ten_mau ASC`
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/colors - Thêm màu vào catalog
router.post('/colors', async (req, res) => {
    try {
        const { ten_mau, ma_hex, mo_ta } = req.body;
        if (!ten_mau || !ten_mau.trim()) {
            return res.status(400).json({ success: false, message: 'Tên màu không được trống' });
        }
        const hex = (ma_hex || '').trim() || null;
        const [result] = await pool.query(
            'INSERT INTO mau_sac (ten_mau, ma_hex, mo_ta) VALUES (?, ?, ?)',
            [ten_mau.trim(), hex, (mo_ta || '').trim() || null]
        );
        res.json({ success: true, data: { ma_mau: result.insertId, ten_mau, ma_hex: hex } });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Màu này đã tồn tại' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/colors/:id - Cập nhật màu
router.put('/colors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_mau, ma_hex, mo_ta, trang_thai } = req.body;
        if (!ten_mau || !ten_mau.trim()) {
            return res.status(400).json({ success: false, message: 'Tên màu không được trống' });
        }
        await pool.query(
            `UPDATE mau_sac SET ten_mau = ?, ma_hex = ?, mo_ta = ?, trang_thai = ? WHERE ma_mau = ?`,
            [ten_mau.trim(), (ma_hex || '').trim() || null, (mo_ta || '').trim() || null,
             trang_thai === 'inactive' ? 'inactive' : 'active', id]
        );
        res.json({ success: true });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Tên màu đã tồn tại' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/colors/:id - Xóa màu khỏi catalog
router.delete('/colors/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [[{ cnt }]] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM bien_the_san_pham WHERE ma_mau = ?', [id]
        );
        if (cnt > 0) {
            return res.status(400).json({
                success: false,
                message: `Không thể xóa: màu này đang được dùng ở ${cnt} biến thể. Hãy ẩn thay vì xóa.`
            });
        }
        await pool.query('DELETE FROM mau_sac WHERE ma_mau = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================================
// CATALOG DUNG LƯỢNG (dùng chung cho mọi sản phẩm)
// ============================================================================

// GET /api/admin/storages
router.get('/storages', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT ma_dung_luong, ten_dung_luong, kich_thuoc_gb, trang_thai,
                    (SELECT COUNT(*) FROM bien_the_san_pham WHERE ma_dung_luong = dung_luong.ma_dung_luong) AS so_bien_the
             FROM dung_luong
             ORDER BY COALESCE(kich_thuoc_gb, 0) ASC, ten_dung_luong ASC`
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/storages
router.post('/storages', async (req, res) => {
    try {
        const { ten_dung_luong, kich_thuoc_gb } = req.body;
        if (!ten_dung_luong || !ten_dung_luong.trim()) {
            return res.status(400).json({ success: false, message: 'Tên dung lượng không được trống' });
        }
        const size = kich_thuoc_gb ? parseInt(kich_thuoc_gb) : null;
        const [result] = await pool.query(
            'INSERT INTO dung_luong (ten_dung_luong, kich_thuoc_gb) VALUES (?, ?)',
            [ten_dung_luong.trim(), size]
        );
        res.json({ success: true, data: { ma_dung_luong: result.insertId, ten_dung_luong, kich_thuoc_gb: size } });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Dung lượng này đã tồn tại' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/storages/:id
router.put('/storages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_dung_luong, kich_thuoc_gb, trang_thai } = req.body;
        if (!ten_dung_luong || !ten_dung_luong.trim()) {
            return res.status(400).json({ success: false, message: 'Tên dung lượng không được trống' });
        }
        await pool.query(
            `UPDATE dung_luong SET ten_dung_luong = ?, kich_thuoc_gb = ?, trang_thai = ? WHERE ma_dung_luong = ?`,
            [ten_dung_luong.trim(), kich_thuoc_gb ? parseInt(kich_thuoc_gb) : null,
             trang_thai === 'inactive' ? 'inactive' : 'active', id]
        );
        res.json({ success: true });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Tên dung lượng đã tồn tại' });
        }
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /api/admin/storages/:id
router.delete('/storages/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [[{ cnt }]] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM bien_the_san_pham WHERE ma_dung_luong = ?', [id]
        );
        if (cnt > 0) {
            return res.status(400).json({
                success: false,
                message: `Không thể xóa: dung lượng này đang được dùng ở ${cnt} biến thể. Hãy ẩn thay vì xóa.`
            });
        }
        await pool.query('DELETE FROM dung_luong WHERE ma_dung_luong = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================================================
// MỞ RỘNG: set ảnh chính cho 1 màu + cập nhật variants nhận ma_mau/ma_dung_luong
// ============================================================================

// PATCH /api/admin/products/:id/color-images/:imageId/set-main
// Đặt ảnh này làm ảnh CHÍNH cho màu của nó (các ảnh khác cùng màu bị bỏ flag).
router.patch('/products/:id/color-images/:imageId/set-main', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { id, imageId } = req.params;
        await conn.beginTransaction();
        const [rows] = await conn.query(
            'SELECT ma_sp, mau_sac, ma_mau FROM hinh_anh_bien_the WHERE ma_anh = ? AND ma_sp = ?',
            [imageId, id]
        );
        if (rows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh' });
        }
        const { mau_sac, ma_mau } = rows[0];
        // Bỏ flag mọi ảnh cùng màu
        if (ma_mau) {
            await conn.query(
                'UPDATE hinh_anh_bien_the SET la_anh_chinh = 0 WHERE ma_sp = ? AND ma_mau = ?',
                [id, ma_mau]
            );
        } else {
            await conn.query(
                'UPDATE hinh_anh_bien_the SET la_anh_chinh = 0 WHERE ma_sp = ? AND mau_sac = ?',
                [id, mau_sac]
            );
        }
        await conn.query(
            'UPDATE hinh_anh_bien_the SET la_anh_chinh = 1 WHERE ma_anh = ?',
            [imageId]
        );
        await conn.commit();
        res.json({ success: true });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        res.status(500).json({ success: false, message: error.message });
    } finally {
        conn.release();
    }
});

// PUT /api/admin/products/:id/variants-v2 — version mới: nhận ma_mau + ma_dung_luong + gia_ban
// Body: { variants: [{ma_mau, ma_dung_luong, gia_ban, gia_khuyen_mai, so_luong, sku, trang_thai}], syncStock: true }
// Phép cũ (PUT /products/:id/variants) vẫn giữ để backward-compat với màn legacy.
router.put('/products/:id/variants-v2', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const { id } = req.params;
        const { variants, syncStock } = req.body;
        if (!Array.isArray(variants)) {
            return res.status(400).json({ success: false, message: 'variants phải là mảng' });
        }

        // Pre-load catalog để lookup tên + hex
        const [colorRows] = await pool.query('SELECT ma_mau, ten_mau, ma_hex FROM mau_sac');
        const [storageRows] = await pool.query('SELECT ma_dung_luong, ten_dung_luong FROM dung_luong');
        const colorMap = new Map(colorRows.map(c => [c.ma_mau, c]));
        const storageMap = new Map(storageRows.map(s => [s.ma_dung_luong, s]));

        // Lấy giá gốc của sản phẩm để tính gia_chenh
        const [prodCheck] = await conn.query('SELECT ma_sp, gia FROM san_pham WHERE ma_sp = ?', [id]);
        if (prodCheck.length === 0) {
            return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });
        }
        const productBasePrice = parseFloat(prodCheck[0].gia) || 0;

        const cleaned = [];
        const seen = new Set();
        for (const v of variants) {
            const ma_mau = parseInt(v.ma_mau);
            const ma_dung_luong = parseInt(v.ma_dung_luong);
            if (!ma_mau || !colorMap.has(ma_mau)) {
                return res.status(400).json({ success: false, message: 'Mã màu không hợp lệ' });
            }
            if (!ma_dung_luong || !storageMap.has(ma_dung_luong)) {
                return res.status(400).json({ success: false, message: 'Mã dung lượng không hợp lệ' });
            }
            const key = `${ma_mau}__${ma_dung_luong}`;
            if (seen.has(key)) {
                const c = colorMap.get(ma_mau);
                const s = storageMap.get(ma_dung_luong);
                return res.status(400).json({
                    success: false,
                    message: `Biến thể trùng: ${c.ten_mau} - ${s.ten_dung_luong}`
                });
            }
            seen.add(key);

            const sl = parseInt(v.so_luong);
            if (Number.isNaN(sl) || sl < 0) {
                return res.status(400).json({ success: false, message: 'Số lượng không hợp lệ' });
            }
            const gia_ban = v.gia_ban != null && v.gia_ban !== '' ? parseFloat(v.gia_ban) : null;
            const gia_khuyen_mai = v.gia_khuyen_mai != null && v.gia_khuyen_mai !== '' ? parseFloat(v.gia_khuyen_mai) : null;
            const gia_nhap = v.gia_nhap != null && v.gia_nhap !== '' ? parseFloat(v.gia_nhap) : null;

            if (gia_ban !== null && gia_ban < 0) {
                return res.status(400).json({ success: false, message: 'Giá bán biến thể không được âm' });
            }
            if (gia_khuyen_mai !== null && gia_khuyen_mai < 0) {
                return res.status(400).json({ success: false, message: 'Giá khuyến mãi biến thể không được âm' });
            }
            if (gia_nhap !== null && gia_nhap < 0) {
                return res.status(400).json({ success: false, message: 'Giá nhập biến thể không được âm' });
            }

            // Tính toán gia_chenh dựa trên gia_ban và productBasePrice
            let gia_chenh = parseFloat(v.gia_chenh) || 0;
            if (gia_ban != null && productBasePrice > 0) {
                gia_chenh = gia_ban - productBasePrice;
            }

            const c = colorMap.get(ma_mau);
            const s = storageMap.get(ma_dung_luong);
            cleaned.push({
                ma_mau, ma_dung_luong,
                mau_sac: c.ten_mau,
                mau_hex: c.ma_hex,
                dung_luong: s.ten_dung_luong,
                so_luong: sl,
                gia_ban,
                gia_khuyen_mai,
                gia_nhap,
                gia_chenh,
                sku: v.sku ? String(v.sku).slice(0, 80) : null,
                trang_thai: v.trang_thai === 'inactive' ? 'inactive' : 'active'
            });
        }

        await conn.beginTransaction();
        await conn.query('DELETE FROM bien_the_san_pham WHERE ma_sp = ?', [id]);

        if (cleaned.length > 0) {
            const values = cleaned.map(v => [
                id, v.mau_sac, v.mau_hex, v.ma_mau, v.ma_dung_luong,
                v.dung_luong, v.so_luong, v.gia_chenh, v.gia_ban, v.gia_khuyen_mai,
                v.gia_nhap, v.sku, v.trang_thai
            ]);
            await conn.query(
                `INSERT INTO bien_the_san_pham
                 (ma_sp, mau_sac, mau_hex, ma_mau, ma_dung_luong, dung_luong, so_luong, gia_chenh, gia_ban, gia_khuyen_mai, gia_nhap, sku, trang_thai)
                 VALUES ?`,
                [values]
            );
        }

        if (syncStock !== false) {
            const totalStock = cleaned
                .filter(v => v.trang_thai === 'active')
                .reduce((s, v) => s + v.so_luong, 0);
            await conn.query('UPDATE san_pham SET so_luong_ton = ? WHERE ma_sp = ?', [totalStock, id]);
        }

        // Sync san_pham.mau_sac (text JSON dùng cho FE products page)
        const colorNames = [], colorHexes = [];
        const seenColors = new Set();
        for (const v of cleaned) {
            if (v.trang_thai !== 'active') continue;
            if (seenColors.has(v.ma_mau)) continue;
            seenColors.add(v.ma_mau);
            colorNames.push(v.mau_sac);
            colorHexes.push(v.mau_hex || '#1C1C1C');
        }
        const mauSacJson = colorNames.length > 0
            ? JSON.stringify({ colorNames, colors: colorHexes })
            : null;
        await conn.query('UPDATE san_pham SET mau_sac = ? WHERE ma_sp = ?', [mauSacJson, id]);

        await conn.commit();
        res.json({ success: true, data: { count: cleaned.length } });
    } catch (error) {
        try { await conn.rollback(); } catch (_) {}
        console.error('variants-v2 error:', error && error.message);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        conn.release();
    }
});

// GET /api/admin/products/:id/variants-v2 — trả về kèm ma_mau/ma_dung_luong/gia_ban
router.get('/products/:id/variants-v2', async (req, res) => {
    try {
        const { id } = req.params;
        const [variants] = await pool.query(
            `SELECT bt.ma_bt, bt.ma_sp, bt.ma_mau, bt.ma_dung_luong,
                    bt.mau_sac, bt.mau_hex, bt.dung_luong,
                    bt.so_luong, bt.gia_chenh, bt.gia_ban, bt.gia_khuyen_mai, bt.gia_nhap,
                    bt.sku, bt.trang_thai,
                    m.ten_mau, m.ma_hex AS catalog_hex,
                    d.ten_dung_luong, d.kich_thuoc_gb
             FROM bien_the_san_pham bt
             LEFT JOIN mau_sac m ON bt.ma_mau = m.ma_mau
             LEFT JOIN dung_luong d ON bt.ma_dung_luong = d.ma_dung_luong
             WHERE bt.ma_sp = ?
             ORDER BY m.ten_mau ASC, d.kich_thuoc_gb ASC`,
            [id]
        );
        res.json({ success: true, data: variants });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/products/:id/color-images-v2 — upload kèm ma_mau + la_anh_chinh
router.post('/products/:id/color-images-v2', (req, res) => {
    upload.single('image')(req, res, async function (err) {
        if (err) return res.status(400).json({ success: false, message: err.message });
        if (!req.file) return res.status(400).json({ success: false, message: 'Không có file' });
        try {
            const { id } = req.params;
            const ma_mau = parseInt(req.body.ma_mau);
            const la_anh_chinh = req.body.la_anh_chinh === '1' || req.body.la_anh_chinh === 'true' ? 1 : 0;
            if (!ma_mau) return res.status(400).json({ success: false, message: 'Thiếu ma_mau' });

            const [colorRows] = await pool.query('SELECT ten_mau FROM mau_sac WHERE ma_mau = ?', [ma_mau]);
            if (colorRows.length === 0) {
                return res.status(400).json({ success: false, message: 'Màu không tồn tại trong catalog' });
            }
            const ten_mau = colorRows[0].ten_mau;
            const imageUrl = 'images/products/' + req.file.filename;

            if (la_anh_chinh) {
                await pool.query(
                    'UPDATE hinh_anh_bien_the SET la_anh_chinh = 0 WHERE ma_sp = ? AND ma_mau = ?',
                    [id, ma_mau]
                );
            }
            const [result] = await pool.query(
                `INSERT INTO hinh_anh_bien_the (ma_sp, ma_mau, mau_sac, duong_dan, la_anh_chinh)
                 VALUES (?, ?, ?, ?, ?)`,
                [id, ma_mau, ten_mau, imageUrl, la_anh_chinh]
            );
            res.json({
                success: true,
                data: {
                    ma_anh: result.insertId,
                    ma_sp: Number(id),
                    ma_mau,
                    mau_sac: ten_mau,
                    duong_dan: imageUrl,
                    la_anh_chinh
                }
            });
        } catch (e) {
            res.status(500).json({ success: false, message: e.message });
        }
    });
});

// GET /api/admin/products/:id/color-images-v2?ma_mau=X
router.get('/products/:id/color-images-v2', async (req, res) => {
    try {
        const { id } = req.params;
        const ma_mau = req.query.ma_mau ? parseInt(req.query.ma_mau) : null;
        let rows;
        if (ma_mau) {
            [rows] = await pool.query(
                `SELECT ma_anh, ma_sp, ma_mau, mau_sac, duong_dan, thu_tu, la_anh_chinh
                 FROM hinh_anh_bien_the
                 WHERE ma_sp = ? AND ma_mau = ?
                 ORDER BY la_anh_chinh DESC, thu_tu ASC, ma_anh ASC`,
                [id, ma_mau]
            );
        } else {
            [rows] = await pool.query(
                `SELECT h.ma_anh, h.ma_sp, h.ma_mau, h.mau_sac, h.duong_dan, h.thu_tu, h.la_anh_chinh,
                        m.ten_mau, m.ma_hex
                 FROM hinh_anh_bien_the h
                 LEFT JOIN mau_sac m ON h.ma_mau = m.ma_mau
                 WHERE h.ma_sp = ?
                 ORDER BY m.ten_mau, h.la_anh_chinh DESC, h.thu_tu ASC`,
                [id]
            );
        }
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/employees/:id/permissions - Cập nhật phân quyền chi tiết cho nhân viên
router.put('/employees/:id/permissions', async (req, res) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;
        
        if (!Array.isArray(permissions)) {
            return res.status(400).json({ success: false, error: 'Danh sách quyền không hợp lệ' });
        }
        
        // Convert array to JSON string
        const permissionsJson = JSON.stringify(permissions);
        
        // Update allowed_modules in nhan_vien table
        await pool.query(
            'UPDATE nhan_vien SET allowed_modules = ? WHERE ma_nv = ?',
            [permissionsJson, id]
        );
        
        res.json({ 
            success: true, 
            message: 'Cập nhật phân quyền thành công',
            permissions: permissions
        });
    } catch (error) {
        console.error('Error updating permissions:', error);
        res.status(500).json({ success: false, error: 'Lỗi cập nhật phân quyền' });
    }
});

// ==================== IMEI MANAGEMENT ====================

// GET /api/admin/imei/stats - Thống kê IMEI theo trạng thái
router.get('/imei/stats', checkPermission('nav-imei'), async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT trang_thai, COUNT(*) AS so_luong
            FROM imei_san_pham
            GROUP BY trang_thai
        `);
        const stats = { in_stock: 0, sold: 0, reserved: 0, returned: 0, total: 0 };
        rows.forEach(r => {
            stats[r.trang_thai] = Number(r.so_luong) || 0;
            stats.total += Number(r.so_luong) || 0;
        });
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error fetching IMEI stats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/imei - Danh sách IMEI có filter
// Query: status, ma_sp, search (theo imei), limit (default 200)
router.get('/imei', checkPermission('nav-imei'), async (req, res) => {
    try {
        const { status, ma_sp, search } = req.query;
        const limit = Math.min(parseInt(req.query.limit) || 200, 1000);

        const wheres = [];
        const params = [];
        if (status && ['in_stock', 'sold', 'reserved', 'returned'].includes(status)) {
            wheres.push('im.trang_thai = ?');
            params.push(status);
        }
        if (ma_sp) {
            wheres.push('im.ma_sp = ?');
            params.push(ma_sp);
        }
        if (search) {
            wheres.push('im.imei LIKE ?');
            params.push(`%${search}%`);
        }
        const whereClause = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';

        const [rows] = await pool.query(`
            SELECT im.ma_imei, im.imei, im.trang_thai, im.ngay_nhap, im.ngay_ban,
                   im.ma_sp, im.ma_bt, im.ma_ct_don,
                   sp.ten_sp,
                   bt.mau_sac, bt.mau_hex, bt.dung_luong, bt.sku,
                   ct.ma_don
            FROM imei_san_pham im
            LEFT JOIN san_pham sp ON im.ma_sp = sp.ma_sp
            LEFT JOIN bien_the_san_pham bt ON im.ma_bt = bt.ma_bt
            LEFT JOIN chi_tiet_don_hang ct ON im.ma_ct_don = ct.ma_ct_don
            ${whereClause}
            ORDER BY im.ngay_nhap DESC, im.ma_imei DESC
            LIMIT ?
        `, [...params, limit]);

        res.json({ success: true, data: rows, count: rows.length });
    } catch (error) {
        console.error('Error fetching IMEI list:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;

