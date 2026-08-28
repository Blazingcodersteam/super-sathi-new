"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const utils = require("util");
const AdminController_1 = require("../Controllers/AdminController");
const verifyNonUser_1 = require("../middleware/verifyNonUser");
const AdminMasterController_1 = require("../Controllers/AdminMasterController");
const GSTConfigController_1 = require("../Controllers/GSTConfigController");
const GSTTypeMasterController_1 = require("../Controllers/GSTTypeMasterController");
const StateGSTController_1 = require("../Controllers/StateGSTController");
const contactController = require("../Controllers/ContactController");
const AdminVendorConsultationController_1 = require("../Controllers/AdminVendorConsultationController");
const RoleManagementController_1 = require("../Controllers/RoleManagementController");
const StaffController_1 = require("../Controllers/StaffController");
const TranslationController_1 = require("../Controllers/TranslationController");
const EmailTemplateController_1 = require("../Controllers/EmailTemplateController");
const googleAnalyticsRoutes_1 = require("./googleAnalyticsRoutes");
// import { getRevenueReport } from "../Controllers/RevenueReportController";
const VendorController_1 = require("../Controllers/VendorController");
const VendorSubscriptionController_1 = require("../Controllers/VendorSubscriptionController");
const VendorCompletionController_1 = require("../Controllers/VendorCompletionController");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
// Configure multer for CEO image uploads
const ceoImageStorage = multer.memoryStorage();
const uploadCEOImage = multer({
    storage: ceoImageStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});
