const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

let defaultPasswordHash = '';
bcrypt.hash('123456', 10).then(hash => {
    defaultPasswordHash = hash;
}).catch(err => {
    console.error('Error hashing default password:', err);
});


// Middleware check admin/employee login
const checkAdmin = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ success: false, message: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', code: 'AUTH_REQUIRED' });
    }
    if (req.session.user.role !== 'admin' && req.session.user.vai_tro !== 'admin') {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập chức năng này.' });
    }
    next();
};

// Middleware check detailed module permission
const checkPermission = (moduleName) => {
    return (req, res, next) => {
        if (req.session.user.quyen === 'superadmin') {
            return next();
        }
        let allowed = [];
        if (req.session.user.allowed_modules) {
            try {
                allowed = typeof req.session.user.allowed_modules === 'string'
                    ? JSON.parse(req.session.user.allowed_modules)
                    : req.session.user.allowed_modules;
            } catch (e) {
                console.error('Error parsing allowed_modules in checkPermission (POS):', e);
            }
        }
        if (Array.isArray(allowed) && allowed.includes(moduleName)) {
            return next();
        }
        return res.status(403).json({ success: false, message: `Bạn không có quyền truy cập chức năng này (yêu cầu quyền: ${moduleName}).`, code: 'PERMISSION_DENIED' });
    };
};

router.use(checkAdmin);
router.use(checkPermission('nav-pos'));

