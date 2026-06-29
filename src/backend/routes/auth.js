// API routes cho xác thực (đăng ký, đăng nhập)
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const passport = require('passport');
const { pool } = require('../config/database');

// Lưu trữ OTP tạm thời (trong production nên dùng Redis)
const otpStore = new Map();

// Cấu hình nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
    }
});

// Hàm tạo OTP 6 số
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Hàm gửi email OTP
async function sendOTPEmail(email, otp, ho_ten) {
    const mailOptions = {
        from: `"QuangHưng Mobile" <${process.env.EMAIL_USER || 'noreply@quanghungmobile.com'}>`,
        to: email,
        subject: '🔐 Mã xác thực OTP - QuangHưng Mobile',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">QuangHưng Mobile</h1>
                    <p style="color: #ffcdd2; margin: 10px 0 0;">Xác thực tài khoản</p>
                </div>
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <p style="font-size: 16px; color: #333;">Xin chào <strong>${ho_ten || 'bạn'}</strong>,</p>
                    <p style="font-size: 16px; color: #333;">Mã OTP xác thực của bạn là:</p>
                    <div style="background: #fff; border: 2px dashed #e41e26; padding: 20px; text-align: center; margin: 20px 0; border-radius: 10px;">
                        <span style="font-size: 36px; font-weight: bold; color: #e41e26; letter-spacing: 8px;">${otp}</span>
                    </div>
                    <p style="font-size: 14px; color: #666;">⏰ Mã có hiệu lực trong <strong>5 phút</strong></p>
                    <p style="font-size: 14px; color: #666;">⚠️ Không chia sẻ mã này với bất kỳ ai</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #999; text-align: center;">
                        Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.<br>
                        © 2025 QuangHưng Mobile - Uy tín - Chất lượng - Giá tốt
                    </p>
                </div>
            </div>
        `
    };

    return transporter.sendMail(mailOptions);
}

// Đảm bảo thư mục avatars tồn tại
const avatarDir = path.join(__dirname, '../../frontend/images/avatars');
if (!fs.existsSync(avatarDir)) {
    fs.mkdirSync(avatarDir, { recursive: true });
}

// Cấu hình multer để upload avatar
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, avatarDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avt-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Max 5MB
    fileFilter: function (req, file, cb) {
        // Whitelist nghiêm — bỏ application/octet-stream và SVG (XSS qua SVG)
        const allowedExtensions = /\.(jpe?g|png|gif|webp|bmp|tiff?|heic|heif|avif|jfif)$/i;
        const allowedMimeTypes = /^image\/(jpeg|png|gif|webp|bmp|tiff|heic|heif|avif)$/i;

        const extOk = allowedExtensions.test(path.extname(file.originalname));
        const mimeOk = allowedMimeTypes.test(file.mimetype);

        // Bắt buộc CẢ extension và mime hợp lệ (trước đây dùng OR → bypass dễ)
        if (extOk && mimeOk) {
            return cb(null, true);
        }
        cb(new Error('Định dạng ảnh không được hỗ trợ! Chấp nhận: JPG, PNG, GIF, WEBP, BMP, TIFF, HEIC, AVIF'));
    }
});

// Middleware xử lý lỗi upload
const handleUpload = (req, res, next) => {
    upload.single('avt')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ success: false, message: 'Lỗi upload: ' + err.message });
        } else if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        next();
    });
};

// POST /api/auth/send-otp - Gửi mã OTP đến email
router.post('/send-otp', async (req, res) => {
    try {
        const { email, ho_ten } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập email' });
        }

        // Kiểm tra email đã tồn tại chưa
        const [existing] = await pool.query('SELECT ma_kh FROM khach_hang WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Email này đã được đăng ký' });
        }

        // Tạo OTP
        const otp = generateOTP();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 phút

        // Lưu OTP
        otpStore.set(email, { otp, expiresAt, ho_ten });

        // Gửi email
        try {
            await sendOTPEmail(email, otp, ho_ten);
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEV] OTP sent to ${email}: ${otp}`);
            }
            res.json({ success: true, message: 'Mã OTP đã được gửi đến email của bạn' });
        } catch (emailError) {
            console.error('Lỗi gửi email:', emailError && emailError.message);
            // KHÔNG giả vờ thành công — user cần biết để thử lại
            otpStore.delete(email);
            return res.status(500).json({ success: false, message: 'Không thể gửi email OTP. Vui lòng thử lại sau.' });
        }

    } catch (error) {
        console.error('Lỗi gửi OTP:', error && error.message);
        res.status(500).json({ success: false, message: 'Lỗi server, vui lòng thử lại.' });
    }
});

