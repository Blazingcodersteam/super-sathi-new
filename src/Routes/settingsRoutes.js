"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settingsController = require("../Controllers/SettingsController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// All settings routes require authentication
router.use(auth_1.authenticateToken);
// Get all user settings
router.get("/", settingsController.getUserSettings);
// Update contact settings
router.put("/contact", settingsController.updateContactSettings);
// Update contact filter settings
router.put("/contact-filters", settingsController.updateContactFilterSettings);
// Update contact filter settings with IDs
router.put("/contact-filters-ids", settingsController.updateContactFilterSettingsWithIds);
// Update email SMS alert settings
router.put("/email-sms-alerts", settingsController.updateEmailSmsAlertSettings);
// Get messages
// Message templates and settings
router.get("/message-templates", settingsController.getMessageTemplates);
router.put("/message-settings", settingsController.updateMessageSettings);
// Update specific settings
router.put("/profile", settingsController.updateProfileSettings);
router.put("/privacy", settingsController.updatePrivacySettings);
router.put("/notifications", settingsController.updateNotificationSettings);
router.put("/account", settingsController.updateAccountSettings);
// Email update with OTP
router.post("/email-update/send-otp", settingsController.sendEmailUpdateOTP);
router.put("/email-update/verify-otp", settingsController.updateEmailWithOTP);
// Phone update with OTP
router.post("/phone-update/send-otp", settingsController.sendPhoneUpdateOTP);
router.put("/phone-update/verify-otp", settingsController.updatePhoneWithOTP);
// Privacy & Blocking
router.post("/block-user", settingsController.blockUser);
router.get("/blocked-users", settingsController.getBlockedUsers);
router.put("/photo-password", settingsController.updatePhotoPassword);
// Profile Management
router.get("/profile-completion", settingsController.getProfileCompletion);
// Specific privacy settings
router.put("/shortlist-setting", settingsController.updateShortlistSetting);
router.put("/do-not-disturb", settingsController.updateDoNotDisturbSetting);
router.put("/profile-privacy", settingsController.updateProfilePrivacySetting);
// Profile management
router.get("/hide-profile-durations", settingsController.getHideProfileDurations);
router.get("/hide-profile-status", settingsController.getHideProfileStatus);
router.put("/hide-profile", settingsController.hideProfile);
router.put("/unhide-profile", settingsController.unhideProfile);
router.delete("/delete-profile", settingsController.deleteProfile);
// Account management
router.put("/change-password", settingsController.changePassword);
router.put("/deactivate", settingsController.deactivateAccount);
router.delete("/delete-account", settingsController.deleteAccount);
// Individual privacy settings
router.put("/income-privacy", settingsController.updateIncomePrivacy);
router.put("/dob-privacy", settingsController.updateDobPrivacy);
router.put("/contact-filter-privacy", settingsController.updateContactFilterPrivacy);
router.put("/email-privacy", settingsController.updateEmailPrivacy);
router.put("/phone-privacy", settingsController.updatePhonePrivacy);
router.put("/photo-privacy", settingsController.updatePhotoPrivacy);
router.put("/display-name-privacy", settingsController.updateDisplayNamePrivacy);
exports.default = router;
//# sourceMappingURL=settingsRoutes.js.map