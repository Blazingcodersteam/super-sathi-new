"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const successStoriesController = require("../Controllers/SuccessStoriesController");
const auth_1 = require("../middleware/auth");
const multer = require("multer");
// Configure multer for photo uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files (JPG, PNG, WEBP) are allowed'));
        }
    }
});
const router = (0, express_1.Router)();
// Public routes
router.get("/", successStoriesController.getSuccessStories);
router.post("/submit", upload.single('photo'), successStoriesController.submitSuccessStory);
// Admin routes
router.get("/submissions", auth_1.authenticateToken, successStoriesController.getSuccessStorySubmissions);
router.put("/submissions/:story_id/status", auth_1.authenticateToken, successStoriesController.updateSuccessStoryStatus);
exports.default = router;
//# sourceMappingURL=successStoriesRoutes.js.map