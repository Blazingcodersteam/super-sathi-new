"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController = require("../Controllers/UserController");
const forgotPasswordController = require("../Controllers/ForgotPasswordController");
const extendedProfileController = require("../Controllers/ExtendedProfileController");
const partnerPreferenceController = require("../Controllers/PartnerPreferenceController");
const LocationController_1 = require("../Controllers/LocationController");
const DashboardController_1 = require("../Controllers/DashboardController");
const AdminController_1 = require("../Controllers/AdminController");
const GoogleAnalyticsController_1 = require("../Controllers/GoogleAnalyticsController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Public routes
router.post("/send-email-otp", userController.sendEmailVerificationOTP);
router.post("/verify-email-otp", userController.verifyEmailOTP);
router.post("/create-profile", userController.createProfile);
router.get("/master-data", userController.getMasterData);
router.get("/subscription-restriction-status", userController.getSubscriptionRestrictionStatus);
router.get("/cities", LocationController_1.getAllCities);
router.get("/cities/state/:state_id", LocationController_1.getCitiesByState);
// Forgot Password routes
router.post("/forgot-password/send-otp", forgotPasswordController.sendOTP);
router.post("/forgot-password/verify-otp", forgotPasswordController.verifyOTP);
router.post("/forgot-password/reset-password", forgotPasswordController.resetPassword);
// Protected routes
router.get("/dashboard", auth_1.authenticateToken, DashboardController_1.getDashboard);
router.get("/profile", auth_1.authenticateToken, userController.getProfile);
router.put("/profile", auth_1.authenticateToken, userController.updateProfile);
// Name update with OTP verification
router.post("/name-update/send-otp", auth_1.authenticateToken, userController.sendNameUpdateOTP);
router.put("/name-update/verify-otp", auth_1.authenticateToken, userController.updateNameWithOTP);
// Extended Profile routes
router.get("/profile/complete", auth_1.authenticateToken, extendedProfileController.getCompleteProfile);
router.post("/profile/complete", auth_1.authenticateToken, userController.completeProfile);
router.put("/profile/basic", auth_1.authenticateToken, extendedProfileController.updateBasic);
router.put("/profile/about", auth_1.authenticateToken, extendedProfileController.updateAbout);
router.put("/profile/astro", auth_1.authenticateToken, extendedProfileController.updateAstro);
router.put("/profile/family", auth_1.authenticateToken, extendedProfileController.updateFamily);
router.put("/profile/career", auth_1.authenticateToken, extendedProfileController.updateCareer);
router.put("/profile/location", auth_1.authenticateToken, extendedProfileController.updateLocation);
router.put("/profile/hobbies", auth_1.authenticateToken, extendedProfileController.updateHobbies);
router.put("/profile/religious-info", auth_1.authenticateToken, userController.updateReligiousInfo);
router.put("/profile/government-id", auth_1.authenticateToken, userController.updateGovernmentId);
// Partner Preferences routes
router.get("/partner-preferences", auth_1.authenticateToken, partnerPreferenceController.getPartnerPreferences);
router.post("/partner-preferences", auth_1.authenticateToken, partnerPreferenceController.upsertPartnerPreferences);
router.put("/partner-preferences", auth_1.authenticateToken, partnerPreferenceController.upsertPartnerPreferences);
// Audio upload route
router.post("/upload-about-myself-audio", auth_1.authenticateToken, userController.uploadAboutMyselfAudio);
// Site Settings routes (public)
router.get("/site-settings", AdminController_1.getAllSiteSettings);
router.get("/site-settings/:id", AdminController_1.getSiteSettingById);
router.get("/site-settings/name/:name", AdminController_1.getSiteSettingByName);
// Google Analytics routes (public)
router.get("/google-analytics", GoogleAnalyticsController_1.GoogleAnalyticsController.getSettings);
router.get("/google-analytics/status", GoogleAnalyticsController_1.GoogleAnalyticsController.getStatus);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map