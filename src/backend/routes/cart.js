const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Middleware kiểm soát quyền truy cập giỏ hàng (gia cố bảo mật)
const checkCartAccess = async (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ 
      success: false, 
      message: 'Vui lòng đăng nhập để thực hiện thao tác này.',
      code: 'AUTH_REQUIRED'
    });
  }
  
  const sessionUser = req.session.user;
  const isAdmin = sessionUser.vai_tro === 'admin';
  
  // 1. Kiểm tra theo userId (nếu có) — chuẩn hoá về Number để so sánh strict
  const rawUserId = req.params.userId || req.body.userId;
  if (rawUserId !== undefined && rawUserId !== null && rawUserId !== '') {
    const userId = Number(rawUserId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: 'userId không hợp lệ.' });
    }
    if (!isAdmin && Number(sessionUser.ma_kh) !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập giỏ hàng này.',
        code: 'ACCESS_DENIED'
      });
    }
    return next();
  }

  // 2. Kiểm tra theo cartItemId (nếu có)
  const rawCartItemId = req.params.cartItemId || req.body.cartItemId;
  if (rawCartItemId !== undefined && rawCartItemId !== null && rawCartItemId !== '') {
    const cartItemId = Number(rawCartItemId);
    if (!Number.isInteger(cartItemId) || cartItemId <= 0) {
      return res.status(400).json({ success: false, message: 'cartItemId không hợp lệ.' });
    }
    try {
      const [cartOwner] = await pool.query(
        `SELECT gh.ma_kh FROM chi_tiet_gio_hang ct
         JOIN gio_hang gh ON ct.ma_gio_hang = gh.ma_gio_hang
         WHERE ct.ma_ct = ?`,
        [cartItemId]
      );

      if (cartOwner.length > 0) {
        if (!isAdmin && Number(cartOwner[0].ma_kh) !== Number(sessionUser.ma_kh)) {
          return res.status(403).json({
            success: false,
            message: 'Bạn không có quyền thay đổi sản phẩm này trong giỏ hàng.',
            code: 'ACCESS_DENIED'
          });
        }
      }
      return next();
    } catch (e) {
      console.error('checkCartAccess error:', e && e.message);
      return res.status(500).json({ success: false, message: 'Lỗi kiểm tra quyền truy cập.' });
    }
  }

  next();
};

// ============================================
// CÁC ROUTE CỤ THỂ PHẢI ĐẶT TRƯỚC ROUTE CÓ PARAMS
// ============================================

// GET /api/cart/debug/:userId - Debug giỏ hàng (CHỈ DEV)
if (process.env.NODE_ENV !== 'production') {
  router.get('/debug/:userId', checkCartAccess, async (req, res) => {
    try {
      const { userId } = req.params;

      const [carts] = await pool.query(
        'SELECT * FROM gio_hang WHERE ma_kh = ?',
        [userId]
      );

      if (carts.length === 0) {
        return res.json({ userId, totalCarts: 0, data: [] });
      }

      // Gộp 1 query thay vì N — tránh N+1
      const cartIds = carts.map(c => c.ma_gio_hang);
      const [allDetails] = await pool.query(
        'SELECT * FROM chi_tiet_gio_hang WHERE ma_gio_hang IN (?)',
        [cartIds]
      );

      const byCart = carts.map(cart => ({
        cart,
        details: allDetails.filter(d => d.ma_gio_hang === cart.ma_gio_hang)
      }));

      res.json({ userId, totalCarts: carts.length, data: byCart });
    } catch (error) {
      console.error('cart debug error:', error && error.message);
      res.status(500).json({ error: 'Lỗi server' });
    }
  });
}

