import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  verifyPayment,
  getPaymentDetails,
  getPaymentMethods,
  getPaymentInvoice,
  getInvoiceHtml,
  updatePaymentStatus,
  getPaymentAnalytics,
  getPaymentHistory,
  cancelOrder,
  getRefundRequests,
  handlePaymentFailure,
  handleWebhook,
  processRefund
} from '../Controllers/PaymentController';

import {
  createOrder,
  handleCCAvenueCallback,
  handleCCAvenueCancel,
  gstPreview,
  publicGstPreview
} from '../Controllers/PaymentControllerDual';

const router = Router();

// Create order (supports both Razorpay and CCAvenue)
router.post('/create-order', authenticateToken, createOrder);

// GST preview — calculate GST for a plan without creating an order (Authenticated)
router.get('/gst-preview', authenticateToken, gstPreview);

// Public GST preview — calculate GST for a plan without authentication
router.get('/public/gst-preview', publicGstPreview);

// CCAvenue specific routes
router.post('/ccavenue/callback', handleCCAvenueCallback);
router.post('/ccavenue/cancel', handleCCAvenueCancel);

// Verify payment
router.post('/verify-payment', authenticateToken, verifyPayment);

// Handle payment failure
router.post('/payment-failed', authenticateToken, handlePaymentFailure);

// Razorpay webhook (no auth required)
router.post('/webhook', handleWebhook);

// Get payment details
router.get('/details/:paymentId', authenticateToken, getPaymentDetails);

// Get payment methods
router.get('/methods', getPaymentMethods);

// Get payment invoice
router.get('/invoice/:paymentId', authenticateToken, getPaymentInvoice);

// Get invoice HTML (public)
router.get('/invoice-view/:invoiceNumber', getInvoiceHtml);

// Update payment status
router.put('/update-status', authenticateToken, updatePaymentStatus);

// Get payment analytics
router.get('/analytics', authenticateToken, getPaymentAnalytics);

// Get payment history
router.get('/history', authenticateToken, getPaymentHistory);

// Cancel payment order
router.post('/cancel-order', authenticateToken, cancelOrder);

// Admin refund management
router.get('/refund-requests', authenticateToken, getRefundRequests);
router.post('/process-refund', authenticateToken, processRefund);

export default router;