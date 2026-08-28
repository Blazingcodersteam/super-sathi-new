require("dotenv").config();

import * as express from "express";
import * as http from "http";
import * as bodyparser from "body-parser";
import * as session from "express-session";
import passport from "./config/passport";
import { initSocket } from "./socket/SocketManager";
import * as cron from "node-cron";

const cors = require("cors");
const app = express();
const port = process.env.PORT || 9000;
console.log("port***", port);

const adminRoutes = require("./Routes/adminRoutes");
import authRoutes from "./Routes/authRoutes";
import userRoutes from "./Routes/userRoutes";
import searchRoutes from "./Routes/searchRoutes";
import subscriptionRoutes from "./Routes/subscriptionRoutes";
import subscriptionRoutesV2 from "./Routes/subscriptionRoutesV2";
import featureRoutes from "./Routes/featureRoutes";
import settingsRoutes from "./Routes/settingsRoutes";
import matchActionsRoutes from "./Routes/matchActionsRoutes";
import paymentRoutes from "./Routes/paymentRoutes";
import photoRoutes from "./Routes/photoRoutes";
import chatRoutes from "./Routes/chatRoutes";
import matchRoutes from "./Routes/matchRoutes";
import inboxRoutes from "./Routes/inboxRoutes";
import notificationRoutes from "./Routes/notificationRoutes";
import contactRoutes from "./Routes/contactRoutes";
import successStoriesRoutes from "./Routes/successStoriesRoutes";
import contentRoutes from "./Routes/contentRoutes";
import matchmakingRoutes from "./Routes/matchmakingRoutes";
import callRoutes from "./Routes/callRoutes";
import googleAuthRoutes from "./Routes/googleAuthRoutes";
import documentVerificationRoutes from "./Routes/documentVerificationRoutes";
import vendorRoutes from "./Routes/vendorRoutes";
import staffRoutes from "./Routes/staffRoutes";
import { handleDigiLockerCallback } from "./Controllers/CallbackController";
import { sendOtp, verifyOtp } from "./Controllers/OTPController";


const jwt = require("jsonwebtoken");

const fs = require("fs");
const path = require("path");

// ==== Setup Error Logging ====
const logFilePath = path.resolve(__dirname, "../error.log");

function logErrorToFile(error: any) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${error.stack || error}\n\n`;
  fs.appendFileSync(logFilePath, message, "utf8");
  console.error("Logged error:", error);
}

// Catch global errors (runtime + async)
process.on("uncaughtException", (err) => {
  logErrorToFile(err);
});

process.on("unhandledRejection", (reason: any) => {
  logErrorToFile(reason);
});

app.use(cors());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
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
app.use(passport.initialize());
app.use(passport.session());

// API root
app.get("/api/", (req, res) => {
  res.status(200).send("Supersathi API Code");
});

// OTP routes
app.post("/api/send_otp_mail", sendOtp);
app.post("/api/verify_mail_otp", verifyOtp);
app.post("/api/send_otp_phone", sendOtp);
app.post("/api/verify_phone_otp", verifyOtp);

// DigiLocker callback
app.get("/verification/callback", handleDigiLockerCallback);

// Module routes (MUST be before static file serving)
app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/subscription/v2", subscriptionRoutesV2);
app.use("/api/features", featureRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/match-actions", matchActionsRoutes);
app.use("/api/payments", paymentRoutes); // Payment routes including CCAvenue callback
app.use("/api/photos", photoRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/inbox", inboxRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/success-stories", successStoriesRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/matchmaking", matchmakingRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/auth", googleAuthRoutes);
app.use("/api/user/document-verification", documentVerificationRoutes);
app.use("/api/vendor", vendorRoutes);

// ==== Serve Static Files ====
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ==== Serve Admin Static Files ====
const adminBuildPath = path.join(__dirname, "admin");
app.use("/admin", express.static(adminBuildPath));

// ==== Serve React Front-End (front folder) ====
const frontBuildPath = path.join(__dirname, "front");
app.get("/admin/*", (req, res) => {
  res.sendFile(path.join(adminBuildPath, "index.html"));
});
app.use("/", express.static(frontBuildPath));
app.get(/^(?!\/api|\/admin).*/, (req, res) => {
  res.sendFile(path.join(frontBuildPath, "index.html"));
});

// Only serve index.html for non-API routes
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(adminBuildPath, "index.html"));
});

// ==== API 404 Handler ====
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ==== Express Error Middleware ====
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logErrorToFile(err);
  res.status(500).json({ error: "Internal Server Error" });
});
const server = http.createServer(app);
initSocket(server);
server.listen(port, () => {
  console.log(`server listening on ${port}`);
  console.log(`Socket.IO ready on ws://localhost:${port}`);

  cron.schedule("0 0 * * *", async () => {
    const mysql2 = require("mysql2/promise");
    let conn: any;
    try {
      conn = await mysql2.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });
      const [result]: any = await conn.execute(
        `UPDATE user_subscriptions
         SET is_active = 0, subscription_status_id = 2
         WHERE end_date <= CURRENT_DATE AND is_active = 1`
      );
      console.log(`[Cron] Expired subscriptions deactivated: ${result.affectedRows}`);
    } catch (err) {
      logErrorToFile(err);
    } finally {
      if (conn) await conn.end();
    }
  });
});

server.on("error", (err: any) => {
  logErrorToFile(err);
  if (err.code === 'EADDRINUSE') {
    logErrorToFile(`Port ${port} is already in use`);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
module.exports = app;
// ngrok http --url=unique-firefly-endless.ngrok-free.app 9090