// POST /api/cart/cleanup/:userId - Dọn dẹp giỏ hàng trùng lặp
router.post('/cleanup/:userId', checkCartAccess, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { userId } = req.params;

    // Lấy tất cả giỏ hàng của user
    const [carts] = await connection.query(
      'SELECT ma_gio_hang FROM gio_hang WHERE ma_kh = ? ORDER BY ma_gio_hang ASC',
      [userId]
    );

    if (carts.length <= 1) {
      return res.json({ success: true, message: 'Không cần cleanup', cartsCount: carts.length });
    }

    await connection.beginTransaction();

    const mainCartId = carts[0].ma_gio_hang;
    const otherCartIds = carts.slice(1).map(c => c.ma_gio_hang);

    // Gộp lấy tất cả chi tiết từ các giỏ phụ trong 1 query — tránh N+1
    const [allDetails] = await connection.query(
      'SELECT ma_sp, so_luong, gia_tai_thoi_diem FROM chi_tiet_gio_hang WHERE ma_gio_hang IN (?)',
      [otherCartIds]
    );

    // Gộp số lượng theo ma_sp
    const merged = new Map();
    for (const d of allDetails) {
      const cur = merged.get(d.ma_sp);
      if (cur) cur.so_luong += d.so_luong;
      else merged.set(d.ma_sp, { ma_sp: d.ma_sp, so_luong: d.so_luong, gia_tai_thoi_diem: d.gia_tai_thoi_diem });
    }

    // Lấy chi tiết hiện có ở giỏ chính 1 lần
    const [existingMain] = await connection.query(
      'SELECT ma_ct, ma_sp FROM chi_tiet_gio_hang WHERE ma_gio_hang = ?',
      [mainCartId]
    );
    const existingMap = new Map(existingMain.map(r => [r.ma_sp, r.ma_ct]));

    for (const item of merged.values()) {
      const exMaCt = existingMap.get(item.ma_sp);
      if (exMaCt) {
        await connection.query(
          'UPDATE chi_tiet_gio_hang SET so_luong = so_luong + ? WHERE ma_ct = ?',
          [item.so_luong, exMaCt]
        );
      } else {
        await connection.query(
          'INSERT INTO chi_tiet_gio_hang (ma_gio_hang, ma_sp, so_luong, gia_tai_thoi_diem) VALUES (?, ?, ?, ?)',
          [mainCartId, item.ma_sp, item.so_luong, item.gia_tai_thoi_diem]
        );
      }
    }

    // Xoá toàn bộ chi tiết + bản ghi giỏ phụ trong 2 query
    await connection.query('DELETE FROM chi_tiet_gio_hang WHERE ma_gio_hang IN (?)', [otherCartIds]);
    await connection.query('DELETE FROM gio_hang WHERE ma_gio_hang IN (?)', [otherCartIds]);

    await connection.commit();
    res.json({
      success: true,
      message: `Đã merge ${otherCartIds.length} giỏ hàng vào giỏ hàng chính`,
      mainCartId,
      mergedCarts: otherCartIds
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error('Cleanup error:', error && error.message);
    res.status(500).json({ success: false, message: 'Lỗi cleanup giỏ hàng.' });
  } finally {
    connection.release();
  }
});

