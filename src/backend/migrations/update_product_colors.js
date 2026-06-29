const { pool } = require('../config/database');

// Bản đồ ánh xạ từ tên màu sang mã màu Hex
const colorMap = {
  'đen': '#1C1C1C',
  'trắng': '#F5F5F5',
  'trang': '#F5F5F5',
  'xanh': '#3B82F6',
  'xanh dương': '#3B82F6',
  'xanh duong': '#3B82F6',
  'đỏ': '#EF4444',
  'do': '#EF4444',
  'vàng': '#FBBF24',
  'vang': '#FBBF24',
  'hồng': '#EC4899',
  'hong': '#EC4899',
  'tím': '#A855F7',
  'tim': '#A855F7',
  'xám': '#6B7280',
  'xam': '#6B7280',
  'bạc': '#D1D5DB',
  'bac': '#D1D5DB',
  'vàng đồng': '#D4AF37',
  'titan đen': '#3F3F46',
  'titan trắng': '#E5E7EB',
  'titan xanh': '#1E3A8A',
  'titan sa mạc': '#C2A07A',
  'xám titan': '#8E8E93',
  'titan tự nhiên': '#8E8E93',
  'xanh sapphire': '#0F52BA',
  'xanh lá': '#90EE90',
  'xanh la': '#90EE90',
  'xanh mint': '#98FF98',
  'xanh emerald': '#50C878',
  'xanh aurora': '#00D2FF',
  'xanh azure': '#007FFF',
  'xanh forest': '#228B22',
  'cam': '#FF8C00',
  'xanh monet': '#A2BFFE',
  'xám speed': '#708090',
  'bay blue': '#4682B4',
  'titan gold': '#B8860B',
  'xám urban': '#5A5A5A',
  'đen midnight': '#2C3E50',
  'đen titanium': '#414141',
  'đen orbit': '#2E2E2E',
  'vàng xanh': '#DFFF00',
  'obsidian': '#1C1C1C',
  'porcelain': '#F5F5F5',
  'peony': '#FFB6C1',
  'wintergreen': '#90EE90',
  'phantom black': '#1C1C1C',
  'storm white': '#F5F5F5',
  'rebellion red': '#FF0000',
  'xanh lục': '#90EE90',
  'xanh da trời': '#00BFFF',
  'xanh sapphire': '#0F52BA',
  'n/a': '#D1D5DB'
};

function resolveHex(name) {
  if (!name) return '#808080';
  const clean = name.toLowerCase().trim();
  if (colorMap[clean]) return colorMap[clean];
  
  // Tìm kiếm theo từ khóa chứa trong tên màu
  for (const key of Object.keys(colorMap)) {
    if (clean.includes(key) || key.includes(clean)) {
      return colorMap[key];
    }
  }
  return '#808080'; // Fallback nếu không khớp
}

function getDefaultColorsByBrand(productName, brandName) {
  const nameLower = productName.toLowerCase();
  const brandLower = (brandName || '').toLowerCase();

  // Xác định nếu là phụ kiện
  const isAccessory = nameLower.includes('ốp') || 
                      nameLower.includes('case') || 
                      nameLower.includes('cường lực') || 
                      nameLower.includes('cáp') || 
                      nameLower.includes('sạc') || 
                      nameLower.includes('dây') || 
                      nameLower.includes('sac') || 
                      nameLower.includes('cap') || 
                      nameLower.includes('op');

  if (isAccessory) {
    if (nameLower.includes('ốp') || nameLower.includes('case')) {
      return {
        colorNames: ['Đen', 'Xanh dương', 'Hồng'],
        colors: ['#1C1C1C', '#3B82F6', '#EC4899']
      };
    }
    return {
      colorNames: ['Trắng'],
      colors: ['#F5F5F5']
    };
  }

  // Điện thoại & Thiết bị di động theo hãng
  if (brandLower === 'apple' || nameLower.includes('iphone')) {
    if (nameLower.includes('16 pro') || nameLower.includes('17 pro')) {
      return {
        colorNames: ['Titan Sa Mạc', 'Titan Tự Nhiên', 'Titan Trắng', 'Titan Đen'],
        colors: ['#C2A07A', '#8E8E93', '#E5E7EB', '#3F3F46']
      };
    }
    return {
      colorNames: ['Đen', 'Trắng', 'Xanh', 'Hồng'],
      colors: ['#1C1C1C', '#F5F5F5', '#3B82F6', '#EC4899']
    };
  } else if (brandLower === 'samsung') {
    return {
      colorNames: ['Đen', 'Trắng', 'Tím', 'Xanh Mint'],
      colors: ['#1C1C1C', '#F5F5F5', '#4B0082', '#90EE90']
    };
  } else if (brandLower === 'xiaomi') {
    return {
      colorNames: ['Đen Midnight', 'Xanh Mint', 'Trắng'],
      colors: ['#1C1C1C', '#90EE90', '#F5F5F5']
    };
  } else if (brandLower === 'oppo') {
    return {
      colorNames: ['Đen', 'Trắng', 'Xanh'],
      colors: ['#1C1C1C', '#F5F5F5', '#3B82F6']
    };
  } else if (brandLower === 'realme') {
    return {
      colorNames: ['Vàng', 'Đen', 'Xanh'],
      colors: ['#FBBF24', '#1C1C1C', '#3B82F6']
    };
  } else if (brandLower === 'google') {
    return {
      colorNames: ['Obsidian', 'Porcelain', 'Bay Blue'],
      colors: ['#1C1C1C', '#F5F5F5', '#4682B4']
    };
  }

  // Mặc định
  return {
    colorNames: ['Đen', 'Trắng'],
    colors: ['#1C1C1C', '#F5F5F5']
  };
}