// GET /api/admin/pos/products - Lấy danh sách sản phẩm + biến thể + IMEI phục vụ POS
router.get('/products', async (req, res) => {
    try {
        const queryStr = req.query.q || '';
        
        // 1. Lấy sản phẩm active
        let productsQuery = `
            SELECT sp.ma_sp, sp.ten_sp, sp.ma_hang, sp.gia, sp.gia_giam, sp.so_luong_ton, sp.anh_dai_dien, sp.trang_thai,
                   hsx.ten_hang
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            WHERE sp.trang_thai = 'active'
        `;
        let params = [];
        if (queryStr) {
            productsQuery += ` AND (sp.ten_sp LIKE ? OR hsx.ten_hang LIKE ? OR sp.ma_sp = ?)`;
            params = [`%${queryStr}%`, `%${queryStr}%`, isNaN(queryStr) ? -1 : parseInt(queryStr)];
        }
        const [products] = await pool.query(productsQuery, params);

        // 2. Lấy danh sách biến thể sản phẩm
        const [variants] = await pool.query(`
            SELECT ma_bt, ma_sp, mau_sac, mau_hex, dung_luong, so_luong, gia_chenh, sku, trang_thai
            FROM bien_the_san_pham
            WHERE trang_thai = 'active'
        `);

        // 3. Lấy IMEI còn trong kho
        const [imeis] = await pool.query(`
            SELECT ma_imei, ma_sp, ma_bt, imei
            FROM imei_san_pham
            WHERE trang_thai = 'in_stock'
        `);

        // Group dữ liệu ở Javascript
        const result = products.map(p => {
            const productVariants = variants.filter(v => v.ma_sp === p.ma_sp);
            const productImeis = imeis.filter(im => im.ma_sp === p.ma_sp && im.ma_bt === null);

            const mappedVariants = productVariants.map(v => {
                const variantImeis = imeis.filter(im => im.ma_bt === v.ma_bt);
                return {
                    ...v,
                    imeis: variantImeis.map(im => im.imei)
                };
            });

            return {
                ...p,
                variants: mappedVariants,
                imeis: productImeis.map(im => im.imei)
            };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Error fetching POS products:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /api/admin/pos/customers - Tìm kiếm khách hàng theo sđt/email nhanh
router.get('/customers', async (req, res) => {
    try {
        const queryStr = req.query.q || '';
        if (!queryStr) {
            return res.json({ success: true, data: [] });
        }
        const [customers] = await pool.query(
            `SELECT ma_kh, ho_ten, so_dt, email, dia_chi, tong_diem, hang_thanh_vien, tong_chi_tieu 
             FROM khach_hang 
             WHERE so_dt LIKE ? OR email LIKE ? OR ho_ten LIKE ? LIMIT 10`,
            [`%${queryStr}%`, `%${queryStr}%`, `%${queryStr}%`]
        );
        res.json({ success: true, data: customers });
    } catch (error) {
        console.error('Error searching customers:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/pos/customers - Tạo nhanh khách hàng tại quầy
router.post('/customers', async (req, res) => {
    try {
        const { ho_ten, so_dt, email, dia_chi } = req.body;
        if (!ho_ten || !so_dt) {
            return res.status(400).json({ success: false, message: 'Họ tên và Số điện thoại là bắt buộc' });
        }

        // Kiểm tra xem số điện thoại đã tồn tại chưa
        const [existing] = await pool.query('SELECT ma_kh FROM khach_hang WHERE so_dt = ?', [so_dt]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Số điện thoại này đã được đăng ký thành viên' });
        }

        const hash = defaultPasswordHash || await bcrypt.hash('123456', 10);
        const [result] = await pool.query(
            'INSERT INTO khach_hang (ho_ten, so_dt, email, dia_chi, mat_khau, tong_diem, hang_thanh_vien, tong_chi_tieu) VALUES (?, ?, ?, ?, ?, 0, "dong", 0)',
            [ho_ten, so_dt, email || null, dia_chi || null, hash]
        );

        res.json({
            success: true,
            message: 'Tạo khách hàng thành viên thành công',
            data: {
                ma_kh: result.insertId,
                ho_ten,
                so_dt,
                email,
                dia_chi,
                tong_diem: 0,
                hang_thanh_vien: 'dong',
                tong_chi_tieu: 0
            }
        });
    } catch (error) {
        console.error('Error creating customer:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /api/admin/pos/checkout - Xử lý thanh toán đơn hàng tại quầy
router.post('/checkout', async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { customerId, customerInfo, cartItems, discountAmount, voucherId, paymentMethod, paymentDetails } = req.body;
        const staffId = req.session.user.ma_nv || req.session.user.ma_admin;

        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            throw new Error('Giỏ hàng trống');
        }

        // 1. Xử lý khách hàng
        let finalCustomerId = customerId || null;
        let customerName = 'Khách mua tại quầy';
        let customerPhone = '';
        let customerAddress = 'Mua tại quầy';

        if (finalCustomerId) {
            const [cust] = await conn.query('SELECT ho_ten, so_dt, dia_chi FROM khach_hang WHERE ma_kh = ?', [finalCustomerId]);
            if (cust.length > 0) {
                customerName = cust[0].ho_ten;
                customerPhone = cust[0].so_dt;
                customerAddress = cust[0].dia_chi || 'Mua tại quầy';
            }
        } else if (customerInfo && customerInfo.so_dt) {
            // Kiểm tra trùng
            const [ex] = await conn.query('SELECT ma_kh, ho_ten, dia_chi FROM khach_hang WHERE so_dt = ?', [customerInfo.so_dt]);
            if (ex.length > 0) {
                finalCustomerId = ex[0].ma_kh;
                customerName = ex[0].ho_ten;
                customerPhone = customerInfo.so_dt;
                customerAddress = ex[0].dia_chi || 'Mua tại quầy';
            } else {
                // Tạo mới
                const hash = defaultPasswordHash || await bcrypt.hash('123456', 10);
                const [newCust] = await conn.query(
                    'INSERT INTO khach_hang (ho_ten, so_dt, email, dia_chi, mat_khau, tong_diem, hang_thanh_vien, tong_chi_tieu) VALUES (?, ?, ?, ?, ?, 0, "dong", 0)',
                    [customerInfo.ho_ten, customerInfo.so_dt, customerInfo.email || null, customerInfo.dia_chi || null, hash]
                );
                finalCustomerId = newCust.insertId;
                customerName = customerInfo.ho_ten;
                customerPhone = customerInfo.so_dt;
                customerAddress = customerInfo.dia_chi || 'Mua tại quầy';
            }
        }

        // 2. Tính toán tổng tiền
        let totalAmount = 0;
        for (const item of cartItems) {
            totalAmount += item.price * item.quantity;
        }
        
        let finalAmount = totalAmount - (discountAmount || 0);
        if (finalAmount < 0) finalAmount = 0;

        let internalNote = 'Đơn hàng POS thanh toán tại quầy.';
        if (paymentMethod === 'mixed' && paymentDetails) {
            const cashVal = paymentDetails.cashAmount || 0;
            const transferVal = paymentDetails.transferAmount || 0;
            internalNote += ` Thanh toán hỗn hợp: Tiền mặt ${cashVal.toLocaleString()}đ, Chuyển khoản ${transferVal.toLocaleString()}đ.`;
        }

        // 3. Tạo đơn hàng (Trạng thái: completed, loại đơn: normal)
        const [orderResult] = await conn.query(
            `INSERT INTO don_hang 
               (ma_kh, ten_nguoi_nhan, so_dt, dia_chi_nhan, tong_tien, trang_thai, ma_km, loai_don, ma_nv_xu_ly, ghi_chu_noi_bo, thoi_gian)
             VALUES (?, ?, ?, ?, ?, 'completed', ?, 'normal', ?, ?, NOW())`,
            [finalCustomerId, customerName, customerPhone, customerAddress, finalAmount, voucherId || null, staffId, internalNote]
        );
        const orderId = orderResult.insertId;

        // 4. Lưu phương thức thanh toán
        await conn.query(
            `INSERT INTO thanh_toan (ma_don, phuong_thuc, so_tien, trang_thai) 
             VALUES (?, ?, ?, 'success')`,
            [orderId, paymentMethod, finalAmount]
        );

        // 5. Lưu chi tiết đơn hàng + cập nhật tồn kho + IMEI
        for (const item of cartItems) {
            // Lấy giá nhập nếu có để thống kê lãi lỗ
            let importPrice = item.importPrice || 0;
            if (!importPrice) {
                if (item.variantId) {
                    const [variant] = await conn.query('SELECT gia_nhap FROM bien_the_san_pham WHERE ma_bt = ?', [item.variantId]);
                    if (variant.length > 0 && variant[0].gia_nhap != null && parseFloat(variant[0].gia_nhap) > 0) {
                        importPrice = parseFloat(variant[0].gia_nhap);
                    }
                }
                if (!importPrice) {
                    const [prod] = await conn.query('SELECT gia_nhap FROM san_pham WHERE ma_sp = ?', [item.productId]);
                    if (prod.length > 0) importPrice = prod[0].gia_nhap || 0;
                }
            }

            // Insert chi tiết đơn hàng
            const [detailResult] = await conn.query(
                `INSERT INTO chi_tiet_don_hang 
                   (ma_don, ma_sp, ma_bt, mau_sac_chon, dung_luong_chon, so_luong, gia, gia_nhap)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [orderId, item.productId, item.variantId || null, item.selectedColor || null, item.selectedStorage || null, item.quantity, item.price, importPrice]
            );
            const detailId = detailResult.insertId;

            // Xử lý IMEI nếu có
            if (item.imei) {
                const [imeiUpdate] = await conn.query(
                    `UPDATE imei_san_pham 
                     SET trang_thai = 'sold', ma_ct_don = ?, ngay_ban = NOW() 
                     WHERE imei = ? AND ma_sp = ? AND trang_thai = 'in_stock'`,
                    [detailId, item.imei, item.productId]
                );
                
                if (imeiUpdate.affectedRows === 0) {
                    throw new Error(`Mã IMEI ${item.imei} không có sẵn hoặc đã bán.`);
                }
            }

            // Cập nhật tồn kho
            if (item.variantId) {
                const [vUpdate] = await conn.query(
                    `UPDATE bien_the_san_pham SET so_luong = so_luong - ? WHERE ma_bt = ? AND so_luong >= ?`,
                    [item.quantity, item.variantId, item.quantity]
                );
                if (vUpdate.affectedRows === 0) {
                    throw new Error('Số lượng sản phẩm trong kho không đủ cho biến thể đã chọn.');
                }
            }
            
            const [spUpdate] = await conn.query(
                `UPDATE san_pham SET so_luong_ton = so_luong_ton - ? WHERE ma_sp = ? AND so_luong_ton >= ?`,
                [item.quantity, item.productId, item.quantity]
            );
            if (spUpdate.affectedRows === 0) {
                throw new Error('Số lượng sản phẩm tổng trong kho không đủ.');
            }
        }

        // 6. Cộng điểm tích lũy thành viên
        if (finalCustomerId) {
            // Tích lũy điểm (ví dụ: 100,000đ = 1 điểm)
            const earnedPoints = Math.floor(finalAmount / 100000);
            if (earnedPoints > 0) {
                await conn.query(
                    `UPDATE khach_hang 
                     SET tong_diem = tong_diem + ?, 
                         tong_chi_tieu = tong_chi_tieu + ? 
                     WHERE ma_kh = ?`,
                    [earnedPoints, finalAmount, finalCustomerId]
                );

                // Lưu lịch sử điểm thưởng
                await conn.query(
                    `INSERT INTO diem_thuong (ma_kh, so_diem, loai, mo_ta, ma_don, ngay_tao) 
                     VALUES (?, ?, 'earn', ?, ?, NOW())`,
                    [finalCustomerId, earnedPoints, `Tích lũy từ đơn hàng POS #${orderId}`, orderId]
                );

                // Tự động nâng hạng thành viên dựa trên tổng chi tiêu
                const [custData] = await conn.query('SELECT tong_chi_tieu FROM khach_hang WHERE ma_kh = ?', [finalCustomerId]);
                const totalSpent = parseFloat(custData[0].tong_chi_tieu);
                let newRank = 'dong';
                if (totalSpent >= 100000000) newRank = 'kim_cuong';      // 100tr
                else if (totalSpent >= 50000000) newRank = 'vang';      // 50tr
                else if (totalSpent >= 15000000) newRank = 'bac';        // 15tr

                await conn.query('UPDATE khach_hang SET hang_thanh_vien = ? WHERE ma_kh = ?', [newRank, finalCustomerId]);
            }
        }

        await conn.commit();
        res.json({
            success: true,
            message: 'Thanh toán đơn hàng thành công',
            data: {
                orderId,
                totalAmount,
                discountAmount: discountAmount || 0,
                finalAmount,
                customerName,
                customerPhone,
                ngay_tao: new Date().toISOString()
            }
        });

    } catch (error) {
        await conn.rollback();
        console.error('POS Checkout Transaction Error:', error);
        res.status(400).json({ success: false, message: error.message });
    } finally {
        conn.release();
    }
});

// GET /api/admin/pos/imei/status - Tra cứu nhanh trạng thái IMEI
router.get('/imei/status', async (req, res) => {
    try {
        const { imei } = req.query;
        if (!imei) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp IMEI' });
        }
        
        const [rows] = await pool.query(`
            SELECT im.imei, im.trang_thai, im.ngay_nhap, im.ngay_ban,
                   sp.ten_sp, v.mau_sac, v.dung_luong,
                   dh.ma_don, dh.ngay_tao as ngay_don_hang
            FROM imei_san_pham im
            LEFT JOIN san_pham sp ON im.ma_sp = sp.ma_sp
            LEFT JOIN bien_the_san_pham v ON im.ma_bt = v.ma_bt
            LEFT JOIN chi_tiet_don_hang ctd ON im.ma_ct_don = ctd.ma_ct_don
            LEFT JOIN don_hang dh ON ctd.ma_don = dh.ma_don
            WHERE im.imei = ?
        `, [imei]);

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Mã IMEI này không tồn tại trong hệ thống.' });
        }
        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error('Error checking IMEI status:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
