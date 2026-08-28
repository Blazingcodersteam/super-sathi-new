"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const multer = require("multer");
const fs = require("fs");
const path = require("path");
// Local fallback storage
function LocalUploader(folderName = "uploads/") {
    const uploadPath = path.join(__dirname, "..", folderName);
    console.log("uploadPath", uploadPath);
    // Ensure the directory exists
    if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
    }
    return multer({
        storage: multer.diskStorage({
            destination: function (req, file, cb) {
                cb(null, uploadPath);
            },
            filename: function (req, file, cb) {
                const ext = path.extname(file.originalname);
                const filename = `${Date.now()}_${Math.floor(Math.random() * 1e9)}${ext}`;
                cb(null, filename);
            },
        }),
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
            const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
            if (!allowedTypes.includes(file.mimetype)) {
                return cb(new Error("Only JPEG, PNG, and WEBP files are allowed"));
            }
            cb(null, true);
        },
    });
}
exports.default = LocalUploader;
//# sourceMappingURL=LocalUploader.js.map