// POST /api/auth/verify-otp - Xác thực OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mã OTP' });
        }

        const storedData = otpStore.get(email);

        if (!storedData) {
            return res.status(400).json({ success: false, message: 'Mã OTP không tồn tại hoặc đã hết hạn' });
        }

        if (Date.now() > storedData.expiresAt) {
            otpStore.delete(email);
            return res.status(400).json({ success: false, message: 'Mã OTP đã hết hạn' });
        }

        if (storedData.otp !== otp) {
            return res.status(400).json({ success: false, message: 'Mã OTP không đúng' });
        }

        // OTP đúng - đánh dấu email đã xác thực
        otpStore.set(email, { ...storedData, verified: true });

        res.json({ success: true, message: 'Xác thực OTP thành công' });

    } catch (error) {
        console.error('Lỗi xác thực OTP:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// POST /api/auth/register - Đăng ký khách hàng (sau khi xác thực OTP)
router.post('/register', handleUpload, async (req, res) => {
    try {
        const { ho_ten, email, so_dt, dia_chi, mat_khau, skip_otp } = req.body;
        const avtFile = req.file;

        // Validate required fields
        if (!email || !mat_khau || !ho_ten) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng điền đầy đủ thông tin bắt buộc (họ tên, email, mật khẩu)' 
            });
        }

        // Kiểm tra OTP đã xác thực chưa (chỉ bỏ qua trong môi trường development)
        const allowSkipOtp = skip_otp && process.env.NODE_ENV === 'development';
        if (!allowSkipOtp) {
            const storedData = otpStore.get(email);
            if (!storedData || !storedData.verified) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Email chưa được xác thực. Vui lòng xác thực OTP trước.' 
                });
            }
        }

        // Check if email already exists
        const [existing] = await pool.query(
            'SELECT ma_kh FROM khach_hang WHERE email = ?', 
            [email]
        );

        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email đã được sử dụng' 
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(mat_khau, 10);

        // Đường dẫn avatar (nếu có upload)
        const avtPath = avtFile ? `images/avatars/${avtFile.filename}` : null;

        // Insert new customer
        const [result] = await pool.query(
            `INSERT INTO khach_hang (ho_ten, avt, email, so_dt, dia_chi, mat_khau) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ho_ten, avtPath, email, so_dt || null, dia_chi || null, hashedPassword]
        );

        res.status(201).json({ 
            success: true, 
            message: 'Đăng ký thành công',
            data: { ma_kh: result.insertId, ho_ten, email, avt: avtPath }
        });

    } catch (error) {
        console.error('Lỗi đăng ký:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// POST /api/auth/login - Đăng nhập (kiểm tra cả admin và khách hàng)
router.post('/login', async (req, res) => {
    try {
        const { email, mat_khau } = req.body;

        if (!email || !mat_khau) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng nhập email và mật khẩu' 
            });
        }

        // 2. Kiểm tra trong bảng khách hàng
        const [users] = await pool.query(
            'SELECT * FROM khach_hang WHERE email = ? OR so_dt = ?', 
            [email, email]
        );

        if (users.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Email hoặc mật khẩu không đúng' 
            });
        }

        const user = users[0];

        // Kiểm tra tài khoản có bị khóa không
        if (user.trang_thai === 'locked') {
            return res.status(403).json({ 
                success: false, 
                message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ admin để được hỗ trợ.',
                code: 'ACCOUNT_LOCKED'
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(mat_khau, user.mat_khau);

        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Email hoặc mật khẩu không đúng' 
            });
        }

        const userData = {
            ma_kh: user.ma_kh,
            ho_ten: user.ho_ten,
            email: user.email,
            so_dt: user.so_dt,
            dia_chi: user.dia_chi,
            avt: user.avt,
            gioi_tinh: user.gioi_tinh,
            ngay_sinh: user.ngay_sinh,
            role: 'customer'
        };

        // Lưu vào session
        if (req.session) {
            req.session.user = userData;
        }

        // Return user info (without password)
        res.json({ 
            success: true, 
            message: 'Đăng nhập thành công',
            data: userData
        });

    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// POST /api/auth/admin/login - Đăng nhập admin
router.post('/admin/login', async (req, res) => {
    try {
        const tai_khoan = req.body.tai_khoan || req.body.username;
        const mat_khau = req.body.mat_khau || req.body.password;

        if (!tai_khoan || !mat_khau) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng nhập tài khoản và mật khẩu' 
            });
        }

        // Tìm trong bảng admin
        const [admins] = await pool.query(
            'SELECT * FROM admin WHERE tai_khoan = ? OR email = ?', 
            [tai_khoan, tai_khoan]
        );

        if (admins.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản hoặc mật khẩu không đúng' 
            });
        }

        const user = admins[0];

        // Compare password (chỉ dùng bcrypt hash, KHÔNG hỗ trợ plaintext)
        const isMatch = await bcrypt.compare(mat_khau, user.mat_khau).catch(() => false);

        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản hoặc mật khẩu không đúng' 
            });
        }

        // [TASK 2] Ghi nhận IP và thời gian đăng nhập gần nhất
        const loginIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        try {
            await pool.query(
                'UPDATE admin SET last_login_at = NOW(), last_login_ip = ? WHERE ma_admin = ?',
                [loginIp, user.ma_admin]
            );
        } catch (ipErr) {
            console.error('Lỗi cập nhật last_login cho admin:', ipErr.message);
        }

        const adminData = {
            ma_admin: user.ma_admin,
            tai_khoan: user.tai_khoan,
            ho_ten: user.ho_ten,
            quyen: user.quyen || 'admin',
            avt: user.avt || null,
            email: user.email,
            role: 'admin',
            vai_tro: 'admin',
            last_login_at: new Date().toISOString(),
            last_login_ip: loginIp
        };

        // Lưu vào session và đảm bảo session được lưu trước khi trả response
        req.session.user = adminData;
        
        // Force save session trước khi trả response
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Lỗi lưu phiên đăng nhập' 
                });
            }
            
            console.log('✅ Admin session saved successfully:', req.sessionID);
            
            res.json({ 
                success: true, 
                message: 'Đăng nhập admin thành công',
                data: adminData,
                sessionId: req.sessionID
            });
        });

    } catch (error) {
        console.error('Lỗi đăng nhập admin:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// POST /api/auth/employee/login - Đăng nhập nhân viên
router.post('/employee/login', async (req, res) => {
    try {
        const tai_khoan = req.body.tai_khoan || req.body.username;
        const mat_khau = req.body.mat_khau || req.body.password;

        if (!tai_khoan || !mat_khau) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng nhập tài khoản và mật khẩu' 
            });
        }

        // Chỉ tìm trong bảng nhan_vien
        const [employees] = await pool.query(
            'SELECT * FROM nhan_vien WHERE tai_khoan = ? OR email = ?', 
            [tai_khoan, tai_khoan]
        );

        if (employees.length === 0) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản hoặc mật khẩu không đúng' 
            });
        }

        const user = employees[0];

        if (user.trang_thai === 'khoa' || user.trang_thai === 'nghi_viec') {
            return res.status(403).json({ 
                success: false, 
                message: 'Tài khoản nhân viên này đã bị khóa hoặc nghỉ việc.' 
            });
        }

        // Compare password (chỉ dùng bcrypt hash, KHÔNG hỗ trợ plaintext)
        const isMatch = await bcrypt.compare(mat_khau, user.mat_khau).catch(() => false);

        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Tài khoản hoặc mật khẩu không đúng' 
            });
        }

        // [TASK 2] Ghi nhận IP và thời gian đăng nhập gần nhất
        const loginIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
        try {
            await pool.query(
                'UPDATE nhan_vien SET last_login_at = NOW(), last_login_ip = ? WHERE ma_nv = ?',
                [loginIp, user.ma_nv]
            );
        } catch (ipErr) {
            console.error('Lỗi cập nhật last_login cho nhân viên:', ipErr.message);
        }

        const employeeData = {
            ma_admin: user.ma_nv,
            ma_nv: user.ma_nv,
            tai_khoan: user.tai_khoan,
            ho_ten: user.ho_ten,
            quyen: user.quyen,
            allowed_modules: user.allowed_modules, // ✨ THÊM DÒNG NÀY
            isEmployee: true,
            role: 'admin',
            vai_tro: 'admin',
            last_login_at: new Date().toISOString(),
            last_login_ip: loginIp
        };

        // Lưu session an toàn với HttpOnly Cookie
        req.session.user = employeeData;

        req.session.save((err) => {
            if (err) {
                console.error('Lỗi lưu session:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Lỗi lưu phiên đăng nhập' 
                });
            }
            
            console.log('✅ Employee session saved successfully:', req.sessionID);
            
            res.json({ 
                success: true, 
                message: 'Đăng nhập nhân viên thành công',
                data: employeeData,
                sessionId: req.sessionID
            });
        });

    } catch (error) {
        console.error('Lỗi đăng nhập nhân viên:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// PUT /api/auth/profile/:id - Cập nhật hồ sơ khách hàng
router.put('/profile/:id', handleUpload, async (req, res) => {
    try {
        const { id } = req.params;
        const { ho_ten, so_dt, dia_chi, gioi_tinh, ngay_sinh } = req.body;
        const avtFile = req.file;

        // [BẢO MẬT] Kiểm tra quyền: chỉ chủ tài khoản hoặc admin mới được cập nhật
        const sessionUser = req.session?.user;
        if (!sessionUser || (String(sessionUser.ma_kh) !== String(id) && sessionUser.vai_tro !== 'admin')) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật hồ sơ này.' });
        }

        // Kiểm tra user tồn tại
        const [existing] = await pool.query('SELECT * FROM khach_hang WHERE ma_kh = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
        }

        // Chuẩn bị dữ liệu cập nhật
        let updateFields = [];
        let updateValues = [];

        if (ho_ten) {
            updateFields.push('ho_ten = ?');
            updateValues.push(ho_ten);
        }
        if (so_dt !== undefined) {
            updateFields.push('so_dt = ?');
            updateValues.push(so_dt || null);
        }
        if (dia_chi !== undefined) {
            updateFields.push('dia_chi = ?');
            updateValues.push(dia_chi || null);
        }
        if (gioi_tinh !== undefined) {
            updateFields.push('gioi_tinh = ?');
            updateValues.push(gioi_tinh || null);
        }
        if (ngay_sinh !== undefined) {
            updateFields.push('ngay_sinh = ?');
            updateValues.push(ngay_sinh || null);
        }
        if (avtFile) {
            const avtPath = `images/avatars/${avtFile.filename}`;
            updateFields.push('avt = ?');
            updateValues.push(avtPath);
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'Không có dữ liệu để cập nhật' });
        }

        // Thực hiện cập nhật
        updateValues.push(id);
        await pool.query(
            `UPDATE khach_hang SET ${updateFields.join(', ')} WHERE ma_kh = ?`,
            updateValues
        );

        // Lấy thông tin user sau khi cập nhật
        const [updated] = await pool.query('SELECT * FROM khach_hang WHERE ma_kh = ?', [id]);
        const user = updated[0];

        res.json({
            success: true,
            message: 'Cập nhật hồ sơ thành công',
            data: {
                ma_kh: user.ma_kh,
                ho_ten: user.ho_ten,
                email: user.email,
                so_dt: user.so_dt,
                dia_chi: user.dia_chi,
                avt: user.avt,
                gioi_tinh: user.gioi_tinh,
                ngay_sinh: user.ngay_sinh,
                role: 'customer'
            }
        });

    } catch (error) {
        console.error('Lỗi cập nhật hồ sơ:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// POST /api/auth/forgot-password - Gửi OTP reset password (lưu vào bảng reset_password)
// Bảo vệ chống email enumeration: luôn trả response giống nhau, không tiết lộ email có tồn tại hay không
router.post('/forgot-password', async (req, res) => {
    const genericResponse = { success: true, message: 'Nếu email tồn tại, mã đặt lại mật khẩu sẽ được gửi.' };
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập email' });
        }

        const [users] = await pool.query('SELECT ma_kh, ho_ten FROM khach_hang WHERE email = ?', [email]);
        if (users.length === 0) {
            // Vẫn trả thành công để chống enumerate; không gửi mail
            return res.json(genericResponse);
        }

        const user = users[0];

        // Tạo OTP (token)
        const otp = generateOTP();
        const expiredAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút

        // Xóa các token cũ chưa sử dụng của user này
        await pool.query('DELETE FROM reset_password WHERE ma_kh = ? AND used = 0', [user.ma_kh]);

        // Lưu OTP vào bảng reset_password
        await pool.query(
            'INSERT INTO reset_password (ma_kh, token, expired_at, used) VALUES (?, ?, ?, 0)',
            [user.ma_kh, otp, expiredAt]
        );

        // Gửi email reset password
        const mailOptions = {
            from: `"QuangHưng Mobile" <${process.env.EMAIL_USER || 'noreply@quanghungmobile.com'}>`,
            to: email,
            subject: '🔑 Đặt lại mật khẩu - QuangHưng Mobile',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #e41e26, #c5111a); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">QuangHưng Mobile</h1>
                        <p style="color: #ffcdd2; margin: 10px 0 0;">Đặt lại mật khẩu</p>
                    </div>
                    <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                        <p style="font-size: 16px; color: #333;">Xin chào <strong>${user.ho_ten}</strong>,</p>
                        <p style="font-size: 16px; color: #333;">Bạn đã yêu cầu đặt lại mật khẩu. Mã OTP của bạn là:</p>
                        <div style="background: #fff; border: 2px dashed #e41e26; padding: 20px; text-align: center; margin: 20px 0; border-radius: 10px;">
                            <span style="font-size: 36px; font-weight: bold; color: #e41e26; letter-spacing: 8px;">${otp}</span>
                        </div>
                        <p style="font-size: 14px; color: #666;">⏰ Mã có hiệu lực trong <strong>5 phút</strong></p>
                        <p style="font-size: 14px; color: #666;">⚠️ Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #999; text-align: center;">
                            © 2025 QuangHưng Mobile - Uy tín - Chất lượng - Giá tốt
                        </p>
                    </div>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEV] Reset OTP sent to ${email}`);
            }
            return res.json(genericResponse);
        } catch (emailError) {
            console.error('Lỗi gửi email reset:', emailError && emailError.message);
            // Vẫn trả response generic để không leak; nhưng status 500 để frontend retry
            return res.status(500).json({ success: false, message: 'Không thể gửi email lúc này, vui lòng thử lại sau.' });
        }

    } catch (error) {
        console.error('Lỗi forgot password:', error && error.message);
        res.status(500).json({ success: false, message: 'Lỗi server, vui lòng thử lại.' });
    }
});

