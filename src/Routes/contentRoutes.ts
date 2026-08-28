import { Router } from 'express';
import * as ContentController from '../Controllers/ContentController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import * as multer from 'multer';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Public routes
router.get('/', ContentController.getWebsiteContent);
router.get('/ceo-content', ContentController.getCeoContent);
router.put('/public/ceo-content', ContentController.updateCeoContentPublic);

// Admin routes (protected)
router.put('/privacy-policy', authenticateToken, requireAdmin, ContentController.updatePrivacyPolicy);
router.put('/terms-conditions', authenticateToken, requireAdmin, ContentController.updateTermsConditions);
router.put('/refund-policy', authenticateToken, requireAdmin, ContentController.updateRefundPolicy);
router.put('/safe-policy', authenticateToken, requireAdmin, ContentController.updateSafePolicy);
router.put('/be-safe-online', authenticateToken, requireAdmin, ContentController.updateBeSafeOnline);
router.put('/title', authenticateToken, requireAdmin, ContentController.updateTitle);
router.put('/subtitle', authenticateToken, requireAdmin, ContentController.updateSubtitle);
router.put('/description', authenticateToken, requireAdmin, ContentController.updateDescription);
router.post('/homepage-banner', authenticateToken, requireAdmin, upload.array('bannerImages', 10), ContentController.uploadHomepageBanner);
router.post('/ceo-image', authenticateToken, requireAdmin, upload.single('ceoImage'), ContentController.uploadCeoImage);
router.put('/ceo-content', authenticateToken, requireAdmin, ContentController.updateCeoContent);

export default router;