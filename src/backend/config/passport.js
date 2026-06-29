const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { pool } = require('./database');

module.exports = function(passport) {
    // Serialize user
    passport.serializeUser((user, done) => {
        done(null, user);
    });

    // Deserialize user
    passport.deserializeUser((user, done) => {
        done(null, user);
    });

    // Google Strategy
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
        passReqToCallback: true // Để truy cập req
    }, async (req, accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails[0].value;
            const ho_ten = profile.displayName;
            const avt = profile.photos[0]?.value || null;
            const google_id = profile.id;

            // Lấy state từ query để biết đang đăng nhập hay đăng ký
            const queryState = req.query.state;
            const sessionState = req.session?.googleAuthState;
            // OAuth state phải khớp với session để chống CSRF; nếu thiếu hoàn toàn vẫn cho qua (fallback dev)
            if (queryState && sessionState && queryState !== sessionState) {
                console.warn('Google OAuth: state mismatch — reject');
                console.warn('  queryState:', queryState, '- sessionState:', sessionState);
                return done(null, false, { message: 'invalid_state' });
            }
            const state = queryState || sessionState || 'login';
            const isRegistering = state === 'register';

            // Nếu là admin login, trả về thông tin cơ bản từ Google profile
            // Logic kiểm tra admin sẽ được xử lý ở callback handler (auth.js)
            if (state === 'admin_login') {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('Google OAuth - Admin login mode - Email:', email);
                }
                return done(null, {
                    email: email,
                    ho_ten: ho_ten,
                    avt: avt,
                    google_id: google_id,
                    role: 'pending_admin_check' // Sẽ được xác nhận ở callback
                });
            }

            if (process.env.NODE_ENV !== 'production') {
                console.log('Google OAuth - State:', state, '- isRegistering:', isRegistering, '- Email:', email);
            }
            
            // Kiểm tra user đã tồn tại chưa
            const [existingUsers] = await pool.query(
                'SELECT * FROM khach_hang WHERE email = ? OR google_id = ?',
                [email, google_id]
            );

            let user;

            if (existingUsers.length > 0) {
                // User đã tồn tại
                user = existingUsers[0];
                if (process.env.NODE_ENV !== 'production') {
                    console.log('User đã tồn tại trong DB:', user.email);
                }
                
                // Nếu đang đăng ký mà email đã tồn tại → báo lỗi
                if (isRegistering) {
                    return done(null, false, { message: 'email_exists' });
                }

                // Kiểm tra tài khoản có bị khóa không
                if (user.trang_thai === 'locked') {
                    return done(null, false, { message: 'account_locked' });
                }
                
                // Cập nhật google_id nếu chưa có
                if (!user.google_id) {
                    await pool.query(
                        'UPDATE khach_hang SET google_id = ?, avt = COALESCE(avt, ?) WHERE ma_kh = ?',
                        [google_id, avt, user.ma_kh]
                    );
                }
            } else {
                if (isRegistering) {
                    // Đang đăng ký → tạo tài khoản mới
                    await pool.query(
                        'INSERT INTO khach_hang (ho_ten, email, avt, google_id, mat_khau) VALUES (?, ?, ?, ?, ?)',
                        [ho_ten, email, avt, google_id, 'google_oauth_user']
                    );
                    // Trả về thông tin đăng ký thành công (không đăng nhập ngay)
                    return done(null, false, { message: 'register_success', email: email, ho_ten: ho_ten });
                } else {
                    // Đang đăng nhập mà chưa có tài khoản → từ chối, yêu cầu đăng ký trước
                    return done(null, false, { message: 'not_registered' });
                }
            }

            // Kiểm tra xem user có phải admin không (chỉ để thêm flag, không redirect)
            const [adminCheck] = await pool.query(
                'SELECT * FROM admin WHERE tai_khoan = ? OR email = ?',
                [email, email]
            );

            const isAdmin = adminCheck.length > 0;
            const adminData = isAdmin ? adminCheck[0] : null;

            return done(null, {
                ma_kh: user.ma_kh,
                ma_admin: adminData?.ma_admin || null,
                ho_ten: user.ho_ten || ho_ten,
                email: user.email || email,
                avt: user.avt || avt,
                so_dt: user.so_dt,
                dia_chi: user.dia_chi,
                gioi_tinh: user.gioi_tinh,
                ngay_sinh: user.ngay_sinh,
                quyen: adminData?.quyen || null,
                role: isAdmin ? 'admin' : 'customer',
                isAdmin: isAdmin,
                google_id: google_id
            });

        } catch (error) {
            console.error('Google OAuth Error:', error);
            return done(error, null);
        }
    }));
};
