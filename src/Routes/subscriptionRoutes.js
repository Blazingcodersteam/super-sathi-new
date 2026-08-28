"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const SubscriptionController_1 = require("../Controllers/SubscriptionController");
const router = (0, express_1.Router)();
// Get available subscription plans (no auth required)
router.get('/plans', SubscriptionController_1.getSubscriptionPlans);
// Get subscription details with features (no auth required)
router.get('/details', SubscriptionController_1.getSubscriptionDetails);
// Get subscription features (no auth required)
router.get('/features', SubscriptionController_1.getSubscriptionFeatures);
// Get subscription add-ons (no auth required)
router.get('/addons', SubscriptionController_1.getSubscriptionAddons);
// Get user's subscription status
router.get('/my-subscription', auth_1.authenticateToken, SubscriptionController_1.getUserSubscription);
// Check subscription status
router.get('/status', auth_1.authenticateToken, SubscriptionController_1.checkSubscriptionStatus);
// Refund endpoints
router.post('/request-refund', auth_1.authenticateToken, SubscriptionController_1.requestRefund);
router.get('/my-refund-requests', auth_1.authenticateToken, SubscriptionController_1.getMyRefundRequests);
router.get('/refund-status/:subscriptionId', auth_1.authenticateToken, SubscriptionController_1.getRefundStatus);
exports.default = router;
//# sourceMappingURL=subscriptionRoutes.js.map