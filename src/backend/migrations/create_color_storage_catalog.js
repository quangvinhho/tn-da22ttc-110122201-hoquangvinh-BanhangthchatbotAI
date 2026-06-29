/**
 * Migration: catalog Màu sắc + Dung lượng (chuẩn TGDD/FPT/CellphoneS)
 *
 * - mau_sac (catalog) : kho màu dùng chung cho mọi SP, có mã hex chuẩn
 * - dung_luong (catalog): kho dung lượng dùng chung, sort theo dung lượng
 * - ALTER bien_the_san_pham:
 *     + thêm ma_mau (FK → mau_sac.ma_mau)
 *     + thêm ma_dung_luong (FK → dung_luong.ma_dung_luong)
 *     + thêm gia_ban (giá tuyệt đối của biến thể; nếu null thì fallback gia_chenh cũ)
 *   → vẫn giữ cột text mau_sac/dung_luong cũ để backward-compat.
 * - ALTER hinh_anh_bien_the:
 *     + thêm ma_mau (FK)
 *     + thêm la_anh_chinh (TINYINT: 1 = ảnh chính của màu)
 *
 * Idempotent: kiểm tra cột/khoá trước khi ALTER. Không phá dữ liệu cũ.
 */
const { pool } = require('../config/database');

async function columnExists(table, column) {
    const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    return rows[0].cnt > 0;
}

async function ensureCatalogTables() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS mau_sac (
            ma_mau INT NOT NULL AUTO_INCREMENT,
            ten_mau VARCHAR(80) NOT NULL,
            ma_hex VARCHAR(20) DEFAULT NULL,
            mo_ta VARCHAR(255) DEFAULT NULL,
            trang_thai VARCHAR(20) DEFAULT 'active',
            ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (ma_mau),
            UNIQUE KEY uniq_ten_mau (ten_mau)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS dung_luong (
            ma_dung_luong INT NOT NULL AUTO_INCREMENT,
            ten_dung_luong VARCHAR(40) NOT NULL,
            kich_thuoc_gb INT DEFAULT NULL,
            trang_thai VARCHAR(20) DEFAULT 'active',
            ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (ma_dung_luong),
            UNIQUE KEY uniq_ten_dung_luong (ten_dung_luong)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

async function ensureVariantColumns() {
    if (!await columnExists('bien_the_san_pham', 'ma_mau')) {
        await pool.query(`ALTER TABLE bien_the_san_pham ADD COLUMN ma_mau INT NULL AFTER mau_hex`);
        await pool.query(`ALTER TABLE bien_the_san_pham ADD INDEX idx_bt_mau (ma_mau)`);
    }
    if (!await columnExists('bien_the_san_pham', 'ma_dung_luong')) {
        await pool.query(`ALTER TABLE bien_the_san_pham ADD COLUMN ma_dung_luong INT NULL AFTER ma_mau`);
        await pool.query(`ALTER TABLE bien_the_san_pham ADD INDEX idx_bt_dl (ma_dung_luong)`);
    }
    if (!await columnExists('bien_the_san_pham', 'gia_ban')) {
        await pool.query(`ALTER TABLE bien_the_san_pham ADD COLUMN gia_ban DECIMAL(12,2) DEFAULT NULL AFTER gia_chenh`);
    }
    if (!await columnExists('bien_the_san_pham', 'gia_khuyen_mai')) {
        await pool.query(`ALTER TABLE bien_the_san_pham ADD COLUMN gia_khuyen_mai DECIMAL(12,2) DEFAULT NULL AFTER gia_ban`);
    }
}

async function ensureImageColumns() {
    if (!await columnExists('hinh_anh_bien_the', 'ma_mau')) {
        await pool.query(`ALTER TABLE hinh_anh_bien_the ADD COLUMN ma_mau INT NULL AFTER ma_sp`);
        await pool.query(`ALTER TABLE hinh_anh_bien_the ADD INDEX idx_habt_mau (ma_mau)`);
    }
    if (!await columnExists('hinh_anh_bien_the', 'la_anh_chinh')) {
        await pool.query(`ALTER TABLE hinh_anh_bien_the ADD COLUMN la_anh_chinh TINYINT(1) DEFAULT 0 AFTER thu_tu`);
    }
}

async function seedDefaults() {
    const [[{ cnt: colorCnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM mau_sac');
    if (colorCnt === 0) {
        const colors = [
            ['Đen', '#1C1C1C'], ['Trắng', '#F5F5F5'], ['Xanh', '#3B82F6'],
            ['Đỏ', '#EF4444'], ['Vàng', '#FBBF24'], ['Hồng', '#EC4899'],
            ['Tím', '#A855F7'], ['Xám', '#6B7280'], ['Bạc', '#D1D5DB'],
            ['Vàng đồng', '#D4AF37'], ['Titan Đen', '#3F3F46'], ['Titan Trắng', '#E5E7EB'],
            ['Titan Xanh', '#1E3A8A'], ['Titan Sa Mạc', '#C2A07A']
        ];
        await pool.query(
            'INSERT INTO mau_sac (ten_mau, ma_hex) VALUES ?',
            [colors]
        );
    }

    const [[{ cnt: storageCnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM dung_luong');
    if (storageCnt === 0) {
        const storages = [
            ['64GB', 64], ['128GB', 128], ['256GB', 256],
            ['512GB', 512], ['1TB', 1024], ['2TB', 2048]
        ];
        await pool.query(
            'INSERT INTO dung_luong (ten_dung_luong, kich_thuoc_gb) VALUES ?',
            [storages]
        );
    }
}

async function backfillVariantRefs() {
    // Sync ma_mau/ma_dung_luong cho các variant cũ dựa vào text mau_sac/dung_luong
    await pool.query(`
        UPDATE bien_the_san_pham bt
        JOIN mau_sac m ON LOWER(m.ten_mau) = LOWER(bt.mau_sac)
        SET bt.ma_mau = m.ma_mau
        WHERE bt.ma_mau IS NULL
    `);
    await pool.query(`
        UPDATE bien_the_san_pham bt
        JOIN dung_luong d ON LOWER(d.ten_dung_luong) = LOWER(bt.dung_luong)
        SET bt.ma_dung_luong = d.ma_dung_luong
        WHERE bt.ma_dung_luong IS NULL
    `);
    // Sync ma_mau cho ảnh cũ
    await pool.query(`
        UPDATE hinh_anh_bien_the h
        JOIN mau_sac m ON LOWER(m.ten_mau) = LOWER(h.mau_sac)
        SET h.ma_mau = m.ma_mau
        WHERE h.ma_mau IS NULL
    `);
}

async function run() {
    try {
        await ensureCatalogTables();
        await ensureVariantColumns();
        await ensureImageColumns();
        await seedDefaults();
        await backfillVariantRefs();
        if (process.env.NODE_ENV !== 'production') {
            console.log('✅ catalog mau_sac/dung_luong + alter variant/image: ready');
        }
        return true;
    } catch (e) {
        console.error('❌ Migration create_color_storage_catalog failed:', e && e.message);
        return false;
    }
}

module.exports = { run };

if (require.main === module) {
    run().then(ok => process.exit(ok ? 0 : 1));
}
