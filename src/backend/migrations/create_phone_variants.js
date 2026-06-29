const { pool } = require('../config/database');

// Helper function to normalize string to ASCII for SKU generation
function toAscii(str) {
    if (!str) return '';
    return str.normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[đĐ]/g, 'd')
              .replace(/[^a-zA-Z0-9]/g, '')
              .toUpperCase();
}

// Function to parse storage capacity from text (e.g. "128", "256GB", "1TB")
function parseCapacity(text) {
    if (!text) return null;
    const match = text.match(/(\d+)\s*(GB|TB|G)/i);
    if (match) {
        const size = parseInt(match[1]);
        const unit = (match[2] || 'GB').toUpperCase();
        return { size, unit: unit === 'G' ? 'GB' : unit };
    }
    const numMatch = text.match(/\b(\d+)\b/);
    if (numMatch) {
        const size = parseInt(numMatch[1]);
        if ([16, 32, 64, 128, 256, 512, 1024].includes(size) || size === 1 || size === 2) {
            return { size, unit: (size === 1 || size === 2) ? 'TB' : 'GB' };
        }
    }
    return null;
}

async function run() {
    try {
        console.log('🔄 Bắt đầu chạy tạo biến thể màu sắc và dung lượng cho điện thoại...');

        // 1. Lấy danh sách sản phẩm đã có biến thể
        const [existingVariantRows] = await pool.query('SELECT DISTINCT ma_sp FROM bien_the_san_pham');
        const existingVariantSpIds = new Set(existingVariantRows.map(r => r.ma_sp));
        console.log(`ℹ️ Đã có ${existingVariantSpIds.size} sản phẩm đã thiết lập biến thể.`);

        // 2. Lấy danh sách màu sắc và dung lượng từ catalog để map
        const [colorRows] = await pool.query('SELECT ma_mau, ten_mau, ma_hex FROM mau_sac');
        const colorCatalogMap = new Map();
        for (const c of colorRows) {
            colorCatalogMap.set(c.ten_mau.toLowerCase().trim(), c);
        }

        const [storageRows] = await pool.query('SELECT ma_dung_luong, ten_dung_luong FROM dung_luong');
        const storageCatalogMap = new Map();
        for (const s of storageRows) {
            storageCatalogMap.set(s.ten_dung_luong.toLowerCase().trim(), s.ma_dung_luong);
        }

        // 3. Lấy toàn bộ sản phẩm trong DB
        const [products] = await pool.query(`
            SELECT sp.ma_sp, sp.ten_sp, hsx.ten_hang, sp.bo_nho, sp.mau_sac, sp.so_luong_ton, sp.gia
            FROM san_pham sp
            LEFT JOIN hang_san_xuat hsx ON sp.ma_hang = hsx.ma_hang
        `);

        let updatedCount = 0;

        for (const sp of products) {
            // Chỉ xử lý nếu chưa có biến thể nào
            if (existingVariantSpIds.has(sp.ma_sp)) {
                continue;
            }

            // Phân biệt điện thoại và phụ kiện qua tên
            const nameLower = sp.ten_sp.toLowerCase();
            const isAccessory = nameLower.includes('ốp') || 
                                nameLower.includes('case') || 
                                nameLower.includes('cường lực') || 
                                nameLower.includes('cáp') || 
                                nameLower.includes('sạc') || 
                                nameLower.includes('dây') || 
                                nameLower.includes('sac') || 
                                nameLower.includes('cap') || 
                                nameLower.includes('op') ||
                                nameLower.includes('tai nghe') || 
                                nameLower.includes('chuột') || 
                                nameLower.includes('bàn phím') ||
                                nameLower.includes('hub') ||
                                nameLower.includes('đế') ||
                                nameLower.includes('giá đỡ') ||
                                nameLower.includes('pin dự phòng') ||
                                nameLower.includes('adapter') ||
                                nameLower.includes('loa');

            if (isAccessory) {
                continue; // Bỏ qua phụ kiện
            }

            console.log(`📱 Xử lý điện thoại: #${sp.ma_sp} "${sp.ten_sp}" (Giá gốc: ${parseFloat(sp.gia).toLocaleString('vi-VN')}đ)`);

            // A. Phân tích màu sắc của sản phẩm
            let colorNames = [];
            let colorHexes = [];
            if (sp.mau_sac) {
                try {
                    const parsed = JSON.parse(sp.mau_sac);
                    if (parsed && Array.isArray(parsed.colorNames)) {
                        colorNames = parsed.colorNames;
                        colorHexes = parsed.colors || [];
                    }
                } catch (e) {}
            }
            if (colorNames.length === 0) {
                colorNames = ['Đen', 'Trắng'];
                colorHexes = ['#1C1C1C', '#F5F5F5'];
            }

            // Đồng bộ màu sắc vào catalog mau_sac
            const productColorsMapped = [];
            for (let i = 0; i < colorNames.length; i++) {
                const cName = colorNames[i].trim();
                const key = cName.toLowerCase();
                let ma_hex = colorHexes[i] || '#1C1C1C';
                let ma_mau;

                if (colorCatalogMap.has(key)) {
                    const found = colorCatalogMap.get(key);
                    ma_mau = found.ma_mau;
                    ma_hex = found.ma_hex || ma_hex;
                } else {
                    const [res] = await pool.query(
                        'INSERT INTO mau_sac (ten_mau, ma_hex) VALUES (?, ?)',
                        [cName, ma_hex]
                    );
                    ma_mau = res.insertId;
                    const newColorObj = { ma_mau, ten_mau: cName, ma_hex };
                    colorCatalogMap.set(key, newColorObj);
                    console.log(`   🎨 Đã thêm màu mới vào catalog: "${cName}" (${ma_hex})`);
                }
                productColorsMapped.push({ ma_mau, ten_mau: cName, ma_hex });
            }

            // B. Phân tích và sinh danh sách dung lượng (dung_luong)
            let primaryCap = parseCapacity(sp.bo_nho) || parseCapacity(sp.ten_sp);
            let targetCapacities = [];
            if (primaryCap) {
                const capStr = `${primaryCap.size}${primaryCap.unit}`;
                targetCapacities.push(capStr);
                // Thêm dung lượng lớn hơn để đa dạng
                if (primaryCap.unit === 'GB') {
                    if (primaryCap.size === 64) targetCapacities.push('128GB');
                    else if (primaryCap.size === 128) targetCapacities.push('256GB');
                    else if (primaryCap.size === 256) targetCapacities.push('512GB');
                    else if (primaryCap.size === 512) targetCapacities.push('1TB');
                }
            } else {
                // Mặc định dựa trên giá tiền
                const price = parseFloat(sp.gia) || 0;
                if (price >= 15000000) {
                    targetCapacities = ['256GB', '512GB'];
                } else {
                    targetCapacities = ['128GB', '256GB'];
                }
            }

            // Đồng bộ dung lượng vào catalog dung_luong
            const productStoragesMapped = [];
            for (const capName of targetCapacities) {
                const key = capName.toLowerCase().trim();
                let ma_dung_luong;

                if (storageCatalogMap.has(key)) {
                    ma_dung_luong = storageCatalogMap.get(key);
                } else {
                    const sizeGb = capName.includes('TB') ? parseInt(capName) * 1024 : parseInt(capName);
                    const [res] = await pool.query(
                        'INSERT INTO dung_luong (ten_dung_luong, kich_thuoc_gb) VALUES (?, ?)',
                        [capName, sizeGb]
                    );
                    ma_dung_luong = res.insertId;
                    storageCatalogMap.set(key, ma_dung_luong);
                    console.log(`   💾 Đã thêm dung lượng mới vào catalog: "${capName}"`);
                }
                productStoragesMapped.push({ ma_dung_luong, ten_dung_luong: capName });
            }

            // C. Sinh tổ hợp các biến thể (Màu × Dung lượng)
            const combos = [];
            for (const color of productColorsMapped) {
                for (let j = 0; j < productStoragesMapped.length; j++) {
                    const storage = productStoragesMapped[j];
                    combos.push({
                        colorName: color.ten_mau,
                        colorHex: color.ma_hex,
                        ma_mau: color.ma_mau,
                        ma_dung_luong: storage.ma_dung_luong,
                        storageName: storage.ten_dung_luong,
                        storageIndex: j
                    });
                }
            }

            // D. Phân bổ tồn kho
            const totalStock = parseInt(sp.so_luong_ton) || 0;
            const numCombos = combos.length;
            const baseStockPerCombo = Math.floor(totalStock / numCombos);
            let remainderStock = totalStock % numCombos;

            const insertValues = [];
            for (let idx = 0; idx < combos.length; idx++) {
                const combo = combos[idx];
                const stock = baseStockPerCombo + (remainderStock > 0 ? 1 : 0);
                remainderStock--;

                // Tính toán chênh lệch giá (gia_chenh) theo dung lượng
                let priceDiff = 0;
                if (combo.storageIndex > 0) {
                    const prevCap = productStoragesMapped[combo.storageIndex - 1].ten_dung_luong;
                    const curCap = combo.storageName;

                    if (prevCap === '64GB' && curCap === '128GB') priceDiff = 1000000;
                    else if (prevCap === '128GB' && curCap === '256GB') priceDiff = 1500000;
                    else if (prevCap === '256GB' && curCap === '512GB') priceDiff = 3000000;
                    else if (prevCap === '512GB' && curCap === '1TB') priceDiff = 6000000;
                    else priceDiff = combo.storageIndex * 1500000;
                }

                const sku = `SP_${sp.ma_sp}_${toAscii(combo.colorName)}_${toAscii(combo.storageName)}`;

                insertValues.push([
                    sp.ma_sp,
                    combo.colorName,
                    combo.colorHex,
                    combo.ma_mau,
                    combo.ma_dung_luong,
                    combo.storageName,
                    stock,
                    priceDiff,
                    null, // gia_ban
                    null, // gia_khuyen_mai
                    sku,
                    'active'
                ]);
            }

            // E. Thực hiện Insert
            if (insertValues.length > 0) {
                await pool.query(
                    `INSERT INTO bien_the_san_pham 
                     (ma_sp, mau_sac, mau_hex, ma_mau, ma_dung_luong, dung_luong, so_luong, gia_chenh, gia_ban, gia_khuyen_mai, sku, trang_thai)
                     VALUES ?`,
                    [insertValues]
                );
                
                // F. Đồng bộ lại mau_sac trong san_pham để đồng bộ hiển thị
                const uniqueColors = productColorsMapped.map(c => c.ten_mau);
                const uniqueHexes = productColorsMapped.map(c => c.ma_hex);
                const mauSacJson = JSON.stringify({ colorNames: uniqueColors, colors: uniqueHexes });
                await pool.query('UPDATE san_pham SET mau_sac = ? WHERE ma_sp = ?', [mauSacJson, sp.ma_sp]);

                console.log(`   ✅ Đã sinh ${insertValues.length} biến thể cho SP #${sp.ma_sp} "${sp.ten_sp}". (Tồn kho chia đều: ${totalStock} cái)`);
                updatedCount++;
            }
        }

        console.log(`🎉 Thành công! Đã cập nhật biến thể cho ${updatedCount} sản phẩm điện thoại di động.`);
        return true;
    } catch (e) {
        console.error('❌ Lỗi chạy migration create_phone_variants:', e && e.message);
        return false;
    }
}

module.exports = { run };

if (require.main === module) {
    run().then(ok => process.exit(ok ? 0 : 1));
}
