const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// ============================================================
// 1. LẤY DANH SÁCH VOUCHER KHẢ DỤNG
// ============================================================
router.get('/vouchers/available', async (req, res) => {
  try {
    
    
    // Debug: Lấy tất cả voucher để kiểm tra
    const [allVouchers] = await pool.query('SELECT code, trang_thai, ngay_bat_dau, ngay_ket_thuc, NOW() as now_time FROM khuyen_mai LIMIT 10');
    
    
    const [vouchers] = await pool.query(`
      SELECT 
        ma_km,
        code,
        loai_km,
        loai,
        gia_tri,
        mo_ta,
        dieu_kien_toi_thieu,
        dieu_kien_toi_da,
        so_luong,
        so_luong_da_dung,
        (so_luong - so_luong_da_dung) as so_luong_con_lai,
        ngay_bat_dau,
        ngay_ket_thuc,
        DATEDIFF(ngay_ket_thuc, NOW()) as so_ngay_con_lai
      FROM khuyen_mai
      WHERE trang_thai = 'active'
        AND ngay_bat_dau <= NOW()
        AND ngay_ket_thuc >= NOW()
        AND so_luong_da_dung < so_luong
      ORDER BY ngay_ket_thuc ASC
      LIMIT 50
    `);
    
    

    res.json({
      success: true,
      data: vouchers.map(v => ({
        id: v.ma_km,
        code: v.code,
        type: v.loai_km,
        discountType: v.loai,
        discountValue: parseFloat(v.gia_tri),
        description: v.mo_ta,
        minOrder: parseFloat(v.dieu_kien_toi_thieu),
        maxOrder: v.dieu_kien_toi_da ? parseFloat(v.dieu_kien_toi_da) : null,
        totalQuantity: v.so_luong,
        usedQuantity: v.so_luong_da_dung,
        remainingQuantity: v.so_luong_con_lai,
        startDate: v.ngay_bat_dau,
        endDate: v.ngay_ket_thuc,
        daysRemaining: v.so_ngay_con_lai
      }))
    });
  } catch (error) {
    console.error('Get vouchers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// DEBUG: LẤY TẤT CẢ VOUCHER (không lọc)
// ============================================================
router.get('/vouchers/all', async (req, res) => {
  try {
    const [vouchers] = await pool.query(`
      SELECT 
        ma_km, code, loai_km, loai, gia_tri, mo_ta,
        dieu_kien_toi_thieu, so_luong, so_luong_da_dung,
        trang_thai, ngay_bat_dau, ngay_ket_thuc,
        NOW() as server_time,
        CASE 
          WHEN ngay_bat_dau > NOW() THEN 'chua_bat_dau'
          WHEN ngay_ket_thuc < NOW() THEN 'da_het_han'
          WHEN so_luong_da_dung >= so_luong THEN 'het_luot'
          WHEN trang_thai != 'active' THEN 'khong_active'
          ELSE 'kha_dung'
        END as ly_do
      FROM khuyen_mai
      ORDER BY ngay_tao DESC
    `);
    
    res.json({ success: true, data: vouchers, count: vouchers.length });
  } catch (error) {
    console.error('Get all vouchers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 2. KIỂM TRA VOUCHER CÓ HỢP LỆ
// ============================================================
router.post('/vouchers/validate', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { code, totalAmount } = req.body;

    if (!code || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu mã voucher hoặc tổng tiền'
      });
    }

    // Gọi stored procedure
    const [result] = await connection.query(
      'CALL sp_validate_voucher(?, ?, @valid, @message, @ma_km, @gia_tri_giam)',
      [code, totalAmount]
    );

    const [output] = await connection.query(
      'SELECT @valid as valid, @message as message, @ma_km as ma_km, @gia_tri_giam as gia_tri_giam'
    );

    const { valid, message, ma_km, gia_tri_giam } = output[0];

    if (valid === 1) {
      res.json({
        success: true,
        data: {
          voucherId: ma_km,
          code: code,
          discountAmount: parseFloat(gia_tri_giam),
          message: message
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: message
      });
    }
  } catch (error) {
    console.error('Validate voucher error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
});

// ============================================================
// 3. LẤY DANH SÁCH FLASH SALE ĐANG DIỄN RA
// ============================================================
router.get('/flash-sales/active', async (req, res) => {
  try {
    const [flashSales] = await pool.query(`
      SELECT 
        fs.ma_flash_sale,
        fs.ten_su_kien,
        fs.mo_ta,
        fs.anh_dai_dien,
        fs.ngay_bat_dau,
        fs.ngay_ket_thuc,
        TIMESTAMPDIFF(MINUTE, NOW(), fs.ngay_ket_thuc) as phut_con_lai,
        COUNT(ctfs.ma_ct_flash) as so_san_pham,
        COALESCE(SUM(ctfs.so_luong_da_ban), 0) as tong_da_ban
      FROM flash_sale fs
      LEFT JOIN chi_tiet_flash_sale ctfs ON fs.ma_flash_sale = ctfs.ma_flash_sale
      WHERE fs.trang_thai = 'active'
        AND fs.ngay_bat_dau <= NOW()
        AND fs.ngay_ket_thuc >= NOW()
      GROUP BY fs.ma_flash_sale
      ORDER BY fs.ngay_ket_thuc ASC
    `);

    res.json({
      success: true,
      data: flashSales.map(fs => ({
        id: fs.ma_flash_sale,
        name: fs.ten_su_kien,
        description: fs.mo_ta,
        image: fs.anh_dai_dien,
        startTime: fs.ngay_bat_dau,
        endTime: fs.ngay_ket_thuc,
        minutesRemaining: fs.phut_con_lai,
        productCount: fs.so_san_pham,
        totalSold: fs.tong_da_ban
      }))
    });
  } catch (error) {
    console.error('Get flash sales error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 4. LẤY CHI TIẾT FLASH SALE (SẢN PHẨM TRONG FLASH SALE)
// ============================================================
router.get('/flash-sales/:flashSaleId/products', async (req, res) => {
  try {
    const { flashSaleId } = req.params;

    const [products] = await pool.query(`
      SELECT 
        ctfs.ma_ct_flash,
        ctfs.ma_sp,
        sp.ten_sp,
        sp.anh_dai_dien,
        ctfs.gia_goc,
        ctfs.gia_flash,
        ctfs.so_luong_flash,
        ctfs.so_luong_da_ban,
        (ctfs.so_luong_flash - ctfs.so_luong_da_ban) as so_luong_con_lai,
        ROUND(((ctfs.gia_goc - ctfs.gia_flash) / ctfs.gia_goc * 100), 0) as phan_tram_giam
      FROM chi_tiet_flash_sale ctfs
      JOIN san_pham sp ON ctfs.ma_sp = sp.ma_sp
      WHERE ctfs.ma_flash_sale = ?
      ORDER BY ctfs.so_luong_da_ban DESC
    `, [flashSaleId]);

    res.json({
      success: true,
      data: products.map(p => ({
        id: p.ma_ct_flash,
        productId: p.ma_sp,
        name: p.ten_sp,
        image: p.anh_dai_dien ? (p.anh_dai_dien.startsWith('images/') ? p.anh_dai_dien : `images/${p.anh_dai_dien}`) : 'images/iphone.jpg',
        originalPrice: parseFloat(p.gia_goc),
        flashPrice: parseFloat(p.gia_flash),
        totalQuantity: p.so_luong_flash,
        soldQuantity: p.so_luong_da_ban,
        remainingQuantity: p.so_luong_con_lai,
        discountPercent: p.phan_tram_giam
      }))
    });
  } catch (error) {
    console.error('Get flash sale products error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 5. LẤY KHUYẾN MÃI SẢN PHẨM (DISCOUNT TRỰC TIẾP)
// ============================================================
router.get('/products/:productId/discount', async (req, res) => {
  try {
    const { productId } = req.params;

    const [discount] = await pool.query(`
      SELECT 
        ma_km_sp,
        loai_giam,
        gia_tri_giam,
        ngay_bat_dau,
        ngay_ket_thuc
      FROM khuyen_mai_san_pham
      WHERE ma_sp = ?
        AND trang_thai = 'active'
        AND ngay_bat_dau <= NOW()
        AND ngay_ket_thuc >= NOW()
      LIMIT 1
    `, [productId]);

    if (discount.length === 0) {
      return res.json({
        success: true,
        data: null
      });
    }

    const d = discount[0];
    res.json({
      success: true,
      data: {
        id: d.ma_km_sp,
        discountType: d.loai_giam,
        discountValue: parseFloat(d.gia_tri_giam),
        startDate: d.ngay_bat_dau,
        endDate: d.ngay_ket_thuc
      }
    });
  } catch (error) {
    console.error('Get product discount error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 6. LƯU VOUCHER CHO NGƯỜI DÙNG
// ============================================================
router.post('/vouchers/:voucherId/save', async (req, res) => {
  try {
    const { voucherId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Cần đăng nhập để lưu voucher'
      });
    }

    // Kiểm tra voucher tồn tại
    const [voucher] = await pool.query(
      'SELECT ma_km FROM khuyen_mai WHERE ma_km = ? AND trang_thai = "active"',
      [voucherId]
    );

    if (voucher.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Voucher không tồn tại'
      });
    }

    // Thêm vào danh sách lưu
    await pool.query(
      'INSERT IGNORE INTO voucher_nguoi_dung (ma_kh, ma_km) VALUES (?, ?)',
      [userId, voucherId]
    );

    res.json({
      success: true,
      message: 'Đã lưu voucher'
    });
  } catch (error) {
    console.error('Save voucher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 7. LẤY DANH SÁCH VOUCHER ĐÃ LƯU CỦA NGƯỜI DÙNG
// ============================================================
router.get('/user/:userId/saved-vouchers', async (req, res) => {
  try {
    const { userId } = req.params;

    const [vouchers] = await pool.query(`
      SELECT 
        km.ma_km,
        km.code,
        km.loai_km,
        km.loai,
        km.gia_tri,
        km.mo_ta,
        km.dieu_kien_toi_thieu,
        km.dieu_kien_toi_da,
        km.so_luong,
        km.so_luong_da_dung,
        (km.so_luong - km.so_luong_da_dung) as so_luong_con_lai,
        km.ngay_ket_thuc,
        vn.da_su_dung
      FROM voucher_nguoi_dung vn
      JOIN khuyen_mai km ON vn.ma_km = km.ma_km
      WHERE vn.ma_kh = ?
        AND km.trang_thai = 'active'
        AND km.ngay_ket_thuc >= NOW()
        AND vn.da_su_dung = 0
      ORDER BY km.ngay_ket_thuc ASC
    `, [userId]);

    res.json({
      success: true,
      data: vouchers.map(v => ({
        id: v.ma_km,
        code: v.code,
        type: v.loai_km,
        discountType: v.loai,
        discountValue: parseFloat(v.gia_tri),
        description: v.mo_ta,
        minOrder: parseFloat(v.dieu_kien_toi_thieu),
        maxOrder: v.dieu_kien_toi_da ? parseFloat(v.dieu_kien_toi_da) : null,
        remainingQuantity: v.so_luong_con_lai,
        endDate: v.ngay_ket_thuc
      }))
    });
  } catch (error) {
    console.error('Get saved vouchers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================
// 8. TÍNH TỔNG TIỀN ĐƠN HÀNG (CÓ TÍNH KHUYẾN MÃI)
// ============================================================
router.post('/calculate-total', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { subtotal, voucherId, items } = req.body;

    if (!subtotal || !items) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu dữ liệu'
      });
    }

    // Gọi stored procedure
    await connection.query(
      'CALL sp_calculate_order_total(?, ?, ?, @tien_giam_voucher, @tien_giam_san_pham, @tien_giam_flash_sale, @tien_ship, @tong_tien)',
      [subtotal, voucherId || null, JSON.stringify(items)]
    );

    const [output] = await connection.query(
      'SELECT @tien_giam_voucher as tien_giam_voucher, @tien_giam_san_pham as tien_giam_san_pham, @tien_giam_flash_sale as tien_giam_flash_sale, @tien_ship as tien_ship, @tong_tien as tong_tien'
    );

    const result = output[0];

    res.json({
      success: true,
      data: {
        subtotal: parseFloat(subtotal),
        voucherDiscount: parseFloat(result.tien_giam_voucher),
        productDiscount: parseFloat(result.tien_giam_san_pham),
        flashSaleDiscount: parseFloat(result.tien_giam_flash_sale),
        shippingFee: parseFloat(result.tien_ship),
        totalDiscount: parseFloat(result.tien_giam_voucher) + parseFloat(result.tien_giam_san_pham) + parseFloat(result.tien_giam_flash_sale),
        total: parseFloat(result.tong_tien)
      }
    });
  } catch (error) {
    console.error('Calculate total error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    connection.release();
  }
});

// ============================================================
// LẤY SẢN PHẨM BÁN CHẬM NHẤT (SLOW MOVERS)
// Lấy 4 sản phẩm có lượng bán thấp nhất từ database thực
// Tự động refresh mỗi 12 tiếng
// ============================================================

// Cache để lưu sản phẩm bán chậm và thời gian cập nhật
let slowMoversCache = {
  products: [],
  lastUpdated: null,
  REFRESH_INTERVAL: 12 * 60 * 60 * 1000 // 12 tiếng (milliseconds)
};

// Kiểm tra xem cache có cần refresh không
function shouldRefreshSlowMovers() {
  if (!slowMoversCache.lastUpdated || slowMoversCache.products.length === 0) {
    return true;
  }
  const now = Date.now();
  const timeSinceLastUpdate = now - slowMoversCache.lastUpdated;
  return timeSinceLastUpdate >= slowMoversCache.REFRESH_INTERVAL;
}

// Tính thời gian còn lại đến lần refresh tiếp theo
function getTimeUntilNextRefresh() {
  if (!slowMoversCache.lastUpdated) return 0;
  const nextRefresh = slowMoversCache.lastUpdated + slowMoversCache.REFRESH_INTERVAL;
  const remaining = nextRefresh - Date.now();
  return Math.max(0, remaining);
}

// Map tên file ngắn trong DB sang tên file thực tế trong thư mục images
const dbImageToRealImage = {
  // iPhone
  'iphone15.jpg': 'images/15-256.avif',
  'iphone14.jpg': 'images/iphone-14-pro_2__5.webp',
  'iphone16.jpg': 'images/iphone-16-pro-max-titan-den.webp',
  'iphone17.jpg': 'images/iphone-17-pro-max-256.jpg',
  // Samsung
  's24u.jpg': 'images/samsung-galaxy-s24_15__2.webp',
  'a54.jpg': 'images/a54.webp',
  'a05.jpg': 'images/A05.webp',
  'a07.jpg': 'images/samsung_galaxy_a07.webp',
  // Xiaomi
  'rn13.jpg': 'images/Xiaomi%20Redmi%20Note%2013.webp',
  'xiaomi.jpg': 'images/Xiaomi.avif',
  // Oppo
  'reno10.jpg': 'images/oppo_reno_13_f_4g_256gb.avif',
  'oppo_findx.jpg': 'images/OPPX9.avif',
  // Vivo
  'v25.jpg': 'images/vivo.webp',
  'vivo.jpg': 'images/vivo.webp',
  // Asus
  'rog7.jpg': 'images/asus-rog-phone-7.webp',
  'asus.jpg': 'images/asus-rog-phone-7.webp',
  // Vsmart
  'joy4.jpg': 'images/vsmart-joy-4_1__2.webp',
  'vsmart.jpg': 'images/vsmart-joy-4_1__2.webp',
  // Sony
  'xperia5.jpg': 'images/sony-xperia-1-vi.webp',
  'sony.jpg': 'images/sony-xperia-1-vi.webp',
  // Google
  'pixel.jpg': 'images/pixel-9-pro.avif',
  // Tecno
  'tecno.jpg': 'images/TECNO.avif',
  // Realme
  'realme.jpg': 'images/reno10_5g_-_combo_product_-_blue_-_copy.webp'
};

// Map ảnh mặc định theo hãng (chỉ dùng khi DB không có ảnh)
const brandImageMap = {
  'Apple': 'images/iphone-17-pro-max-256.jpg',
  'Samsung': 'images/samsung-galaxy-s24_15__2.webp',
  'Xiaomi': 'images/Xiaomi.avif',
  'Oppo': 'images/oppo_reno_13_f_4g_256gb.avif',
  'Vivo': 'images/vivo.webp',
  'Google': 'images/pixel-9-pro.avif',
  'Sony': 'images/sony-xperia-1-vi.webp',
  'Tecno': 'images/TECNO.avif',
  'Realme': 'images/reno10_5g_-_combo_product_-_blue_-_copy.webp',
  'Asus': 'images/asus-rog-phone-7.webp',
  'Vsmart': 'images/vsmart-joy-4_1__2.webp',
  'default': 'images/IPHONE17.avif'
};

// Helper function để lấy ảnh - TRỰC TIẾP TỪ DATABASE
function getSlowMoverImage(row) {
  const dbImage = row.anh_dai_dien || '';
  const brand = row.ten_hang || '';
  
  // Dùng ảnh từ DB nếu có
  if (dbImage) {
    // Kiểm tra xem có trong map chuyển đổi không (tên file ngắn -> tên file thực)
    if (dbImageToRealImage[dbImage]) {
      console.log(`[getSlowMoverImage] Mapped ${dbImage} -> ${dbImageToRealImage[dbImage]}`);
      return dbImageToRealImage[dbImage];
    }
    
    let imagePath = dbImage;
    // Thêm prefix images/ nếu chưa có
    if (!imagePath.startsWith('images/') && !imagePath.startsWith('http')) {
      imagePath = 'images/' + imagePath;
    }
    // Encode khoảng trắng
    if (imagePath.includes(' ') && !imagePath.includes('%20')) {
      imagePath = imagePath.replace(/ /g, '%20');
    }
    return imagePath;
  }
  
  // Fallback nếu DB không có ảnh - dùng ảnh theo hãng
  return brandImageMap[brand] || brandImageMap['default'];
}

// Hàm lấy sản phẩm bán chậm từ DB
async function fetchSlowMoversFromDB() {
  // Lấy 4 sản phẩm bán chậm nhất (ít đơn hàng hoàn thành nhất) + thông tin hãng
  const [products] = await pool.query(`
    SELECT 
      sp.ma_sp,
      sp.ten_sp,
      sp.gia,
      sp.anh_dai_dien,
      sp.so_luong_ton,
      hsx.ten_hang,
      COALESCE(sold_data.so_luong_da_ban, 0) as so_luong_da_ban,
      COALESCE(review_data.so_danh_gia, 0) as so_danh_gia,
      COALESCE(review_data.diem_trung_binh, 0) as diem_trung_binh
    FROM san_pham sp
    LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
    LEFT JOIN (
      SELECT 
        ctdh.ma_sp,
        SUM(ctdh.so_luong) as so_luong_da_ban
      FROM chi_tiet_don_hang ctdh
      JOIN don_hang dh ON ctdh.ma_don = dh.ma_don
      WHERE dh.trang_thai IN ('completed', 'shipping', 'confirmed')
      GROUP BY ctdh.ma_sp
    ) sold_data ON sp.ma_sp = sold_data.ma_sp
    LEFT JOIN (
      SELECT 
        ma_sp,
        COUNT(*) as so_danh_gia,
        AVG(so_sao) as diem_trung_binh
      FROM danh_gia
      GROUP BY ma_sp
    ) review_data ON sp.ma_sp = review_data.ma_sp
    WHERE sp.so_luong_ton > 0
    ORDER BY so_luong_da_ban ASC, sp.ma_sp ASC
    LIMIT 4
  `);

  // Log chi tiết để debug
  // Slow movers loaded from DB

  if (products.length === 0) {
    // Fallback: lấy bất kỳ 4 sản phẩm nào
    const [fallbackProducts] = await pool.query(`
      SELECT 
        sp.ma_sp,
        sp.ten_sp,
        sp.gia,
        sp.anh_dai_dien,
        sp.so_luong_ton,
        hsx.ten_hang,
        0 as so_luong_da_ban,
        0 as so_danh_gia,
        4.5 as diem_trung_binh
      FROM san_pham sp
      LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
      WHERE sp.so_luong_ton > 0
      ORDER BY RAND()
      LIMIT 4
    `);
    return fallbackProducts;
  }

  return products;
}

router.get('/slow-movers', async (req, res) => {
  try {
    let products;
    const forceRefresh = req.query.refresh === 'true';
    
    // Force refresh cache nếu có query param
    if (forceRefresh) {
      console.log('[Slow Movers] Force refresh requested - clearing cache...');
      slowMoversCache.products = [];
      slowMoversCache.lastUpdated = null;
    }
    
    // Kiểm tra cache và refresh nếu cần (mỗi 12 tiếng)
    if (shouldRefreshSlowMovers()) {
      console.log('[Slow Movers] Refreshing cache - fetching from DB...');
      products = await fetchSlowMoversFromDB();
      
      // Cập nhật cache
      slowMoversCache.products = products;
      slowMoversCache.lastUpdated = Date.now();
      
      console.log(`[Slow Movers] Cache updated at ${new Date(slowMoversCache.lastUpdated).toLocaleString('vi-VN')}`);
      console.log(`[Slow Movers] Next refresh in 12 hours`);
    } else {
      // Sử dụng cache
      products = slowMoversCache.products;
      const nextRefreshMs = getTimeUntilNextRefresh();
      const nextRefreshHours = Math.floor(nextRefreshMs / (1000 * 60 * 60));
      const nextRefreshMinutes = Math.floor((nextRefreshMs % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`[Slow Movers] Using cached data. Next refresh in ${nextRefreshHours}h ${nextRefreshMinutes}m`);
    }

    // Tính thời gian còn lại đến lần refresh tiếp theo
    const nextRefreshMs = getTimeUntilNextRefresh();
    const nextRefreshTime = new Date(Date.now() + nextRefreshMs);

    // Map ảnh cho từng sản phẩm (luôn gọi getSlowMoverImage để đảm bảo ảnh đúng)
    const mappedProducts = products.map(p => {
      const image = getSlowMoverImage(p);
      
      return {
        id: p.ma_sp,
        name: p.ten_sp,
        price: parseFloat(p.gia || 0),
        image: image,
        stock: p.so_luong_ton || 0,
        sold: parseInt(p.so_luong_da_ban) || 0,
        rating: parseFloat(p.diem_trung_binh) || 4.5,
        reviews: parseInt(p.so_danh_gia) || 0,
        brand: p.ten_hang || ''
      };
    });

    res.json({
      success: true,
      data: mappedProducts,
      message: 'Sản phẩm có lượng mua thấp nhất - Ưu đãi đặc biệt!',
      cache: {
        lastUpdated: slowMoversCache.lastUpdated ? new Date(slowMoversCache.lastUpdated).toISOString() : null,
        nextRefresh: nextRefreshTime.toISOString(),
        refreshIntervalHours: 12
      }
    });
  } catch (error) {
    console.error('Get slow movers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API để clear cache (cho admin/debug)
router.get('/slow-movers/clear-cache', async (req, res) => {
  slowMoversCache.products = [];
  slowMoversCache.lastUpdated = null;
  console.log('[Slow Movers] Cache cleared manually');
  res.json({ success: true, message: 'Cache cleared' });
});

// ============================================================
// API CHO ADMIN: THỐNG KÊ VOUCHER
// ============================================================

// Lấy tất cả voucher với thống kê sử dụng (cho admin)
router.get('/admin/vouchers/stats', async (req, res) => {
  try {
    const [vouchers] = await pool.query(`
      SELECT 
        km.ma_km,
        km.code,
        km.loai_km,
        km.loai,
        km.gia_tri,
        km.mo_ta,
        km.dieu_kien_toi_thieu,
        km.so_luong,
        km.so_luong_da_dung,
        (km.so_luong - km.so_luong_da_dung) as so_luong_con_lai,
        km.trang_thai,
        km.ngay_bat_dau,
        km.ngay_ket_thuc,
        CASE 
          WHEN km.ngay_ket_thuc < NOW() THEN 'expired'
          WHEN km.ngay_bat_dau > NOW() THEN 'upcoming'
          WHEN km.so_luong_da_dung >= km.so_luong THEN 'sold_out'
          WHEN km.trang_thai = 'active' THEN 'active'
          ELSE km.trang_thai
        END as status_display,
        ROUND((km.so_luong_da_dung / km.so_luong) * 100, 1) as usage_percent
      FROM khuyen_mai km
      ORDER BY km.ngay_tao DESC
    `);

    res.json({
      success: true,
      data: vouchers.map(v => ({
        id: v.ma_km,
        code: v.code,
        type: v.loai_km,
        discountType: v.loai,
        discountValue: parseFloat(v.gia_tri),
        description: v.mo_ta,
        minOrder: parseFloat(v.dieu_kien_toi_thieu || 0),
        totalQuantity: v.so_luong,
        usedQuantity: v.so_luong_da_dung,
        remainingQuantity: v.so_luong_con_lai,
        status: v.trang_thai,
        statusDisplay: v.status_display,
        usagePercent: v.usage_percent,
        startDate: v.ngay_bat_dau,
        endDate: v.ngay_ket_thuc
      }))
    });
  } catch (error) {
    console.error('Get voucher stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy lịch sử sử dụng voucher (cho admin)
router.get('/admin/vouchers/:voucherId/history', async (req, res) => {
  try {
    const { voucherId } = req.params;
    
    const [history] = await pool.query(`
      SELECT 
        lsv.ma_lich_su,
        lsv.ma_don,
        lsv.so_tien_giam,
        lsv.ngay_su_dung,
        kh.ho_ten as ten_khach_hang,
        kh.email,
        dh.tong_tien,
        dh.trang_thai as trang_thai_don
      FROM lich_su_voucher lsv
      LEFT JOIN khach_hang kh ON lsv.ma_kh = kh.ma_kh
      LEFT JOIN don_hang dh ON lsv.ma_don = dh.ma_don
      WHERE lsv.ma_km = ?
      ORDER BY lsv.ngay_su_dung DESC
      LIMIT 100
    `, [voucherId]);

    res.json({
      success: true,
      data: history.map(h => ({
        id: h.ma_lich_su,
        orderId: h.ma_don,
        discountAmount: parseFloat(h.so_tien_giam || 0),
        usedAt: h.ngay_su_dung,
        customerName: h.ten_khach_hang || 'Khách vãng lai',
        customerEmail: h.email,
        orderTotal: parseFloat(h.tong_tien || 0),
        orderStatus: h.trang_thai_don
      }))
    });
  } catch (error) {
    console.error('Get voucher history error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cập nhật số lượng voucher (cho admin)
router.put('/admin/vouchers/:voucherId/quantity', async (req, res) => {
  try {
    const { voucherId } = req.params;
    const { quantity } = req.body;

    if (quantity === undefined || quantity < 0) {
      return res.status(400).json({ success: false, message: 'Số lượng không hợp lệ' });
    }

    await pool.query(
      'UPDATE khuyen_mai SET so_luong = ? WHERE ma_km = ?',
      [quantity, voucherId]
    );

    res.json({ success: true, message: 'Cập nhật số lượng thành công' });
  } catch (error) {
    console.error('Update voucher quantity error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Reset số lượng đã dùng (cho admin - cẩn thận khi dùng)
router.put('/admin/vouchers/:voucherId/reset-usage', async (req, res) => {
  try {
    const { voucherId } = req.params;

    await pool.query(
      'UPDATE khuyen_mai SET so_luong_da_dung = 0 WHERE ma_km = ?',
      [voucherId]
    );

    res.json({ success: true, message: 'Đã reset số lượng đã dùng về 0' });
  } catch (error) {
    console.error('Reset voucher usage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Gia hạn tất cả voucher hết hạn (cho admin)
router.put('/admin/vouchers/extend-all', async (req, res) => {
  try {
    const { newEndDate } = req.body;
    const endDate = newEndDate || '2025-12-31';
    
    const [result] = await pool.query(
      'UPDATE khuyen_mai SET ngay_ket_thuc = ? WHERE ngay_ket_thuc < NOW()',
      [endDate]
    );

    res.json({ 
      success: true, 
      message: `Đã gia hạn ${result.affectedRows} voucher đến ${endDate}` 
    });
  } catch (error) {
    console.error('Extend vouchers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cập nhật voucher (cho admin)
router.put('/admin/vouchers/:voucherId', async (req, res) => {
  try {
    const { voucherId } = req.params;
    const { code, discountType, discountValue, minOrder, quantity, startDate, endDate, status, description, type } = req.body;

    const updates = [];
    const values = [];

    if (code) { updates.push('code = ?'); values.push(code); }
    if (discountType) { updates.push('loai = ?'); values.push(discountType); }
    if (discountValue !== undefined) { updates.push('gia_tri = ?'); values.push(discountValue); }
    if (minOrder !== undefined) { updates.push('dieu_kien_toi_thieu = ?'); values.push(minOrder); }
    if (quantity !== undefined) { updates.push('so_luong = ?'); values.push(quantity); }
    if (startDate) { updates.push('ngay_bat_dau = ?'); values.push(startDate); }
    if (endDate) { updates.push('ngay_ket_thuc = ?'); values.push(endDate); }
    if (status) { updates.push('trang_thai = ?'); values.push(status); }
    if (description) { updates.push('mo_ta = ?'); values.push(description); }
    if (type) { updates.push('loai_km = ?'); values.push(type); }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có dữ liệu cập nhật' });
    }

    values.push(voucherId);
    await pool.query(`UPDATE khuyen_mai SET ${updates.join(', ')} WHERE ma_km = ?`, values);

    res.json({ success: true, message: 'Cập nhật voucher thành công' });
  } catch (error) {
    console.error('Update voucher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Tạo voucher mới (cho admin)
router.post('/admin/vouchers', async (req, res) => {
  try {
    const { code, type, discountType, discountValue, minOrder, quantity, startDate, endDate, description } = req.body;

    if (!code || !discountValue || !quantity) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const [result] = await pool.query(
      `INSERT INTO khuyen_mai (code, loai_km, loai, gia_tri, dieu_kien_toi_thieu, so_luong, ngay_bat_dau, ngay_ket_thuc, mo_ta, trang_thai)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        code.toUpperCase(),
        type || 'discount',
        discountType || 'fixed',
        discountValue,
        minOrder || 0,
        quantity,
        startDate || new Date().toISOString().split('T')[0],
        endDate || '2025-12-31',
        description || ''
      ]
    );

    res.json({ 
      success: true, 
      message: 'Tạo voucher thành công',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Create voucher error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Mã voucher đã tồn tại' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
