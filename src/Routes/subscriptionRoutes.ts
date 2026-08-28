import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { 
  getSubscriptionPlans, 
  getSubscriptionDetails,
  getUserSubscription,
  getSubscriptionFeatures,
  getSubscriptionAddons,
  checkSubscriptionStatus,
  requestRefund,
  getMyRefundRequests,
  getRefundStatus
} from '../Controllers/SubscriptionController';

const router = Router();

// Get available subscription plans (no auth required)
router.get('/plans', getSubscriptionPlans);

// Get subscription details with features (no auth required)
router.get('/details', getSubscriptionDetails);

// Get subscription features (no auth required)
router.get('/features', getSubscriptionFeatures);

// Get subscription add-ons (no auth required)
router.get('/addons', getSubscriptionAddons);

// Get user's subscription status
router.get('/my-subscription', authenticateToken, getUserSubscription);

// Check subscription status
router.get('/status', authenticateToken, checkSubscriptionStatus);

// Refund endpoints
router.post('/request-refund', authenticateToken, requestRefund);
router.get('/my-refund-requests', authenticateToken, getMyRefundRequests);
router.get('/refund-status/:subscriptionId', authenticateToken, getRefundStatus);

export default router;