// DELETE /api/cart/remove/:cartItemId - Xóa theo cartItemId
router.delete('/remove/:cartItemId', checkCartAccess, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { cartItemId } = req.params;
    
    console.log('=== DELETE /remove/:cartItemId ===');
    console.log('cartItemId:', cartItemId, 'type:', typeof cartItemId);
    
    // Kiểm tra cartItemId hợp lệ
    if (!cartItemId || isNaN(cartItemId)) {
      connection.release();
      return res.json({ success: false, message: 'cartItemId không hợp lệ' });
    }
    
    const cartItemIdNum = parseInt(cartItemId, 10);
    console.log('cartItemIdNum:', cartItemIdNum);
    
    // Kiểm tra xem item có tồn tại không trước khi xóa
    const [checkExist] = await connection.query(
      'SELECT ma_ct, ma_gio_hang, ma_sp FROM chi_tiet_gio_hang WHERE ma_ct = ?',
      [cartItemIdNum]
    );
    console.log('Item exists check:', checkExist);
    
    if (checkExist.length === 0) {
      console.log('Item not found in database, cartItemId:', cartItemIdNum);
      connection.release();
      return res.json({ success: true, message: 'Item không tồn tại hoặc đã bị xóa', affectedRows: 0, deleted: true });
    }
    
    // Bắt đầu transaction để đảm bảo xóa thành công
    await connection.beginTransaction();
    
    const [result] = await connection.query(
      'DELETE FROM chi_tiet_gio_hang WHERE ma_ct = ?',
      [cartItemIdNum]
    );
    
    console.log('Delete result:', result);
    console.log('Affected rows:', result.affectedRows);
    
    // Kiểm tra lại sau khi xóa
    const [checkAfter] = await connection.query(
      'SELECT ma_ct FROM chi_tiet_gio_hang WHERE ma_ct = ?',
      [cartItemIdNum]
    );
    
    const isDeleted = checkAfter.length === 0;
    console.log('After delete check:', isDeleted ? 'DELETED' : 'STILL EXISTS');
    
    if (!isDeleted) {
      // Rollback nếu không xóa được
      await connection.rollback();
      connection.release();
      console.error('CRITICAL: Item still exists after DELETE query! Rolling back...');
      return res.json({ 
        success: false, 
        message: 'Không thể xóa sản phẩm, vui lòng thử lại', 
        affectedRows: result.affectedRows,
        deleted: false
      });
    }
    
    // Commit transaction
    await connection.commit();
    connection.release();
    
    console.log('=== DELETE SUCCESS ===');
    
    res.json({ 
      success: true, 
      message: 'Đã xóa khỏi giỏ hàng', 
      affectedRows: result.affectedRows,
      deleted: true
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Delete cart item error:', error);
    res.json({ success: false, message: error.message });
  }
});

// DELETE /api/cart/clear/:userId - Xóa toàn bộ giỏ hàng
router.delete('/clear/:userId', checkCartAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('DELETE /clear/:userId called with:', userId);
    
    // Lấy TẤT CẢ ma_gio_hang của user (có thể có nhiều do bug)
    const [carts] = await pool.query(
      'SELECT ma_gio_hang FROM gio_hang WHERE ma_kh = ?',
      [userId]
    );
    
    console.log('Found carts for user:', carts);
    
    // Xóa tất cả chi tiết giỏ hàng từ TẤT CẢ giỏ hàng
    for (const cart of carts) {
      const [result] = await pool.query(
        'DELETE FROM chi_tiet_gio_hang WHERE ma_gio_hang = ?',
        [cart.ma_gio_hang]
      );
      console.log(`Deleted ${result.affectedRows} items from cart ${cart.ma_gio_hang}`);
    }
    
    res.json({ success: true, message: 'Đã xóa giỏ hàng', cartsCleared: carts.length });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.json({ success: false, message: error.message });
  }
});

