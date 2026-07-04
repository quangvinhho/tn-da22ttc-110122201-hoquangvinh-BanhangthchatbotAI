const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const { testConnection } = require('./config/database');

const IS_PROD = process.env.NODE_ENV === 'production';

// Guard các secret bắt buộc khi chạy production
if (IS_PROD) {
    const required = ['JWT_SECRET', 'DB_PASSWORD', 'MOMO_SECRET_KEY', 'MOMO_ACCESS_KEY'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) {
        console.error('❌ FATAL: Thiếu env bắt buộc cho production:', missing.join(', '));
        process.exit(1);
    }
}
if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET chưa set — đang dùng secret dev mặc định. CHỈ chấp nhận local.');
}

const app = express();
app.set('trust proxy', 1); // cần khi sau reverse proxy (HTTPS)
const PORT = process.env.PORT || 3000;

// Security Middlewares
// Set security headers
app.use(helmet({
  contentSecurityPolicy: false, // Tắt CSP để tránh block resources từ CDN/frontend
  crossOriginEmbedderPolicy: false
}));

// Prevent HTTP param pollution
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 1000 // Limit each IP to 1000 requests per `window` (here, per 15 minutes) - set high to avoid breaking existing functionality
});
app.use('/api', limiter);

// Rate limiting nghiêm ngặt cho admin login — chống brute force
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10, // Tối đa 10 lần đăng nhập sai trong 15 phút
  message: { success: false, message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/admin/login', adminLoginLimiter);

// Rate limiting cho admin API — chống spam
const adminApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // 300 requests / 15 phút cho admin API
  message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng chờ và thử lại.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/admin', adminApiLimiter);

// Test kết nối database + chạy migration biến thể (idempotent)
testConnection();
// Chạy migrations TUẦN TỰ để tránh deadlock khi nhiều ALTER cùng lúc trên cùng bảng/FK
(async () => {
  const steps = [
    ['create_variant_table', './migrations/create_variant_table'],
    ['add_product_status', './migrations/add_product_status'],
    ['add_variant_to_cart_detail', './migrations/add_variant_to_cart_detail'],
    ['create_color_image_table', './migrations/create_color_image_table'],
    ['create_color_storage_catalog', './migrations/create_color_storage_catalog'],
    ['add_shop_reply_to_review', './migrations/add_shop_reply_to_review'],
    ['create_review_votes',      './migrations/create_review_votes'],
    ['create_review_reports',    './migrations/create_review_reports'],
    ['create_qa_table',          './migrations/create_qa_table'],
    ['create_audit_log',         './migrations/create_audit_log'],
    ['add_order_assignment',     './migrations/add_order_assignment'],
    ['add_hidden_to_review',     './migrations/add_hidden_to_review'],
    ['create_shop_settings',     './migrations/create_shop_settings'],
    ['add_keywords_to_chatbot_knowledge', './migrations/add_keywords_to_chatbot_knowledge'],
    ['seed_chatbot_knowledge_20',         './migrations/seed_chatbot_knowledge_20'],
    ['add_context_state_to_conversation', './migrations/add_context_state_to_conversation'],
    ['add_employee_details',              './migrations/add_employee_details'],
    ['create_product_warranty_table',     './migrations/create_product_warranty_table'],
    ['update_product_colors',             './migrations/update_product_colors'],
    ['create_phone_variants',             './migrations/create_phone_variants'],
    ['seed_product_discounts',            './migrations/seed_product_discounts'],
    ['add_order_code_column',             './migrations/add_order_code_column'],
  ];
  for (const [name, mod] of steps) {
    try {
      await require(mod).run();
    } catch (e) {
      console.error(`[Migration ${name}]`, e && e.message);
    }
  }
})();

// Middleware
// CORS - Chỉ chấp nhận các origin tin cậy
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',    // Live Server VS Code
    'http://127.0.0.1:5500',
    'http://localhost:5502',    // Live Server VS Code (alt port)
    'http://127.0.0.1:5502',
    'http://localhost:5173',    // Vite dev server
];

