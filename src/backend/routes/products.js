// API routes cho sản phẩm
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// Simple In-memory Caching Middleware (Lưu RAM)
const memoryCache = {};
const cacheMiddleware = (durationMin) => {
    return (req, res, next) => {
        const key = req.originalUrl || req.url;
        const cachedData = memoryCache[key];
        
        if (cachedData && cachedData.expiry > Date.now()) {
            return res.json(cachedData.data);
        }
        
        const originalJson = res.json;
        res.json = (body) => {
            // Chỉ lưu cache khi thành công
            if (res.statusCode >= 200 && res.statusCode < 300 && body.success) {
                memoryCache[key] = {
                    data: body,
                    expiry: Date.now() + durationMin * 60 * 1000
                };
            }
            originalJson.call(res, body);
        };
        next();
    };
};

// Map ảnh mặc định theo hãng - sử dụng ảnh sản phẩm thực tế
const brandImageMap = {
    'Apple': 'images/iphone-17-pro-max-256.jpg',
    'Samsung': 'images/samsung-galaxy-s24_15__2.webp',
    'Xiaomi': 'images/Xiaomi.avif',
    'Oppo': 'images/oppo_reno_13_f_4g_256gb.avif',
    'Vivo': 'images/oppo_reno_13_f_4g_256gb.avif',
    'Google': 'images/pixel-9-pro.avif',
    'Sony': 'images/sony-xperia-1-vi.webp',
    'Tecno': 'images/TECNO.avif',
    'Realme': 'images/reno10_5g_-_combo_product_-_blue_-_copy.webp',
    'default': 'images/iphone-17-pro-max-256.jpg'
};

// Helper function để lấy ảnh phù hợp
function getProductImage(row) {
    // Nếu có ảnh trong DB, dùng nó
    const dbImage = row.anh_dai_dien || row.image;
    if (dbImage && (dbImage.includes('.avif') || dbImage.includes('.webp') || dbImage.includes('.png') || dbImage.includes('.jpg') || dbImage.includes('.jpeg'))) {
        return dbImage.startsWith('images/') ? dbImage : `images/${dbImage}`;
    }
    
    // Nếu không, dùng ảnh mặc định theo hãng
    const brand = row.ten_hang || row.brand || '';
    return brandImageMap[brand] || brandImageMap['default'];
}

// Helper function để lấy mảng ảnh chi tiết
// Chỉ trả về ảnh từ DB (admin thêm), không tự động thêm ảnh mặc định
function getProductImages(row) {
    const mainImage = getProductImage(row);
    
    // Nếu có ảnh phụ trong DB (admin đã thêm), dùng nó
    if (row.images) {
        let images = typeof row.images === 'string' ? JSON.parse(row.images) : row.images;
        // Lọc bỏ ảnh banner - không phải ảnh sản phẩm
        images = images.filter(img => {
            if (!img) return false;
            const imgLower = img.toLowerCase();
            if (imgLower.includes('h1_1440x242')) return false;
            if (imgLower.includes('banner')) return false;
            if (imgLower.includes('1440x242')) return false;
            if (imgLower.includes('promo')) return false;
            if (imgLower.includes('khuyen-mai')) return false;
            if (imgLower.includes('khuyenmai')) return false;
            if (imgLower.includes('sale')) return false;
            if (imgLower.includes('_ad')) return false;
            // Loại bỏ ảnh có kích thước banner (thường là 1440x242, 1200x300, etc.)
            if (/\d{3,4}x\d{2,3}/.test(imgLower)) return false;
            return true;
        });
        if (images.length > 0) return images;
    }
    
    // Không có ảnh phụ từ admin -> chỉ trả về ảnh chính
    // Admin sẽ tự thêm ảnh phụ qua trang quản trị
    return [mainImage];
}

