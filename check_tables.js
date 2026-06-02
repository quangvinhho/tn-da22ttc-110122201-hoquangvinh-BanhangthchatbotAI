const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Vinh123456789@',
  database: 'QHUNG'
});

db.connect((err) => {
  if (err) {
    console.log('DB Error:', err.message);
    process.exit(1);
  }
  
  // Check wishlist-related tables
  db.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = 'QHUNG' 
    AND (TABLE_NAME LIKE '%wishlist%' 
         OR TABLE_NAME LIKE '%yeu%thich%' 
         OR TABLE_NAME LIKE '%theo%doi%')`, (err, res) => {
    console.log('=== Wishlist Tables ===');
    console.log(res);
    
    // Get all tables
    db.query(`SHOW TABLES FROM QHUNG`, (err, res2) => {
      console.log('\n=== All Tables ===');
      res2.forEach(row => {
        const tableName = Object.values(row)[0];
        console.log(`- ${tableName}`);
      });
      db.end();
    });
  });
});