async function run() {
  try {
    console.log('🔄 Bắt đầu chạy cập nhật và chuẩn hóa màu sắc sản phẩm...');

    // Tăng kích thước cột mau_sac để chứa chuỗi JSON dài hơn
    console.log('📐 Đang tăng kích thước cột mau_sac trong bảng san_pham lên VARCHAR(500)...');
    await pool.query('ALTER TABLE san_pham MODIFY COLUMN mau_sac VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL');
    console.log('✅ Đã tăng kích thước cột mau_sac.');

    const [products] = await pool.query(`
      SELECT sp.ma_sp, sp.ten_sp, sp.mau_sac, hsx.ten_hang
      FROM san_pham sp
      LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
    `);

    for (const product of products) {
      let currentVal = product.mau_sac;
      let targetColorsObj = null;

      // 1. Phân tích dữ liệu cũ
      let parsed = null;
      if (currentVal) {
        try {
          parsed = JSON.parse(currentVal);
        } catch (e) {
          // Trừơng hợp chuỗi text thô
          parsed = currentVal;
        }
      }

      // 2. Chuyển đổi sang định dạng màu chuẩn
      if (!parsed) {
        // Màu trống -> Gán màu mặc định theo hãng
        targetColorsObj = getDefaultColorsByBrand(product.ten_sp, product.ten_hang);
      } else if (Array.isArray(parsed)) {
        // Định dạng cũ là một mảng tên màu, ví dụ ["Đen", "Trắng"]
        const names = parsed.map(s => String(s).trim());
        const hexes = names.map(n => resolveHex(n));
        targetColorsObj = { colorNames: names, colors: hexes };
      } else if (typeof parsed === 'object') {
        const colorsArr = Array.isArray(parsed.colors) ? parsed.colors.map(s => String(s).trim()) : [];
        const namesArr = Array.isArray(parsed.colorNames) ? parsed.colorNames.map(s => String(s).trim()) : [];

        if (namesArr.length === 0 && colorsArr.length > 0) {
          // Mảng colors chứa tên màu thay vì mã hex (VD: '{"colors":["Đen","Tím"],"colorNames":[]}')
          // Kiểm tra xem các phần tử có phải mã hex hay không
          const lookLikeHex = colorsArr.every(c => c.startsWith('#'));
          if (lookLikeHex) {
            // Đã có mã hex nhưng thiếu tên hiển thị -> Ánh xạ ngược hoặc gán tên mặc định
            const names = colorsArr.map(h => {
              // Tìm tên màu có mã hex khớp
              for (const [name, hex] of Object.entries(colorMap)) {
                if (hex.toLowerCase() === h.toLowerCase()) {
                  return name.charAt(0).toUpperCase() + name.slice(1);
                }
              }
              return 'Màu khác';
            });
            targetColorsObj = { colorNames: names, colors: colorsArr };
          } else {
            // Mảng colors thực chất chứa tên màu chữ
            const hexes = colorsArr.map(n => resolveHex(n));
            targetColorsObj = { colorNames: colorsArr, colors: hexes };
          }
        } else if (namesArr.length > 0 && colorsArr.length > 0) {
          // Đã có cả hai mảng -> Kiểm tra xem mảng hex có chuẩn không
          const lookLikeHex = colorsArr.every(c => c.startsWith('#'));
          if (!lookLikeHex) {
            // Nếu mảng colors chứa tên màu thay vì hex
            const hexes = namesArr.map(n => resolveHex(n));
            targetColorsObj = { colorNames: namesArr, colors: hexes };
          } else {
            // Đã chuẩn sẵn
            targetColorsObj = { colorNames: namesArr, colors: colorsArr };
          }
        } else {
          // Mảng rỗng -> Gán màu mặc định theo hãng
          targetColorsObj = getDefaultColorsByBrand(product.ten_sp, product.ten_hang);
        }
      } else if (typeof parsed === 'string') {
        // Trường hợp chuỗi văn bản thô phân tách bằng dấu phẩy
        const names = parsed.split(',').map(s => s.trim()).filter(Boolean);
        const hexes = names.map(n => resolveHex(n));
        targetColorsObj = { colorNames: names, colors: hexes };
      }

      // Nếu không tạo được, dùng fallback
      if (!targetColorsObj || targetColorsObj.colors.length === 0) {
        targetColorsObj = getDefaultColorsByBrand(product.ten_sp, product.ten_hang);
      }

      // 3. Thực hiện cập nhật database
      const jsonStr = JSON.stringify(targetColorsObj);
      await pool.query('UPDATE san_pham SET mau_sac = ? WHERE ma_sp = ?', [jsonStr, product.ma_sp]);
      console.log(`   ✅ Chuẩn hóa màu sắc cho SP #${product.ma_sp} "${product.ten_sp}": ${jsonStr}`);
    }

    console.log('🎉 Cập nhật và chuẩn hóa màu sắc sản phẩm thành công!');
    return true;
  } catch (error) {
    console.error('❌ Lỗi chuẩn hóa màu sắc sản phẩm:', error.message);
    return false;
  }
}

module.exports = { run };

if (require.main === module) {
  run().then(ok => process.exit(ok ? 0 : 1));
}