// POST /api/auth/verify-reset-otp - Xác thực OTP reset password (từ bảng reset_password)
router.post('/verify-reset-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mã OTP' });
        }

        // Lấy ma_kh từ email
        const [users] = await pool.query('SELECT ma_kh FROM khach_hang WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Email không tồn tại' });
        }

        const ma_kh = users[0].ma_kh;

        // Kiểm tra OTP trong bảng reset_password
        const [tokens] = await pool.query(
            'SELECT * FROM reset_password WHERE ma_kh = ? AND token = ? AND used = 0 ORDER BY id DESC LIMIT 1',
            [ma_kh, otp]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ success: false, message: 'Mã OTP không đúng hoặc đã được sử dụng' });
        }

        const tokenData = tokens[0];

        // Kiểm tra hết hạn
        if (new Date() > new Date(tokenData.expired_at)) {
            return res.status(400).json({ success: false, message: 'Mã OTP đã hết hạn' });
        }

        // OTP đúng - không đánh dấu used ngay, chờ đến khi reset password thành công
        res.json({ success: true, message: 'Xác thực OTP thành công' });

    } catch (error) {
        console.error('Lỗi verify reset OTP:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// POST /api/auth/reset-password - Đặt lại mật khẩu mới (sử dụng bảng reset_password)
router.post('/reset-password', async (req, res) => {
    try {
        const { email, mat_khau_moi } = req.body;

        if (!email || !mat_khau_moi) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập email và mật khẩu mới' });
        }

        if (mat_khau_moi.length < 8) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
        }

        // Lấy ma_kh từ email
        const [users] = await pool.query('SELECT ma_kh FROM khach_hang WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Email không tồn tại' });
        }

        const ma_kh = users[0].ma_kh;

        // Kiểm tra có token hợp lệ (chưa used và chưa hết hạn)
        const [tokens] = await pool.query(
            'SELECT * FROM reset_password WHERE ma_kh = ? AND used = 0 AND expired_at > NOW() ORDER BY id DESC LIMIT 1',
            [ma_kh]
        );

        if (tokens.length === 0) {
            return res.status(400).json({ success: false, message: 'Vui lòng xác thực OTP trước hoặc OTP đã hết hạn' });
        }

        // Hash mật khẩu mới
        const hashedPassword = await bcrypt.hash(mat_khau_moi, 10);

        // Cập nhật mật khẩu
        await pool.query('UPDATE khach_hang SET mat_khau = ? WHERE ma_kh = ?', [hashedPassword, ma_kh]);

        // Đánh dấu token đã sử dụng
        await pool.query('UPDATE reset_password SET used = 1 WHERE id = ?', [tokens[0].id]);

        res.json({ success: true, message: 'Đặt lại mật khẩu thành công' });

    } catch (error) {
        console.error('Lỗi reset password:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// PUT /api/auth/change-password/:id - Đổi mật khẩu
router.put('/change-password/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { mat_khau_cu, mat_khau_moi } = req.body;

        // [BẢO MẬT] Kiểm tra quyền: chỉ chủ tài khoản mới được đổi mật khẩu
        const sessionUser = req.session?.user;
        if (!sessionUser || String(sessionUser.ma_kh) !== String(id)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền đổi mật khẩu tài khoản này.' });
        }

        if (!mat_khau_cu || !mat_khau_moi) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ mật khẩu cũ và mới' });
        }

        if (mat_khau_moi.length < 8) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
        }

        // Lấy user hiện tại
        const [users] = await pool.query('SELECT * FROM khach_hang WHERE ma_kh = ?', [id]);
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
        }

        const user = users[0];

        // Kiểm tra mật khẩu cũ
        const isMatch = await bcrypt.compare(mat_khau_cu, user.mat_khau);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Mật khẩu cũ không đúng' });
        }

        // Hash mật khẩu mới
        const hashedPassword = await bcrypt.hash(mat_khau_moi, 10);

        // Cập nhật mật khẩu
        await pool.query('UPDATE khach_hang SET mat_khau = ? WHERE ma_kh = ?', [hashedPassword, id]);

        res.json({ success: true, message: 'Đổi mật khẩu thành công' });

    } catch (error) {
        console.error('Lỗi đổi mật khẩu:', error);
        res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
    }
});

