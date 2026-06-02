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

const app = express();
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

// Test kết nối database
testConnection();

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
    if (allowedOrigins.includes(origin)) {
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
    secure: false, // set to true in production with HTTPS
    httpOnly: true,
    sameSite: 'lax', // Cho phép cookie được gửi trong redirect
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Debug middleware - log session info
app.use((req, res, next) => {
  if (req.path.includes('/api/auth') || req.path.includes('/api/admin')) {
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
const addressRoutes = require('./routes/address');
const notificationRoutes = require('./routes/notifications');
const promotionRoutes = require('./routes/promotions');
const chatbotRoutes = require('./routes/chatbot');
const chatbotKnowledgeRoutes = require('./routes/chatbot-knowledge');
const recommendationRoutes = require('./routes/recommendations'); // ✅ Hook Route HML
const interestRoutes = require('./routes/interests'); // ✅ Quản lý sở thích
const warrantyRoutes = require('./routes/warranty'); // ✅ Quản lý bảo hành

app.use('/api/products', productRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/address', addressRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/chatbot-knowledge', chatbotKnowledgeRoutes);
app.use('/api/recommendations', recommendationRoutes); // ✅ Endpoint UI sử dụng
app.use('/api/interests', interestRoutes); // ✅ Sở thích khách hàng
app.use('/api/warranty', warrantyRoutes); // ✅ Quản lý bảo hành
app.use('/api/wishlist', require('./routes/wishlist')); // ✅ SP yêu thích + auto subscribe

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
