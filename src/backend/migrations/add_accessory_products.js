const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Vinh123456789@',
    database: process.env.DB_NAME || 'QHUNG'
};

const accessories = [
    {
        ten_sp: 'Ốp lưng Silicone MagSafe iPhone 16 Pro Max',
        ma_hang: 1, // Apple
        gia: 1290000,
        gia_nhap: 800000,
        gia_giam: null,
        so_luong_ton: 50,
        mo_ta: 'Ốp lưng Silicone chính hãng Apple dành cho iPhone 16 Pro Max tích hợp vòng nam châm MagSafe giúp sạc không dây nhanh chóng và tiện lợi. Thiết kế ôm khít thân máy, mặt trong lót sợi vi sợi mềm mại bảo vệ tối đa điện thoại của bạn.',
        mo_ta_ngan: 'Chất liệu silicone mịn màng | Hỗ trợ sạc không dây MagSafe | Chống trầy xước và va đập',
        mau_sac: '{"colors":["#000000","#0000ff","#ffc0cb"],"colorNames":["Đen","Xanh dương","Hồng"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/op-lung-iphone-16-pro-max-silicone-magsafe.webp'
    },
    {
        ten_sp: 'Ốp lưng Spigen Tough Armor Samsung Galaxy S24 Ultra',
        ma_hang: 2, // Samsung
        gia: 650000,
        gia_nhap: 400000,
        gia_giam: null,
        so_luong_ton: 45,
        mo_ta: 'Ốp lưng chống sốc cao cấp Spigen Tough Armor thiết kế 2 lớp bảo vệ toàn diện cho Galaxy S24 Ultra. Tích hợp chân đế Kickstand gập mở tiện lợi khi xem phim, làm việc.',
        mo_ta_ngan: 'Công nghệ chống sốc đệm khí Air Cushion | Chân đế dựng máy tiện dụng | Nhập khẩu chính hãng',
        mau_sac: '{"colors":["#000000","#808080"],"colorNames":["Đen","Xám"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/op-lung-spigen-tough-armor-s24-ultra.webp'
    },
    {
        ten_sp: 'Tai nghe Bluetooth Apple AirPods 4',
        ma_hang: 1, // Apple
        gia: 3490000,
        gia_nhap: 2500000,
        gia_giam: null,
        so_luong_ton: 35,
        mo_ta: 'Tai nghe Bluetooth không dây thế hệ mới Apple AirPods 4 mang lại trải nghiệm âm thanh đột phá nhờ chip H2. Hộp sạc USB-C nhỏ gọn, thời lượng pin lên đến 30 giờ sử dụng kèm hộp sạc.',
        mo_ta_ngan: 'Chip Apple H2 mạnh mẽ | Âm thanh không gian cá nhân hóa | Kháng nước bụi IP54',
        mau_sac: '{"colors":["#ffffff"],"colorNames":["Trắng"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/tai-nghe-bluetooth-apple-airpods-4.webp'
    },
    {
        ten_sp: 'Tai nghe Bluetooth Samsung Galaxy Buds3',
        ma_hang: 2, // Samsung
        gia: 3990000,
        gia_nhap: 2800000,
        gia_giam: null,
        so_luong_ton: 30,
        mo_ta: 'Galaxy Buds3 sở hữu thiết kế góc cạnh đột phá, tích hợp AI tối ưu hóa chất lượng âm thanh dựa trên hình dạng tai và thói quen đeo của bạn. Khả năng dịch thuật trực tiếp cực kỳ tiện lợi.',
        mo_ta_ngan: 'Chống ồn chủ động ANC thông minh | Thiết kế công thái học mới | Âm thanh Hi-Fi 24bit',
        mau_sac: '{"colors":["#ffffff","#808080"],"colorNames":["Trắng","Xám"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/tai-nghe-bluetooth-samsung-galaxy-buds3.webp'
    },
    {
        ten_sp: 'Tai nghe có dây Apple EarPods USB-C',
        ma_hang: 1, // Apple
        gia: 550000,
        gia_nhap: 350000,
        gia_giam: null,
        so_luong_ton: 100,
        mo_ta: 'Tai nghe có dây chính hãng Apple EarPods thiết kế bo tròn theo cấu trúc tai, kết nối qua cổng USB-C tương thích tốt với các dòng iPhone 15, iPhone 16, iPad và Macbook.',
        mo_ta_ngan: 'Kết nối trực tiếp cổng USB-C | Âm thanh rõ nét chất lượng | Tích hợp micro đàm thoại',
        mau_sac: '{"colors":["#ffffff"],"colorNames":["Trắng"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/tai-nghe-co-day-apple-earpods-usb-c.webp'
    },
    {
        ten_sp: 'Củ sạc nhanh Apple 20W USB-C chính hãng',
        ma_hang: 1, // Apple
        gia: 520000,
        gia_nhap: 350000,
        gia_giam: null,
        so_luong_ton: 90,
        mo_ta: 'Củ sạc nhanh 20W USB-C chính hãng Apple cung cấp khả năng sạc nhanh hiệu quả tại nhà, trong văn phòng hoặc khi đang di chuyển. Khuyến nghị sử dụng cho iPhone 8 trở lên để đạt hiệu suất tối ưu.',
        mo_ta_ngan: 'Công suất sạc nhanh 20W | Thiết kế siêu nhỏ gọn | Tương thích mọi thiết bị cổng Type-C',
        mau_sac: '{"colors":["#ffffff"],"colorNames":["Trắng"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/cu-sac-nhanh-apple-20w-usb-c.webp'
    },
    {
        ten_sp: 'Củ sạc nhanh Anker Nano II 65W',
        ma_hang: 1, // Apple compatible / associated
        gia: 850000,
        gia_nhap: 550000,
        gia_giam: null,
        so_luong_ton: 60,
        mo_ta: 'Củ sạc nhanh Anker Nano II công suất tối đa 65W sử dụng công nghệ vật liệu GaN II giúp sạc nhỏ hơn 58% so với sạc thông thường. Tích hợp 2 cổng USB-C và 1 cổng USB-A sạc đồng thời 3 thiết bị.',
        mo_ta_ngan: 'Công suất 65W mạnh mẽ | Công nghệ GaN II siêu nhỏ gọn | 3 cổng sạc tiện dụng',
        mau_sac: '{"colors":["#000000"],"colorNames":["Đen"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/cu-sac-nhanh-anker-nano-ii-65w.webp'
    },
    {
        ten_sp: 'Cáp sạc Apple USB-C to Lightning 1m',
        ma_hang: 1, // Apple
        gia: 590000,
        gia_nhap: 400000,
        gia_giam: null,
        so_luong_ton: 120,
        mo_ta: 'Cáp chuyển đổi từ cổng USB-C sang Lightning chính hãng Apple dài 1m dùng để sạc và truyền tải dữ liệu giữa iPhone/iPad/iPod với Macbook. Hỗ trợ tính năng sạc nhanh Power Delivery.',
        mo_ta_ngan: 'Kết nối Lightning và USB-C | Hỗ trợ sạc nhanh PD | Chiều dài tiêu chuẩn 1m',
        mau_sac: '{"colors":["#ffffff"],"colorNames":["Trắng"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/cap-sac-apple-usb-c-to-lightning-1m.webp'
    },
    {
        ten_sp: 'Cáp sạc Xiaomi USB-C to USB-C 6A 1m',
        ma_hang: 3, // Xiaomi
        gia: 150000,
        gia_nhap: 80000,
        gia_giam: null,
        so_luong_ton: 150,
        mo_ta: 'Cáp sạc nhanh Xiaomi USB-C to USB-C hỗ trợ dòng điện tối đa lên tới 6A, tương thích hoàn hảo với các củ sạc nhanh của Xiaomi để kích hoạt tính năng sạc Turbo Charge.',
        mo_ta_ngan: 'Hỗ trợ sạc siêu nhanh 6A | Lõi đồng dày bền bỉ | Chiều dài tiêu chuẩn 1m',
        mau_sac: '{"colors":["#ffffff"],"colorNames":["Trắng"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/cap-sac-xiaomi-usb-c-to-usb-c-6a-1m.webp'
    },
    {
        ten_sp: 'Kính cường lực iPhone 16 Pro Max JCPal',
        ma_hang: 1, // Apple
        gia: 390000,
        gia_nhap: 200000,
        gia_giam: null,
        so_luong_ton: 80,
        mo_ta: 'Kính cường lực JCPal cao cấp cho iPhone 16 Pro Max bảo vệ màn hình tối ưu chống nứt vỡ. Tính năng Privacy chống nhìn trộm từ hai bên giúp bảo mật thông tin hiển thị trên màn hình.',
        mo_ta_ngan: 'Độ cứng 9H chống trầy xước | Chống nhìn trộm từ góc 30 độ | Độ trong suốt cao',
        mau_sac: '{"colors":["#000000"],"colorNames":["Đen"]}',
        bo_nho: 'N/A',
        anh_dai_dien: 'images/products/kinh-cuong-luc-iphone-16-pro-max-jcpal.webp'
    }
];

async function run() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Connected to database successfully.');

        for (const item of accessories) {
            // Check if product already exists
            const [existing] = await connection.query('SELECT ma_sp FROM san_pham WHERE ten_sp = ?', [item.ten_sp]);
            if (existing.length > 0) {
                console.log(`⚠️ Product "${item.ten_sp}" already exists, skipping.`);
                continue;
            }

            // Insert product
            const [result] = await connection.query(
                `INSERT INTO san_pham (ten_sp, ma_hang, gia, gia_nhap, gia_giam, so_luong_ton, mo_ta, mo_ta_ngan, mau_sac, bo_nho, anh_dai_dien) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    item.ten_sp,
                    item.ma_hang,
                    item.gia,
                    item.gia_nhap,
                    item.gia_giam,
                    item.so_luong_ton,
                    item.mo_ta,
                    item.mo_ta_ngan,
                    item.mau_sac,
                    item.bo_nho,
                    item.anh_dai_dien
                ]
            );
            console.log(`✅ Inserted product "${item.ten_sp}" with ID ${result.insertId}`);
        }

        console.log('🎉 Migration completed successfully.');
    } catch (error) {
        console.error('❌ Error executing migration:', error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
        process.exit(0);
    }
}

run();