// GET /api/auth/check - Kiểm tra trạng thái đăng nhập và session
router.get('/check', async (req, res) => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('🔍 Auth check - sid:', req.sessionID, '- user:', req.session?.user?.email || 'none');
    }

    // Ưu tiên session từ Google OAuth (passport)
    if (req.user) {
        return res.json({
            isAuthenticated: true,
            user: { ...req.user, vai_tro: req.user.vai_tro || req.user.role || (req.user.isAdmin ? 'admin' : 'customer') }
        });
    }

    // Fallback: session đăng nhập thường
    if (req.session && req.session.user) {
        // Tự động đồng bộ permissions/allowed_modules mới nhất từ database nếu là nhân viên
        if (req.session.user.isEmployee && req.session.user.ma_nv) {
            try {
                const [rows] = await pool.query('SELECT allowed_modules FROM nhan_vien WHERE ma_nv = ?', [req.session.user.ma_nv]);
                if (rows.length > 0) {
                    req.session.user.allowed_modules = rows[0].allowed_modules;
                }
            } catch (err) {
                console.error('Error fetching updated permissions in check-auth:', err);
            }
        }

        return res.json({
            isAuthenticated: true,
            user: { ...req.session.user, vai_tro: req.session.user.vai_tro || req.session.user.role || 'customer' }
        });
    }

    res.status(401).json({ isAuthenticated: false, message: 'Chưa đăng nhập' });
});

