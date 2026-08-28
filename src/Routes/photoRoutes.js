"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const PhotoController_1 = require("../Controllers/PhotoController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Upload single photo
router.post('/upload', auth_1.authenticateToken, PhotoController_1.uploadPhoto);
// Upload multiple photos
router.post('/upload-multiple', auth_1.authenticateToken, PhotoController_1.uploadMultiplePhotos);
// Get user photos
router.get('/', auth_1.authenticateToken, PhotoController_1.getUserPhotos);
// Delete photo
router.delete('/:photoId', auth_1.authenticateToken, PhotoController_1.deletePhoto);
// Set primary photo
router.put('/:photoId/primary', auth_1.authenticateToken, PhotoController_1.setPrimaryPhoto);
exports.default = router;
//# sourceMappingURL=photoRoutes.js.map