// Thông số kỹ thuật và GIÁ chi tiết THỰC TẾ theo thị trường Việt Nam (12/2025)
const productSpecs = {
    // ==================== iPhone Series ====================
    'iphone 16 pro max 256': {
        price: 34990000, oldPrice: 36990000,
        screen: '6.9" Super Retina XDR OLED, 2868x1320, 120Hz ProMotion, 2000 nits',
        chip: 'Apple A18 Pro 6 nhân (3nm)',
        ram: '8GB',
        storage: 256,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 48MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '4685 mAh, sạc nhanh 27W, MagSafe 25W',
        os: 'iOS 18',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '227g',
        colors: ['#1C1C1C', '#F5F5DC', '#C4A77D', '#4A4A4A'],
        colorNames: ['Titan Đen', 'Titan Trắng', 'Titan Sa Mạc', 'Titan Tự Nhiên']
    },
    'iphone 16 pro max 512': {
        price: 40990000, oldPrice: 43990000,
        screen: '6.9" Super Retina XDR OLED, 2868x1320, 120Hz ProMotion, 2000 nits',
        chip: 'Apple A18 Pro 6 nhân (3nm)',
        ram: '8GB',
        storage: 512,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 48MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '4685 mAh, sạc nhanh 27W, MagSafe 25W',
        os: 'iOS 18',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '227g',
        colors: ['#1C1C1C', '#F5F5DC', '#C4A77D', '#4A4A4A'],
        colorNames: ['Titan Đen', 'Titan Trắng', 'Titan Sa Mạc', 'Titan Tự Nhiên']
    },
    'iphone 16 pro max 1tb': {
        price: 46990000, oldPrice: 49990000,
        screen: '6.9" Super Retina XDR OLED, 2868x1320, 120Hz ProMotion, 2000 nits',
        chip: 'Apple A18 Pro 6 nhân (3nm)',
        ram: '8GB',
        storage: 1024,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 48MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '4685 mAh, sạc nhanh 27W, MagSafe 25W',
        os: 'iOS 18',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '227g',
        colors: ['#1C1C1C', '#F5F5DC', '#C4A77D', '#4A4A4A'],
        colorNames: ['Titan Đen', 'Titan Trắng', 'Titan Sa Mạc', 'Titan Tự Nhiên']
    },
    'iphone 16 pro max': {
        price: 34990000, oldPrice: 36990000,
        screen: '6.9" Super Retina XDR OLED, 2868x1320, 120Hz ProMotion, 2000 nits',
        chip: 'Apple A18 Pro 6 nhân (3nm)',
        ram: '8GB',
        storage: 256,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 48MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '4685 mAh, sạc nhanh 27W, MagSafe 25W',
        os: 'iOS 18',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '227g',
        colors: ['#1C1C1C', '#F5F5DC', '#C4A77D', '#4A4A4A'],
        colorNames: ['Titan Đen', 'Titan Trắng', 'Titan Sa Mạc', 'Titan Tự Nhiên']
    },
    'iphone 16 pro 256': {
        price: 28990000, oldPrice: 30990000,
        screen: '6.3" Super Retina XDR OLED, 2622x1206, 120Hz ProMotion',
        chip: 'Apple A18 Pro 6 nhân (3nm)',
        ram: '8GB',
        storage: 256,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 48MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '3582 mAh, sạc nhanh 27W, MagSafe 25W',
        os: 'iOS 18',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '199g',
        colors: ['#1C1C1C', '#F5F5DC', '#C4A77D', '#4A4A4A'],
        colorNames: ['Titan Đen', 'Titan Trắng', 'Titan Sa Mạc', 'Titan Tự Nhiên']
    },
    'iphone 16 pro': {
        price: 28990000, oldPrice: 30990000,
        screen: '6.3" Super Retina XDR OLED, 2622x1206, 120Hz ProMotion',
        chip: 'Apple A18 Pro 6 nhân (3nm)',
        ram: '8GB',
        storage: 256,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 48MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '3582 mAh, sạc nhanh 27W, MagSafe 25W',
        os: 'iOS 18',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '199g',
        colors: ['#1C1C1C', '#F5F5DC', '#C4A77D', '#4A4A4A'],
        colorNames: ['Titan Đen', 'Titan Trắng', 'Titan Sa Mạc', 'Titan Tự Nhiên']
    },
    'iphone 16 128': {
        price: 22990000, oldPrice: 24990000,
        screen: '6.1" Super Retina XDR OLED, 2556x1179, 60Hz',
        chip: 'Apple A18 6 nhân (3nm)',
        ram: '8GB',
        storage: 128,
        camera: 'Chính 48MP f/1.6 OIS | Ultra 12MP f/2.2',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '3561 mAh, sạc nhanh 20W, MagSafe 15W',
        os: 'iOS 18',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '170g',
        colors: ['#2D2D2D', '#F5F5F5', '#E91E63', '#00BCD4', '#8BC34A'],
        colorNames: ['Đen', 'Trắng', 'Hồng', 'Xanh Mòng Két', 'Xanh Lá']
    },
    'iphone 16': {
        price: 22990000, oldPrice: 24990000,
        screen: '6.1" Super Retina XDR OLED, 2556x1179, 60Hz',
        chip: 'Apple A18 6 nhân (3nm)',
        ram: '8GB',
        storage: 128,
        camera: 'Chính 48MP f/1.6 OIS | Ultra 12MP f/2.2',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '3561 mAh, sạc nhanh 20W, MagSafe 15W',
        os: 'iOS 18',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '170g',
        colors: ['#2D2D2D', '#F5F5F5', '#E91E63', '#00BCD4', '#8BC34A'],
        colorNames: ['Đen', 'Trắng', 'Hồng', 'Xanh Mòng Két', 'Xanh Lá']
    },
    'iphone 15 pro max 256': {
        price: 29990000, oldPrice: 34990000,
        screen: '6.7" Super Retina XDR OLED, 2796x1290, 120Hz ProMotion',
        chip: 'Apple A17 Pro 6 nhân (3nm)',
        ram: '8GB',
        storage: 256,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 12MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '4422 mAh, sạc nhanh 27W, MagSafe 15W',
        os: 'iOS 17 (nâng cấp iOS 18)',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '221g',
        colors: ['#3C3C3C', '#F5F5DC', '#1C1C1C', '#3B4B59'],
        colorNames: ['Titan Tự Nhiên', 'Titan Trắng', 'Titan Đen', 'Titan Xanh']
    },
    'iphone 15 pro max': {
        price: 29990000, oldPrice: 34990000,
        screen: '6.7" Super Retina XDR OLED, 2796x1290, 120Hz ProMotion',
        chip: 'Apple A17 Pro 6 nhân (3nm)',
        ram: '8GB',
        storage: 256,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 12MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '4422 mAh, sạc nhanh 27W, MagSafe 15W',
        os: 'iOS 17 (nâng cấp iOS 18)',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '221g',
        colors: ['#3C3C3C', '#F5F5DC', '#1C1C1C', '#3B4B59'],
        colorNames: ['Titan Tự Nhiên', 'Titan Trắng', 'Titan Đen', 'Titan Xanh']
    },
    'iphone 15 128': {
        price: 19990000, oldPrice: 22990000,
        screen: '6.1" Super Retina XDR OLED, 2556x1179, 60Hz',
        chip: 'Apple A16 Bionic 6 nhân',
        ram: '6GB',
        storage: 128,
        camera: 'Chính 48MP f/1.6 OIS | Ultra 12MP f/2.4',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '3349 mAh, sạc nhanh 20W, MagSafe 15W',
        os: 'iOS 17',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '171g',
        colors: ['#2D2D2D', '#FFE4E1', '#FFFACD', '#98FB98', '#87CEEB'],
        colorNames: ['Đen', 'Hồng', 'Vàng', 'Xanh Lá', 'Xanh Dương']
    },
    'iphone 15': {
        price: 19990000, oldPrice: 22990000,
        screen: '6.1" Super Retina XDR OLED, 2556x1179, 60Hz',
        chip: 'Apple A16 Bionic 6 nhân',
        ram: '6GB',
        storage: 128,
        camera: 'Chính 48MP f/1.6 OIS | Ultra 12MP f/2.4',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '3349 mAh, sạc nhanh 20W, MagSafe 15W',
        os: 'iOS 17',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '171g',
        colors: ['#2D2D2D', '#FFE4E1', '#FFFACD', '#98FB98', '#87CEEB'],
        colorNames: ['Đen', 'Hồng', 'Vàng', 'Xanh Lá', 'Xanh Dương']
    },
    
    // iPhone 14 Series
    'iphone 14 pro max': {
        price: 24990000, oldPrice: 29990000,
        screen: '6.7" Super Retina XDR OLED, 2796x1290, 120Hz ProMotion',
        chip: 'Apple A16 Bionic 6 nhân',
        ram: '6GB',
        storage: 256,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 12MP f/2.2 | Tele 12MP 3x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '4323 mAh, sạc nhanh 27W, MagSafe 15W',
        os: 'iOS 16 (nâng cấp iOS 18)',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '240g',
        colors: ['#1C1C1C', '#F5F5DC', '#483D8B', '#FFD700'],
        colorNames: ['Đen Không Gian', 'Bạc', 'Tím Đậm', 'Vàng']
    },
    'iphone 14 pro': {
        price: 22990000, oldPrice: 27990000,
        screen: '6.1" Super Retina XDR OLED, 2556x1179, 120Hz ProMotion',
        chip: 'Apple A16 Bionic 6 nhân',
        ram: '6GB',
        storage: 128,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 12MP f/2.2 | Tele 12MP 3x',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '3200 mAh, sạc nhanh 27W, MagSafe 15W',
        os: 'iOS 16 (nâng cấp iOS 18)',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '206g',
        colors: ['#1C1C1C', '#F5F5DC', '#483D8B', '#FFD700'],
        colorNames: ['Đen Không Gian', 'Bạc', 'Tím Đậm', 'Vàng']
    },
    'iphone 14': {
        price: 17990000, oldPrice: 19990000,
        screen: '6.1" Super Retina XDR OLED, 2532x1170, 60Hz',
        chip: 'Apple A15 Bionic 6 nhân',
        ram: '6GB',
        storage: 128,
        camera: 'Chính 12MP f/1.5 OIS | Ultra 12MP f/2.4',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '3279 mAh, sạc nhanh 20W, MagSafe 15W',
        os: 'iOS 16 (nâng cấp iOS 18)',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '172g',
        colors: ['#1C1C1C', '#F5F5F5', '#4169E1', '#800080', '#FFFACD'],
        colorNames: ['Đêm', 'Ánh Sao', 'Xanh Dương', 'Tím', 'Vàng']
    },
    'iphone 14 plus': {
        price: 19990000, oldPrice: 22990000,
        screen: '6.7" Super Retina XDR OLED, 2778x1284, 60Hz',
        chip: 'Apple A15 Bionic 6 nhân',
        ram: '6GB',
        storage: 128,
        camera: 'Chính 12MP f/1.5 OIS | Ultra 12MP f/2.4',
        frontCamera: '12MP f/1.9 TrueDepth',
        battery: '4325 mAh, sạc nhanh 20W, MagSafe 15W',
        os: 'iOS 16 (nâng cấp iOS 18)',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '203g',
        colors: ['#1C1C1C', '#F5F5F5', '#4169E1', '#800080', '#FFFACD'],
        colorNames: ['Đêm', 'Ánh Sao', 'Xanh Dương', 'Tím', 'Vàng']
    },
    
    // iPhone 17 Pro (dự kiến 2025)
    'iphone 17 pro': {
        price: 28990000, oldPrice: 31990000,
        screen: '6.3" Super Retina XDR OLED, ProMotion 120Hz, 2000 nits',
        chip: 'Apple A19 Pro (3nm thế hệ 2)',
        ram: '8GB',
        storage: 128,
        camera: 'Chính 48MP f/1.78 OIS | Ultra 48MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/1.9 TrueDepth, Face ID',
        battery: '3800 mAh, sạc nhanh 35W, MagSafe 20W',
        os: 'iOS 19',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '190g',
        colors: ['#1C1C1C', '#F5F5DC', '#C4A77D', '#4A4A4A'],
        colorNames: ['Titan Đen', 'Titan Trắng', 'Titan Sa Mạc', 'Titan Tự Nhiên']
    },
    
    // ==================== Vivo Series ====================
    'vivo v25': {
        price: 9990000, oldPrice: 10990000,
        screen: '6.44" AMOLED, 2404x1080, 90Hz',
        chip: 'MediaTek Dimensity 900 5G',
        ram: '8GB',
        storage: 128,
        camera: 'Chính 64MP f/1.79 OIS | Ultra 8MP f/2.2 | Macro 2MP',
        frontCamera: '50MP f/2.0',
        battery: '4500 mAh, sạc nhanh 44W',
        os: 'Android 12, Funtouch OS 12',
        sim: '2 Nano SIM',
        weight: '186g',
        colors: ['#1C1C1C', '#4169E1', '#FFD700'],
        colorNames: ['Elegant Black', 'Sunrise Gold', 'Diamond Black']
    },
    'vivo v27': {
        price: 10990000, oldPrice: 12490000,
        screen: '6.78" AMOLED, 2400x1080, 120Hz',
        chip: 'MediaTek Dimensity 7200',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 50MP f/1.88 OIS | Ultra 8MP f/2.2 | Macro 2MP',
        frontCamera: '50MP f/2.0',
        battery: '4600 mAh, sạc nhanh 66W',
        os: 'Android 13, Funtouch OS 13',
        sim: '2 Nano SIM',
        weight: '182g',
        colors: ['#1C1C1C', '#90EE90', '#DDA0DD'],
        colorNames: ['Magic Black', 'Emerald Green', 'Lavender Purple']
    },
    
    // ==================== Asus ROG Phone Series ====================
    'asus rog phone 7': {
        price: 24990000, oldPrice: 27990000,
        screen: '6.78" AMOLED, 2448x1080, 165Hz',
        chip: 'Snapdragon 8 Gen 2',
        ram: '16GB',
        storage: 512,
        camera: 'Chính 50MP f/1.9 OIS | Ultra 13MP f/2.2 | Macro 5MP',
        frontCamera: '12MP f/2.8',
        battery: '6000 mAh, sạc nhanh 65W',
        os: 'Android 13, ROG UI',
        sim: '2 Nano SIM',
        weight: '239g',
        colors: ['#1C1C1C', '#F5F5F5', '#FF0000'],
        colorNames: ['Phantom Black', 'Storm White', 'Rebellion Red']
    },
    'asus rog phone 8': {
        price: 27990000, oldPrice: 31990000,
        screen: '6.78" LTPO AMOLED, 2448x1080, 165Hz',
        chip: 'Snapdragon 8 Gen 3',
        ram: '16GB',
        storage: 512,
        camera: 'Chính 50MP f/1.9 OIS | Ultra 13MP f/2.2 | Tele 32MP 3x',
        frontCamera: '12MP f/2.8',
        battery: '5500 mAh, sạc nhanh 65W',
        os: 'Android 14, ROG UI',
        sim: '2 Nano SIM',
        weight: '225g',
        colors: ['#1C1C1C', '#808080'],
        colorNames: ['Phantom Black', 'Rebel Grey']
    },
    
    // ==================== Sony Xperia Series ====================
    'sony xperia 5': {
        price: 19990000, oldPrice: 24990000,
        screen: '6.1" OLED, 2520x1080, 120Hz HDR',
        chip: 'Snapdragon 8 Gen 1',
        ram: '8GB',
        storage: 256,
        camera: 'Chính 12MP f/1.7 OIS | Ultra 12MP f/2.2 | Tele 12MP 3x',
        frontCamera: '8MP f/2.0',
        battery: '5000 mAh, sạc nhanh 30W',
        os: 'Android 13',
        sim: '1 Nano SIM + 1 Nano SIM hoặc MicroSD',
        weight: '182g',
        colors: ['#1C1C1C', '#F5F5F5', '#4169E1', '#90EE90'],
        colorNames: ['Đen', 'Trắng', 'Xanh Dương', 'Xanh Lá']
    },
    'sony xperia 1 vi': {
        price: 32990000, oldPrice: 36990000,
        screen: '6.5" OLED 4K, 3840x1644, 120Hz HDR',
        chip: 'Snapdragon 8 Gen 3',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 52MP f/1.9 OIS | Ultra 12MP f/2.2 | Tele 12MP 5x',
        frontCamera: '12MP f/2.0',
        battery: '5000 mAh, sạc nhanh 30W, không dây 15W',
        os: 'Android 14',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '192g',
        colors: ['#1C1C1C', '#F5F5F5', '#90EE90'],
        colorNames: ['Đen', 'Bạc', 'Xanh Khaki']
    },
    
    // ==================== Vsmart Series ====================
    'vsmart joy 4': {
        price: 3990000, oldPrice: 4490000,
        screen: '6.53" IPS LCD, 2340x1080, 60Hz',
        chip: 'Snapdragon 460',
        ram: '4GB',
        storage: 64,
        camera: 'Chính 13MP f/2.2 | Macro 2MP | Depth 2MP',
        frontCamera: '8MP f/2.0',
        battery: '5000 mAh, sạc nhanh 18W',
        os: 'Android 10, VOS 3.0',
        sim: '2 Nano SIM',
        weight: '193g',
        colors: ['#1C1C1C', '#F5F5F5', '#00CED1'],
        colorNames: ['Đen', 'Trắng', 'Xanh Ngọc']
    },

    // ==================== Samsung Galaxy S Series ====================
    'samsung galaxy s25 ultra 256': {
        price: 33990000, oldPrice: 36990000,
        screen: '6.9" Dynamic AMOLED 2X, 3120x1440, 120Hz LTPO',
        chip: 'Snapdragon 8 Elite for Galaxy',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 200MP f/1.7 OIS | Ultra 50MP f/1.9 | Tele 50MP 5x | Tele 10MP 3x',
        frontCamera: '12MP f/2.2',
        battery: '5000 mAh, sạc nhanh 45W, không dây 25W',
        os: 'Android 15, One UI 7',
        sim: '2 Nano SIM hoặc 1 Nano SIM + 1 eSIM',
        weight: '218g',
        colors: ['#1C1C1C', '#C0C0C0', '#000080', '#808080'],
        colorNames: ['Titan Đen', 'Titan Bạc', 'Titan Xanh', 'Titan Xám']
    },
    'samsung galaxy s25 ultra': {
        price: 33990000, oldPrice: 36990000,
        screen: '6.9" Dynamic AMOLED 2X, 3120x1440, 120Hz LTPO',
        chip: 'Snapdragon 8 Elite for Galaxy',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 200MP f/1.7 OIS | Ultra 50MP f/1.9 | Tele 50MP 5x | Tele 10MP 3x',
        frontCamera: '12MP f/2.2',
        battery: '5000 mAh, sạc nhanh 45W, không dây 25W',
        os: 'Android 15, One UI 7',
        sim: '2 Nano SIM hoặc 1 Nano SIM + 1 eSIM',
        weight: '218g',
        colors: ['#1C1C1C', '#C0C0C0', '#000080', '#808080'],
        colorNames: ['Titan Đen', 'Titan Bạc', 'Titan Xanh', 'Titan Xám']
    },
    'samsung galaxy s24 ultra 256': {
        price: 27990000, oldPrice: 33990000,
        screen: '6.8" Dynamic AMOLED 2X, 3088x1440, 120Hz LTPO',
        chip: 'Snapdragon 8 Gen 3 for Galaxy',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 200MP f/1.7 OIS | Ultra 12MP f/2.2 | Tele 50MP 5x | Tele 10MP 3x',
        frontCamera: '12MP f/2.2',
        battery: '5000 mAh, sạc nhanh 45W, không dây 15W',
        os: 'Android 14, One UI 6.1',
        sim: '2 Nano SIM hoặc 1 Nano SIM + 1 eSIM',
        weight: '232g',
        colors: ['#1C1C1C', '#E5E4E2', '#483D8B', '#FFD700', '#808080'],
        colorNames: ['Titan Đen', 'Titan Xám', 'Tím Titan', 'Vàng Titan', 'Xanh Titan']
    },
    'samsung galaxy s24 ultra': {
        price: 27990000, oldPrice: 33990000,
        screen: '6.8" Dynamic AMOLED 2X, 3088x1440, 120Hz LTPO',
        chip: 'Snapdragon 8 Gen 3 for Galaxy',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 200MP f/1.7 OIS | Ultra 12MP f/2.2 | Tele 50MP 5x | Tele 10MP 3x',
        frontCamera: '12MP f/2.2',
        battery: '5000 mAh, sạc nhanh 45W, không dây 15W',
        os: 'Android 14, One UI 6.1',
        sim: '2 Nano SIM hoặc 1 Nano SIM + 1 eSIM',
        weight: '232g',
        colors: ['#1C1C1C', '#E5E4E2', '#483D8B', '#FFD700', '#808080'],
        colorNames: ['Titan Đen', 'Titan Xám', 'Tím Titan', 'Vàng Titan', 'Xanh Titan']
    },
    'samsung galaxy s24 fe': {
        price: 14990000, oldPrice: 16990000,
        screen: '6.7" Dynamic AMOLED 2X, 2340x1080, 120Hz',
        chip: 'Exynos 2400e',
        ram: '8GB',
        storage: 128,
        camera: 'Chính 50MP f/1.8 OIS | Ultra 12MP f/2.2 | Tele 8MP 3x',
        frontCamera: '10MP f/2.4',
        battery: '4700 mAh, sạc nhanh 25W, không dây 15W',
        os: 'Android 14, One UI 6.1',
        sim: '2 Nano SIM',
        weight: '213g',
        colors: ['#2D2D2D', '#E6E6FA', '#87CEEB', '#FFFACD', '#98FB98'],
        colorNames: ['Đen', 'Tím', 'Xanh Dương', 'Vàng', 'Xanh Lá']
    },

    // ==================== Samsung Galaxy A Series ====================
    'samsung galaxy a55': {
        price: 10490000, oldPrice: 11990000,
        screen: '6.6" Super AMOLED, 2340x1080, 120Hz',
        chip: 'Exynos 1480 8 nhân',
        ram: '8GB',
        storage: 128,
        camera: 'Chính 50MP f/1.8 OIS | Ultra 12MP f/2.2 | Macro 5MP',
        frontCamera: '32MP f/2.2',
        battery: '5000 mAh, sạc nhanh 25W',
        os: 'Android 14, One UI 6.1',
        sim: '2 Nano SIM',
        weight: '213g',
        colors: ['#2D2D2D', '#E0FFFF', '#DDA0DD', '#FFFACD'],
        colorNames: ['Đen Huyền Bí', 'Xanh Băng', 'Tím Oải Hương', 'Vàng Chanh']
    },
    'samsung galaxy a36 5g': {
        price: 8490000, oldPrice: 9490000,
        screen: '6.6" Super AMOLED, 2340x1080, 120Hz',
        chip: 'Exynos 1380 8 nhân',
        ram: '8GB',
        storage: 128,
        camera: 'Chính 50MP f/1.8 OIS | Ultra 8MP f/2.2 | Macro 5MP',
        frontCamera: '13MP f/2.2',
        battery: '5000 mAh, sạc nhanh 25W',
        os: 'Android 14, One UI 6.1',
        sim: '2 Nano SIM',
        weight: '200g',
        colors: ['#2D2D2D', '#ADD8E6', '#E6E6FA', '#90EE90'],
        colorNames: ['Đen', 'Xanh Dương', 'Tím Lavender', 'Xanh Lá']
    },

    // ==================== OPPO Series ====================
    'oppo find x8 pro': {
        price: 24990000, oldPrice: 27990000,
        screen: '6.78" LTPO AMOLED, 2780x1264, 120Hz, 4500 nits',
        chip: 'MediaTek Dimensity 9400',
        ram: '16GB',
        storage: 512,
        camera: 'Chính 50MP f/1.6 OIS | Ultra 50MP f/2.0 | Tele 50MP 3x (Hasselblad)',
        frontCamera: '32MP f/2.4',
        battery: '5910 mAh, sạc nhanh 80W, không dây 50W',
        os: 'Android 15, ColorOS 15',
        sim: '2 Nano SIM',
        weight: '215g',
        colors: ['#1C1C1C', '#F5F5F5'],
        colorNames: ['Đen Không Gian', 'Trắng Ngọc Trai']
    },
    'oppo reno 13 5g': {
        price: 12990000, oldPrice: 14990000,
        screen: '6.59" AMOLED, 2412x1080, 120Hz',
        chip: 'MediaTek Dimensity 8350',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 50MP f/1.8 OIS | Ultra 8MP f/2.2 | Macro 2MP',
        frontCamera: '50MP f/2.0',
        battery: '5600 mAh, sạc nhanh 80W',
        os: 'Android 15, ColorOS 15',
        sim: '2 Nano SIM',
        weight: '181g',
        colors: ['#1C1C1C', '#4169E1', '#FFB6C1'],
        colorNames: ['Đen Huyền Bí', 'Xanh Đại Dương', 'Hồng Phấn']
    },
    'oppo reno 13': {
        price: 12990000, oldPrice: 14990000,
        screen: '6.59" AMOLED, 2412x1080, 120Hz',
        chip: 'MediaTek Dimensity 8350',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 50MP f/1.8 OIS | Ultra 8MP f/2.2 | Macro 2MP',
        frontCamera: '50MP f/2.0',
        battery: '5600 mAh, sạc nhanh 80W',
        os: 'Android 15, ColorOS 15',
        sim: '2 Nano SIM',
        weight: '181g',
        colors: ['#1C1C1C', '#4169E1', '#FFB6C1'],
        colorNames: ['Đen Huyền Bí', 'Xanh Đại Dương', 'Hồng Phấn']
    },

    // ==================== Xiaomi Series ====================
    'xiaomi 14 ultra': {
        price: 29990000, oldPrice: 32990000,
        screen: '6.73" LTPO AMOLED, 3200x1440, 120Hz, 3000 nits',
        chip: 'Snapdragon 8 Gen 3',
        ram: '16GB',
        storage: 512,
        camera: 'Chính 50MP f/1.63 OIS | Ultra 50MP f/1.8 | Tele 50MP 3x | Tele 50MP 5x (Leica)',
        frontCamera: '32MP f/2.0',
        battery: '5300 mAh, sạc nhanh 90W, không dây 80W',
        os: 'Android 14, HyperOS',
        sim: '2 Nano SIM',
        weight: '224g',
        colors: ['#1C1C1C', '#F5F5F5'],
        colorNames: ['Đen', 'Trắng']
    },
    'xiaomi 14': {
        price: 18990000, oldPrice: 21990000,
        screen: '6.36" LTPO AMOLED, 2670x1200, 120Hz',
        chip: 'Snapdragon 8 Gen 3',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 50MP f/1.6 OIS | Ultra 50MP f/2.2 | Tele 50MP 3x (Leica)',
        frontCamera: '32MP f/2.0',
        battery: '4610 mAh, sạc nhanh 90W, không dây 50W',
        os: 'Android 14, HyperOS',
        sim: '2 Nano SIM',
        weight: '188g',
        colors: ['#1C1C1C', '#F5F5F5', '#90EE90'],
        colorNames: ['Đen', 'Trắng', 'Xanh Jade']
    },
    'redmi note 13 pro+ 5g': {
        price: 9990000, oldPrice: 11490000,
        screen: '6.67" AMOLED, 2712x1220, 120Hz, 1800 nits',
        chip: 'MediaTek Dimensity 7200 Ultra',
        ram: '12GB',
        storage: 256,
        camera: 'Chính 200MP f/1.65 OIS | Ultra 8MP f/2.2 | Macro 2MP',
        frontCamera: '16MP f/2.45',
        battery: '5000 mAh, sạc nhanh 120W',
        os: 'Android 13, MIUI 14',
        sim: '2 Nano SIM',
        weight: '204g',
        colors: ['#1C1C1C', '#4B0082', '#00CED1'],
        colorNames: ['Đen', 'Tím Aurora', 'Xanh Băng']
    },

    // ==================== Google Pixel ====================
    'google pixel 9 pro': {
        price: 26990000, oldPrice: 28990000,
        screen: '6.3" LTPO OLED, 2856x1280, 120Hz, 2000 nits',
        chip: 'Google Tensor G4',
        ram: '16GB',
        storage: 128,
        camera: 'Chính 50MP f/1.68 OIS | Ultra 48MP f/1.7 | Tele 48MP 5x',
        frontCamera: '42MP f/2.2',
        battery: '4700 mAh, sạc nhanh 37W, không dây 23W',
        os: 'Android 15',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '199g',
        colors: ['#1C1C1C', '#F5F5F5', '#FFB6C1', '#D2B48C'],
        colorNames: ['Obsidian', 'Porcelain', 'Rose Quartz', 'Hazel']
    },
    'google pixel 9': {
        price: 19990000, oldPrice: 22990000,
        screen: '6.3" OLED, 2424x1080, 120Hz',
        chip: 'Google Tensor G4',
        ram: '12GB',
        storage: 128,
        camera: 'Chính 50MP f/1.68 OIS | Ultra 48MP f/1.7',
        frontCamera: '10.5MP f/2.2',
        battery: '4700 mAh, sạc nhanh 27W, không dây 15W',
        os: 'Android 15',
        sim: '1 Nano SIM + 1 eSIM',
        weight: '198g',
        colors: ['#1C1C1C', '#F5F5F5', '#FFB6C1', '#90EE90'],
        colorNames: ['Obsidian', 'Porcelain', 'Peony', 'Wintergreen']
    }
};

