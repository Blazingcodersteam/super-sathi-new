"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const chatController = require("../Controllers/ChatController");
const alertsController = require("../Controllers/AlertsController");
const auth_1 = require("../middleware/auth");
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require("multer");
// ── File size limits ──────────────────────────────────────────────────────────
const IMAGE_DOC_MAX = 8 * 1024 * 1024; // 8 MB  — images & documents
const VIDEO_MAX = 50 * 1024 * 1024; // 50 MB — videos only
const VIDEO_TYPES = new Set([
    "video/mp4", "video/quicktime", "video/3gpp",
    "video/x-msvideo", "video/webm",
]);
const ALLOWED_TYPES = new Set([
    "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/quicktime", "video/3gpp", "video/x-msvideo", "video/webm",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
// ── Filename sanitizer — strips path traversal sequences ─────────────────────
function sanitizeFilename(name) {
    return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}
// ── Multer instance ───────────────────────────────────────────────────────────
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: VIDEO_MAX },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_TYPES.has(file.mimetype)) {
            return cb(new Error("Only images, videos (MP4, MOV), PDF, and DOC/DOCX/XLS/XLSX files are allowed"));
        }
        const contentLength = parseInt(req.headers["content-length"] || "0", 10);
        if (!VIDEO_TYPES.has(file.mimetype) && contentLength > IMAGE_DOC_MAX) {
            return cb(new Error("Images and documents must be under 8 MB"));
        }
        file.originalname = sanitizeFilename(file.originalname);
        cb(null, true);
    },
});
// ── Upload wrapper — catches multer errors and returns JSON before controller ─
function uploadSingle(fieldName) {
    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message });
            }
            next();
        });
    };
}
// ── Router ────────────────────────────────────────────────────────────────────
const router = (0, express_1.Router)();
// Conversations list — free (lock UI shown in app, no premium gate here)
router.get("/conversations", auth_1.authenticateToken, chatController.getChatList);
// Get blocked users for filtering
router.get("/blocked", auth_1.authenticateToken, chatController.getBlocked);
// Reading messages and sending require Premium (Section 8)
router.get("/messages/:conversation_id", auth_1.authenticateToken, auth_1.requirePremium, chatController.getMessages);
router.post("/send", auth_1.authenticateToken, auth_1.requirePremium, uploadSingle("file"), chatController.sendMessage);
// Alerts
router.get("/alerts", auth_1.authenticateToken, alertsController.getAlerts);
router.put("/alerts/:alert_id/read", auth_1.authenticateToken, alertsController.markAlertRead);
exports.default = router;
//# sourceMappingURL=chatRoutes.js.map