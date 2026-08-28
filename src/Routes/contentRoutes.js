"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ContentController = require("../Controllers/ContentController");
const auth_1 = require("../middleware/auth");
const multer = require("multer");
const router = (0, express_1.Router)();
const upload = multer({ dest: 'uploads/' });
// Public routes
router.get('/', ContentController.getWebsiteContent);
router.get('/ceo-content', ContentController.getCeoContent);
router.put('/public/ceo-content', ContentController.updateCeoContentPublic);
// Admin routes (protected)
router.put('/privacy-policy', auth_1.authenticateToken, auth_1.requireAdmin, ContentController.updatePrivacyPolicy);
router.put('/terms-conditions', auth_1.authenticateToken, auth_1.requireAdmin, ContentController.updateTermsConditions);
router.put('/refund-policy', auth_1.authenticateToken, auth_1.requireAdmin, ContentController.updateRefundPolicy);
router.put('/safe-policy', auth_1.authenticateToken, auth_1.requireAdmin, ContentController.updateSafePolicy);
router.put('/be-safe-online', auth_1.authenticateToken, auth_1.requireAdmin, ContentController.updateBeSafeOnline);
router.put('/title', auth_1.authenticateToken, auth_1.requireAdmin, ContentController.updateTitle);
router.put('/subtitle', auth_1.authenticateToken, auth_1.requireAdmin, ContentController.updateSubtitle);
router.put('/description', auth_1.authenticateToken, auth_1.requireAdmin, ContentController.updateDescription);
router.post('/homepage-banner', auth_1.authenticateToken, auth_1.requireAdmin, upload.array('bannerImages', 10), ContentController.uploadHomepageBanner);
router.post('/ceo-image', auth_1.authenticateToken, auth_1.requireAdmin, upload.single('ceoImage'), ContentController.uploadCeoImage);
router.put('/ceo-content', auth_1.authenticateToken, auth_1.requireAdmin, ContentController.updateCeoContent);
exports.default = router;
//# sourceMappingURL=contentRoutes.js.map