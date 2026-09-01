"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv").config();
const express = require("express");
const http = require("http");
const bodyparser = require("body-parser");
const session = require("express-session");
const passport_1 = require("./config/passport");
const SocketManager_1 = require("./socket/SocketManager");
const cron = require("node-cron");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 9000;
console.log("port***", port);
const adminRoutes = require("./Routes/adminRoutes");
const authRoutes_1 = require("./Routes/authRoutes");
const userRoutes_1 = require("./Routes/userRoutes");
const searchRoutes_1 = require("./Routes/searchRoutes");
const subscriptionRoutes_1 = require("./Routes/subscriptionRoutes");
const subscriptionRoutesV2_1 = require("./Routes/subscriptionRoutesV2");
const featureRoutes_1 = require("./Routes/featureRoutes");
const settingsRoutes_1 = require("./Routes/settingsRoutes");
const matchActionsRoutes_1 = require("./Routes/matchActionsRoutes");
const paymentRoutes_1 = require("./Routes/paymentRoutes");
const photoRoutes_1 = require("./Routes/photoRoutes");
const chatRoutes_1 = require("./Routes/chatRoutes");
const matchRoutes_1 = require("./Routes/matchRoutes");
const inboxRoutes_1 = require("./Routes/inboxRoutes");
const notificationRoutes_1 = require("./Routes/notificationRoutes");
const contactRoutes_1 = require("./Routes/contactRoutes");
const successStoriesRoutes_1 = require("./Routes/successStoriesRoutes");
const contentRoutes_1 = require("./Routes/contentRoutes");
const matchmakingRoutes_1 = require("./Routes/matchmakingRoutes");
const callRoutes_1 = require("./Routes/callRoutes");
const googleAuthRoutes_1 = require("./Routes/googleAuthRoutes");
const documentVerificationRoutes_1 = require("./Routes/documentVerificationRoutes");
const vendorRoutes_1 = require("./Routes/vendorRoutes");
const staffRoutes_1 = require("./Routes/staffRoutes");
const CallbackController_1 = require("./Controllers/CallbackController");
const OTPController_1 = require("./Controllers/OTPController");
const CallController_1 = require("./Controllers/CallController");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
// ==== Setup Error Logging ====
const logFilePath = path.resolve(__dirname, "../error.log");
function logErrorToFile(error) {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ${error.stack || error}\n\n`;
    fs.appendFileSync(logFilePath, message, "utf8");
    console.error("Logged error:", error);
}
// Catch global errors (runtime + async)
process.on("uncaughtException", (err) => {
    logErrorToFile(err);
});
process.on("unhandledRejection", (reason) => {
    logErrorToFile(reason);
});
app.use(cors());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.use(bodyparser.json({ limit: "50mb" }));
app.use(bodyparser.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Session and Passport middleware
app.use(session({
    secret: process.env.JWT_SECRET_KEY || 'fallback-secret',
    resave: false,
    saveUninitialized: false
}));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
// Root and Health endpoints
app.get("/", (req, res) => {
    res.status(200).json({
        status: "online",
        service: "Supersathi Backend API",
        version: "1.0.0"
    });
});
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
app.get("/api/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});
// API root
app.get("/api", (req, res) => {
    res.status(200).send("Supersathi API Code");
});
app.get("/api/", (req, res) => {
    res.status(200).send("Supersathi API Code");
});
// OTP routes
app.post("/api/send_otp_mail", OTPController_1.sendOtp);
app.post("/api/verify_mail_otp", OTPController_1.verifyOtp);
app.post("/api/send_otp_phone", OTPController_1.sendOtp);
app.post("/api/verify_phone_otp", OTPController_1.verifyOtp);
// DigiLocker callback
app.get("/verification/callback", CallbackController_1.handleDigiLockerCallback);
// Module routes (MUST be before static file serving and fallback handlers)
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes_1.default);
app.use("/api/user", userRoutes_1.default);
app.use("/api/staff", staffRoutes_1.default);
app.use("/api/search", searchRoutes_1.default);
app.use("/api/subscription", subscriptionRoutes_1.default);
app.use("/api/subscription/v2", subscriptionRoutesV2_1.default);
app.use("/api/features", featureRoutes_1.default);
app.use("/api/settings", settingsRoutes_1.default);
app.use("/api/matches", matchRoutes_1.default);
app.use("/api/match-actions", matchActionsRoutes_1.default);
app.use("/api/payments", paymentRoutes_1.default); // Payment routes including CCAvenue callback
app.use("/api/photos", photoRoutes_1.default);
app.use("/api/chat", chatRoutes_1.default);
app.use("/api/inbox", inboxRoutes_1.default);
app.use("/api/notifications", notificationRoutes_1.default);
app.use("/api/contact", contactRoutes_1.default);
app.use("/api/success-stories", successStoriesRoutes_1.default);
app.use("/api/content", contentRoutes_1.default);
app.use("/api/matchmaking", matchmakingRoutes_1.default);
app.use("/api/calls", callRoutes_1.default);
app.use("/api/auth", googleAuthRoutes_1.default);
app.use("/api/user/document-verification", documentVerificationRoutes_1.default);
app.use("/api/vendor", vendorRoutes_1.default);
// ==== Serve Uploaded Static Files ====
const uploadsPath = path.resolve(__dirname, "../uploads");
if (fs.existsSync(uploadsPath)) {
    app.use("/uploads", express.static(uploadsPath));
}
// ==== Optional Admin / Frontend Static Files (Safe fallback only if build artifacts exist) ====
const adminBuildPath = path.resolve(__dirname, "admin");
const frontBuildPath = path.resolve(__dirname, "front");
const hasAdminIndex = fs.existsSync(path.join(adminBuildPath, "index.html"));
const hasFrontIndex = fs.existsSync(path.join(frontBuildPath, "index.html"));
if (hasAdminIndex) {
    app.use("/admin", express.static(adminBuildPath));
    app.get("/admin/*", (req, res) => {
        res.sendFile(path.join(adminBuildPath, "index.html"));
    });
}
if (hasFrontIndex) {
    app.use(express.static(frontBuildPath));
    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/verification")) {
            return next();
        }
        res.sendFile(path.join(frontBuildPath, "index.html"));
    });
}
// ==== API 404 Handler ====
app.use("/api/*", (req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
});
// ==== General 404 Handler (for unmatched routes when frontend build is not served by backend) ====
app.use((req, res) => {
    res.status(404).json({ error: "Resource not found" });
});
// ==== Express Error Middleware ====
app.use((err, req, res, next) => {
    logErrorToFile(err);
    res.status(err.status || 500).json({ error: "Internal Server Error" });
});
const server = http.createServer(app);
(0, SocketManager_1.initSocket)(server);
server.listen(port, () => {
    console.log(`server listening on ${port}`);
    console.log(`Socket.IO ready on ws://localhost:${port}`);
    // Start background worker for auto-expiring stale ringing calls
    (0, CallController_1.startCallExpirationWorker)();
    cron.schedule("0 0 * * *", async () => {
        const mysql2 = require("mysql2/promise");
        let conn;
        try {
            conn = await mysql2.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
            });
            const [result] = await conn.execute(`UPDATE user_subscriptions
         SET is_active = 0, subscription_status_id = 2
         WHERE end_date <= CURRENT_DATE AND is_active = 1`);
            console.log(`[Cron] Expired subscriptions deactivated: ${result.affectedRows}`);
        }
        catch (err) {
            logErrorToFile(err);
        }
        finally {
            if (conn)
                await conn.end();
        }
    });
});
server.on("error", (err) => {
    logErrorToFile(err);
    if (err.code === 'EADDRINUSE') {
        logErrorToFile(`Port ${port} is already in use`);
        process.exit(1);
    }
});
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    (0, CallController_1.stopCallExpirationWorker)();
    server.close(() => {
        console.log('Process terminated');
    });
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    (0, CallController_1.stopCallExpirationWorker)();
    server.close(() => {
        console.log('Process terminated');
    });
});
module.exports = app;
// ngrok http --url=unique-firefly-endless.ngrok-free.app 9090
//# sourceMappingURL=app.js.map