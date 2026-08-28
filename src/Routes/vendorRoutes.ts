import { Router } from 'express';
import * as multer from 'multer';
import {
  vendorSignup,
  vendorLogin,
  getVendorProfile,
  updateVendorProfile,
  getVendorCategoriesPublic,
  getVendorMenuPermissions,
  signupUploadFields,
  singleUpload,
  singleDocumentUpload,
  // Bank Details Management
  getMyBankDetails,
  addBankDetail,
  updateBankDetail,
  deleteBankDetail,
  // Services Management
  getMyServices,
  addService,
  updateService,
  deleteService,
  // Documents Management
  getMyDocuments,
  addDocument,
  updateDocument,
  deleteDocument
} from '../Controllers/VendorAuthController';
import {
  getActiveVendorSubscriptionPlans,
  getVendorSubscriptionPlanDetails
} from '../Controllers/VendorSubscriptionController';
import {
  initiateVendorRegistration,
  getTempRegistrationDetails,
  cancelTempRegistration
} from '../Controllers/VendorRegistrationController';
import { registerVendorFreePlan, changeVendorPassword } from '../Controllers/VendorFreePlanController';
import { testVendorEmail, checkEmailConfig } from '../Controllers/TestEmailController';
import {
  initiateVendorPayment,
  verifyVendorRazorpayPayment,
  handleVendorCCAvenueCallback,
  handleVendorCCAvenueCancel,
  getVendorPaymentStatus,
  getVendorGSTPreview
} from '../Controllers/VendorPaymentController';
import {
  getCurrentSubscription
} from '../Controllers/VendorSubscriptionManagementController';
import {
  verifyUpgradePayment
} from '../Controllers/UpgradePaymentVerificationController';
import {
  initiateAuthenticatedRenewal,
  verifyAuthenticatedRenewalPayment,
  getRenewalStatus,
  handleCCAvenueRenewalCallback,
  handleCCAvenueRenewalCancel
} from '../Controllers/SubscriptionRenewalController';
import {
  initiateUpgrade
} from '../Controllers/InitiateUpgradeController';
import {
  getAllStates,
  getStateById,
  getStatesByCountry,
  getCitiesByState,
  getVendorRegistrationFormData
} from '../Controllers/StateController';
import { verifyVendorToken } from '../middleware/vendorAuth';

const router = Router();

// Simple test multer for debugging
const testUpload = multer({ storage: multer.memoryStorage() }).any();

// ============ VENDOR REGISTRATION FORM DATA ============

// Get all states for vendor registration
router.get('/states', getAllStates);

// Get state by ID
router.get('/states/:id', getStateById);

// Get states by country
router.get('/countries/:country_id/states', getStatesByCountry);

// Get cities by state
router.get('/states/:state_id/cities', getCitiesByState);

// Get complete vendor registration form data (states, categories, plans)
router.get('/registration/form-data', getVendorRegistrationFormData);

// ============ NEW VENDOR REGISTRATION FLOW ============

// Email testing endpoints (for debugging)
router.post('/test-email', testVendorEmail);
router.get('/check-email-config', checkEmailConfig);

// Register with FREE plan (no payment required)
router.post('/register/free', (req, res, next) => {
  signupUploadFields(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: `File upload error: ${err.message}`
      });
    }
    next();
  });
}, registerVendorFreePlan);

// Step 1: Initiate registration with payment
router.post('/register/initiate', (req, res, next) => {
  console.log('Initiate registration - headers:', req.headers);
  console.log('Content-Type:', req.get('Content-Type'));
  
  signupUploadFields(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: `File upload error: ${err.message}`
      });
    }
    console.log('Files processed for registration initiation');
    next();
  });
}, initiateVendorRegistration);

// Get temp registration details
router.get('/register/temp/:temp_id', getTempRegistrationDetails);

// Cancel temp registration
router.delete('/register/temp/:temp_id', cancelTempRegistration);

// ============ VENDOR PAYMENT ROUTES ============

// Initiate payment for registration
router.post('/payment/initiate', initiateVendorPayment);

// Verify Razorpay payment
router.post('/payment/razorpay/verify', verifyVendorRazorpayPayment);

// CCAvenue callback routes
router.post('/payment/ccavenue/callback', handleVendorCCAvenueCallback);
router.post('/payment/ccavenue/cancel', handleVendorCCAvenueCancel);

