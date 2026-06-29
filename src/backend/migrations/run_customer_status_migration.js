// Migration script to add status column to khach_hang table
const { pool } = require('../config/database');

async function addCustomerStatus() {
    try {
        // Check if column exists
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'khach_hang' 
            AND COLUMN_NAME = 'trang_thai'
        `);
        
        if (columns.length > 0) {
            console.log('Column trang_thai already exists in khach_hang table');
        } else {
            // Add column
            await pool.query(`
                ALTER TABLE khach_hang 
                ADD COLUMN trang_thai ENUM('active', 'locked') DEFAULT 'active' AFTER ngay_tao
            `);
            console.log('✅ Column trang_thai added successfully');
        }
        
        // Update existing customers to have 'active' status
        await pool.query(`UPDATE khach_hang SET trang_thai = 'active' WHERE trang_thai IS NULL`);
        console.log('✅ Updated existing customers to active status');
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

addCustomerStatus();
