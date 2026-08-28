"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const VendorConsultationController_1 = require("../Controllers/VendorConsultationController");
const vendorAuth_1 = require("../middleware/vendorAuth");
const router = (0, express_1.Router)();
// ============ VENDOR CONSULTATION ROUTES (Protected) ============
// Consultations Management
router.post('/consultations', vendorAuth_1.verifyVendorToken, VendorConsultationController_1.createConsultation);
router.get('/consultations', vendorAuth_1.verifyVendorToken, VendorConsultationController_1.getMyConsultations);
router.put('/consultations/:id', vendorAuth_1.verifyVendorToken, VendorConsultationController_1.updateConsultation);
// Earnings Management
router.get('/earnings', vendorAuth_1.verifyVendorToken, VendorConsultationController_1.getMyEarnings);
// Reviews Management
router.get('/reviews', vendorAuth_1.verifyVendorToken, VendorConsultationController_1.getMyReviews);
// ============ PUBLIC REVIEW ROUTES ============
// Public review submission (using token)
router.get('/reviews/form/:token', VendorConsultationController_1.getReviewForm);
router.post('/reviews/submit/:token', VendorConsultationController_1.submitReview);
// ============ TEST ROUTES ============
// Test email functionality
router.post('/test-email', VendorConsultationController_1.testEmail);
exports.default = router;
//# sourceMappingURL=vendorConsultationRoutes.js.map