// Get payment status
router.get('/payment/status/:temp_registration_id', getVendorPaymentStatus);

// GST preview for vendor registration
router.get('/payment/gst-preview', getVendorGSTPreview);

// ============ LEGACY VENDOR REGISTRATION (KEEP FOR ADMIN) ============

// ============ LEGACY VENDOR REGISTRATION (KEEP FOR ADMIN) ============

// Vendor Authentication (Public - but will be deprecated)
router.post('/signup', (req, res, next) => {
  console.log('DEPRECATED: Use /register/initiate for new registrations');
  console.log('Request headers:', req.headers);
  console.log('Content-Type:', req.get('Content-Type'));
  
  signupUploadFields(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: `File upload error: ${err.message}`
      });
    }
    console.log('Multer processed successfully');
    console.log('req.files after multer:', req.files);
    console.log('req.body after multer:', Object.keys(req.body));
    next();
  });
}, vendorSignup);
// Vendor Login (Public)
router.post('/login', vendorLogin);

// Get vendor categories for signup form (Public)
router.get('/categories', getVendorCategoriesPublic);

// Get vendor subscription plans (Public - no token required)
router.get('/subscription-plans', getActiveVendorSubscriptionPlans);
router.get('/subscription-plans/:id', getVendorSubscriptionPlanDetails);

// Test route for file upload debugging
router.post('/test-upload', testUpload, (req, res) => {
  console.log('Test upload - req.files:', req.files);
  console.log('Test upload - req.body:', req.body);
  res.json({
    success: true,
    files: req.files,
    body: req.body
  });
});

// ============ PROTECTED VENDOR ROUTES ============

// Vendor Subscription Management (Protected)
router.get('/subscription/current', verifyVendorToken, getCurrentSubscription);
router.get('/subscription/renewal-status', verifyVendorToken, getRenewalStatus);
router.post('/subscription/upgrade', verifyVendorToken, initiateUpgrade);
router.post('/subscription/upgrade/verify', verifyVendorToken, verifyUpgradePayment);
router.post('/subscription/renew', verifyVendorToken, initiateAuthenticatedRenewal);
router.post('/subscription/renew/verify', verifyVendorToken, verifyAuthenticatedRenewalPayment);

// CCAvenue Renewal Callbacks (No auth required - CCAvenue calls directly)
router.post('/payment/ccavenue/renewal/callback', handleCCAvenueRenewalCallback);
router.post('/payment/ccavenue/renewal/cancel', handleCCAvenueRenewalCancel);

// ============ VENDOR PROFILE MANAGEMENT ============

// Vendor Profile Management (Protected)
router.get('/profile', verifyVendorToken, getVendorProfile);
router.put('/profile', verifyVendorToken, singleUpload, updateVendorProfile);

// Change Password (Protected)
router.post('/change-password', verifyVendorToken, changeVendorPassword);

// Vendor Menu Permissions (Protected)
router.get('/menus', verifyVendorToken, getVendorMenuPermissions);

// ============ VENDOR BANK DETAILS MANAGEMENT ============

// Bank Details CRUD (Protected)
router.get('/bank-details', verifyVendorToken, getMyBankDetails);
router.post('/bank-details', verifyVendorToken, addBankDetail);
router.put('/bank-details/:id', verifyVendorToken, updateBankDetail);
router.delete('/bank-details/:id', verifyVendorToken, deleteBankDetail);

// ============ VENDOR SERVICES MANAGEMENT ============

// Services CRUD (Protected)
router.get('/services', verifyVendorToken, getMyServices);
router.post('/services', verifyVendorToken, addService);
router.put('/services/:id', verifyVendorToken, updateService);
router.delete('/services/:id', verifyVendorToken, deleteService);

// ============ VENDOR DOCUMENTS MANAGEMENT ============

// Documents CRUD (Protected)
router.get('/documents', verifyVendorToken, getMyDocuments);
router.post('/documents', verifyVendorToken, singleDocumentUpload, addDocument);
router.put('/documents/:id', verifyVendorToken, singleDocumentUpload, updateDocument);
router.delete('/documents/:id', verifyVendorToken, deleteDocument);

// ============ VENDOR CONSULTATIONS MANAGEMENT ============

// Import consultation routes
import consultationRoutes from './vendorConsultationRoutes';
router.use('/', consultationRoutes);

export default router;