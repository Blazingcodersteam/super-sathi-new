require("dotenv").config();
const mysql = require("mysql2");
let pool;
function createPool() {
    pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        connectionLimit: 10,
        queueLimit: 0,
        idleTimeout: 300000
    });
    pool.on('connection', (connection) => {
        console.log('Database connected as id', connection.threadId);
    });
    pool.on('error', (err) => {
        console.error('Database pool error:', err.message);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.log('Recreating pool...');
            createPool();
        }
    });
    console.log('Database pool created successfully');
}
try {
    createPool();
}
catch (error) {
    console.error('Failed to create database pool:', error);
    process.exit(1);
}
module.exports = pool;
//# sourceMappingURL=database.js.map