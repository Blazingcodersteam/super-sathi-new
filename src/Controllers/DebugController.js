"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkServerHealth = checkServerHealth;
const db = require("../database");
async function checkServerHealth(req, res) {
    try {
        // Check database connection
        const dbResult = await new Promise((resolve, reject) => {
            db.query("SELECT 1 as test", (err, result) => {
                if (err)
                    reject(err);
                else
                    resolve(result);
            });
        });
        // Check environment variables
        const envCheck = {
            JWT_SECRET: !!process.env.JWT_SECRET_KEY,
            NODE_ENV: process.env.NODE_ENV,
            PORT: process.env.PORT,
            DB_HOST: !!process.env.DB_HOST,
            DB_USER: !!process.env.DB_USER,
            DB_PASSWORD: !!process.env.DB_PASSWORD,
            DB_NAME: !!process.env.DB_NAME,
            DB_PORT: process.env.DB_PORT || '3306'
        };
        res.json({
            success: true,
            message: "Server health check",
            database: "Connected",
            environment: envCheck,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error("Health check error:", error);
        res.status(500).json({
            success: false,
            message: "Health check failed",
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
//# sourceMappingURL=DebugController.js.map