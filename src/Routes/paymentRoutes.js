"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const PaymentController_1 = require("../Controllers/PaymentController");
const PaymentControllerDual_1 = require("../Controllers/PaymentControllerDual");
const router = (0, express_1.Router)();
// Create order (supports both Razorpay and CCAvenue)
router.post('/create-order', auth_1.authenticateToken, PaymentControllerDual_1.createOrder);
// GST preview — calculate GST for a plan without creating an order (Authenticated)
router.get('/gst-preview', auth_1.authenticateToken, PaymentControllerDual_1.gstPreview);
// Public GST preview — calculate GST for a plan without authentication
router.get('/public/gst-preview', PaymentControllerDual_1.publicGstPreview);
// CCAvenue specific routes
router.post('/ccavenue/callback', PaymentControllerDual_1.handleCCAvenueCallback);
router.post('/ccavenue/cancel', PaymentControllerDual_1.handleCCAvenueCancel);
// Verify payment
router.post('/verify-payment', auth_1.authenticateToken, PaymentController_1.verifyPayment);
// Handle payment failure
router.post('/payment-failed', auth_1.authenticateToken, PaymentController_1.handlePaymentFailure);
// Razorpay webhook (no auth required)
router.post('/webhook', PaymentController_1.handleWebhook);
// Get payment details
router.get('/details/:paymentId', auth_1.authenticateToken, PaymentController_1.getPaymentDetails);
// Get payment methods
router.get('/methods', PaymentController_1.getPaymentMethods);
// Get payment invoice
router.get('/invoice/:paymentId', auth_1.authenticateToken, PaymentController_1.getPaymentInvoice);
// Get invoice HTML (public)
router.get('/invoice-view/:invoiceNumber', PaymentController_1.getInvoiceHtml);
// Update payment status
router.put('/update-status', auth_1.authenticateToken, PaymentController_1.updatePaymentStatus);
// Get payment analytics
router.get('/analytics', auth_1.authenticateToken, PaymentController_1.getPaymentAnalytics);
// Get payment history
router.get('/history', auth_1.authenticateToken, PaymentController_1.getPaymentHistory);
// Cancel payment order
router.post('/cancel-order', auth_1.authenticateToken, PaymentController_1.cancelOrder);
// Admin refund management
router.get('/refund-requests', auth_1.authenticateToken, PaymentController_1.getRefundRequests);
router.post('/process-refund', auth_1.authenticateToken, PaymentController_1.processRefund);
exports.default = router;
//# sourceMappingURL=paymentRoutes.js.map