app.use(cors({
  origin: function(origin, callback) {
    // Cho phép requests không có origin (cùng origin, Postman, mobile apps)
    if (!origin) return callback(null, true);
    // Cho phép tất cả các cổng localhost / 127.0.0.1 trong phát triển để tránh lỗi cổng Live Server khác nhau (5501, 5503...)
    const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (allowedOrigins.includes(origin) || isLocal) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Session middleware
app.use(session({
  name: 'qh.sid', // Đặt tên cookie rõ ràng
  secret: process.env.JWT_SECRET || 'gdda_secret_key_2024',
  resave: false, // Không lưu lại session nếu không thay đổi
  saveUninitialized: false, // Không tạo session cho request chưa đăng nhập
  rolling: true, // Làm mới cookie mỗi request để tránh hết hạn
  cookie: {
    secure: IS_PROD, // Bắt buộc HTTPS ở production
    httpOnly: true,
    sameSite: 'lax', // Cho phép cookie được gửi trong redirect
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Origin/Referer check cho các request state-changing (CSRF defense)
const allowedRequestOrigins = new Set([
  ...(process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',').map(s => s.trim()) : []),
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'http://localhost:5500', 'http://127.0.0.1:5500',
  'http://localhost:5502', 'http://127.0.0.1:5502',
  'http://localhost:5173',
]);
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (!req.path.startsWith('/api')) return next();
  // Webhook MoMo IPN gọi từ MoMo server, không có origin frontend → cho qua
  if (req.path.startsWith('/api/payment/momo/ipn')) return next();
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : null);
  if (!origin) return next(); // mobile / curl / postman; rate limit + auth đã chặn
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (allowedRequestOrigins.has(origin) || isLocal) return next();
  return res.status(403).json({ success: false, message: 'Origin không hợp lệ.' });
});

// Debug middleware - log session info (chỉ ở dev để tránh leak thông tin user ở production)
app.use((req, res, next) => {
  if (!IS_PROD && (req.path.includes('/api/auth') || req.path.includes('/api/admin'))) {
    console.log(`📍 ${req.method} ${req.path}`);
    console.log('Session ID:', req.sessionID);
    console.log('Session user:', req.session?.user?.tai_khoan || req.session?.user?.email || 'none');
  }
  next();
});

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Passport Google Strategy
require('./config/passport')(passport);

// Serve static files từ frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
const productRoutes = require('./routes/products');
const authRoutes = require('./routes/auth');
const reviewRoutes = require('./routes/reviews');
const cartRoutes = require('./routes/cart');
const paymentRoutes = require('./routes/payment');
const orderRoutes = require('./routes/orders');
const newsRoutes = require('./routes/news');
const adminRoutes = require('./routes/admin');
const searchRoutes = require('./routes/search');
const posRoutes = require('./routes/pos');
const addressRoutes = require('./routes/address');
const notificationRoutes = require('./routes/notifications');
const promotionRoutes = require('./routes/promotions');
const chatbotRoutes = require('./routes/chatbot');
const chatbotKnowledgeRoutes = require('./routes/chatbot-knowledge');
const recommendationRoutes = require('./routes/recommendations'); // ✅ Hook Route HML
const interestRoutes = require('./routes/interests'); // ✅ Quản lý sở thích
const warrantyRoutes = require('./routes/warranty'); // ✅ Quản lý bảo hành
const reportsRoutes = require('./routes/reports'); // ✅ Quản lý báo cáo doanh thu & lợi nhuận
const returnRoutes = require('./routes/returns'); // ✅ Phân hệ Đổi - Trả - Hoàn tiền

app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/pos', posRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/address', addressRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/chatbot-knowledge', chatbotKnowledgeRoutes);
app.use('/api/recommendations', recommendationRoutes); // ✅ Endpoint UI sử dụng
app.use('/api/interests', interestRoutes); // ✅ Sở thích khách hàng
app.use('/api/warranty', warrantyRoutes); // ✅ Quản lý bảo hành
app.use('/api/returns', returnRoutes); // ✅ Quản lý Đổi - Trả - Hoàn tiền
app.use('/api/wishlist', require('./routes/wishlist')); // ✅ SP yêu thích + auto subscribe
app.use('/api/admin/reports', reportsRoutes); // ✅ Phân hệ Báo cáo

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server đang chạy' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
    console.log(`API endpoint: http://localhost:${PORT}/api`);

    // Start cron jobs (pending payment reminder)
    try {
        require('./services/cronJobs').start();
    } catch (e) {
        console.error('[Cron] Failed to start:', e.message);
    }
});
