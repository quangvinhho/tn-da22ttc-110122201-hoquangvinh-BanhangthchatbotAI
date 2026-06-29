const { pool } = require('./config/database');

async function alterTable() {
    try {
        const query = `
            ALTER TABLE nhan_vien 
            MODIFY COLUMN cccd_truoc LONGTEXT,
            MODIFY COLUMN cccd_sau LONGTEXT;
        `;
        await pool.query(query);
        console.log('Columns modified to LONGTEXT successfully');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

alterTable();