// Hàm lấy thông số theo tên sản phẩm - ưu tiên khớp chính xác hơn
function getProductSpecsByName(productName) {
    const name = productName.toLowerCase();
    let bestMatch = null;
    let bestMatchLength = 0;
    
    for (const [key, specs] of Object.entries(productSpecs)) {
        if (name.includes(key) && key.length > bestMatchLength) {
            bestMatch = specs;
            bestMatchLength = key.length;
        }
    }
    return bestMatch;
}

// Helper function để map dữ liệu từ DB sang format frontend
function mapProductToFrontend(row) {
    const brand = row.ten_hang || row.brand || 'unknown';
    const mainImage = getProductImage(row);
    const productName = row.ten_sp || row.name || '';
    
    // Lấy thông số thực tế theo tên sản phẩm
    const realSpecs = getProductSpecsByName(productName);
    
    // ƯU TIÊN giá từ database (admin nhập), chỉ dùng hardcode làm fallback
    let price = parseFloat(row.gia || row.price) || realSpecs?.price || 0;
    let oldPrice = null;
    if (row.gia_giam && parseFloat(row.gia_giam) > 0) {
        price = parseFloat(row.gia_giam);
        oldPrice = parseFloat(row.gia || row.price) || realSpecs?.price || 0;
    }
    
    // Xác định OS dựa trên brand - QUAN TRỌNG: iPhone chạy iOS, không phải Android!
    const brandLower = brand.toLowerCase();
    let defaultOS = 'Android 14';
    let defaultSim = '2 Nano SIM';
    let defaultColors = ['#000000', '#FFFFFF'];
    let defaultColorNames = ['Đen', 'Trắng'];
    
    // Gán OS và thông số mặc định theo brand
    if (brandLower === 'apple' || productName.toLowerCase().includes('iphone')) {
        defaultOS = 'iOS 18';
        defaultSim = '1 Nano SIM + 1 eSIM';
        defaultColors = ['#1C1C1C', '#F5F5DC', '#FFD700', '#FF69B4'];
        defaultColorNames = ['Đen', 'Trắng', 'Vàng', 'Hồng'];
    } else if (brandLower === 'samsung') {
        defaultOS = 'Android 14, One UI 6.1';
        defaultColors = ['#1C1C1C', '#F5F5F5', '#4B0082', '#90EE90'];
        defaultColorNames = ['Đen', 'Trắng', 'Tím', 'Xanh Mint'];
    } else if (brandLower === 'xiaomi') {
        defaultOS = 'Android 14, HyperOS';
        defaultColors = ['#1C1C1C', '#F5F5F5', '#87CEEB', '#90EE90'];
        defaultColorNames = ['Đen', 'Trắng', 'Xanh Dương', 'Xanh Lá'];
    } else if (brandLower === 'oppo') {
        defaultOS = 'Android 14, ColorOS 14';
        defaultColors = ['#1C1C1C', '#F5F5F5', '#4169E1', '#90EE90'];
        defaultColorNames = ['Đen', 'Trắng', 'Xanh Dương', 'Xanh Lục'];
    } else if (brandLower === 'vivo') {
        defaultOS = 'Android 14, Funtouch OS 14';
        defaultColors = ['#1C1C1C', '#F5F5F5', '#4169E1'];
        defaultColorNames = ['Đen', 'Trắng', 'Xanh'];
    } else if (brandLower === 'google') {
        defaultOS = 'Android 15';
        defaultColors = ['#1C1C1C', '#F5F5F5', '#FFB6C1', '#90EE90'];
        defaultColorNames = ['Obsidian', 'Porcelain', 'Peony', 'Wintergreen'];
    } else if (brandLower === 'sony') {
        defaultOS = 'Android 14';
        defaultColors = ['#1C1C1C', '#F5F5F5', '#4169E1'];
        defaultColorNames = ['Đen', 'Trắng', 'Xanh'];
    } else if (brandLower === 'asus') {
        defaultOS = 'Android 14, ROG UI';
        defaultColors = ['#1C1C1C', '#F5F5F5', '#FF0000'];
        defaultColorNames = ['Phantom Black', 'Storm White', 'Rebellion Red'];
    } else if (brandLower === 'tecno') {
        defaultOS = 'Android 14, HiOS 14';
        defaultColors = ['#1C1C1C', '#4169E1', '#FFD700'];
        defaultColorNames = ['Đen', 'Xanh Aurora', 'Vàng'];
    }
    
    // Mapping tên màu tiếng Việt sang mã hex
    const colorNameToHex = {
        'đen': '#000000', 'den': '#000000', 'black': '#000000',
        'trắng': '#FFFFFF', 'trang': '#FFFFFF', 'white': '#FFFFFF',
        'bạc': '#C0C0C0', 'bac': '#C0C0C0', 'silver': '#C0C0C0',
        'xám': '#808080', 'xam': '#808080', 'gray': '#808080', 'grey': '#808080',
        'vàng': '#FFD700', 'vang': '#FFD700', 'gold': '#FFD700', 'vàng gold': '#FFD700',
        'hồng': '#FFC0CB', 'hong': '#FFC0CB', 'pink': '#FFC0CB',
        'đỏ': '#FF0000', 'do': '#FF0000', 'red': '#FF0000',
        'cam': '#FFA500', 'orange': '#FFA500',
        'xanh': '#0000FF', 'xanh dương': '#0000FF', 'xanh duong': '#0000FF', 'blue': '#0000FF',
        'xanh lá': '#008000', 'xanh la': '#008000', 'green': '#008000',
        'xanh da trời': '#00BFFF', 'xanh da troi': '#00BFFF',
        'xanh mint': '#90EE90', 'mint': '#90EE90',
        'xanh teal': '#008080', 'teal': '#008080',
        'tím': '#800080', 'tim': '#800080', 'purple': '#800080',
        'tím indigo': '#4B0082', 'tim indigo': '#4B0082', 'indigo': '#4B0082',
        'tím lavender': '#E6E6FA', 'lavender': '#E6E6FA',
        'nâu': '#8B4513', 'nau': '#8B4513', 'brown': '#8B4513',
        'đỏ đô': '#800000', 'do do': '#800000', 'maroon': '#800000',
        'titan tự nhiên': '#3C3C3C', 'titan tu nhien': '#3C3C3C', 'natural titanium': '#3C3C3C',
        'titan trắng': '#F5F5DC', 'titan trang': '#F5F5DC', 'white titanium': '#F5F5DC',
        'titan xanh': '#3B4B59', 'titan xanh': '#3B4B59', 'blue titanium': '#3B4B59',
        'titan đen': '#1C1C1C', 'titan den': '#1C1C1C', 'black titanium': '#1C1C1C',
        'graphite': '#2D2926',
        'cream': '#FAF0E6', 'kem': '#FAF0E6',
        'midnight': '#1C1C1C'
    };
    
    // Parse màu sắc từ database
    let dbColors = null;
    let dbColorNames = null;
    if (row.mau_sac) {
        try {
            const colorData = typeof row.mau_sac === 'string' ? JSON.parse(row.mau_sac) : row.mau_sac;
            if (colorData.colors && Array.isArray(colorData.colors)) {
                dbColors = colorData.colors;
                dbColorNames = colorData.colorNames || [];
            } else if (Array.isArray(colorData)) {
                dbColors = colorData;
            }
        } catch(e) {
            // Fallback: nếu là string đơn giản dạng "Xanh, Hồng, Đen"
            const colorStr = row.mau_sac.toString().trim();
            if (colorStr && !colorStr.startsWith('{') && !colorStr.startsWith('[')) {
                const colorList = colorStr.split(',').map(c => c.trim().toLowerCase());
                dbColors = [];
                dbColorNames = [];
                for (const colorName of colorList) {
                    const hex = colorNameToHex[colorName] || colorNameToHex[colorName.toLowerCase()];
                    if (hex) {
                        dbColors.push(hex);
                        dbColorNames.push(colorName.charAt(0).toUpperCase() + colorName.slice(1));
                    }
                }
                if (dbColors.length === 0) {
                    dbColors = null;
                    dbColorNames = null;
                }
            }
        }
    }
    
    const nameLower = productName.toLowerCase();
    const isAccessory = (() => {
        if (row.category === 'phukien') return true;
        return nameLower.includes('ốp') || 
               nameLower.includes('case') ||
               nameLower.includes('tai nghe') || 
               nameLower.includes('earpods') || 
               nameLower.includes('airpods') || 
               nameLower.includes('buds') || 
               nameLower.includes('sạc') || 
               nameLower.includes('cáp') || 
               nameLower.includes('dây sạc') || 
               nameLower.includes('cường lực') || 
               nameLower.includes('giá đỡ') || 
               nameLower.includes('gậy chụp');
    })();

    const accessoryType = (() => {
        if (!isAccessory) return null;
        if (nameLower.includes('tai nghe') || nameLower.includes('earpods') || nameLower.includes('airpods') || nameLower.includes('buds') || nameLower.includes('headphone')) return 'tainghe';
        if (nameLower.includes('ốp') || nameLower.includes('case')) return 'oplung';
        if (nameLower.includes('cường lực') || nameLower.includes('kính cường lực')) return 'cuongluc';
        if (nameLower.includes('giá đỡ') || nameLower.includes('holder')) return 'giado';
        if (nameLower.includes('gậy chụp') || nameLower.includes('gậy tự sướng')) return 'gaychup';
        if (nameLower.includes('cáp') || nameLower.includes('dây sạc') || nameLower.includes('cable')) return 'cap';
        if (nameLower.includes('sạc dự phòng') || nameLower.includes('pin dự phòng')) return 'sac';
        if (nameLower.includes('sạc') || nameLower.includes('củ sạc') || nameLower.includes('cốc sạc') || nameLower.includes('charger')) return 'sac';
        return null;
    })();

    return {
        id: row.ma_sp || row.id,
        name: productName,
        brand: brandLower,
        category: isAccessory ? 'phukien' : (row.category || 'dienthoai'),
        type: accessoryType,
        price: price,
        oldPrice: oldPrice,
        discount: oldPrice ? Math.round((1 - price / oldPrice) * 100) : 0,
        ram: isAccessory ? null : (realSpecs?.ram || row.ram || '8GB'),
        storage: isAccessory ? null : (realSpecs?.storage || parseInt(row.bo_nho) || row.storage || 128),
        screen: isAccessory ? null : (realSpecs?.screen || row.screen || '6.5" AMOLED'),
        chip: isAccessory ? null : (realSpecs?.chip || row.chip || (brandLower === 'apple' ? 'Apple A17 Pro' : 'Snapdragon 8 Gen 2')),
        camera: isAccessory ? null : (realSpecs?.camera || row.camera || '50MP'),
        frontCamera: isAccessory ? null : (realSpecs?.frontCamera || '12MP'),
        battery: isAccessory ? null : (realSpecs?.battery || row.battery || '5000 mAh'),
        os: isAccessory ? null : (realSpecs?.os || defaultOS),
        sim: isAccessory ? null : (realSpecs?.sim || defaultSim),
        weight: realSpecs?.weight || '200g',
        features: row.features ? (typeof row.features === 'string' ? JSON.parse(row.features) : row.features) : ['tragop'],
        colors: dbColors || realSpecs?.colors || defaultColors,
        colorNames: dbColorNames || realSpecs?.colorNames || defaultColorNames,
        image: mainImage,
        images: getProductImages(row),
        sku: row.sku || `SKU-${row.ma_sp || row.id}`,
        rating: row.rating || 4.5,
        reviews: row.reviews || Math.floor(Math.random() * 200) + 50,
        stock: row.so_luong_ton !== undefined && row.so_luong_ton !== null ? row.so_luong_ton : (row.stock !== undefined && row.stock !== null ? row.stock : 10),
        shortDescription: row.mo_ta_ngan || row.shortDescription || '',
        description: row.mo_ta || row.description || '',
        thoi_gian_bh: row.thoi_gian_bh !== undefined ? row.thoi_gian_bh : 12,
        dieu_kien_bh: row.dieu_kien_bh || row.dieu_kien || ''
    };
}

