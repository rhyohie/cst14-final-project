const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('database.db');
db.all(`SELECT 
        CAST(strftime('%m', order_date) AS INTEGER) as month,
        CASE CAST(strftime('%m', order_date) AS INTEGER)
          WHEN 1 THEN 'Jan'
          WHEN 2 THEN 'Feb'
          WHEN 3 THEN 'Mar'
          WHEN 4 THEN 'Apr'
          WHEN 5 THEN 'May'
          WHEN 6 THEN 'Jun'
          WHEN 7 THEN 'Jul'
          WHEN 8 THEN 'Aug'
          WHEN 9 THEN 'Sep'
          WHEN 10 THEN 'Oct'
          WHEN 11 THEN 'Nov'
          WHEN 12 THEN 'Dec'
          ELSE 'N/A'
        END as month_name,
        SUM(total_amount) as revenue
       FROM orders
       WHERE order_date >= datetime('now', '-6 months')
       GROUP BY strftime('%m', order_date)
       ORDER BY month ASC`, [], (err, rows) => {
    console.log('ERR', err);
    console.log('ROWS', rows);
    db.close();
});
