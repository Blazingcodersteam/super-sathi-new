"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer = require("multer");
const VendorAuthController_1 = require("../Controllers/VendorAuthController");
const VendorSubscriptionController_1 = require("../Controllers/VendorSubscriptionController");
const VendorRegistrationController_1 = require("../Controllers/VendorRegistrationController");
const VendorFreePlanController_1 = require("../Controllers/VendorFreePlanController");
const TestEmailController_1 = require("../Controllers/TestEmailController");
const VendorPaymentController_1 = require("../Controllers/VendorPaymentController");
const VendorSubscriptionManagementController_1 = require("../Controllers/VendorSubscriptionManagementController");
const UpgradePaymentVerificationController_1 = require("../Controllers/UpgradePaymentVerificationController");
const SubscriptionRenewalController_1 = require("../Controllers/SubscriptionRenewalController");
const InitiateUpgradeController_1 = require("../Controllers/InitiateUpgradeController");
const StateController_1 = require("../Controllers/StateController");
const vendorAuth_1 = require("../middleware/vendorAuth");
const router = (0, express_1.Router)();
// Simple test multer for debugging
const testUpload = multer({ storage: multer.memoryStorage() }).any();
// ============ VENDOR REGISTRATION FORM DATA ============
// Get all states for vendor registration
router.get('/states', StateController_1.getAllStates);
// Get state by ID
router.get('/states/:id', StateController_1.getStateById);
// Get states by country
router.get('/countries/:country_id/states', StateController_1.getStatesByCountry);
// Get cities by state
router.get('/states/:state_id/cities', StateController_1.getCitiesByState);
// Get complete vendor registration form data (states, categories, plans)
router.get('/registration/form-data', StateController_1.getVendorRegistrationFormData);
// ============ NEW VENDOR REGISTRATION FLOW ============
// Email testing endpoints (for debugging)
router.post('/test-email', TestEmailController_1.testVendorEmail);
router.get('/check-email-config', TestEmailController_1.checkEmailConfig);
// Register with FREE plan (no payment required)
router.post('/register/free', (req, res, next) => {
    (0, VendorAuthController_1.signupUploadFields)(req, res, (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({
                success: false,
                message: `File upload error: ${err.message}`
            });
        }
        next();
    });
}, VendorFreePlanController_1.registerVendorFreePlan);
// Step 1: Initiate registration with payment
router.post('/register/initiate', (req, res, next) => {
    console.log('Initiate registration - headers:', req.headers);
    console.log('Content-Type:', req.get('Content-Type'));
    (0, VendorAuthController_1.signupUploadFields)(req, res, (err) => {
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
}, VendorRegistrationController_1.initiateVendorRegistration);
// Get temp registration details
router.get('/register/temp/:temp_id', VendorRegistrationController_1.getTempRegistrationDetails);
// Cancel temp registration
router.delete('/register/temp/:temp_id', VendorRegistrationController_1.cancelTempRegistration);
// ============ VENDOR PAYMENT ROUTES ============
// Initiate payment for registration
router.post('/payment/initiate', VendorPaymentController_1.initiateVendorPayment);
// Verify Razorpay payment
router.post('/payment/razorpay/verify', VendorPaymentController_1.verifyVendorRazorpayPayment);
// CCAvenue callback routes
router.post('/payment/ccavenue/callback', VendorPaymentController_1.handleVendorCCAvenueCallback);
router.post('/payment/ccavenue/cancel', VendorPaymentController_1.handleVendorCCAvenueCancel);
// Get payment status
router.get('/payment/status/:temp_registration_id', VendorPaymentController_1.getVendorPaymentStatus);
// GST preview for vendor registration
router.get('/payment/gst-preview', VendorPaymentController_1.getVendorGSTPreview);
// ============ LEGACY VENDOR REGISTRATION (KEEP FOR ADMIN) ============
// ============ LEGACY VENDOR REGISTRATION (KEEP FOR ADMIN) ============
// Vendor Authentication (Public - but will be deprecated)
router.post('/signup', (req, res, next) => {
    console.log('DEPRECATED: Use /register/initiate for new registrations');
    console.log('Request headers:', req.headers);
    console.log('Content-Type:', req.get('Content-Type'));
    (0, VendorAuthController_1.signupUploadFields)(req, res, (err) => {
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
}, VendorAuthController_1.vendorSignup);
// Vendor Login (Public)
router.post('/login', VendorAuthController_1.vendorLogin);
// Get vendor categories for signup form (Public)
router.get('/categories', VendorAuthController_1.getVendorCategoriesPublic);
// Get vendor subscription plans (Public - no token required)
router.get('/subscription-plans', VendorSubscriptionController_1.getActiveVendorSubscriptionPlans);
router.get('/subscription-plans/:id', VendorSubscriptionController_1.getVendorSubscriptionPlanDetails);
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
router.get('/subscription/current', vendorAuth_1.verifyVendorToken, VendorSubscriptionManagementController_1.getCurrentSubscription);
router.get('/subscription/renewal-status', vendorAuth_1.verifyVendorToken, SubscriptionRenewalController_1.getRenewalStatus);
router.post('/subscription/upgrade', vendorAuth_1.verifyVendorToken, InitiateUpgradeController_1.initiateUpgrade);
router.post('/subscription/upgrade/verify', vendorAuth_1.verifyVendorToken, UpgradePaymentVerificationController_1.verifyUpgradePayment);
router.post('/subscription/renew', vendorAuth_1.verifyVendorToken, SubscriptionRenewalController_1.initiateAuthenticatedRenewal);
router.post('/subscription/renew/verify', vendorAuth_1.verifyVendorToken, SubscriptionRenewalController_1.verifyAuthenticatedRenewalPayment);
// CCAvenue Renewal Callbacks (No auth required - CCAvenue calls directly)
router.post('/payment/ccavenue/renewal/callback', SubscriptionRenewalController_1.handleCCAvenueRenewalCallback);
router.post('/payment/ccavenue/renewal/cancel', SubscriptionRenewalController_1.handleCCAvenueRenewalCancel);
// ============ VENDOR PROFILE MANAGEMENT ============
// Vendor Profile Management (Protected)
router.get('/profile', vendorAuth_1.verifyVendorToken, VendorAuthController_1.getVendorProfile);
router.put('/profile', vendorAuth_1.verifyVendorToken, VendorAuthController_1.singleUpload, VendorAuthController_1.updateVendorProfile);
// Change Password (Protected)
router.post('/change-password', vendorAuth_1.verifyVendorToken, VendorFreePlanController_1.changeVendorPassword);
// Vendor Menu Permissions (Protected)
router.get('/menus', vendorAuth_1.verifyVendorToken, VendorAuthController_1.getVendorMenuPermissions);
// ============ VENDOR BANK DETAILS MANAGEMENT ============
// Bank Details CRUD (Protected)
router.get('/bank-details', vendorAuth_1.verifyVendorToken, VendorAuthController_1.getMyBankDetails);
router.post('/bank-details', vendorAuth_1.verifyVendorToken, VendorAuthController_1.addBankDetail);
router.put('/bank-details/:id', vendorAuth_1.verifyVendorToken, VendorAuthController_1.updateBankDetail);
router.delete('/bank-details/:id', vendorAuth_1.verifyVendorToken, VendorAuthController_1.deleteBankDetail);
// ============ VENDOR SERVICES MANAGEMENT ============
// Services CRUD (Protected)
router.get('/services', vendorAuth_1.verifyVendorToken, VendorAuthController_1.getMyServices);
router.post('/services', vendorAuth_1.verifyVendorToken, VendorAuthController_1.addService);
router.put('/services/:id', vendorAuth_1.verifyVendorToken, VendorAuthController_1.updateService);
router.delete('/services/:id', vendorAuth_1.verifyVendorToken, VendorAuthController_1.deleteService);
// ============ VENDOR DOCUMENTS MANAGEMENT ============
// Documents CRUD (Protected)
router.get('/documents', vendorAuth_1.verifyVendorToken, VendorAuthController_1.getMyDocuments);
router.post('/documents', vendorAuth_1.verifyVendorToken, VendorAuthController_1.singleDocumentUpload, VendorAuthController_1.addDocument);
router.put('/documents/:id', vendorAuth_1.verifyVendorToken, VendorAuthController_1.singleDocumentUpload, VendorAuthController_1.updateDocument);
router.delete('/documents/:id', vendorAuth_1.verifyVendorToken, VendorAuthController_1.deleteDocument);
// ============ VENDOR CONSULTATIONS MANAGEMENT ============
// Import consultation routes
const vendorConsultationRoutes_1 = require("./vendorConsultationRoutes");
router.use('/', vendorConsultationRoutes_1.default);
exports.default = router;
//# sourceMappingURL=vendorRoutes.js.map