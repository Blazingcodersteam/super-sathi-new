import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { 
  getSubscriptionPlans,
  getPostPurchaseAddons,
  getFeatureUsage,
  purchaseVerificationBadge,
  getVerificationBadgeStatus,
  confirmMarriage,
  activateFreeSubscription,
  changePlan
} from '../Controllers/SubscriptionControllerV2';
import { getPlanComparison, getMarriageConfirmationStatus } from '../Controllers/FeatureController';
import { getUserSubscription } from '../Controllers/SubscriptionController';

const router = Router();

// Public endpoints
router.get('/plans', getSubscriptionPlans);
router.get('/plan-comparison', getPlanComparison);

// Protected endpoints
// my-subscription: reuses V1 getUserSubscription (same data, same DB query)
router.get('/my-subscription', authenticateToken, getUserSubscription);
router.get('/post-purchase-addons', authenticateToken, getPostPurchaseAddons);
router.get('/feature-usage', authenticateToken, getFeatureUsage);
router.post('/purchase-verification-badge', authenticateToken, purchaseVerificationBadge);
router.get('/verification-badge-status', authenticateToken, getVerificationBadgeStatus);
router.post('/confirm-marriage', authenticateToken, confirmMarriage);
router.get('/marriage-confirmation-status', authenticateToken, getMarriageConfirmationStatus);

// Free subscription activation (0 amount plans)
router.post('/activate-free', authenticateToken, activateFreeSubscription);

// Change plan (cancel active + purchase new in one step)
router.post('/change-plan', authenticateToken, changePlan);

export default router;
