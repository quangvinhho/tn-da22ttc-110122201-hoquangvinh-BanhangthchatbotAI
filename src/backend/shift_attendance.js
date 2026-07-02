const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'quanghungmobile_db'
  });

  try {
    console.log('=== SHIFTING CHAM_CONG DATES TO JULY 2026 ===');
    
    // Update June 27 to July 1
    const [r1] = await connection.query(`
      UPDATE cham_cong
      SET ngay = '2026-07-01',
          gio_checkin = REPLACE(gio_checkin, '2026-06-27', '2026-07-01'),
          gio_checkout = REPLACE(gio_checkout, '2026-06-27', '2026-07-01')
      WHERE ngay = '2026-06-27'
    `);
    console.log(`Updated June 27 shifts: ${r1.affectedRows} rows`);

    // Update June 30 to July 2
    const [r2] = await connection.query(`
      UPDATE cham_cong
      SET ngay = '2026-07-02',
          gio_checkin = REPLACE(gio_checkin, '2026-06-30', '2026-07-02'),
          gio_checkout = REPLACE(gio_checkout, '2026-06-30', '2026-07-02')
      WHERE ngay = '2026-06-30'
    `);
    console.log(`Updated June 30 shifts: ${r2.affectedRows} rows`);

    // Also update phan_cong_ca to match the dates!
    const [r3] = await connection.query(`
      UPDATE phan_cong_ca
      SET ngay_lam = '2026-07-01'
      WHERE ngay_lam = '2026-06-27'
    `);
    const [r4] = await connection.query(`
      UPDATE phan_cong_ca
      SET ngay_lam = '2026-07-02'
      WHERE ngay_lam = '2026-06-30'
    `);
    console.log(`Updated phan_cong_ca: ${r3.affectedRows + r4.affectedRows} rows`);

  } catch (error) {
    console.error(error);
  } finally {
    await connection.end();
  }
}

run();
