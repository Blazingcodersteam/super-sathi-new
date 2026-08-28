import { Router } from "express";
import * as successStoriesController from "../Controllers/SuccessStoriesController";
import { authenticateToken } from "../middleware/auth";
import * as multer from "multer";

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
    } else {
      cb(new Error('Only image files (JPG, PNG, WEBP) are allowed'));
    }
  }
});

const router = Router();

// Public routes
router.get("/", successStoriesController.getSuccessStories);
router.post("/submit", upload.single('photo'), successStoriesController.submitSuccessStory);

// Admin routes
router.get("/submissions", authenticateToken, successStoriesController.getSuccessStorySubmissions);
router.put("/submissions/:story_id/status", authenticateToken, successStoriesController.updateSuccessStoryStatus);

export default router;