import { Router } from 'express';
import {
  createConsultation,
  getMyConsultations,
  updateConsultation,
  getMyEarnings,
  getMyReviews,
  submitReview,
  getReviewForm,
  testEmail
} from '../Controllers/VendorConsultationController';
import { verifyVendorToken } from '../middleware/vendorAuth';

const router = Router();

// ============ VENDOR CONSULTATION ROUTES (Protected) ============

// Consultations Management
router.post('/consultations', verifyVendorToken, createConsultation);
router.get('/consultations', verifyVendorToken, getMyConsultations);
router.put('/consultations/:id', verifyVendorToken, updateConsultation);

// Earnings Management
router.get('/earnings', verifyVendorToken, getMyEarnings);

// Reviews Management
router.get('/reviews', verifyVendorToken, getMyReviews);

// ============ PUBLIC REVIEW ROUTES ============

// Public review submission (using token)
router.get('/reviews/form/:token', getReviewForm);
router.post('/reviews/submit/:token', submitReview);

// ============ TEST ROUTES ============

// Test email functionality
router.post('/test-email', testEmail);

export default router;