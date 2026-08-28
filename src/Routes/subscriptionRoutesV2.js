"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const SubscriptionControllerV2_1 = require("../Controllers/SubscriptionControllerV2");
const FeatureController_1 = require("../Controllers/FeatureController");
const SubscriptionController_1 = require("../Controllers/SubscriptionController");
const router = (0, express_1.Router)();
// Public endpoints
router.get('/plans', SubscriptionControllerV2_1.getSubscriptionPlans);
router.get('/plan-comparison', FeatureController_1.getPlanComparison);
// Protected endpoints
// my-subscription: reuses V1 getUserSubscription (same data, same DB query)
router.get('/my-subscription', auth_1.authenticateToken, SubscriptionController_1.getUserSubscription);
router.get('/post-purchase-addons', auth_1.authenticateToken, SubscriptionControllerV2_1.getPostPurchaseAddons);
router.get('/feature-usage', auth_1.authenticateToken, SubscriptionControllerV2_1.getFeatureUsage);
router.post('/purchase-verification-badge', auth_1.authenticateToken, SubscriptionControllerV2_1.purchaseVerificationBadge);
router.get('/verification-badge-status', auth_1.authenticateToken, SubscriptionControllerV2_1.getVerificationBadgeStatus);
router.post('/confirm-marriage', auth_1.authenticateToken, SubscriptionControllerV2_1.confirmMarriage);
router.get('/marriage-confirmation-status', auth_1.authenticateToken, FeatureController_1.getMarriageConfirmationStatus);
// Free subscription activation (0 amount plans)
router.post('/activate-free', auth_1.authenticateToken, SubscriptionControllerV2_1.activateFreeSubscription);
// Change plan (cancel active + purchase new in one step)
router.post('/change-plan', auth_1.authenticateToken, SubscriptionControllerV2_1.changePlan);
exports.default = router;
//# sourceMappingURL=subscriptionRoutesV2.js.map