// Configure multer for site logo uploads
const siteLogoStorage = multer.memoryStorage();
const uploadSiteLogo = multer({
    storage: siteLogoStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only PNG, JPG, and JPEG images are allowed!'), false);
        }
    }
});
// Configure multer for user photo uploads (Admin)
const userPhotoStorage = multer.memoryStorage();
const uploadUserPhoto = multer({
    storage: userPhotoStorage,
    limits: {
        fileSize: 15 * 1024 * 1024 // 15MB limit
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed!'), false);
        }
    }
});
// Configure multer for success story photo uploads
const successStoryPhotoStorage = multer.memoryStorage();
const uploadSuccessStoryPhotoMulter = multer({
    storage: successStoryPhotoStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only JPG, JPEG, PNG, and WEBP images are allowed!'), false);
        }
    }
});
// Configure multer for vendor document uploads
const uploadVendorFiles = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
            'application/pdf'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only JPG, PNG, WEBP images and PDF files are allowed!'), false);
        }
    }
});
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const router = express.Router();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET_KEY;
// Admin authentication middleware
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
        return res.status(403).json({ message: "No token provided" });
    }
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Invalid token", error: err.message });
        }
        if (decoded.user_type !== "admin" && decoded.user_type !== "staff") {
            return res.status(403).json({ message: "Admin access required" });
        }
        req.admin = decoded;
        next();
    });
};
// Admin login
router.post("/login", AdminController_1.adminLogin);
// Admin Dashboard
router.get("/dashboard", verifyNonUser_1.verifyNonUser, AdminController_1.getAdminDashboard);
// User management routes (protected)
router.get("/users", verifyAdmin, AdminController_1.getAllUsers);
router.get("/users/full-report", verifyAdmin, AdminController_1.getAllUsersFullReport);
router.get("/user-reports", verifyAdmin, AdminController_1.getUserReports);
router.get("/users/:id", verifyAdmin, AdminController_1.getUserById);
router.post("/users", verifyAdmin, AdminController_1.createUser);
router.post("/users/complete-profile", verifyAdmin, AdminController_1.createCompleteUserProfile);
router.put("/users/:id", verifyAdmin, AdminController_1.updateUser);
router.put("/users/:id/status", verifyAdmin, AdminController_1.updateUserStatus);
router.delete("/users/:id", verifyAdmin, AdminController_1.deleteUser);
// User profile update routes (protected)
router.put("/users/:id/profile", verifyAdmin, AdminController_1.updateUserProfile);
router.put("/users/:id/profile/complete", verifyAdmin, AdminController_1.updateCompleteUserProfile);
router.put("/users/:id/profile/basic", verifyAdmin, AdminController_1.updateUserBasic);
router.put("/users/:id/profile/about", verifyAdmin, AdminController_1.updateUserAbout);
router.put("/users/:id/profile/astro", verifyAdmin, AdminController_1.updateUserAstro);
router.put("/users/:id/profile/family", verifyAdmin, AdminController_1.updateUserFamily);
router.put("/users/:id/profile/career", verifyAdmin, AdminController_1.updateUserCareer);
router.put("/users/:id/profile/location", verifyAdmin, AdminController_1.updateUserLocation);
router.put("/users/:id/profile/hobbies", verifyAdmin, AdminController_1.updateUserHobbies);
router.put("/users/:id/religious-info", verifyAdmin, AdminController_1.updateUserReligiousInfo);
router.put("/users/:id/government-id", verifyAdmin, AdminController_1.updateUserGovernmentId);
// User photo management routes (Admin)
router.post("/users/:id/photos/upload", verifyAdmin, uploadUserPhoto.single('photo'), AdminController_1.adminUploadUserPhoto);
router.post("/users/:id/photos/upload-multiple", verifyAdmin, uploadUserPhoto.array('photos', 20), AdminController_1.adminUploadMultipleUserPhotos);
router.get("/users/:id/photos", verifyAdmin, AdminController_1.adminGetUserPhotos);
router.delete("/users/:id/photos/:photoId", verifyAdmin, AdminController_1.adminDeleteUserPhoto);
router.put("/users/:id/photos/:photoId/primary", verifyAdmin, AdminController_1.adminSetUserPrimaryPhoto);
// Master table routes
// Caste Master
router.get("/caste", verifyAdmin, AdminMasterController_1.casteMaster.getAll);
router.get("/caste/:id", verifyAdmin, AdminMasterController_1.casteMaster.getById);
router.post("/caste", verifyAdmin, AdminMasterController_1.casteMaster.create);
router.put("/caste/:id", verifyAdmin, AdminMasterController_1.casteMaster.update);
router.delete("/caste/:id", verifyAdmin, AdminMasterController_1.casteMaster.delete);
// Community Master
router.get("/community", verifyAdmin, AdminMasterController_1.communityMaster.getAll);
router.get("/community/:id", verifyAdmin, AdminMasterController_1.communityMaster.getById);
router.post("/community", verifyAdmin, AdminMasterController_1.communityMaster.create);
router.put("/community/:id", verifyAdmin, AdminMasterController_1.communityMaster.update);
router.delete("/community/:id", verifyAdmin, AdminMasterController_1.communityMaster.delete);
// Country Master
router.get("/country", verifyAdmin, AdminMasterController_1.countryMaster.getAll);
router.get("/country/:id", verifyAdmin, AdminMasterController_1.countryMaster.getById);
router.post("/country", verifyAdmin, AdminMasterController_1.countryMaster.create);
router.put("/country/:id", verifyAdmin, AdminMasterController_1.countryMaster.update);
router.delete("/country/:id", verifyAdmin, AdminMasterController_1.countryMaster.delete);
// Country Code Master
router.get("/country-code", verifyAdmin, AdminMasterController_1.countryCodeMaster.getAll);
router.get("/country-code/:id", verifyAdmin, AdminMasterController_1.countryCodeMaster.getById);
router.post("/country-code", verifyAdmin, AdminMasterController_1.countryCodeMaster.create);
router.put("/country-code/:id", verifyAdmin, AdminMasterController_1.countryCodeMaster.update);
router.delete("/country-code/:id", verifyAdmin, AdminMasterController_1.countryCodeMaster.delete);
// Currency Master
router.get("/currency", verifyAdmin, AdminMasterController_1.currencyMaster.getAll);
router.get("/currency/:id", verifyAdmin, AdminMasterController_1.currencyMaster.getById);
router.post("/currency", verifyAdmin, AdminMasterController_1.currencyMaster.create);
router.put("/currency/:id", verifyAdmin, AdminMasterController_1.currencyMaster.update);
router.delete("/currency/:id", verifyAdmin, AdminMasterController_1.currencyMaster.delete);
// Education Level Master
router.get("/education-level", verifyAdmin, AdminMasterController_1.educationLevelMaster.getAll);
router.get("/education-level/:id", verifyAdmin, AdminMasterController_1.educationLevelMaster.getById);
router.post("/education-level", verifyAdmin, AdminMasterController_1.educationLevelMaster.create);
router.put("/education-level/:id", verifyAdmin, AdminMasterController_1.educationLevelMaster.update);
router.delete("/education-level/:id", verifyAdmin, AdminMasterController_1.educationLevelMaster.delete);
// Family Status Master
router.get("/family-status", verifyAdmin, AdminMasterController_1.familyStatusMaster.getAll);
router.get("/family-status/:id", verifyAdmin, AdminMasterController_1.familyStatusMaster.getById);
router.post("/family-status", verifyAdmin, AdminMasterController_1.familyStatusMaster.create);
router.put("/family-status/:id", verifyAdmin, AdminMasterController_1.familyStatusMaster.update);
router.delete("/family-status/:id", verifyAdmin, AdminMasterController_1.familyStatusMaster.delete);
// Family Type Master
router.get("/family-type", verifyAdmin, AdminMasterController_1.familyTypeMaster.getAll);
router.get("/family-type/:id", verifyAdmin, AdminMasterController_1.familyTypeMaster.getById);
router.post("/family-type", verifyAdmin, AdminMasterController_1.familyTypeMaster.create);
router.put("/family-type/:id", verifyAdmin, AdminMasterController_1.familyTypeMaster.update);
router.delete("/family-type/:id", verifyAdmin, AdminMasterController_1.familyTypeMaster.delete);
// Family Values Master
router.get("/family-values", verifyAdmin, AdminMasterController_1.familyValuesMaster.getAll);
router.get("/family-values/:id", verifyAdmin, AdminMasterController_1.familyValuesMaster.getById);
router.post("/family-values", verifyAdmin, AdminMasterController_1.familyValuesMaster.create);
router.put("/family-values/:id", verifyAdmin, AdminMasterController_1.familyValuesMaster.update);
router.delete("/family-values/:id", verifyAdmin, AdminMasterController_1.familyValuesMaster.delete);
// Family Financial Status Master
router.get("/family-financial-status", verifyAdmin, AdminMasterController_1.familyFinancialStatusMaster.getAll);
router.get("/family-financial-status/:id", verifyAdmin, AdminMasterController_1.familyFinancialStatusMaster.getById);
router.post("/family-financial-status", verifyAdmin, AdminMasterController_1.familyFinancialStatusMaster.create);
router.put("/family-financial-status/:id", verifyAdmin, AdminMasterController_1.familyFinancialStatusMaster.update);
router.delete("/family-financial-status/:id", verifyAdmin, AdminMasterController_1.familyFinancialStatusMaster.delete);
// Gender Master
router.get("/gender", verifyAdmin, AdminMasterController_1.genderMaster.getAll);
router.get("/gender/:id", verifyAdmin, AdminMasterController_1.genderMaster.getById);
router.post("/gender", verifyAdmin, AdminMasterController_1.genderMaster.create);
router.put("/gender/:id", verifyAdmin, AdminMasterController_1.genderMaster.update);
router.delete("/gender/:id", verifyAdmin, AdminMasterController_1.genderMaster.delete);
// General Status Master
router.get("/general-status", verifyAdmin, AdminMasterController_1.generalStatusMaster.getAll);
router.get("/general-status/:id", verifyAdmin, AdminMasterController_1.generalStatusMaster.getById);
router.post("/general-status", verifyAdmin, AdminMasterController_1.generalStatusMaster.create);
router.put("/general-status/:id", verifyAdmin, AdminMasterController_1.generalStatusMaster.update);
router.delete("/general-status/:id", verifyAdmin, AdminMasterController_1.generalStatusMaster.delete);
// Subscription Plans - New CRUD
router.get("/subscription-plans", verifyAdmin, AdminController_1.subscriptionPlansCRUD.getAll);
router.get("/subscription-plans/:id", verifyAdmin, AdminController_1.subscriptionPlansCRUD.getById);
router.post("/subscription-plans", verifyAdmin, AdminController_1.subscriptionPlansCRUD.create);
router.put("/subscription-plans/:id", verifyAdmin, AdminController_1.subscriptionPlansCRUD.update);
router.delete("/subscription-plans/:id", verifyAdmin, AdminController_1.subscriptionPlansCRUD.delete);
// Subscription Plan Features - New CRUD
router.get("/subscription-plan-features", verifyAdmin, AdminController_1.subscriptionPlanFeaturesCRUD.getAll);
router.get("/subscription-plan-features/:id", verifyAdmin, AdminController_1.subscriptionPlanFeaturesCRUD.getById);
router.post("/subscription-plan-features", verifyAdmin, AdminController_1.subscriptionPlanFeaturesCRUD.create);
router.put("/subscription-plan-features/:id", verifyAdmin, AdminController_1.subscriptionPlanFeaturesCRUD.update);
router.delete("/subscription-plan-features/:id", verifyAdmin, AdminController_1.subscriptionPlanFeaturesCRUD.delete);
// Subscription Status Master
router.get("/subscription-status", verifyAdmin, AdminMasterController_1.subscriptionStatusMaster.getAll);
router.get("/subscription-status/:id", verifyAdmin, AdminMasterController_1.subscriptionStatusMaster.getById);
router.post("/subscription-status", verifyAdmin, AdminMasterController_1.subscriptionStatusMaster.create);
router.put("/subscription-status/:id", verifyAdmin, AdminMasterController_1.subscriptionStatusMaster.update);
router.delete("/subscription-status/:id", verifyAdmin, AdminMasterController_1.subscriptionStatusMaster.delete);
// Website Content Management
router.get("/content", verifyAdmin, AdminController_1.getWebsiteContent);
router.get("/content/:field_name", verifyAdmin, AdminController_1.getContentField);
router.put("/content", verifyAdmin, AdminController_1.updateWebsiteContent);
router.put("/content/field/:field_name", verifyAdmin, AdminController_1.updateContentField);
router.put("/content/homepage-banner", verifyAdmin, AdminController_1.updateHomepageBanner);
router.post("/content/upload-ceo-image", verifyAdmin, uploadCEOImage.single('ceo_image'), AdminController_1.uploadCEOImageFile);
// ============ CONTENT UPDATE ROUTES (ALL ROLES EXCEPT USERS) ============
// Content Update Routes - Allow all roles except users
router.put("/privacy-policy", verifyNonUser_1.verifyNonUser, (req, res) => {
    req.params.field_name = 'privacy_policy';
    req.body = { content: req.body.content || req.body.privacy_policy };
    (0, AdminController_1.updateContentField)(req, res);
});
router.put("/terms-conditions", verifyNonUser_1.verifyNonUser, (req, res) => {
    req.params.field_name = 'terms_conditions';
    req.body = { content: req.body.content || req.body.terms_conditions };
    (0, AdminController_1.updateContentField)(req, res);
});
router.put("/refund-policy", verifyNonUser_1.verifyNonUser, (req, res) => {
    req.params.field_name = 'refund_policy';
    req.body = { content: req.body.content || req.body.refund_policy };
    (0, AdminController_1.updateContentField)(req, res);
});
router.put("/safe-policy", verifyNonUser_1.verifyNonUser, (req, res) => {
    req.params.field_name = 'safe_policy';
    req.body = { content: req.body.content || req.body.safe_policy };
    (0, AdminController_1.updateContentField)(req, res);
});
router.put("/be-safe-online", verifyNonUser_1.verifyNonUser, (req, res) => {
    req.params.field_name = 'be_safe_online';
    req.body = { content: req.body.content || req.body.be_safe_online };
    (0, AdminController_1.updateContentField)(req, res);
});
router.put("/title", verifyNonUser_1.verifyNonUser, (req, res) => {
    req.params.field_name = 'title';
    req.body = { content: req.body.content || req.body.title };
    (0, AdminController_1.updateContentField)(req, res);
});
router.put("/subtitle", verifyNonUser_1.verifyNonUser, (req, res) => {
    req.params.field_name = 'subtitle';
    req.body = { content: req.body.content || req.body.subtitle };
    (0, AdminController_1.updateContentField)(req, res);
});
router.put("/description", verifyNonUser_1.verifyNonUser, (req, res) => {
    req.params.field_name = 'description';
    req.body = { content: req.body.content || req.body.description };
    (0, AdminController_1.updateContentField)(req, res);
});
router.put("/ceo-content", verifyNonUser_1.verifyNonUser, (req, res) => {
    req.params.field_name = 'ceo_content';
    req.body = { content: req.body.content || req.body.ceo_content };
    (0, AdminController_1.updateContentField)(req, res);
});
router.post("/homepage-banner", verifyNonUser_1.verifyNonUser, uploadCEOImage.array('bannerImages', 10), (req, res) => {
    req.body = { images: req.body.images || req.files };
    (0, AdminController_1.updateHomepageBanner)(req, res);
});
router.post("/ceo-image", verifyNonUser_1.verifyNonUser, uploadCEOImage.single('ceoImage'), AdminController_1.uploadCEOImageFile);
// GST Management (Refactored System)
// Uses gst_type_master and states_gst_mapping tables
router.get("/gst-config", verifyAdmin, GSTConfigController_1.getGSTConfig);
router.put("/gst-config", verifyAdmin, GSTConfigController_1.updateGSTConfig);
router.get("/gst-state-mapping", verifyAdmin, GSTConfigController_1.getStateGSTMapping);
router.put("/gst-state-mapping", verifyAdmin, GSTConfigController_1.updateStateGSTMapping);
router.put("/gst-state-mapping/bulk", verifyAdmin, GSTConfigController_1.bulkUpdateStateGSTMapping);
// State GST Management (New Enhanced System)
// Complete state GST configuration management
router.get("/states-gst", verifyAdmin, StateGSTController_1.getAllStatesWithGST);
router.get("/states-gst/:state_id", verifyAdmin, StateGSTController_1.getStateGSTConfig);
router.put("/states-gst/:state_id", verifyAdmin, StateGSTController_1.createOrUpdateStateGST);
router.put("/states-gst/bulk", verifyAdmin, StateGSTController_1.bulkCreateOrUpdateStatesGST);
router.delete("/states-gst/:state_id", verifyAdmin, StateGSTController_1.deleteStateGSTConfig);
router.get("/states-gst/:state_id/debug", verifyAdmin, StateGSTController_1.debugStateGSTMappings);
// GST Type Master CRUD
router.get("/gst-type", verifyNonUser_1.verifyNonUser, GSTTypeMasterController_1.gstTypeMaster.getAll);
router.get("/gst-type/:id", verifyNonUser_1.verifyNonUser, GSTTypeMasterController_1.gstTypeMaster.getById);
router.post("/gst-type", verifyNonUser_1.verifyNonUser, GSTTypeMasterController_1.gstTypeMaster.create);
router.put("/gst-type/:id", verifyNonUser_1.verifyNonUser, GSTTypeMasterController_1.gstTypeMaster.update);
router.delete("/gst-type/:id", verifyNonUser_1.verifyNonUser, GSTTypeMasterController_1.gstTypeMaster.delete);
// Religion Master
router.get("/religion", verifyAdmin, AdminMasterController_1.religionMaster.getAll);
router.get("/religion/:id", verifyAdmin, AdminMasterController_1.religionMaster.getById);
router.post("/religion", verifyAdmin, AdminMasterController_1.religionMaster.create);
router.put("/religion/:id", verifyAdmin, AdminMasterController_1.religionMaster.update);
router.delete("/religion/:id", verifyAdmin, AdminMasterController_1.religionMaster.delete);
// Marital Status Master
router.get("/marital-status", verifyAdmin, AdminMasterController_1.maritalStatusMaster.getAll);
router.get("/marital-status/:id", verifyAdmin, AdminMasterController_1.maritalStatusMaster.getById);
router.post("/marital-status", verifyAdmin, AdminMasterController_1.maritalStatusMaster.create);
router.put("/marital-status/:id", verifyAdmin, AdminMasterController_1.maritalStatusMaster.update);
router.delete("/marital-status/:id", verifyAdmin, AdminMasterController_1.maritalStatusMaster.delete);
// Blood Group Master
router.get("/blood-group", verifyAdmin, AdminMasterController_1.bloodGroupMaster.getAll);
router.get("/blood-group/:id", verifyAdmin, AdminMasterController_1.bloodGroupMaster.getById);
router.post("/blood-group", verifyAdmin, AdminMasterController_1.bloodGroupMaster.create);
router.put("/blood-group/:id", verifyAdmin, AdminMasterController_1.bloodGroupMaster.update);
router.delete("/blood-group/:id", verifyAdmin, AdminMasterController_1.bloodGroupMaster.delete);
// Diet Master
router.get("/diet", verifyAdmin, AdminMasterController_1.dietMaster.getAll);
router.get("/diet/:id", verifyAdmin, AdminMasterController_1.dietMaster.getById);
router.post("/diet", verifyAdmin, AdminMasterController_1.dietMaster.create);
router.put("/diet/:id", verifyAdmin, AdminMasterController_1.dietMaster.update);
router.delete("/diet/:id", verifyAdmin, AdminMasterController_1.dietMaster.delete);
// Disability Master
router.get("/disability", verifyAdmin, AdminMasterController_1.disabilityMaster.getAll);
router.get("/disability/:id", verifyAdmin, AdminMasterController_1.disabilityMaster.getById);
router.post("/disability", verifyAdmin, AdminMasterController_1.disabilityMaster.create);
router.put("/disability/:id", verifyAdmin, AdminMasterController_1.disabilityMaster.update);
router.delete("/disability/:id", verifyAdmin, AdminMasterController_1.disabilityMaster.delete);
// Health Info Master
router.get("/health-info", verifyAdmin, AdminMasterController_1.healthInfoMaster.getAll);
router.get("/health-info/:id", verifyAdmin, AdminMasterController_1.healthInfoMaster.getById);
router.post("/health-info", verifyAdmin, AdminMasterController_1.healthInfoMaster.create);
router.put("/health-info/:id", verifyAdmin, AdminMasterController_1.healthInfoMaster.update);
router.delete("/health-info/:id", verifyAdmin, AdminMasterController_1.healthInfoMaster.delete);
// Gothra Master
router.get("/gothra", verifyAdmin, AdminMasterController_1.gothraMaster.getAll);
router.get("/gothra/:id", verifyAdmin, AdminMasterController_1.gothraMaster.getById);
router.post("/gothra", verifyAdmin, AdminMasterController_1.gothraMaster.create);
router.put("/gothra/:id", verifyAdmin, AdminMasterController_1.gothraMaster.update);
router.delete("/gothra/:id", verifyAdmin, AdminMasterController_1.gothraMaster.delete);
// Rasi Master
router.get("/rasi", verifyAdmin, AdminMasterController_1.rasiMaster.getAll);
router.get("/rasi/:id", verifyAdmin, AdminMasterController_1.rasiMaster.getById);
router.post("/rasi", verifyAdmin, AdminMasterController_1.rasiMaster.create);
router.put("/rasi/:id", verifyAdmin, AdminMasterController_1.rasiMaster.update);
router.delete("/rasi/:id", verifyAdmin, AdminMasterController_1.rasiMaster.delete);
// Nakshatra Master
router.get("/nakshatra", verifyAdmin, AdminMasterController_1.nakshatraMaster.getAll);
router.get("/nakshatra/:id", verifyAdmin, AdminMasterController_1.nakshatraMaster.getById);
router.post("/nakshatra", verifyAdmin, AdminMasterController_1.nakshatraMaster.create);
router.put("/nakshatra/:id", verifyAdmin, AdminMasterController_1.nakshatraMaster.update);
router.delete("/nakshatra/:id", verifyAdmin, AdminMasterController_1.nakshatraMaster.delete);
// Mother Tongue Master
router.get("/mother-tongue", verifyAdmin, AdminMasterController_1.motherTongueMaster.getAll);
router.get("/mother-tongue/:id", verifyAdmin, AdminMasterController_1.motherTongueMaster.getById);
router.post("/mother-tongue", verifyAdmin, AdminMasterController_1.motherTongueMaster.create);
router.put("/mother-tongue/:id", verifyAdmin, AdminMasterController_1.motherTongueMaster.update);
router.delete("/mother-tongue/:id", verifyAdmin, AdminMasterController_1.motherTongueMaster.delete);
// Profession Master
router.get("/profession", verifyAdmin, AdminMasterController_1.professionMaster.getAll);
router.get("/profession/:id", verifyAdmin, AdminMasterController_1.professionMaster.getById);
router.post("/profession", verifyAdmin, AdminMasterController_1.professionMaster.create);
router.put("/profession/:id", verifyAdmin, AdminMasterController_1.professionMaster.update);
router.delete("/profession/:id", verifyAdmin, AdminMasterController_1.professionMaster.delete);
// Working With Master
router.get("/working-with", verifyAdmin, AdminMasterController_1.workingWithMaster.getAll);
router.get("/working-with/:id", verifyAdmin, AdminMasterController_1.workingWithMaster.getById);
router.post("/working-with", verifyAdmin, AdminMasterController_1.workingWithMaster.create);
router.put("/working-with/:id", verifyAdmin, AdminMasterController_1.workingWithMaster.update);
router.delete("/working-with/:id", verifyAdmin, AdminMasterController_1.workingWithMaster.delete);
// Parent Occupation Master
router.get("/parent-occupation", verifyAdmin, AdminMasterController_1.parentOccupationMaster.getAll);
router.get("/parent-occupation/:id", verifyAdmin, AdminMasterController_1.parentOccupationMaster.getById);
router.post("/parent-occupation", verifyAdmin, AdminMasterController_1.parentOccupationMaster.create);
router.put("/parent-occupation/:id", verifyAdmin, AdminMasterController_1.parentOccupationMaster.update);
router.delete("/parent-occupation/:id", verifyAdmin, AdminMasterController_1.parentOccupationMaster.delete);
// Profile Managed By Master
router.get("/profile-managed-by", verifyAdmin, AdminMasterController_1.profileManagedByMaster.getAll);
router.get("/profile-managed-by/:id", verifyAdmin, AdminMasterController_1.profileManagedByMaster.getById);
router.post("/profile-managed-by", verifyAdmin, AdminMasterController_1.profileManagedByMaster.create);
router.put("/profile-managed-by/:id", verifyAdmin, AdminMasterController_1.profileManagedByMaster.update);
router.delete("/profile-managed-by/:id", verifyAdmin, AdminMasterController_1.profileManagedByMaster.delete);
// Ethnic Origin Master
router.get("/ethnic-origin", verifyAdmin, AdminMasterController_1.ethnicOriginMaster.getAll);
router.get("/ethnic-origin/:id", verifyAdmin, AdminMasterController_1.ethnicOriginMaster.getById);
router.post("/ethnic-origin", verifyAdmin, AdminMasterController_1.ethnicOriginMaster.create);
router.put("/ethnic-origin/:id", verifyAdmin, AdminMasterController_1.ethnicOriginMaster.update);
router.delete("/ethnic-origin/:id", verifyAdmin, AdminMasterController_1.ethnicOriginMaster.delete);
// Hobbies Master
router.get("/hobbies", verifyAdmin, AdminMasterController_1.hobbiesMaster.getAll);
router.get("/hobbies/:id", verifyAdmin, AdminMasterController_1.hobbiesMaster.getById);
router.post("/hobbies", verifyAdmin, AdminMasterController_1.hobbiesMaster.create);
router.put("/hobbies/:id", verifyAdmin, AdminMasterController_1.hobbiesMaster.update);
router.delete("/hobbies/:id", verifyAdmin, AdminMasterController_1.hobbiesMaster.delete);
// States Master
router.get("/states", verifyAdmin, AdminMasterController_1.statesMaster.getAll);
router.get("/states/:id", verifyAdmin, AdminMasterController_1.statesMaster.getById);
router.post("/states", verifyAdmin, AdminMasterController_1.statesMaster.create);
router.put("/states/:id", verifyAdmin, AdminMasterController_1.statesMaster.update);
router.delete("/states/:id", verifyAdmin, AdminMasterController_1.statesMaster.delete);
// Cities Master
router.get("/cities", verifyAdmin, AdminMasterController_1.citiesMaster.getAll);
router.get("/cities/:id", verifyAdmin, AdminMasterController_1.citiesMaster.getById);
router.post("/cities", verifyAdmin, AdminMasterController_1.citiesMaster.create);
router.put("/cities/:id", verifyAdmin, AdminMasterController_1.citiesMaster.update);
router.delete("/cities/:id", verifyAdmin, AdminMasterController_1.citiesMaster.delete);
// Drinking Master
router.get("/drinking", verifyAdmin, AdminMasterController_1.drinkingMaster.getAll);
router.get("/drinking/:id", verifyAdmin, AdminMasterController_1.drinkingMaster.getById);
router.post("/drinking", verifyAdmin, AdminMasterController_1.drinkingMaster.create);
router.put("/drinking/:id", verifyAdmin, AdminMasterController_1.drinkingMaster.update);
router.delete("/drinking/:id", verifyAdmin, AdminMasterController_1.drinkingMaster.delete);
// Smoking Master
router.get("/smoking", verifyAdmin, AdminMasterController_1.smokingMaster.getAll);
router.get("/smoking/:id", verifyAdmin, AdminMasterController_1.smokingMaster.getById);
router.post("/smoking", verifyAdmin, AdminMasterController_1.smokingMaster.create);
router.put("/smoking/:id", verifyAdmin, AdminMasterController_1.smokingMaster.update);
router.delete("/smoking/:id", verifyAdmin, AdminMasterController_1.smokingMaster.delete);
// Education Area Master
router.get("/education-area", verifyAdmin, AdminMasterController_1.educationAreaMaster.getAll);
router.get("/education-area/:id", verifyAdmin, AdminMasterController_1.educationAreaMaster.getById);
router.post("/education-area", verifyAdmin, AdminMasterController_1.educationAreaMaster.create);
router.put("/education-area/:id", verifyAdmin, AdminMasterController_1.educationAreaMaster.update);
router.delete("/education-area/:id", verifyAdmin, AdminMasterController_1.educationAreaMaster.delete);
// Subscription Features Master - New CRUD
router.get("/subscription-features", verifyAdmin, AdminController_1.subscriptionFeaturesMasterCRUD.getAll);
router.get("/subscription-features/:id", verifyAdmin, AdminController_1.subscriptionFeaturesMasterCRUD.getById);
router.post("/subscription-features", verifyAdmin, AdminController_1.subscriptionFeaturesMasterCRUD.create);
router.put("/subscription-features/:id", verifyAdmin, AdminController_1.subscriptionFeaturesMasterCRUD.update);
router.delete("/subscription-features/:id", verifyAdmin, AdminController_1.subscriptionFeaturesMasterCRUD.delete);
// Subscription Addons Master - New CRUD
router.get("/subscription-addons", verifyAdmin, AdminController_1.subscriptionAddonsMasterCRUD.getAll);
router.get("/subscription-addons/:id", verifyAdmin, AdminController_1.subscriptionAddonsMasterCRUD.getById);
router.post("/subscription-addons", verifyAdmin, AdminController_1.subscriptionAddonsMasterCRUD.create);
router.put("/subscription-addons/:id", verifyAdmin, AdminController_1.subscriptionAddonsMasterCRUD.update);
router.delete("/subscription-addons/:id", verifyAdmin, AdminController_1.subscriptionAddonsMasterCRUD.delete);
// Government ID Type Master
router.get("/government-id-type", verifyAdmin, AdminMasterController_1.governmentIdTypeMaster.getAll);
router.get("/government-id-type/:id", verifyAdmin, AdminMasterController_1.governmentIdTypeMaster.getById);
router.post("/government-id-type", verifyAdmin, AdminMasterController_1.governmentIdTypeMaster.create);
router.put("/government-id-type/:id", verifyAdmin, AdminMasterController_1.governmentIdTypeMaster.update);
router.delete("/government-id-type/:id", verifyAdmin, AdminMasterController_1.governmentIdTypeMaster.delete);
// Action Types Master
router.get("/action-types", verifyAdmin, AdminMasterController_1.actionTypesMaster.getAll);
router.get("/action-types/:id", verifyAdmin, AdminMasterController_1.actionTypesMaster.getById);
router.post("/action-types", verifyAdmin, AdminMasterController_1.actionTypesMaster.create);
router.put("/action-types/:id", verifyAdmin, AdminMasterController_1.actionTypesMaster.update);
router.delete("/action-types/:id", verifyAdmin, AdminMasterController_1.actionTypesMaster.delete);
// Alert Types Master
router.get("/alert-types", verifyAdmin, AdminMasterController_1.alertTypesMaster.getAll);
router.get("/alert-types/:id", verifyAdmin, AdminMasterController_1.alertTypesMaster.getById);
router.post("/alert-types", verifyAdmin, AdminMasterController_1.alertTypesMaster.create);
router.put("/alert-types/:id", verifyAdmin, AdminMasterController_1.alertTypesMaster.update);
router.delete("/alert-types/:id", verifyAdmin, AdminMasterController_1.alertTypesMaster.delete);
// Report Reasons Master
router.get("/report-reasons", verifyAdmin, AdminMasterController_1.reportReasonsMaster.getAll);
router.get("/report-reasons/:id", verifyAdmin, AdminMasterController_1.reportReasonsMaster.getById);
router.post("/report-reasons", verifyAdmin, AdminMasterController_1.reportReasonsMaster.create);
router.put("/report-reasons/:id", verifyAdmin, AdminMasterController_1.reportReasonsMaster.update);
router.delete("/report-reasons/:id", verifyAdmin, AdminMasterController_1.reportReasonsMaster.delete);
// Hide Profile Duration Master
router.get("/hide-profile-duration", verifyAdmin, AdminMasterController_1.hideProfileDurationMaster.getAll);
router.get("/hide-profile-duration/:id", verifyAdmin, AdminMasterController_1.hideProfileDurationMaster.getById);
router.post("/hide-profile-duration", verifyAdmin, AdminMasterController_1.hideProfileDurationMaster.create);
router.put("/hide-profile-duration/:id", verifyAdmin, AdminMasterController_1.hideProfileDurationMaster.update);
router.delete("/hide-profile-duration/:id", verifyAdmin, AdminMasterController_1.hideProfileDurationMaster.delete);
// Delete Account Reasons Master
router.get("/delete-account-reasons", verifyAdmin, AdminMasterController_1.deleteAccountReasonsMaster.getAll);
router.get("/delete-account-reasons/:id", verifyAdmin, AdminMasterController_1.deleteAccountReasonsMaster.getById);
router.post("/delete-account-reasons", verifyAdmin, AdminMasterController_1.deleteAccountReasonsMaster.create);
router.put("/delete-account-reasons/:id", verifyAdmin, AdminMasterController_1.deleteAccountReasonsMaster.update);
router.delete("/delete-account-reasons/:id", verifyAdmin, AdminMasterController_1.deleteAccountReasonsMaster.delete);
// Success Stories Management
router.get("/success-stories", verifyAdmin, AdminController_1.getAllSuccessStories);
router.get("/success-stories/:id", verifyAdmin, AdminController_1.getSuccessStoryById);
router.put("/success-stories/:id", verifyAdmin, AdminController_1.updateSuccessStory);
router.put("/success-stories/:id/with-photo", verifyAdmin, uploadSuccessStoryPhotoMulter.single('photo'), AdminController_1.updateSuccessStoryWithPhoto);
router.post("/success-stories/:id/upload-photo", verifyAdmin, uploadSuccessStoryPhotoMulter.single('photo'), AdminController_1.uploadSuccessStoryPhoto);
router.delete("/success-stories/:id/photo", verifyAdmin, AdminController_1.deleteSuccessStoryPhoto);
router.put("/success-stories/:id/approve", verifyAdmin, AdminController_1.approveSuccessStory);
router.put("/success-stories/:id/reject", verifyAdmin, AdminController_1.rejectSuccessStory);
router.put("/success-stories/:id/status", verifyAdmin, AdminController_1.updateSuccessStoryStatus);
router.delete("/success-stories/:id", verifyAdmin, AdminController_1.deleteSuccessStory);
// Refund Management
router.get("/refund-requests", verifyAdmin, AdminController_1.getAllRefundRequests);
router.get("/refund-requests/statistics", verifyAdmin, AdminController_1.getRefundStatistics);
router.get("/refund-requests/:id", verifyAdmin, AdminController_1.getRefundRequestById);
router.put("/refund-requests/:id/approve", verifyAdmin, AdminController_1.approveRefundRequest);
router.put("/refund-requests/:id/reject", verifyAdmin, AdminController_1.rejectRefundRequest);
router.put("/refund-requests/:id/status", verifyAdmin, AdminController_1.updateRefundRequestStatus);
// General Settings Management
router.get("/general-settings", verifyAdmin, AdminController_1.getGeneralSettings);
router.get("/general_settings", AdminController_1.getGeneralSettings);
router.put("/general-settings", verifyAdmin, AdminController_1.updateGeneralSettings);
router.post("/upload-site-logo", verifyAdmin, uploadSiteLogo.single('logo'), AdminController_1.uploadSiteLogoFile);
// Admin Profile Management
router.get("/profile", verifyAdmin, AdminController_1.getAdminProfile);
router.put("/profile", verifyAdmin, AdminController_1.updateAdminProfile);
router.put("/change-password", verifyAdmin, AdminController_1.changeAdminPassword);
// Payment Management
router.get("/payments", verifyAdmin, AdminController_1.getAllPaymentsHistory);
router.get("/payments/statistics", verifyAdmin, AdminController_1.getPaymentStatistics);
router.get("/payments/:id", verifyAdmin, AdminController_1.getPaymentById);
router.put("/payments/:id/status", verifyAdmin, AdminController_1.updatePaymentStatus);
router.get("/users/:id/payments", verifyAdmin, AdminController_1.getUserPaymentsHistory);
// Contact Management
router.get("/contact/submissions", verifyAdmin, contactController.getContactSubmissions);
router.get("/contact/submissions/:contact_id", verifyAdmin, contactController.getContactDetails);
router.put("/contact/submissions/:contact_id/status", verifyAdmin, contactController.updateContactStatus);
router.post("/contact/submissions/:contact_id/reply", verifyAdmin, contactController.sendAdminReply);
router.delete("/contact/submissions/:contact_id", verifyAdmin, contactController.deleteContactMessage);
// ============ ROLE & MENU MANAGEMENT ============
// Role CRUD (uses user_type_master)
router.get("/roles", verifyAdmin, RoleManagementController_1.roleManagement.getAll);
router.get("/roles/:id", verifyAdmin, RoleManagementController_1.roleManagement.getById);
router.post("/roles", verifyAdmin, RoleManagementController_1.roleManagement.create);
router.put("/roles/:id", verifyAdmin, RoleManagementController_1.roleManagement.update);
router.delete("/roles/:id", verifyAdmin, RoleManagementController_1.roleManagement.delete);
// Role-Menu Permissions
router.get("/roles/:roleId/permissions", verifyAdmin, RoleManagementController_1.roleMenuPermissions.getByRole);
router.put("/roles/:roleId/permissions", verifyAdmin, RoleManagementController_1.roleMenuPermissions.updateByRole);
router.delete("/roles/:roleId/permissions/:menuId", verifyAdmin, RoleManagementController_1.roleMenuPermissions.deleteOne);
// Menu CRUD
router.get("/menus", verifyAdmin, RoleManagementController_1.menuManagement.getAll);
router.get("/menus/accessible", verifyAdmin, RoleManagementController_1.roleMenuPermissions.getAccessibleMenus);
router.get("/menus/:id", verifyAdmin, RoleManagementController_1.menuManagement.getById);
router.post("/menus", verifyAdmin, RoleManagementController_1.menuManagement.create);
router.put("/menus/:id", verifyAdmin, RoleManagementController_1.menuManagement.update);
router.delete("/menus/:id", verifyAdmin, RoleManagementController_1.menuManagement.delete);
// Staff Management Routes (Updated to use new StaffController)
router.get("/staff", verifyAdmin, StaffController_1.staffManagement.getAll); // Get all staff with pagination and filters
router.get("/staff/roles", verifyAdmin, StaffController_1.staffManagement.getAvailableRoles); // Get available staff roles
router.get("/staff/:id", verifyAdmin, StaffController_1.staffManagement.getById); // Get staff by ID
router.get("/staff/role/:roleId", verifyAdmin, StaffController_1.staffManagement.getByRoleId); // Get staff by role ID
router.post("/staff", verifyAdmin, StaffController_1.uploadStaffImage.single('profile_image'), StaffController_1.staffManagement.create); // Create new staff member with image
router.put("/staff/:id", verifyAdmin, StaffController_1.uploadStaffImage.single('profile_image'), StaffController_1.staffManagement.update); // Update staff member with image
router.put("/staff/:id/status", verifyAdmin, StaffController_1.staffManagement.changeStatus); // Change staff status
router.put("/staff/:userId/role", verifyAdmin, StaffController_1.staffManagement.assignRole); // Assign role (backward compatibility)
router.delete("/staff/:id", verifyAdmin, StaffController_1.staffManagement.delete); // Soft delete staff member
// ============ MULTI LANGUAGE / TRANSLATIONS ============
// Language Master
// Languages Public (without auth)
router.get("/languages", TranslationController_1.languageMaster.getAll);
// Languages Admin (with auth)
router.get("/admin/languages", verifyAdmin, TranslationController_1.languageMaster.getAll);
router.post("/languages", verifyAdmin, TranslationController_1.languageMaster.create);
router.put("/languages/:id", verifyAdmin, TranslationController_1.languageMaster.update);
router.delete("/languages/:id", verifyAdmin, TranslationController_1.languageMaster.delete);
// Translations Public
router.get("/translations", TranslationController_1.translations.getAll);
router.get("/translations/key/:text_key", TranslationController_1.translations.getByKey);
router.get("/translations/:id", TranslationController_1.translations.getById);
// Translations Admin
router.get("/translations/export", verifyAdmin, TranslationController_1.translations.exportByLanguage);
router.post("/translations", verifyAdmin, TranslationController_1.translations.create);
router.put("/translations/:id", verifyAdmin, TranslationController_1.translations.update);
router.put("/translations/:id/status", verifyAdmin, TranslationController_1.translations.updateStatus);
router.delete("/translations/:id", verifyAdmin, TranslationController_1.translations.delete);
// ============ EMAIL TEMPLATES MANAGEMENT ============
// Email Templates CRUD
router.get("/email-templates", verifyAdmin, EmailTemplateController_1.EmailTemplateController.getAllTemplates);
router.get("/email-templates/stats", verifyAdmin, EmailTemplateController_1.EmailTemplateController.getTemplateStats);
router.get("/email-templates/variables", verifyAdmin, EmailTemplateController_1.EmailTemplateController.getTemplateVariables);
router.get("/email-templates/:id", verifyAdmin, EmailTemplateController_1.EmailTemplateController.getTemplateById);
router.get("/email-templates/key/:key", verifyAdmin, EmailTemplateController_1.EmailTemplateController.getTemplateByKey);
router.post("/email-templates", verifyAdmin, EmailTemplateController_1.EmailTemplateController.createTemplate);
router.put("/email-templates/:id", verifyAdmin, EmailTemplateController_1.EmailTemplateController.updateTemplate);
router.delete("/email-templates/:id", verifyAdmin, EmailTemplateController_1.EmailTemplateController.deleteTemplate);
router.put("/email-templates/:id/restore", verifyAdmin, EmailTemplateController_1.EmailTemplateController.restoreTemplate);
router.post("/email-templates/:id/preview", verifyAdmin, EmailTemplateController_1.EmailTemplateController.previewTemplate);
router.post("/email-templates/:id/duplicate", verifyAdmin, EmailTemplateController_1.EmailTemplateController.duplicateTemplate);
// ============ REVENUE REPORT ============
// router.get("/revenue-report", verifyAdmin, getRevenueReport);
// ============ GOOGLE ANALYTICS SETTINGS ============
// Google Analytics Settings Management
router.use("/google-analytics", verifyAdmin, googleAnalyticsRoutes_1.default);
// ============ SITE SETTINGS MANAGEMENT ============
// Site Settings CRUD
router.post("/site-settings", verifyAdmin, AdminController_1.createSiteSetting);
router.get("/site-settings", verifyAdmin, AdminController_1.getAllSiteSettings);
router.get("/site-settings/:id", verifyAdmin, AdminController_1.getSiteSettingById);
router.put("/site-settings/:id", verifyAdmin, AdminController_1.updateSiteSetting);
router.delete("/site-settings/:id", verifyAdmin, AdminController_1.deleteSiteSetting);
// ============ CURRENCY SETTINGS MANAGEMENT ============
// Currency Settings CRUD
router.post("/currency-settings", verifyAdmin, AdminController_1.createCurrencySetting);
router.get("/currency-settings", verifyAdmin, AdminController_1.getAllCurrencySettings);
router.get("/currency-settings/:id", verifyAdmin, AdminController_1.getCurrencySettingById);
router.put("/currency-settings/:id", verifyAdmin, AdminController_1.updateCurrencySetting);
router.delete("/currency-settings/:id", verifyAdmin, AdminController_1.deleteCurrencySetting);
// Currency Settings Helper Routes
router.get("/currency-formats", verifyAdmin, AdminController_1.getCurrencyFormats);
router.post("/currency-formats", verifyAdmin, AdminController_1.createCurrencyFormat);
router.put("/currency-formats/:id", verifyAdmin, AdminController_1.updateCurrencyFormat);
router.delete("/currency-formats/:id", verifyAdmin, AdminController_1.deleteCurrencyFormat);
router.get("/symbol-formats", verifyAdmin, AdminController_1.getSymbolFormats);
router.post("/symbol-formats", verifyAdmin, AdminController_1.createSymbolFormat);
router.put("/symbol-formats/:id", verifyAdmin, AdminController_1.updateSymbolFormat);
router.delete("/symbol-formats/:id", verifyAdmin, AdminController_1.deleteSymbolFormat);
router.get("/no-of-decimals", verifyAdmin, AdminController_1.getNoOfDecimals);
router.post("/no-of-decimals", verifyAdmin, AdminController_1.createNoOfDecimals);
router.put("/no-of-decimals/:id", verifyAdmin, AdminController_1.updateNoOfDecimals);
router.delete("/no-of-decimals/:id", verifyAdmin, AdminController_1.deleteNoOfDecimals);
// ============ VENDOR MANAGEMENT ============
// Vendor CRUD operations
router.post("/vendors", verifyAdmin, VendorController_1.singleUpload, VendorController_1.createVendor);
router.get("/vendors", verifyAdmin, VendorController_1.getAllVendors);
router.get("/vendors/:id", verifyAdmin, VendorController_1.getVendorById);
router.put("/vendors/:id", verifyAdmin, VendorController_1.singleUpload, VendorController_1.updateVendor);
router.delete("/vendors/:id", verifyAdmin, VendorController_1.deleteVendor);
router.get("/vendors/category/:category_id", verifyAdmin, VendorController_1.getVendorsByCategory);
// Vendor Categories CRUD
router.post("/vendor-categories", verifyAdmin, VendorController_1.createVendorCategory);
router.get("/vendor-categories", verifyAdmin, VendorController_1.getAllVendorCategories);
router.get("/vendor-categories/:id", verifyAdmin, VendorController_1.getVendorCategoryById);
router.put("/vendor-categories/:id", verifyAdmin, VendorController_1.updateVendorCategory);
router.delete("/vendor-categories/:id", verifyAdmin, VendorController_1.deleteVendorCategory);
// Vendor Bank Details CRUD
router.post("/vendor-bank-details", verifyAdmin, VendorController_1.createVendorBankDetails);
router.get("/vendor-bank-details", verifyAdmin, VendorController_1.getAllVendorBankDetails);
router.get("/vendor-bank-details/:id", verifyAdmin, VendorController_1.getVendorBankDetailsById);
router.put("/vendor-bank-details/:id", verifyAdmin, VendorController_1.updateVendorBankDetails);
router.delete("/vendor-bank-details/:id", verifyAdmin, VendorController_1.deleteVendorBankDetails);
// Vendor Services CRUD
router.post("/vendor-services", verifyAdmin, VendorController_1.createVendorService);
router.get("/vendor-services", verifyAdmin, VendorController_1.getAllVendorServices);
router.get("/vendor-services/:id", verifyAdmin, VendorController_1.getVendorServiceById);
router.put("/vendor-services/:id", verifyAdmin, VendorController_1.updateVendorService);
router.delete("/vendor-services/:id", verifyAdmin, VendorController_1.deleteVendorService);
// Vendor Documents CRUD
router.post("/vendor-documents", verifyAdmin, VendorController_1.singleDocumentUpload, VendorController_1.createVendorDocument);
router.get("/vendor-documents", verifyAdmin, VendorController_1.getAllVendorDocuments);
router.get("/vendor-documents/:id", verifyAdmin, VendorController_1.getVendorDocumentById);
router.put("/vendor-documents/:id", verifyAdmin, VendorController_1.singleDocumentUpload, VendorController_1.updateVendorDocument);
router.delete("/vendor-documents/:id", verifyAdmin, VendorController_1.deleteVendorDocument);
// Get vendor data by vendor ID
router.get("/vendors/:vendor_id/services", verifyAdmin, VendorController_1.getVendorServicesByVendorId);
router.get("/vendors/:vendor_id/bank-details", verifyAdmin, VendorController_1.getVendorBankDetailsByVendorId);
router.get("/vendors/:vendor_id/documents", verifyAdmin, VendorController_1.getVendorDocumentsByVendorId);
// ============ VENDOR CONSULTATIONS MANAGEMENT ============
// Consultations CRUD (Admin)
router.get("/vendor-consultations", verifyAdmin, AdminVendorConsultationController_1.getAllConsultations);
router.get("/vendor-consultations/:id", verifyAdmin, AdminVendorConsultationController_1.getConsultationById);
router.put("/vendor-consultations/:id", verifyAdmin, AdminVendorConsultationController_1.updateConsultationAdmin);
// Vendor Earnings Management (Admin)
router.get("/vendor-earnings", verifyAdmin, AdminVendorConsultationController_1.getAllEarnings);
router.put("/vendor-earnings/:id/status", verifyAdmin, AdminVendorConsultationController_1.updateEarningStatus);
// Vendor Reviews Management (Admin)
router.get("/vendor-reviews", verifyAdmin, AdminVendorConsultationController_1.getAllReviews);
router.get("/vendor-reviews/:id", verifyAdmin, AdminVendorConsultationController_1.getReviewById);
router.put("/vendor-reviews/:id", verifyAdmin, AdminVendorConsultationController_1.updateReview);
router.delete("/vendor-reviews/:id", verifyAdmin, AdminVendorConsultationController_1.deleteReview);
// Vendor Dashboard Statistics (Admin)
router.get("/vendor-dashboard-stats", verifyAdmin, AdminVendorConsultationController_1.getVendorDashboardStats);
// ============ VENDOR REGISTRATION MANAGEMENT ============
// Get all vendor registrations (admin)
router.get("/vendor-registrations", verifyAdmin, VendorCompletionController_1.getVendorRegistrations);
// Get specific registration details (admin)
router.get("/vendor-registrations/:temp_id", verifyAdmin, VendorCompletionController_1.getRegistrationDetails);
// Retry failed registration (admin)
router.post("/vendor-registrations/:temp_id/retry", verifyAdmin, VendorCompletionController_1.retryFailedRegistration);
// ============ VENDOR SUBSCRIPTION PLANS MANAGEMENT ============
// Vendor Subscription Plans CRUD (Admin)
router.get("/vendor-subscription-plans", verifyAdmin, VendorSubscriptionController_1.getAllVendorSubscriptionPlans);
router.get("/vendor-subscription-plans/:id", verifyAdmin, VendorSubscriptionController_1.getVendorSubscriptionPlanById);
router.post("/vendor-subscription-plans", verifyAdmin, VendorSubscriptionController_1.createVendorSubscriptionPlan);
router.put("/vendor-subscription-plans/:id", verifyAdmin, VendorSubscriptionController_1.updateVendorSubscriptionPlan);
router.delete("/vendor-subscription-plans/:id", verifyAdmin, VendorSubscriptionController_1.deleteVendorSubscriptionPlan);
// ============ PUBLIC VENDOR APIS (NO TOKEN REQUIRED) ============
// Get all vendors without authentication
router.get("/public/vendors", VendorController_1.getAllVendors);
// Get vendors by state_id without authentication (strict state_id matching)
router.get("/public/vendors/state/:state_id", async (req, res) => {
    try {
        const { state_id } = req.params;
        const pageNum = parseInt(req.query.page) || 1;
        const limitNum = parseInt(req.query.limit) || 10;
        const categoryId = req.query.category_id;
        const status = req.query.status;
        const city = req.query.city;
        const search = req.query.search;
        const offset = (pageNum - 1) * limitNum;
        let whereConditions = [];
        let queryParams = [];
        // Only match exact state_id (not null values)
        whereConditions.push("v.state_id = ?");
        queryParams.push(state_id);
        // Handle status filtering - support multiple approved statuses
        if (status) {
            if (status === 'approved' || status === 'verified') {
                whereConditions.push("v.status IN ('active', 'approved', 'verified')");
            }
            else {
                whereConditions.push("v.status = ?");
                queryParams.push(status);
            }
        }
        else {
            // Default to approved/active vendors only
            whereConditions.push("v.status IN ('active', 'approved', 'verified')");
        }
        // Free plan vendors visibility rule: Only show if registered within 30 days OR have a paid plan
        // payment_required = 0 means free plan (self-registered without payment)
        // payment_required = 1 means paid plan or admin-created
        whereConditions.push(`(
      v.payment_required = 1
      OR (v.payment_required = 0 AND DATEDIFF(NOW(), v.created_at) <= 30)
    )`);
        // Build additional where conditions
        if (categoryId) {
            whereConditions.push("v.category_id = ?");
            queryParams.push(categoryId);
        }
        if (city) {
            whereConditions.push("v.city LIKE ?");
            queryParams.push(`%${city}%`);
        }
        if (search) {
            whereConditions.push("(v.full_name LIKE ? OR v.business_name LIKE ? OR v.email LIKE ?)");
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      LEFT JOIN states_master sm ON v.state_id = sm.id
      ${whereClause}
    `;
        const countResult = await query(countQuery, queryParams);
        const total = countResult[0].total;
        // Get vendors with pagination
        const vendorsQuery = `
      SELECT
        v.*,
        vc.title as category_name,
        vc.description as category_description,
        sm.state_name,
        sm.id as state_master_id,
        vsp.id as plan_id,
        vsp.plan_name,
        vsp.plan_description,
        vsp.monthly_price,
        vsp.features as plan_features,
        vs.subscription_start_date,
        vs.subscription_end_date,
        vs.status as subscription_status,
        vs.auto_renewal,
        vs.next_billing_date
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      LEFT JOIN states_master sm ON v.state_id = sm.id
      LEFT JOIN vendor_subscription_plans vsp ON v.current_plan_id = vsp.id
      LEFT JOIN vendor_subscriptions vs ON v.id = vs.vendor_id AND vs.status = 'active'
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
    `;
        const vendors = await query(vendorsQuery, [...queryParams, limitNum, offset]);
        // Get vendor IDs for fetching services and reviews
        const vendorIds = vendors.map(v => v.id);
        // Fetch services for all vendors
        let servicesMap = {};
        if (vendorIds.length > 0) {
            const servicesQuery = `
        SELECT vs.*, cm.currency_name, cm.symbol as currency_symbol
        FROM vendor_services vs
        LEFT JOIN currency_master cm ON vs.currency_id = cm.id
        WHERE vs.vendor_id IN (${vendorIds.map(() => '?').join(',')}) AND vs.status = 'active'
        ORDER BY vs.created_at DESC
      `;
            const services = await query(servicesQuery, vendorIds);
            services.forEach(service => {
                if (!servicesMap[service.vendor_id])
                    servicesMap[service.vendor_id] = [];
                servicesMap[service.vendor_id].push(service);
            });
        }
        // Fetch reviews for all vendors
        let reviewsMap = {};
        if (vendorIds.length > 0) {
            const reviewsQuery = `
        SELECT id, vendor_id, reviewer_name, rating, review_text, review_date, status, is_verified, helpful_count
        FROM vendor_reviews
        WHERE vendor_id IN (${vendorIds.map(() => '?').join(',')}) AND status IN ('active', 'pending')
        ORDER BY review_date DESC
      `;
            const reviews = await query(reviewsQuery, vendorIds);
            reviews.forEach(review => {
                if (!reviewsMap[review.vendor_id])
                    reviewsMap[review.vendor_id] = [];
                reviewsMap[review.vendor_id].push(review);
            });
        }
        // Process vendors to include plan details, services, and reviews for self-registered vendors
        const processedVendors = vendors.map((vendor) => {
            const vendorData = Object.assign({}, vendor);
            // Add created_by information
            vendorData.created_by = vendorData.created_by_admin === 1 ? 'admin' : 'self';
            // Calculate subscription_expires_at for free plan vendors
            if (vendorData.created_by_admin === 0 && vendorData.payment_required === 0) {
                const createdDate = new Date(vendorData.created_at);
                const expiryDate = new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                vendorData.subscription_expires_at = expiryDate.toISOString();
            }
            // Prepare plan details for self-registered vendors
            let planDetails = null;
            if (vendorData.created_by_admin === 0) {
                let subscriptionData;
                if (vendorData.subscription_status) {
                    subscriptionData = {
                        start_date: vendorData.subscription_start_date,
                        end_date: vendorData.subscription_end_date,
                        status: vendorData.subscription_status,
                        auto_renewal: vendorData.auto_renewal,
                        next_billing_date: vendorData.next_billing_date,
                        days_remaining: vendorData.subscription_end_date ?
                            Math.ceil((new Date(vendorData.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null
                    };
                }
                else {
                    // For free plan vendors, calculate expiry as 30 days from created_at
                    const createdDate = new Date(vendorData.created_at);
                    const expiryDate = new Date(createdDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                    const daysRemaining = Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                    subscriptionData = {
                        start_date: vendorData.created_at,
                        end_date: expiryDate.toISOString(),
                        status: daysRemaining > 0 ? 'active' : 'expired',
                        auto_renewal: 0,
                        next_billing_date: null,
                        days_remaining: daysRemaining > 0 ? daysRemaining : 0
                    };
                }
                planDetails = {
                    plan_id: vendorData.plan_id || null,
                    plan_name: vendorData.plan_name || 'Free',
                    plan_description: vendorData.plan_description || 'Free plan for vendors to get started',
                    monthly_price: vendorData.monthly_price || '0.00',
                    features: vendorData.plan_features ? JSON.parse(vendorData.plan_features) : [],
                    subscription: subscriptionData
                };
            }
            // Clean up plan-related fields from vendor data
            delete vendorData.plan_id;
            delete vendorData.plan_name;
            delete vendorData.plan_description;
            delete vendorData.monthly_price;
            delete vendorData.plan_features;
            delete vendorData.subscription_start_date;
            delete vendorData.subscription_end_date;
            delete vendorData.subscription_status;
            delete vendorData.auto_renewal;
            delete vendorData.next_billing_date;
            delete vendorData.state_master_id;
            return Object.assign(Object.assign({}, vendorData), { plan_details: planDetails, services: servicesMap[vendor.id] || [], reviews: reviewsMap[vendor.id] || [] });
        });
        // Get state information
        const stateInfoQuery = `SELECT id, state_name FROM states_master WHERE id = ?`;
        const stateInfo = await query(stateInfoQuery, [state_id]);
        res.json({
            success: true,
            data: processedVendors,
            pagination: {
                current_page: pageNum,
                per_page: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            },
            state_info: stateInfo.length > 0 ? {
                state_id: state_id,
                state_name: stateInfo[0].state_name
            } : {
                state_id: state_id,
                state_name: vendors.length > 0 ? vendors[0].state_name : null
            }
        });
    }
    catch (error) {
        console.error("Error fetching vendors by state:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
});
module.exports = router;
//# sourceMappingURL=adminRoutes.js.map