// ==================== GOOGLE OAUTH ====================

// GET /api/auth/google - Bắt đầu đăng nhập Google (cho khách hàng)
router.get('/google', (req, res, next) => {
    // Lưu state vào session để passport strategy có thể đọc
    req.session.googleAuthState = 'login';
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: 'login' // Đánh dấu là đăng nhập
    })(req, res, next);
});

// GET /api/auth/google/register - Đăng ký bằng Google
router.get('/google/register', (req, res, next) => {
    // Lưu state vào session để passport strategy có thể đọc
    req.session.googleAuthState = 'register';
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        state: 'register' // Đánh dấu là đăng ký
    })(req, res, next);
});

// GET /api/auth/google/callback - Callback từ Google
router.get('/google/callback', (req, res, next) => {
    console.log('🔵 Google callback handler started');
    console.log('Query state:', req.query.state);
    console.log('Session adminLogin:', req.session?.adminLogin);
    
    passport.authenticate('google', { 
        failureRedirect: '/login.html?error=google_failed',
        session: false // Không dùng passport session, tự xử lý
    }, async (err, user, info) => {
        console.log('🔵 Passport authenticate callback');
        console.log('Error:', err);
        console.log('User:', user);
        console.log('Info:', info);
        
        try {
            // Kiểm tra xem có phải admin login không
            const isAdminLogin = req.query.state === 'admin_login' || req.session?.adminLogin === true;
            
            console.log('🔵 isAdminLogin:', isAdminLogin);
            
            // Xóa flag khỏi session sau khi sử dụng
            if (req.session?.adminLogin) {
                delete req.session.adminLogin;
            }
            
            if (err) {
                console.error('❌ Google OAuth Error:', err);
                const redirectUrl = isAdminLogin ? '/admin-login.html?error=google_failed' : '/login.html?error=google_failed';
                return res.redirect(redirectUrl);
            }
            
            if (!user) {
                console.log('❌ No user returned from passport. Info:', info);
                const errType = info && info.message ? info.message : 'google_failed';
                
                // Trả về kết quả đăng ký Google thành công
                if (info && info.message === 'register_success') {
                    const emailParam = info.email ? `&email=${encodeURIComponent(info.email)}` : '';
                    return res.redirect(`/login.html?registered=true&google_registered=true${emailParam}`);
                }
                
                // Trả về lỗi nếu email đã tồn tại khi đăng ký
                if (info && info.message === 'email_exists') {
                    return res.redirect(`/register.html?error=email_exists&message=${encodeURIComponent('Email đã được đăng ký trước đó. Vui lòng đăng nhập!')}`);
                }
                
                // Trả về lỗi nếu tài khoản bị khóa
                if (info && info.message === 'account_locked') {
                    return res.redirect(`/login.html?error=account_locked`);
                }
                
                // Các lỗi khác như not_registered hoặc invalid_state
                const redirectUrl = isAdminLogin ? `/admin-login.html?error=${errType}` : `/login.html?error=${errType}`;
                return res.redirect(redirectUrl);
            }
            
            const email = user.email;
            const google_id = user.google_id || user.ma_kh;
            const ho_ten = user.ho_ten;
            const avt = user.avt;
            
            console.log('🔵 Google OAuth callback - Email:', email, '- isAdminLogin:', isAdminLogin);
            
            // Nếu là admin login, kiểm tra xem user có phải admin không
            if (isAdminLogin) {
                const [admins] = await pool.query(
                    'SELECT * FROM admin WHERE tai_khoan = ? OR email = ?',
                    [email, email]
                );
                
                if (admins.length === 0) {
                    // Email không phải admin
                    console.log('❌ Not an admin account:', email);
                    return res.redirect('/admin-login.html?error=not_admin');
                }
                
                const admin = admins[0];
                
                // Cập nhật google_id nếu chưa có
                await pool.query(
                    'UPDATE admin SET google_id = COALESCE(google_id, ?), avt = COALESCE(avt, ?) WHERE ma_admin = ?',
                    [google_id, avt, admin.ma_admin]
                );
                
                // Tạo dữ liệu admin để lưu vào session
                const adminData = {
                    ma_admin: admin.ma_admin,
                    tai_khoan: admin.tai_khoan,
                    email: email,
                    ho_ten: admin.ho_ten || ho_ten,
                    avt: admin.avt || avt,
                    quyen: admin.quyen,
                    role: 'admin',
                    vai_tro: 'admin',
                    isAdmin: true
                };
                
                console.log('🔵 Setting admin session data:', adminData);
                
                // Lưu trực tiếp vào session (không dùng passport)
                req.session.user = adminData;
                
                // Force save session
                req.session.save((saveErr) => {
                    if (saveErr) {
                        console.error('❌ Session save error:', saveErr);
                        return res.redirect('/admin-login.html?error=google_failed');
                    }
                    
                    console.log('✅ Admin Google OAuth session saved:', req.sessionID);
                    console.log('✅ Admin data:', adminData);
                    // Mã hóa dữ liệu admin thành dạng chuẩn Base64 không qua URI encode nội dung
                    const adminBase64 = Buffer.from(JSON.stringify(adminData)).toString('base64');
                    res.redirect(`/admin-login.html?google_success=true&user=${encodeURIComponent(adminBase64)}`);
                });
                
                return;
            }
            
            // Đăng nhập thành công như khách hàng bình thường
            const customerData = {
                ma_kh: user.ma_kh,
                ho_ten: user.ho_ten,
                email: user.email,
                avt: user.avt,
                so_dt: user.so_dt,
                dia_chi: user.dia_chi,
                gioi_tinh: user.gioi_tinh,
                ngay_sinh: user.ngay_sinh,
                role: 'customer'
            };
            
            req.session.user = customerData;
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('❌ Session save error:', saveErr);
                }
                console.log('✅ Customer Google OAuth session saved:', req.sessionID);
                // Mã hóa dữ liệu user thành dạng chuẩn Base64 không qua URI encode nội dung
                const userBase64 = Buffer.from(JSON.stringify(customerData)).toString('base64');
                res.redirect(`/login.html?google_success=true&user=${encodeURIComponent(userBase64)}`);
            });
            
        } catch (error) {
            console.error('❌ Google OAuth callback error:', error);
            const redirectUrl = req.query.state === 'admin_login' ? '/admin-login.html?error=google_failed' : '/login.html?error=google_failed';
            res.redirect(redirectUrl);
        }
    })(req, res, next);
});

