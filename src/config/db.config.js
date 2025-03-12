const mysql = require('mysql2');
require('dotenv').config();

const connection = mysql.createConnection({
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER, // thay thế bằng tên người dùng của bạn
  password: process.env.MYSQL_ADDON_PASSWORD, // thay thế bằng mật khẩu của bạn
  database: process.env.MYSQL_ADDON_DB // thay thế bằng tên cơ sở dữ liệu của bạn
});

connection.connect((err) => {
  if (err) {
    console.error('Lỗi kết nối: ' + err.stack);
    return;
  }
  console.log('Kết nối thành công MYSQL với ID: ' + connection.threadId);
});

module.exports = connection;