// GET /api/products/brands - Lấy danh sách hãng sản xuất (public API)
router.get('/brands', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT h.ma_hang, h.ten_hang, qg.ten_quoc_gia,
                   (SELECT COUNT(*) FROM san_pham WHERE ma_hang = h.ma_hang) as so_san_pham
            FROM hang_san_xuat h
            LEFT JOIN quoc_gia qg ON h.ma_quoc_gia = qg.ma_quoc_gia
            ORDER BY so_san_pham DESC, h.ten_hang ASC
        `);
        res.json(rows);
    } catch (error) {
        console.error('Error getting brands:', error);
        res.status(500).json({ error: 'Lỗi lấy danh sách hãng' });
    }
});

// GET /api/products - Lấy tất cả sản phẩm
router.get('/', async (req, res) => {
    try {
        // Join với bảng hang_san_xuat và cau_hinh để lấy đầy đủ thông tin
        // Lọc bỏ sản phẩm ngừng kinh doanh — sản phẩm cũ không có cột trang_thai vẫn lọt qua (NULL coi như active)
        const [rows] = await pool.query(`
            SELECT sp.*, hsx.ten_hang,
                   ch.ram as db_ram, ch.chip as db_chip, ch.pin as db_pin,
                   ch.man_hinh as db_screen, ch.camera as db_camera, ch.he_dieu_hanh as db_os,
                   bh.thoi_gian_bh, bh.dieu_kien as dieu_kien_bh
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
            LEFT JOIN bao_hanh_san_pham bh ON sp.ma_sp = bh.ma_sp
            WHERE COALESCE(sp.trang_thai, 'active') <> 'discontinued'
        `);
        
        // Map dữ liệu sang format frontend
        const products = rows.map(row => mapProductToFrontendWithDB(row));
        res.json(products);
    } catch (error) {
        console.error('Lỗi lấy sản phẩm:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function map sản phẩm với ưu tiên dữ liệu từ DB (admin nhập)
function mapProductToFrontendWithDB(row) {
    // Lấy base mapping trước
    const baseProduct = mapProductToFrontend(row);
    
    // ƯU TIÊN dữ liệu từ bảng cau_hinh (admin nhập vào)
    // Chỉ dùng fallback nếu DB trống
    if (baseProduct.category !== 'phukien') {
        if (row.db_ram) baseProduct.ram = row.db_ram;
        if (row.db_chip) baseProduct.chip = row.db_chip;
        if (row.db_screen) baseProduct.screen = row.db_screen;
        if (row.db_camera) baseProduct.camera = row.db_camera;
        if (row.db_pin) baseProduct.battery = row.db_pin;
        if (row.db_os) baseProduct.os = row.db_os;
    }
    
    // Thêm ảnh gallery từ bảng anh_san_pham nếu có
    if (row.images && row.images.length > 0) {
        baseProduct.images = row.images;
    }
    
    // Bảo hành
    if (row.thoi_gian_bh !== undefined) baseProduct.thoi_gian_bh = row.thoi_gian_bh;
    if (row.dieu_kien_bh !== undefined) baseProduct.dieu_kien_bh = row.dieu_kien_bh;
    
    return baseProduct;
}

// ==================== ROUTES CHO TRANG INDEX (ĐẶT TRƯỚC /:id) ====================

// GET /api/products/best-sellers - Lấy top 5 sản phẩm bán chạy nhất (cho trang index)
router.get('/best-sellers', cacheMiddleware(5), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        const [products] = await pool.query(`
            SELECT sp.*, hsx.ten_hang, COALESCE(SUM(ct.so_luong), 0) as total_sold,
                   COALESCE((SELECT AVG(so_sao) FROM danh_gia WHERE ma_sp = sp.ma_sp), 0) as avg_rating,
                   COALESCE((SELECT COUNT(*) FROM danh_gia WHERE ma_sp = sp.ma_sp), 0) as review_count
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            LEFT JOIN chi_tiet_don_hang ct ON sp.ma_sp = ct.ma_sp
            LEFT JOIN don_hang dh ON ct.ma_don = dh.ma_don AND dh.trang_thai != 'cancelled'
            GROUP BY sp.ma_sp
            ORDER BY total_sold DESC, sp.ma_sp DESC
            LIMIT ?
        `, [limit]);
        
        // Format dữ liệu cho frontend
        const formattedProducts = products.map(p => ({
            id: p.ma_sp,
            name: p.ten_sp,
            price: p.gia,
            oldPrice: Math.round(p.gia * 1.15),
            image: p.anh_dai_dien || getProductImage(p),
            brand: p.ten_hang,
            storage: p.bo_nho,
            totalSold: p.total_sold || 0,
            rating: parseFloat(p.avg_rating) || 0,
            reviewCount: p.review_count || 0,
            discount: 15,
            shortDescription: p.mo_ta_ngan || ''
        }));
        
        res.json({ success: true, data: formattedProducts });
    } catch (error) {
        console.error('Error getting best sellers:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/products/featured - Lấy sản phẩm nổi bật (có bán chạy hoặc mới nhất)
router.get('/featured', cacheMiddleware(5), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        // Lấy sản phẩm: ưu tiên có bán, sau đó là mới nhất
        const [products] = await pool.query(`
            SELECT sp.*, hsx.ten_hang, 
                   COALESCE(SUM(ct.so_luong), 0) as total_sold,
                   COALESCE((SELECT AVG(so_sao) FROM danh_gia WHERE ma_sp = sp.ma_sp), 0) as avg_rating,
                   COALESCE((SELECT COUNT(*) FROM danh_gia WHERE ma_sp = sp.ma_sp), 0) as review_count
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            LEFT JOIN chi_tiet_don_hang ct ON sp.ma_sp = ct.ma_sp
            LEFT JOIN don_hang dh ON ct.ma_don = dh.ma_don AND dh.trang_thai != 'cancelled'
            WHERE sp.so_luong_ton > 0
            GROUP BY sp.ma_sp
            ORDER BY total_sold DESC, sp.ma_sp DESC
            LIMIT ?
        `, [limit]);
        
        // Format dữ liệu cho frontend
        const formattedProducts = products.map((p, idx) => {
            const badges = ['APPLE VN/A', 'GIẢM 15%', 'ĐỘC QUYỀN', 'SALE SỐC', 'MỚI VỀ'];
            const badgeColors = [
                'from-blue-600 to-cyan-500',
                'from-red-600 to-orange-500', 
                'from-gray-800 to-black',
                'from-purple-600 to-pink-500',
                'from-green-600 to-teal-500'
            ];
            
            const hasDiscount = p.gia_giam && parseFloat(p.gia_giam) > 0;
            const price = hasDiscount ? parseFloat(p.gia_giam) : parseFloat(p.gia);
            const oldPrice = hasDiscount ? parseFloat(p.gia) : null;
            const discountPercent = hasDiscount ? Math.round((1 - price / oldPrice) * 100) : 0;
            
            return {
                id: p.ma_sp,
                name: p.ten_sp,
                price: price,
                oldPrice: oldPrice,
                image: p.anh_dai_dien || getProductImage(p),
                brand: p.ten_hang,
                storage: p.bo_nho,
                totalSold: p.total_sold || 0,
                rating: parseFloat(p.avg_rating) || 0,
                reviewCount: p.review_count || 0,
                discount: discountPercent,
                badge: badges[idx % badges.length],
                badgeColor: badgeColors[idx % badgeColors.length],
                shortDescription: p.mo_ta_ngan || ''
            };
        });
        
        res.json({ success: true, data: formattedProducts });
    } catch (error) {
        console.error('Error getting featured products:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/products/daily-deals - Lấy 5 sản phẩm bán chậm nhất (GIÁ SỐC MỖI NGÀY)
// Sản phẩm thay đổi theo ngày dựa trên seed từ ngày hiện tại
router.get('/daily-deals', cacheMiddleware(5), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        // Tạo seed từ ngày hiện tại để sản phẩm thay đổi mỗi ngày
        const today = new Date();
        const daySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
        
        // Lấy sản phẩm bán chậm nhất - đơn giản hóa query
        const [products] = await pool.query(`
            SELECT sp.*, hsx.ten_hang,
                   COALESCE((SELECT AVG(so_sao) FROM danh_gia WHERE ma_sp = sp.ma_sp), 0) as avg_rating,
                   COALESCE((SELECT COUNT(*) FROM danh_gia WHERE ma_sp = sp.ma_sp), 0) as review_count,
                   COALESCE((SELECT SUM(so_luong) FROM chi_tiet_don_hang WHERE ma_sp = sp.ma_sp), 0) as total_sold
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            WHERE sp.so_luong_ton > 0
            ORDER BY total_sold ASC, MOD(sp.ma_sp * ?, 1000) ASC
            LIMIT ?
        `, [daySeed, limit]);
        
        // Format dữ liệu cho frontend với giảm giá hấp dẫn
        const discountLabels = ['Giảm sốc', 'Flash Sale', 'Siêu giảm giá', 'HOT SALE', 'Deal hot'];
        
        const formattedProducts = products.map((p, idx) => {
            const rating = parseFloat(p.avg_rating) || 4;
            const hasDiscount = p.gia_giam && parseFloat(p.gia_giam) > 0;
            const price = hasDiscount ? parseFloat(p.gia_giam) : parseFloat(p.gia);
            const oldPrice = hasDiscount ? parseFloat(p.gia) : null;
            const discountPercent = hasDiscount ? Math.round((1 - price / oldPrice) * 100) : 0;
            
            return {
                id: p.ma_sp,
                name: p.ten_sp,
                price: price,
                oldPrice: oldPrice,
                discountPercent: discountPercent,
                discountLabel: discountLabels[idx % discountLabels.length],
                image: p.anh_dai_dien || getProductImage(p),
                brand: p.ten_hang,
                storage: p.bo_nho,
                rating: rating,
                reviewCount: p.review_count || Math.floor(Math.random() * 50) + 10,
                totalSold: p.total_sold,
                shortDescription: p.mo_ta_ngan || ''
            };
        });
        
        res.json({ success: true, data: formattedProducts });
    } catch (error) {
        console.error('Error getting daily deals:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/products/newest - Lấy sản phẩm mới về (theo ngày cập nhật mới nhất)
// QUAN TRỌNG: Route này phải đặt TRƯỚC route /:id để không bị match nhầm
router.get('/newest', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        // Lấy sản phẩm mới nhất theo ngay_cap_nhat (ngày cập nhật)
        const [products] = await pool.query(`
            SELECT sp.*, hsx.ten_hang,
                   COALESCE((SELECT AVG(so_sao) FROM danh_gia WHERE ma_sp = sp.ma_sp), 0) as avg_rating,
                   COALESCE((SELECT COUNT(*) FROM danh_gia WHERE ma_sp = sp.ma_sp), 0) as review_count
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            WHERE sp.so_luong_ton > 0
            ORDER BY sp.ngay_cap_nhat DESC, sp.ma_sp DESC
            LIMIT ?
        `, [limit]);
        
        // Format dữ liệu cho frontend
        const formattedProducts = products.map((p, idx) => {
            const rating = parseFloat(p.avg_rating) || 0;
            const hasDiscount = p.gia_giam && parseFloat(p.gia_giam) > 0;
            const price = hasDiscount ? parseFloat(p.gia_giam) : parseFloat(p.gia);
            const oldPrice = hasDiscount ? parseFloat(p.gia) : null;
            
            return {
                id: p.ma_sp,
                name: p.ten_sp,
                price: price,
                oldPrice: oldPrice,
                image: p.anh_dai_dien || getProductImage(p),
                brand: p.ten_hang,
                storage: p.bo_nho,
                rating: rating,
                reviewCount: p.review_count || 0,
                isNew: true,
                shortDescription: p.mo_ta_ngan || ''
            };
        });
        
        res.json({ success: true, data: formattedProducts });
    } catch (error) {
        console.error('Error getting newest products:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/products/:id - Lấy chi tiết sản phẩm
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Lấy thông tin sản phẩm + cấu hình + hãng
        const [rows] = await pool.query(`
            SELECT sp.*, hsx.ten_hang, 
                   ch.ram as db_ram, ch.chip as db_chip, ch.pin as db_pin, 
                   ch.man_hinh as db_screen, ch.camera as db_camera, ch.he_dieu_hanh as db_os,
                   bh.thoi_gian_bh, bh.dieu_kien as dieu_kien_bh
            FROM san_pham sp 
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
            LEFT JOIN cau_hinh ch ON sp.ma_sp = ch.ma_sp
            LEFT JOIN bao_hanh_san_pham bh ON sp.ma_sp = bh.ma_sp
            WHERE sp.ma_sp = ?
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }
        
        // Lấy danh sách ảnh từ bảng anh_san_pham
        const [imageRows] = await pool.query(`
            SELECT duong_dan FROM anh_san_pham WHERE ma_sp = ?
        `, [id]);
        
        const product = rows[0];
        
        // Xử lý ảnh: ảnh đại diện + ảnh mô tả từ DB
        let allImages = [];
        
        // Thêm ảnh đại diện vào đầu tiên (nếu có)
        if (product.anh_dai_dien) {
            const mainImg = product.anh_dai_dien.startsWith('images/') ? product.anh_dai_dien : `images/${product.anh_dai_dien}`;
            allImages.push(mainImg);
        }
        
        // Thêm ảnh từ bảng anh_san_pham
        if (imageRows.length > 0) {
            let galleryImages = imageRows.map(img => img.duong_dan.startsWith('images/') ? img.duong_dan : `images/${img.duong_dan}`);
            // Lọc bỏ ảnh banner và ảnh trùng với ảnh đại diện
            galleryImages = galleryImages.filter(img => {
                if (!img) return false;
                // Loại bỏ ảnh trùng với ảnh đại diện
                if (allImages.includes(img)) return false;
                
                const imgLower = img.toLowerCase();
                if (imgLower.includes('h1_1440x242')) return false;
                if (imgLower.includes('banner')) return false;
                if (imgLower.includes('1440x242')) return false;
                if (imgLower.includes('promo')) return false;
                if (imgLower.includes('khuyen-mai')) return false;
                if (imgLower.includes('khuyenmai')) return false;
                if (imgLower.includes('sale')) return false;
                if (imgLower.includes('_ad')) return false;
                if (/\d{3,4}x\d{2,3}/.test(imgLower)) return false;
                return true;
            });
            allImages = [...allImages, ...galleryImages];
        }
        
        // Gán mảng ảnh vào product
        if (allImages.length > 0) {
            product.images = allImages;
        }
        
        // Map dữ liệu sang format frontend
        const mappedProduct = mapProductToFrontendWithDB(product);
        
        res.json(mappedProduct);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/products/:id/variants - Public endpoint cho frontend
