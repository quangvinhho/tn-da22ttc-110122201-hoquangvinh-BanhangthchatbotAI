const { pool } = require('./config/database.js');

async function main() {
    try {
        console.log('🔄 Adjusting variant import prices based on gia_chenh (Price Difference) for realism...');
        
        // Update query: variant_import_price = product_import_price + (gia_chenh * 0.70)
        // This simulates a realistic import cost increase for higher capacity variants.
        const [result] = await pool.query(`
            UPDATE bien_the_san_pham bt
            JOIN san_pham sp ON bt.ma_sp = sp.ma_sp
            SET bt.gia_nhap = sp.gia_nhap + (bt.gia_chenh * 0.70)
            WHERE bt.gia_chenh > 0
        `);
        
        console.log(`✅ Adjustments completed successfully! Updated variants count: ${result.affectedRows}`);
    } catch (error) {
        console.error('❌ Error during pricing adjustment:', error);
    } finally {
        process.exit(0);
    }
}

main();