// ==================== GOOGLE OAUTH CHO ADMIN ====================

// GET /api/auth/admin/google - Bắt đầu đăng nhập Google cho Admin
router.get('/admin/google', (req, res, next) => {
    // Lưu flag admin vào session để callback biết redirect về đâu
    req.session.adminLogin = true;
    // QUAN TRỌNG: Set googleAuthState = 'admin_login' để khớp với state gửi tới Google
    // Nếu không set, passport.js sẽ so sánh queryState ('admin_login') vs sessionState cũ ('login') → mismatch
    req.session.googleAuthState = 'admin_login';
    req.session.save((err) => {
        if (err) {
            console.error('Session save error:', err);
        }
        console.log('✅ Admin login flag saved to session:', req.sessionID);
        passport.authenticate('google', {
            scope: ['profile', 'email'],
            state: 'admin_login' // Đánh dấu là admin login
        })(req, res, next);
    });
});

// GET /api/auth/google/user - Lấy thông tin user đã đăng nhập
router.get('/google/user', (req, res) => {
    if (req.user) {
        res.json({ success: true, data: req.user });
    } else {
        res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }
});

// POST /api/auth/google/logout - Đăng xuất Google
router.post('/google/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Lỗi đăng xuất' });
        }
        res.json({ success: true, message: 'Đăng xuất thành công' });
    });
});

// POST /api/auth/admin/logout - Đăng xuất admin (hủy session)
router.post('/admin/logout', (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
                return res.status(500).json({ success: false, message: 'Lỗi đăng xuất' });
            }
            res.clearCookie('qh.sid'); // Xóa cookie session
            console.log('✅ Admin logged out successfully');
            res.json({ success: true, message: 'Đăng xuất thành công' });
        });
    } else {
        res.json({ success: true, message: 'Đã đăng xuất' });
    }
});

module.exports = router;