// Trả về biến thể active + tồn kho hiển thị cho khách hàng
router.get('/:id/variants', async (req, res) => {
    try {
        const idNum = parseInt(req.params.id);
        if (!idNum) return res.status(400).json({ success: false, message: 'id không hợp lệ' });

        const [variants] = await pool.query(
            `SELECT ma_bt AS id, mau_sac AS color, mau_hex AS colorHex, dung_luong AS storage,
                    so_luong AS stock, gia_chenh AS priceDiff
             FROM bien_the_san_pham
             WHERE ma_sp = ? AND trang_thai = 'active'
             ORDER BY mau_sac ASC, dung_luong ASC`,
            [idNum]
        );

        // Trả structure dễ dùng cho UI: list màu unique + list dung lượng unique + matrix
        const colors = [];
        const storages = [];
        const seenColors = new Set();
        const seenStorages = new Set();
        for (const v of variants) {
            if (!seenColors.has(v.color)) {
                seenColors.add(v.color);
                colors.push({ name: v.color, hex: v.colorHex });
            }
            if (!seenStorages.has(v.storage)) {
                seenStorages.add(v.storage);
                storages.push(v.storage);
            }
        }

        res.json({
            success: true,
            data: {
                hasVariants: variants.length > 0,
                variants,
                colors,
                storages
            }
        });
    } catch (error) {
        console.error('Error fetching variants:', error && error.message);
        res.status(500).json({ success: false, message: 'Lỗi tải biến thể' });
    }
});

// GET /api/products/:id/color-images?color=Titan%20Đen - Public: ảnh theo màu cho khách hàng
router.get('/:id/color-images', async (req, res) => {
    try {
        const idNum = parseInt(req.params.id);
        if (!idNum) return res.status(400).json({ success: false, message: 'id không hợp lệ' });
        const color = req.query.color;
        let rows;
        if (color) {
            [rows] = await pool.query(
                'SELECT duong_dan, thu_tu FROM hinh_anh_bien_the WHERE ma_sp = ? AND mau_sac = ? ORDER BY thu_tu ASC, ma_anh ASC',
                [idNum, color]
            );
        } else {
            [rows] = await pool.query(
                'SELECT mau_sac, duong_dan, thu_tu FROM hinh_anh_bien_the WHERE ma_sp = ? ORDER BY mau_sac, thu_tu ASC, ma_anh ASC',
                [idNum]
            );
        }
        // Đảm bảo đường dẫn tương đối thống nhất (FE prefix 'images/' nếu cần)
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching color images (public):', error && error.message);
        res.status(500).json({ success: false, message: 'Lỗi tải ảnh theo màu' });
    }
});

module.exports = router;
