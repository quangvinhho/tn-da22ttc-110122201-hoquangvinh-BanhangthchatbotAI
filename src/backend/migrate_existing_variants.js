const { pool } = require('./config/database.js');

async function main() {
    try {
        console.log('🔄 Migrating existing variants to populate gia_nhap from their parent products...');
        
        // Execute the migration query
        const [result] = await pool.query(`
            UPDATE bien_the_san_pham bt
            JOIN san_pham sp ON bt.ma_sp = sp.ma_sp
            SET bt.gia_nhap = sp.gia_nhap
            WHERE bt.gia_nhap IS NULL OR bt.gia_nhap = 0
        `);
        
        console.log(`✅ Migration complete! Affected rows: ${result.affectedRows}`);
    } catch (error) {
        console.error('❌ Error during migration:', error);
    } finally {
        process.exit(0);
    }
}

main();
