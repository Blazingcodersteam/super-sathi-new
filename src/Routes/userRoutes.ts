import { Router } from "express";
import * as userController from "../Controllers/UserController";
import * as forgotPasswordController from "../Controllers/ForgotPasswordController";
import * as extendedProfileController from "../Controllers/ExtendedProfileController";
import * as partnerPreferenceController from "../Controllers/PartnerPreferenceController";
import { getCitiesByState, getAllCities } from "../Controllers/LocationController";
import { getDashboard } from "../Controllers/DashboardController";
import { getAllSiteSettings, getSiteSettingById, getSiteSettingByName } from "../Controllers/AdminController";
import { GoogleAnalyticsController } from "../Controllers/GoogleAnalyticsController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Public routes
router.post("/send-email-otp", userController.sendEmailVerificationOTP);
router.post("/verify-email-otp", userController.verifyEmailOTP);
router.post("/create-profile", userController.createProfile);
router.get("/master-data", userController.getMasterData);
router.get("/subscription-restriction-status", userController.getSubscriptionRestrictionStatus);
router.get("/cities", getAllCities);
router.get("/cities/state/:state_id", getCitiesByState);



// Forgot Password routes
router.post("/forgot-password/send-otp", forgotPasswordController.sendOTP);
router.post("/forgot-password/verify-otp", forgotPasswordController.verifyOTP);
router.post("/forgot-password/reset-password", forgotPasswordController.resetPassword);

// Protected routes
router.get("/dashboard", authenticateToken, getDashboard);
router.get("/profile", authenticateToken, userController.getProfile);
router.put("/profile", authenticateToken, userController.updateProfile);

// Name update with OTP verification
router.post("/name-update/send-otp", authenticateToken, userController.sendNameUpdateOTP);
router.put("/name-update/verify-otp", authenticateToken, userController.updateNameWithOTP);

// Extended Profile routes
router.get("/profile/complete", authenticateToken, extendedProfileController.getCompleteProfile);
router.post("/profile/complete", authenticateToken, userController.completeProfile);
router.put("/profile/basic", authenticateToken, extendedProfileController.updateBasic);
router.put("/profile/about", authenticateToken, extendedProfileController.updateAbout);
router.put("/profile/astro", authenticateToken, extendedProfileController.updateAstro);
router.put("/profile/family", authenticateToken, extendedProfileController.updateFamily);
router.put("/profile/career", authenticateToken, extendedProfileController.updateCareer);
router.put("/profile/location", authenticateToken, extendedProfileController.updateLocation);
router.put("/profile/hobbies", authenticateToken, extendedProfileController.updateHobbies);
router.put("/profile/religious-info", authenticateToken, userController.updateReligiousInfo);
router.put("/profile/government-id", authenticateToken, userController.updateGovernmentId);

// Partner Preferences routes
router.get("/partner-preferences", authenticateToken, partnerPreferenceController.getPartnerPreferences);
router.post("/partner-preferences", authenticateToken, partnerPreferenceController.upsertPartnerPreferences);
router.put("/partner-preferences", authenticateToken, partnerPreferenceController.upsertPartnerPreferences);

// Audio upload route
router.post("/upload-about-myself-audio", authenticateToken, userController.uploadAboutMyselfAudio);

// Site Settings routes (public)
router.get("/site-settings", getAllSiteSettings);
router.get("/site-settings/:id", getSiteSettingById);
router.get("/site-settings/name/:name", getSiteSettingByName);

// Google Analytics routes (public)
router.get("/google-analytics", GoogleAnalyticsController.getSettings);
router.get("/google-analytics/status", GoogleAnalyticsController.getStatus);

export default router;