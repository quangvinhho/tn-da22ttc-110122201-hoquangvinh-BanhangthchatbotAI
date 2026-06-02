// API routes cho Admin Dashboard
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs'); // Thêm bcrypt để băm mật khẩu nhân viên

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
        console.log('❌ Admin auth failed: No session or user');
        console.log('Session:', req.session);
        return res.status(401).json({ 
            success: false, 
            message: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
            code: 'AUTH_REQUIRED'
        });
    }

    if (req.session.user.vai_tro !== 'admin') {
        console.log('❌ Admin auth failed: Not admin role');
        console.log('User role:', req.session.user.vai_tro);
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

// GET /api/admin/orders - Lấy tất cả đơn hàng (bao gồm thông tin đặt cọc)
router.get('/orders', async (req, res) => {
    try {
        const [orders] = await pool.query(`
            SELECT dh.*, 
                   (SELECT COUNT(*) FROM chi_tiet_don_hang WHERE ma_don = dh.ma_don) as so_san_pham
            FROM don_hang dh
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
            'SELECT trang_thai, ma_km FROM don_hang WHERE ma_don = ?',
            [id]
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        }
        
        const oldStatus = orders[0].trang_thai;
        const maKm = orders[0].ma_km;
        
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
            // Hoàn lại số lượng tồn kho
            const [orderItems] = await connection.query(
                'SELECT ma_sp, so_luong FROM chi_tiet_don_hang WHERE ma_don = ?',
                [id]
            );
            
            for (const item of orderItems) {
                await connection.query(
                    'UPDATE san_pham SET so_luong_ton = so_luong_ton + ? WHERE ma_sp = ?',
                    [item.so_luong, item.ma_sp]
                );
            }
            console.log(`Order ${id} cancelled - Stock restored for ${orderItems.length} items`);
            
            // Hoàn lại voucher nếu có
            if (maKm) {
                await connection.query(
                    'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
                    [maKm]
                );
                console.log(`Voucher refunded for cancelled order. Updated so_luong_da_dung for ma_km=${maKm}`);
            }
            
            // Hoàn lại tất cả voucher đã dùng trong đơn hàng (từ bảng lich_su_voucher)
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
                    }
                }
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
            'SELECT trang_thai, ma_km FROM don_hang WHERE ma_don = ?',
            [id]
        );
        
        if (orders.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        }
        
        const oldStatus = orders[0].trang_thai;
        const maKm = orders[0].ma_km;
        
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
        
        // Hoàn lại số lượng tồn kho
        const [orderItems] = await connection.query(
            'SELECT ma_sp, so_luong FROM chi_tiet_don_hang WHERE ma_don = ?',
            [id]
        );
        
        for (const item of orderItems) {
            await connection.query(
                'UPDATE san_pham SET so_luong_ton = so_luong_ton + ? WHERE ma_sp = ?',
                [item.so_luong, item.ma_sp]
            );
        }
        console.log(`Order ${id} cancelled - Stock restored for ${orderItems.length} items`);
        
        // Hoàn lại voucher nếu có
        if (maKm) {
            await connection.query(
                'UPDATE khuyen_mai SET so_luong_da_dung = GREATEST(0, so_luong_da_dung - 1) WHERE ma_km = ?',
                [maKm]
            );
            console.log(`Voucher refunded for cancelled order. Updated so_luong_da_dung for ma_km=${maKm}`);
        }
        
        // Hoàn lại tất cả voucher đã dùng trong đơn hàng (từ bảng lich_su_voucher)
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
                }
            }
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
router.get('/customers', checkSuperAdmin, async (req, res) => {
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
router.get('/customers/:id', checkSuperAdmin, async (req, res) => {
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
router.put('/customers/:id/status', checkSuperAdmin, async (req, res) => {
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
router.delete('/customers/:id', checkSuperAdmin, async (req, res) => {
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
        await fetch('http://127.0.0.1:8000/api/reload-vectorstore', { method: 'POST' });
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
                   (SELECT COUNT(*) FROM danh_gia WHERE ma_sp = sp.ma_sp) as review_count,
                   (SELECT AVG(so_sao) FROM danh_gia WHERE ma_sp = sp.ma_sp) as avg_rating
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            ORDER BY sp.ma_sp DESC
        `);
        
        res.json({ success: true, data: products });
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/products - Thêm sản phẩm mới (kèm thông số kỹ thuật)
router.post('/products', async (req, res) => {
    try {
        const { ten_sp, ma_hang, gia, gia_nhap, gia_giam, bo_nho, so_luong_ton, mau_sac, ten_mau_sac, mo_ta_ngan, mo_ta, anh_dai_dien, cau_hinh } = req.body;
        
        // Validation
        if (!ten_sp || !ten_sp.trim()) {
            return res.status(400).json({ success: false, message: 'Tên sản phẩm không được để trống' });
        }
        
        const price = parseFloat(gia);
        if (!price || price <= 0) {
            return res.status(400).json({ success: false, message: 'Giá sản phẩm phải lớn hơn 0' });
        }

        const discountPrice = gia_giam ? parseFloat(gia_giam) : null;
        if (discountPrice && discountPrice >= price) {
            return res.status(400).json({ success: false, message: 'Giá giảm phải nhỏ hơn giá gốc' });
        }
        
        const stock = parseInt(so_luong_ton) || 0;
        if (stock < 0) {
            return res.status(400).json({ success: false, message: 'Số lượng tồn kho không được âm' });
        }
        
        // Lưu màu sắc dạng JSON object chứa cả hex và tên
        let colorData = null;
        if (mau_sac) {
            try {
                const hexColors = typeof mau_sac === 'string' ? JSON.parse(mau_sac) : mau_sac;
                const colorNames = ten_mau_sac ? (typeof ten_mau_sac === 'string' ? JSON.parse(ten_mau_sac) : ten_mau_sac) : [];
                colorData = JSON.stringify({ colors: hexColors, colorNames: colorNames });
            } catch(e) {
                colorData = mau_sac; // Fallback: giữ nguyên nếu không parse được
            }
        }
        
        const importPrice = parseFloat(gia_nhap) || (price * 0.7); // Fallback nếu không có giá nhập

        // Thêm sản phẩm (ngay_cap_nhat sẽ tự động set bởi MySQL DEFAULT CURRENT_TIMESTAMP)
        const [result] = await pool.query(
            `INSERT INTO san_pham (ten_sp, ma_hang, gia, gia_nhap, gia_giam, bo_nho, so_luong_ton, mau_sac, mo_ta_ngan, mo_ta, anh_dai_dien) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ten_sp, ma_hang, gia, importPrice, discountPrice, bo_nho || 128, so_luong_ton || 0, colorData, mo_ta_ngan, mo_ta, anh_dai_dien]
        );
        
        const productId = result.insertId;
        
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
        
        if (rows.length === 0) {
            return res.json({ success: true, data: null });
        }
        
        res.json({ success: true, data: rows[0] });
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
        const { ram, chip, man_hinh, camera, pin, he_dieu_hanh } = req.body;
        
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
        
        res.json({ success: true, message: 'Cập nhật cấu hình thành công' });
    } catch (error) {
        console.error('Error updating product specs:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/products/:id - Cập nhật sản phẩm (kèm thông số kỹ thuật)
router.put('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { ten_sp, ma_hang, gia, gia_nhap, gia_giam, bo_nho, so_luong_ton, mau_sac, ten_mau_sac, mo_ta_ngan, mo_ta, anh_dai_dien, cau_hinh } = req.body;
        
        // Validation
        if (!ten_sp || !ten_sp.trim()) {
            return res.status(400).json({ success: false, message: 'Tên sản phẩm không được để trống' });
        }
        
        const price = parseFloat(gia);
        if (!price || price <= 0) {
            return res.status(400).json({ success: false, message: 'Giá sản phẩm phải lớn hơn 0' });
        }

        const discountPrice = gia_giam ? parseFloat(gia_giam) : null;
        if (discountPrice && discountPrice >= price) {
            return res.status(400).json({ success: false, message: 'Giá giảm phải nhỏ hơn giá gốc' });
        }
        
        const stock = parseInt(so_luong_ton) || 0;
        if (stock < 0) {
            return res.status(400).json({ success: false, message: 'Số lượng tồn kho không được âm' });
        }
        
        // Lưu màu sắc dạng JSON object chứa cả hex và tên
        let colorData = null;
        if (mau_sac) {
            try {
                const hexColors = typeof mau_sac === 'string' ? JSON.parse(mau_sac) : mau_sac;
                const colorNames = ten_mau_sac ? (typeof ten_mau_sac === 'string' ? JSON.parse(ten_mau_sac) : ten_mau_sac) : [];
                colorData = JSON.stringify({ colors: hexColors, colorNames: colorNames });
            } catch(e) {
                colorData = mau_sac; // Fallback: giữ nguyên nếu không parse được
            }
        }
        
        const importPrice = parseFloat(gia_nhap) || (price * 0.7);

        // [MỚI] Đọc tồn kho cũ để detect back-in-stock (0 → >0)
        let oldStock = 0;
        try {
            const [oldRows] = await pool.query('SELECT so_luong_ton FROM san_pham WHERE ma_sp = ?', [id]);
            oldStock = parseInt(oldRows[0]?.so_luong_ton) || 0;
        } catch (e) { /* ignore */ }

        // Cập nhật sản phẩm
        await pool.query(
            `UPDATE san_pham SET ten_sp = ?, ma_hang = ?, gia = ?, gia_nhap = ?, gia_giam = ?, bo_nho = ?,
             so_luong_ton = ?, mau_sac = ?, mo_ta_ngan = ?, mo_ta = ?, anh_dai_dien = ? WHERE ma_sp = ?`,
            [ten_sp, ma_hang, gia, importPrice, discountPrice, bo_nho, so_luong_ton, colorData, mo_ta_ngan, mo_ta, anh_dai_dien, id]
        );

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
            
            // Tạo mảng 7 ngày
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const found = dailyRevenue.find(d => d.date.toISOString().split('T')[0] === dateStr);
                labels.push(date.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }));
                revenueData.push({
                    date: dateStr,
                    revenue: found ? parseFloat(found.revenue) : 0,
                    profit: found ? parseFloat(found.revenue) - parseFloat(found.import_cost || 0) : 0,
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
            
            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            for (let i = 1; i <= daysInMonth; i++) {
                const found = dailyRevenue.find(d => d.day === i);
                labels.push(i.toString());
                revenueData.push({
                    day: i,
                    revenue: found ? parseFloat(found.revenue) : 0,
                    profit: found ? parseFloat(found.revenue) - parseFloat(found.import_cost || 0) : 0,
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
            
            const monthNames = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
            for (let i = 1; i <= 12; i++) {
                const found = monthlyRevenue.find(d => d.month === i);
                labels.push(monthNames[i - 1]);
                revenueData.push({
                    month: i,
                    revenue: found ? parseFloat(found.revenue) : 0,
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

// Biến lưu cài đặt trong memory (có thể thay bằng database nếu cần)
let shopSettings = {
    hideStockFromCustomer: false // Mặc định hiển thị tồn kho
};

// GET /api/admin/settings - Lấy cài đặt shop
router.get('/settings', async (req, res) => {
    try {
        res.json({ success: true, data: shopSettings });
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/settings - Cập nhật cài đặt shop
router.put('/settings', checkSuperAdmin, async (req, res) => {
    try {
        const { hideStockFromCustomer } = req.body;
        
        if (typeof hideStockFromCustomer === 'boolean') {
            shopSettings.hideStockFromCustomer = hideStockFromCustomer;
        }
        
        res.json({ success: true, message: 'Cập nhật cài đặt thành công', data: shopSettings });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/settings/public - API công khai để frontend lấy cài đặt hiển thị
router.get('/settings/public', async (req, res) => {
    try {
        res.json({ 
            success: true, 
            data: {
                hideStockFromCustomer: shopSettings.hideStockFromCustomer
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== EMPLOYEE MANAGEMENT ====================

// GET /api/admin/employees - Lấy danh sách nhân viên
router.get('/employees', checkSuperAdmin, async (req, res) => {
    try {
        const [employees] = await pool.query(
            "SELECT ma_nv as ma_admin, tai_khoan, ho_ten, email, so_dt, luong_co_ban, trang_thai, quyen FROM nhan_vien ORDER BY ma_nv DESC"
        );
        res.json({ success: true, data: employees });
    } catch (error) {
        console.error('Error getting employees:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/employees - Tạo nhân viên mới
router.post('/employees', checkSuperAdmin, async (req, res) => {
    try {
        const { tai_khoan, mat_khau, ho_ten, email, so_dt, luong_co_ban, trang_thai } = req.body;
        
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
        
        await pool.query(
            'INSERT INTO nhan_vien (tai_khoan, mat_khau, ho_ten, email, so_dt, luong_co_ban, trang_thai, quyen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [tai_khoan, hashed_mat_khau, ho_ten, email || null, so_dt || null, luong_co_ban || 0, trang_thai || 'hoat_dong', req.body.quyen || 'nhanvien']
        );
        res.json({ success: true, message: 'Tạo tài khoản nhân viên thành công' });
    } catch (error) {
        console.error('Error creating employee:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /api/admin/employees/:id - Sửa nhân viên
router.put('/employees/:id', checkSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { tai_khoan, mat_khau, ho_ten, email, so_dt, luong_co_ban, trang_thai, quyen } = req.body;
        
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
            'UPDATE nhan_vien SET tai_khoan=?, mat_khau=?, ho_ten=?, email=?, so_dt=?, luong_co_ban=?, trang_thai=?, quyen=? WHERE ma_nv=?',
            [tai_khoan, finalMatKhau, ho_ten, email || null, so_dt || null, luong_co_ban || 0, trang_thai || 'hoat_dong', quyen || 'nhanvien', id]
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

module.exports = router;