// PUT /api/cart/update - Cập nhật số lượng
router.put('/update', checkCartAccess, async (req, res) => {
  try {
    const { cartItemId, quantity } = req.body;
    
    // Lấy thông tin sản phẩm để kiểm tra tồn kho
    const [cartItem] = await pool.query(
      `SELECT ct.ma_sp, sp.so_luong_ton 
       FROM chi_tiet_gio_hang ct 
       JOIN san_pham sp ON ct.ma_sp = sp.ma_sp 
       WHERE ct.ma_ct = ?`,
      [cartItemId]
    );
    
    if (cartItem.length > 0) {
      const stockQuantity = parseInt(cartItem[0].so_luong_ton) || 0;
      if (quantity > stockQuantity) {
        return res.json({ 
          success: false, 
          message: `Số lượng tối đa có thể mua là ${stockQuantity} sản phẩm`,
          maxQuantity: stockQuantity
        });
      }
    }
    
    await pool.query(
      'UPDATE chi_tiet_gio_hang SET so_luong = ? WHERE ma_ct = ?',
      [quantity, cartItemId]
    );
    
    res.json({ success: true, message: 'Đã cập nhật số lượng' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
});

// POST /api/cart - Thêm sản phẩm vào giỏ hàng
router.post('/', checkCartAccess, async (req, res) => {
  try {
    const {
      userId, productId, quantity = 1, productInfo,
      variantId, color, storage
    } = req.body;

    if (!userId || !productId) {
      return res.json({ success: false, message: 'Thiếu thông tin userId hoặc productId' });
    }

    const variantIdNum = (variantId !== undefined && variantId !== null && variantId !== '')
      ? Number(variantId) : null;
    const colorChosen = color || null;
    const storageChosen = storage || null;

    // Lấy thông tin sản phẩm từ database (bao gồm số lượng tồn kho)
    const [products] = await pool.query(
      'SELECT ma_sp, ten_sp, gia, gia_giam, mau_sac, bo_nho, anh_dai_dien, so_luong_ton FROM san_pham WHERE ma_sp = ?',
      [productId]
    );

    let product;
    let price;
    let isFromDB = false;
    let stockQuantity = 99;
    let variantRow = null;

    if (products.length > 0) {
      product = products[0];
      const basePrice = (product.gia_giam && parseFloat(product.gia_giam) > 0) ? parseFloat(product.gia_giam) : parseFloat(product.gia);
      price = basePrice || 0;
      stockQuantity = parseInt(product.so_luong_ton) || 0;
      isFromDB = true;

      // Nếu client gửi variantId → kiểm tra biến thể và dùng tồn kho/giá variant
      if (variantIdNum && Number.isInteger(variantIdNum) && variantIdNum > 0) {
        const [variants] = await pool.query(
          'SELECT ma_bt, ma_sp, mau_sac, dung_luong, so_luong, gia_chenh, trang_thai FROM bien_the_san_pham WHERE ma_bt = ?',
          [variantIdNum]
        );
        if (variants.length === 0 || Number(variants[0].ma_sp) !== Number(productId)) {
          return res.json({ success: false, message: 'Biến thể không hợp lệ' });
        }
        variantRow = variants[0];
        if (variantRow.trang_thai && variantRow.trang_thai !== 'active') {
          return res.json({ success: false, message: 'Biến thể đã ngừng kinh doanh' });
        }
        stockQuantity = parseInt(variantRow.so_luong) || 0;
        price = basePrice + (parseFloat(variantRow.gia_chenh) || 0);
      }

      if (stockQuantity <= 0) {
        return res.json({
          success: false,
          message: 'Sản phẩm đã hết hàng'
        });
      }

      if (quantity > stockQuantity) {
        return res.json({
          success: false,
          message: `Số lượng tối đa có thể mua là ${stockQuantity} sản phẩm`,
          maxQuantity: stockQuantity
        });
      }
    } else if (productInfo) {
      // Sản phẩm từ JSON file - dùng thông tin từ frontend
      product = {
        ma_sp: productId,
        ten_sp: productInfo.name,
        gia: productInfo.price,
        mau_sac: productInfo.color || 'Mặc định',
        bo_nho: productInfo.storage || '128GB',
        anh_dai_dien: productInfo.image
      };
      price = parseFloat(productInfo.price) || 0;
      isFromDB = false;
    } else {
      return res.json({ success: false, message: 'Sản phẩm không tồn tại' });
    }

    // Chỉ lưu vào database nếu sản phẩm có trong bảng san_pham
    if (isFromDB) {
      // Kiểm tra/tạo giỏ hàng cho user
      let [carts] = await pool.query(
        'SELECT ma_gio_hang FROM gio_hang WHERE ma_kh = ?',
        [userId]
      );

      let cartId;
      if (carts.length === 0) {
        const [result] = await pool.query(
          'INSERT INTO gio_hang (ma_kh) VALUES (?)',
          [userId]
        );
        cartId = result.insertId;
      } else {
        cartId = carts[0].ma_gio_hang;
      }

      // Tìm line item TRÙNG cả biến thể (NULL = NULL coi là trùng cho SP không có variant)
      const [existing] = await pool.query(
        `SELECT ma_ct, so_luong FROM chi_tiet_gio_hang
         WHERE ma_gio_hang = ? AND ma_sp = ?
           AND ((ma_bt IS NULL AND ? IS NULL) OR ma_bt = ?)`,
        [cartId, productId, variantIdNum, variantIdNum]
      );

      if (existing.length > 0) {
        const newTotalQuantity = existing[0].so_luong + quantity;
        if (newTotalQuantity > stockQuantity) {
          return res.json({
            success: false,
            message: `Bạn đã có ${existing[0].so_luong} sản phẩm trong giỏ. Tối đa có thể thêm ${stockQuantity - existing[0].so_luong} sản phẩm nữa.`,
            maxQuantity: stockQuantity,
            currentInCart: existing[0].so_luong
          });
        }

        await pool.query(
          'UPDATE chi_tiet_gio_hang SET so_luong = so_luong + ? WHERE ma_ct = ?',
          [quantity, existing[0].ma_ct]
        );
      } else {
        await pool.query(
          `INSERT INTO chi_tiet_gio_hang
             (ma_gio_hang, ma_sp, ma_bt, mau_sac_chon, dung_luong_chon, so_luong, gia_tai_thoi_diem)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            cartId, productId, variantIdNum,
            variantRow ? variantRow.mau_sac : colorChosen,
            variantRow ? variantRow.dung_luong : storageChosen,
            quantity, price
          ]
        );
      }
    }

    // Xử lý đường dẫn ảnh
    let imagePath = product.anh_dai_dien || 'images/15-256.avif';
    if (imagePath && !imagePath.startsWith('images/') && !imagePath.startsWith('http')) {
      imagePath = `images/${imagePath}`;
    }

    res.json({
      success: true,
      message: isFromDB ? 'Đã thêm vào giỏ hàng' : 'Đã thêm vào giỏ hàng (localStorage)',
      savedToDB: isFromDB,
      product: {
        id: product.ma_sp,
        name: product.ten_sp,
        price: price,
        image: imagePath,
        color: variantRow ? variantRow.mau_sac : (colorChosen || product.mau_sac || 'Mặc định'),
        storage: variantRow ? variantRow.dung_luong : (storageChosen || product.bo_nho || '128GB'),
        variantId: variantRow ? variantRow.ma_bt : null
      }
    });
  } catch (error) {
    console.log('Add to cart error:', error.message);
    res.json({ success: true, message: 'Đã thêm vào giỏ hàng (localStorage)', savedToDB: false });
  }
});

// ============================================
// CÁC ROUTE CÓ PARAMS ĐẶT SAU
// ============================================

// GET /api/cart/:userId - Lấy giỏ hàng của user
router.get('/:userId', checkCartAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('=== GET /:userId ===');
    console.log('userId:', userId);
    
    // Debug: Kiểm tra TẤT CẢ giỏ hàng của user (có thể có nhiều do bug)
    const [allCarts] = await pool.query(
      'SELECT ma_gio_hang FROM gio_hang WHERE ma_kh = ?',
      [userId]
    );
    console.log('All carts for user:', allCarts);
    
    if (allCarts.length > 1) {
      console.warn('WARNING: User has multiple carts! This may cause issues.');
    }
    
    // Lấy giỏ hàng từ TẤT CẢ các bản ghi gio_hang của user
    // LEFT JOIN bien_the_san_pham để vẫn lấy được line item của SP chưa có biến thể (ma_bt NULL)
    const [rows] = await pool.query(`
      SELECT ct.ma_ct, ct.ma_sp, ct.so_luong, ct.gia_tai_thoi_diem, ct.ma_gio_hang,
             ct.ma_bt, ct.mau_sac_chon, ct.dung_luong_chon,
             sp.ten_sp, sp.anh_dai_dien, sp.gia, sp.gia_giam, sp.mau_sac, sp.bo_nho, sp.so_luong_ton,
             bt.mau_sac AS bt_mau_sac, bt.mau_hex AS bt_mau_hex,
             bt.dung_luong AS bt_dung_luong, bt.so_luong AS bt_so_luong,
             bt.trang_thai AS bt_trang_thai
      FROM gio_hang gh
      JOIN chi_tiet_gio_hang ct ON gh.ma_gio_hang = ct.ma_gio_hang
      JOIN san_pham sp ON ct.ma_sp = sp.ma_sp
      LEFT JOIN bien_the_san_pham bt ON ct.ma_bt = bt.ma_bt
      WHERE gh.ma_kh = ?
    `, [userId]);
    
    console.log('Cart items from DB:', rows.length);
    rows.forEach((item, i) => {
      console.log(`Item ${i}: ma_ct=${item.ma_ct}, ma_sp=${item.ma_sp}, ma_gio_hang=${item.ma_gio_hang}`);
    });
    
    // Format data cho frontend
    const cartItems = rows.map(item => {
      const baseDbPrice = (item.gia_giam && parseFloat(item.gia_giam) > 0) ? parseFloat(item.gia_giam) : parseFloat(item.gia);
      const price = parseFloat(item.gia_tai_thoi_diem) || baseDbPrice || 0;
      
      // Xử lý đường dẫn ảnh
      let imagePath = item.anh_dai_dien || '';
      if (!imagePath) {
        imagePath = 'images/15-256.avif';
      } else if (imagePath.startsWith('images/')) {
        // Đã có prefix, giữ nguyên
      } else if (!imagePath.startsWith('http')) {
        imagePath = `images/${imagePath}`;
      }
      imagePath = imagePath.replace('images/images/', 'images/');
      
      // Xử lý màu sắc — ƯU TIÊN biến thể đã chọn nếu có
      let colorName = 'Mặc định';
      let colorCode = '#000000';

      if (item.bt_mau_sac) {
        // Có biến thể → dùng thông tin biến thể (chính xác nhất)
        colorName = item.bt_mau_sac;
        if (item.bt_mau_hex) colorCode = item.bt_mau_hex;
      } else if (item.mau_sac_chon) {
        // Có lựa chọn lưu trong cart (legacy variant chưa link bien_the_san_pham)
        colorName = item.mau_sac_chon;
      } else if (item.mau_sac) {
        try {
          if (item.mau_sac.startsWith('{') || item.mau_sac.startsWith('[')) {
            const colorData = JSON.parse(item.mau_sac);
            if (colorData.colorNames && colorData.colorNames.length > 0) {
              colorName = colorData.colorNames[0];
            }
            if (colorData.colors && colorData.colors.length > 0) {
              colorCode = colorData.colors[0];
            }
          } else {
            colorName = item.mau_sac;
          }
        } catch (e) {
          colorName = item.mau_sac;
        }
      }

      const storage = item.bt_dung_luong || item.dung_luong_chon || item.bo_nho || '128GB';
      const stockCount = item.ma_bt ? (item.bt_so_luong || 0) : (item.so_luong_ton || 0);

      return {
        id: item.ma_sp,
        cartItemId: item.ma_ct,
        variantId: item.ma_bt || null,
        name: item.ten_sp || 'Sản phẩm',
        image: imagePath,
        price: price,
        originalPrice: price,
        quantity: item.so_luong || 1,
        color: colorName,
        colorCode: colorCode,
        storage: storage,
        inStock: stockCount > 0 && (!item.ma_bt || item.bt_trang_thai === 'active' || !item.bt_trang_thai),
        stockCount: stockCount
      };
    });
    
    console.log('=== GET SUCCESS ===');
    res.json({ success: true, data: cartItems });
  } catch (error) {
    console.log('Cart API error:', error.message);
    res.json({ success: true, data: [] });
  }
});

// DELETE /api/cart/:userId/:productId - Xóa sản phẩm khỏi giỏ theo userId và productId
router.delete('/:userId/:productId', checkCartAccess, async (req, res) => {
  try {
    const { userId, productId } = req.params;
    
    console.log('DELETE /:userId/:productId called with:', userId, productId);
    
    // Lấy ma_gio_hang của user
    const [carts] = await pool.query(
      'SELECT ma_gio_hang FROM gio_hang WHERE ma_kh = ?',
      [userId]
    );
    
    if (carts.length > 0) {
      const [result] = await pool.query(
        'DELETE FROM chi_tiet_gio_hang WHERE ma_gio_hang = ? AND ma_sp = ?',
        [carts[0].ma_gio_hang, productId]
      );
      console.log('Delete by userId/productId result:', result);
    }
    
    res.json({ success: true, message: 'Đã xóa khỏi giỏ hàng' });
  } catch (error) {
    console.error('Delete cart error:', error);
    res.json({ success: false, message: error.message });
  }
});

module.exports = router;
