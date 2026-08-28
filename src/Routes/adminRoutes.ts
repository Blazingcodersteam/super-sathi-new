import * as express from "express";
import * as utils from "util";
import {
  adminLogin,
  getAllUsers,
  getAllUsersFullReport,
  getUserReports,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  getWebsiteContent,
  updateWebsiteContent,
  updateContentField,
  updateHomepageBanner,
  getContentField,
  uploadCEOImageFile,
  subscriptionPlansCRUD,
  subscriptionPlanFeaturesCRUD,
  subscriptionFeaturesMasterCRUD,
  subscriptionAddonsMasterCRUD,
  getAllSuccessStories,
  getSuccessStoryById,
  approveSuccessStory,
  rejectSuccessStory,
  updateSuccessStoryStatus,
  deleteSuccessStory,
  updateSuccessStory,
  uploadSuccessStoryPhoto,
  deleteSuccessStoryPhoto,
  updateSuccessStoryWithPhoto,
  createCompleteUserProfile,
  updateUserProfile,
  updateCompleteUserProfile,
  updateUserReligiousInfo,
  updateUserGovernmentId,
  updateUserBasic,
  updateUserAbout,
  updateUserAstro,
  updateUserFamily,
  updateUserCareer,
  updateUserLocation,
  updateUserHobbies,
  adminUploadUserPhoto,
  adminUploadMultipleUserPhotos,
  adminGetUserPhotos,
  adminDeleteUserPhoto,
  adminSetUserPrimaryPhoto,
  getAllRefundRequests,
  getRefundRequestById,
  approveRefundRequest,
  rejectRefundRequest,
  updateRefundRequestStatus,
  getRefundStatistics,
  getGeneralSettings,
  updateGeneralSettings,
  uploadSiteLogoFile,
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
  getAllPaymentsHistory,
  getPaymentById,
  getUserPaymentsHistory,
  getPaymentStatistics,
  updatePaymentStatus,
  // Site Settings
  createSiteSetting,
  getAllSiteSettings,
  getSiteSettingById,
  updateSiteSetting,
  deleteSiteSetting,
  // Currency Settings
  createCurrencySetting,
  getAllCurrencySettings,
  getCurrencySettingById,
  updateCurrencySetting,
  deleteCurrencySetting,
  getCurrencyFormats,
  getSymbolFormats,
  getNoOfDecimals,
  // Currency Format CRUD
  createCurrencyFormat,
  updateCurrencyFormat,
  deleteCurrencyFormat,
  // Symbol Format CRUD
  createSymbolFormat,
  updateSymbolFormat,
  deleteSymbolFormat,
  // No Of Decimals CRUD
  createNoOfDecimals,
  updateNoOfDecimals,
  deleteNoOfDecimals,
  // Admin Dashboard
  getAdminDashboard,
} from "../Controllers/AdminController";
import { verifyNonUser } from "../middleware/verifyNonUser";
import {
  casteMaster,
  communityMaster,
  countryMaster,
  countryCodeMaster,
  currencyMaster,
  educationLevelMaster,
  educationAreaMaster,
  familyStatusMaster,
  familyFinancialStatusMaster,
  familyTypeMaster,
  familyValuesMaster,
  genderMaster,
  generalStatusMaster,
  subscriptionPlans,
  subscriptionPlanFeatures,
  subscriptionFeaturesMaster,
  subscriptionStatusMaster,
  subscriptionAddonsMaster,
  religionMaster,
  maritalStatusMaster,
  bloodGroupMaster,
  dietMaster,
  disabilityMaster,
  healthInfoMaster,
  gothraMaster,
  rasiMaster,
  nakshatraMaster,
  motherTongueMaster,
  professionMaster,
  workingWithMaster,
  parentOccupationMaster,
  profileManagedByMaster,
  ethnicOriginMaster,
  hobbiesMaster,
  statesMaster,
  citiesMaster,
  drinkingMaster,
  smokingMaster,
  governmentIdTypeMaster,
  actionTypesMaster,
  alertTypesMaster,
  reportReasonsMaster,
  hideProfileDurationMaster,
  deleteAccountReasonsMaster,
} from "../Controllers/AdminMasterController";
import {
  getGSTConfig,
  updateGSTConfig,
  getStateGSTMapping,
  updateStateGSTMapping,
  bulkUpdateStateGSTMapping
} from "../Controllers/GSTConfigController";
import { gstTypeMaster } from "../Controllers/GSTTypeMasterController";
import {
  getAllStatesWithGST,
  getStateGSTConfig,
  createOrUpdateStateGST,
  bulkCreateOrUpdateStatesGST,
  deleteStateGSTConfig,
  debugStateGSTMappings
} from "../Controllers/StateGSTController";
import * as contactController from "../Controllers/ContactController";
import {
  getAllConsultations,
  getConsultationById,
  updateConsultationAdmin,
  getAllEarnings,
  updateEarningStatus,
  getAllReviews,
  getReviewById,
  updateReview,
  deleteReview,
  getVendorDashboardStats
} from "../Controllers/AdminVendorConsultationController";
import {
  roleManagement,
  menuManagement,
  roleMenuPermissions,
} from "../Controllers/RoleManagementController";
import { staffManagement, uploadStaffImage } from "../Controllers/StaffController";
import { languageMaster, translations } from "../Controllers/TranslationController";
import { EmailTemplateController } from "../Controllers/EmailTemplateController";
import googleAnalyticsRoutes from "./googleAnalyticsRoutes";
// import { getRevenueReport } from "../Controllers/RevenueReportController";
import {
  createVendor,
  updateVendor,
  getAllVendors,
  getVendorById,
  deleteVendor,
  getVendorsByCategory,
  getVendorCategories,
  getAllVendorCategories,
  getVendorCategoryById,
  createVendorCategory,
  updateVendorCategory,
  deleteVendorCategory,
  createVendorService,
  getAllVendorServices,
  getVendorServiceById,
  updateVendorService,
  deleteVendorService,
  createVendorBankDetails,
  getAllVendorBankDetails,
  getVendorBankDetailsById,
  updateVendorBankDetails,
  deleteVendorBankDetails,
  createVendorDocument,
  getAllVendorDocuments,
  getVendorDocumentById,
  updateVendorDocument,
  deleteVendorDocument,
  getVendorServicesByVendorId,
  getVendorBankDetailsByVendorId,
  getVendorDocumentsByVendorId,
  singleUpload,
  singleDocumentUpload
} from "../Controllers/VendorController";
import {
  getAllVendorSubscriptionPlans,
  getVendorSubscriptionPlanById,
  createVendorSubscriptionPlan,
  updateVendorSubscriptionPlan,
  deleteVendorSubscriptionPlan
} from "../Controllers/VendorSubscriptionController";
import {
  getVendorRegistrations,
  getRegistrationDetails,
  retryFailedRegistration
} from "../Controllers/VendorCompletionController";

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
    } else {
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
    } else {
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
    } else {
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
    } else {
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
    } else {
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
router.post("/login", adminLogin);

// Admin Dashboard
router.get("/dashboard", verifyNonUser, getAdminDashboard);

// User management routes (protected)
router.get("/users", verifyAdmin, getAllUsers);
router.get("/users/full-report", verifyAdmin, getAllUsersFullReport);
router.get("/user-reports", verifyAdmin, getUserReports);
router.get("/users/:id", verifyAdmin, getUserById);
router.post("/users", verifyAdmin, createUser);
router.post("/users/complete-profile", verifyAdmin, createCompleteUserProfile);
router.put("/users/:id", verifyAdmin, updateUser);
router.put("/users/:id/status", verifyAdmin, updateUserStatus);
router.delete("/users/:id", verifyAdmin, deleteUser);

// User profile update routes (protected)
router.put("/users/:id/profile", verifyAdmin, updateUserProfile);
router.put("/users/:id/profile/complete", verifyAdmin, updateCompleteUserProfile);
router.put("/users/:id/profile/basic", verifyAdmin, updateUserBasic);
router.put("/users/:id/profile/about", verifyAdmin, updateUserAbout);
router.put("/users/:id/profile/astro", verifyAdmin, updateUserAstro);
router.put("/users/:id/profile/family", verifyAdmin, updateUserFamily);
router.put("/users/:id/profile/career", verifyAdmin, updateUserCareer);
router.put("/users/:id/profile/location", verifyAdmin, updateUserLocation);
router.put("/users/:id/profile/hobbies", verifyAdmin, updateUserHobbies);
router.put("/users/:id/religious-info", verifyAdmin, updateUserReligiousInfo);
router.put("/users/:id/government-id", verifyAdmin, updateUserGovernmentId);

// User photo management routes (Admin)
router.post("/users/:id/photos/upload", verifyAdmin, uploadUserPhoto.single('photo'), adminUploadUserPhoto);
router.post("/users/:id/photos/upload-multiple", verifyAdmin, uploadUserPhoto.array('photos', 20), adminUploadMultipleUserPhotos);
router.get("/users/:id/photos", verifyAdmin, adminGetUserPhotos);
router.delete("/users/:id/photos/:photoId", verifyAdmin, adminDeleteUserPhoto);
router.put("/users/:id/photos/:photoId/primary", verifyAdmin, adminSetUserPrimaryPhoto);

// Master table routes
// Caste Master
router.get("/caste", verifyAdmin, casteMaster.getAll);
router.get("/caste/:id", verifyAdmin, casteMaster.getById);
router.post("/caste", verifyAdmin, casteMaster.create);
router.put("/caste/:id", verifyAdmin, casteMaster.update);
router.delete("/caste/:id", verifyAdmin, casteMaster.delete);

// Community Master
router.get("/community", verifyAdmin, communityMaster.getAll);
router.get("/community/:id", verifyAdmin, communityMaster.getById);
router.post("/community", verifyAdmin, communityMaster.create);
router.put("/community/:id", verifyAdmin, communityMaster.update);
router.delete("/community/:id", verifyAdmin, communityMaster.delete);

// Country Master
router.get("/country", verifyAdmin, countryMaster.getAll);
router.get("/country/:id", verifyAdmin, countryMaster.getById);
router.post("/country", verifyAdmin, countryMaster.create);
router.put("/country/:id", verifyAdmin, countryMaster.update);
router.delete("/country/:id", verifyAdmin, countryMaster.delete);

// Country Code Master
router.get("/country-code", verifyAdmin, countryCodeMaster.getAll);
router.get("/country-code/:id", verifyAdmin, countryCodeMaster.getById);
router.post("/country-code", verifyAdmin, countryCodeMaster.create);
router.put("/country-code/:id", verifyAdmin, countryCodeMaster.update);
router.delete("/country-code/:id", verifyAdmin, countryCodeMaster.delete);

// Currency Master
router.get("/currency", verifyAdmin, currencyMaster.getAll);
router.get("/currency/:id", verifyAdmin, currencyMaster.getById);
router.post("/currency", verifyAdmin, currencyMaster.create);
router.put("/currency/:id", verifyAdmin, currencyMaster.update);
router.delete("/currency/:id", verifyAdmin, currencyMaster.delete);

// Education Level Master
router.get("/education-level", verifyAdmin, educationLevelMaster.getAll);
router.get("/education-level/:id", verifyAdmin, educationLevelMaster.getById);
router.post("/education-level", verifyAdmin, educationLevelMaster.create);
router.put("/education-level/:id", verifyAdmin, educationLevelMaster.update);
router.delete("/education-level/:id", verifyAdmin, educationLevelMaster.delete);

// Family Status Master
router.get("/family-status", verifyAdmin, familyStatusMaster.getAll);
router.get("/family-status/:id", verifyAdmin, familyStatusMaster.getById);
router.post("/family-status", verifyAdmin, familyStatusMaster.create);
router.put("/family-status/:id", verifyAdmin, familyStatusMaster.update);
router.delete("/family-status/:id", verifyAdmin, familyStatusMaster.delete);

// Family Type Master
router.get("/family-type", verifyAdmin, familyTypeMaster.getAll);
router.get("/family-type/:id", verifyAdmin, familyTypeMaster.getById);
router.post("/family-type", verifyAdmin, familyTypeMaster.create);
router.put("/family-type/:id", verifyAdmin, familyTypeMaster.update);
router.delete("/family-type/:id", verifyAdmin, familyTypeMaster.delete);

// Family Values Master
router.get("/family-values", verifyAdmin, familyValuesMaster.getAll);
router.get("/family-values/:id", verifyAdmin, familyValuesMaster.getById);
router.post("/family-values", verifyAdmin, familyValuesMaster.create);
router.put("/family-values/:id", verifyAdmin, familyValuesMaster.update);
router.delete("/family-values/:id", verifyAdmin, familyValuesMaster.delete);

// Family Financial Status Master
router.get("/family-financial-status", verifyAdmin, familyFinancialStatusMaster.getAll);
router.get("/family-financial-status/:id", verifyAdmin, familyFinancialStatusMaster.getById);
router.post("/family-financial-status", verifyAdmin, familyFinancialStatusMaster.create);
router.put("/family-financial-status/:id", verifyAdmin, familyFinancialStatusMaster.update);
router.delete("/family-financial-status/:id", verifyAdmin, familyFinancialStatusMaster.delete);

// Gender Master
router.get("/gender", verifyAdmin, genderMaster.getAll);
router.get("/gender/:id", verifyAdmin, genderMaster.getById);
router.post("/gender", verifyAdmin, genderMaster.create);
router.put("/gender/:id", verifyAdmin, genderMaster.update);
router.delete("/gender/:id", verifyAdmin, genderMaster.delete);

// General Status Master
router.get("/general-status", verifyAdmin, generalStatusMaster.getAll);
router.get("/general-status/:id", verifyAdmin, generalStatusMaster.getById);
router.post("/general-status", verifyAdmin, generalStatusMaster.create);
router.put("/general-status/:id", verifyAdmin, generalStatusMaster.update);
router.delete("/general-status/:id", verifyAdmin, generalStatusMaster.delete);

// Subscription Plans - New CRUD
router.get("/subscription-plans", verifyAdmin, subscriptionPlansCRUD.getAll);
router.get("/subscription-plans/:id", verifyAdmin, subscriptionPlansCRUD.getById);
router.post("/subscription-plans", verifyAdmin, subscriptionPlansCRUD.create);
router.put("/subscription-plans/:id", verifyAdmin, subscriptionPlansCRUD.update);
router.delete("/subscription-plans/:id", verifyAdmin, subscriptionPlansCRUD.delete);

// Subscription Plan Features - New CRUD
router.get("/subscription-plan-features", verifyAdmin, subscriptionPlanFeaturesCRUD.getAll);
router.get("/subscription-plan-features/:id", verifyAdmin, subscriptionPlanFeaturesCRUD.getById);
router.post("/subscription-plan-features", verifyAdmin, subscriptionPlanFeaturesCRUD.create);
router.put("/subscription-plan-features/:id", verifyAdmin, subscriptionPlanFeaturesCRUD.update);
router.delete("/subscription-plan-features/:id", verifyAdmin, subscriptionPlanFeaturesCRUD.delete);

// Subscription Status Master
router.get("/subscription-status", verifyAdmin, subscriptionStatusMaster.getAll);
router.get("/subscription-status/:id", verifyAdmin, subscriptionStatusMaster.getById);
router.post("/subscription-status", verifyAdmin, subscriptionStatusMaster.create);
router.put("/subscription-status/:id", verifyAdmin, subscriptionStatusMaster.update);
router.delete("/subscription-status/:id", verifyAdmin, subscriptionStatusMaster.delete);

// Website Content Management
router.get("/content", verifyAdmin, getWebsiteContent);
router.get("/content/:field_name", verifyAdmin, getContentField);
router.put("/content", verifyAdmin, updateWebsiteContent);
router.put("/content/field/:field_name", verifyAdmin, updateContentField);
router.put("/content/homepage-banner", verifyAdmin, updateHomepageBanner);
router.post("/content/upload-ceo-image", verifyAdmin, uploadCEOImage.single('ceo_image'), uploadCEOImageFile);

// ============ CONTENT UPDATE ROUTES (ALL ROLES EXCEPT USERS) ============

// Content Update Routes - Allow all roles except users
router.put("/privacy-policy", verifyNonUser, (req, res) => {
  req.params.field_name = 'privacy_policy';
  req.body = { content: req.body.content || req.body.privacy_policy };
  updateContentField(req, res);
});
router.put("/terms-conditions", verifyNonUser, (req, res) => {
  req.params.field_name = 'terms_conditions';
  req.body = { content: req.body.content || req.body.terms_conditions };
  updateContentField(req, res);
});
router.put("/refund-policy", verifyNonUser, (req, res) => {
  req.params.field_name = 'refund_policy';
  req.body = { content: req.body.content || req.body.refund_policy };
  updateContentField(req, res);
});
router.put("/safe-policy", verifyNonUser, (req, res) => {
  req.params.field_name = 'safe_policy';
  req.body = { content: req.body.content || req.body.safe_policy };
  updateContentField(req, res);
});
router.put("/be-safe-online", verifyNonUser, (req, res) => {
  req.params.field_name = 'be_safe_online';
  req.body = { content: req.body.content || req.body.be_safe_online };
  updateContentField(req, res);
});
router.put("/title", verifyNonUser, (req, res) => {
  req.params.field_name = 'title';
  req.body = { content: req.body.content || req.body.title };
  updateContentField(req, res);
});
router.put("/subtitle", verifyNonUser, (req, res) => {
  req.params.field_name = 'subtitle';
  req.body = { content: req.body.content || req.body.subtitle };
  updateContentField(req, res);
});
router.put("/description", verifyNonUser, (req, res) => {
  req.params.field_name = 'description';
  req.body = { content: req.body.content || req.body.description };
  updateContentField(req, res);
});
router.put("/ceo-content", verifyNonUser, (req, res) => {
  req.params.field_name = 'ceo_content';
  req.body = { content: req.body.content || req.body.ceo_content };
  updateContentField(req, res);
});
router.post("/homepage-banner", verifyNonUser, uploadCEOImage.array('bannerImages', 10), (req, res) => {
  req.body = { images: req.body.images || req.files };
  updateHomepageBanner(req, res);
});
router.post("/ceo-image", verifyNonUser, uploadCEOImage.single('ceoImage'), uploadCEOImageFile);

// GST Management (Refactored System)
// Uses gst_type_master and states_gst_mapping tables
router.get("/gst-config", verifyAdmin, getGSTConfig);
router.put("/gst-config", verifyAdmin, updateGSTConfig);
router.get("/gst-state-mapping", verifyAdmin, getStateGSTMapping);
router.put("/gst-state-mapping", verifyAdmin, updateStateGSTMapping);
router.put("/gst-state-mapping/bulk", verifyAdmin, bulkUpdateStateGSTMapping);

// State GST Management (New Enhanced System)
// Complete state GST configuration management
router.get("/states-gst", verifyAdmin, getAllStatesWithGST);
router.get("/states-gst/:state_id", verifyAdmin, getStateGSTConfig);
router.put("/states-gst/:state_id", verifyAdmin, createOrUpdateStateGST);
router.put("/states-gst/bulk", verifyAdmin, bulkCreateOrUpdateStatesGST);
router.delete("/states-gst/:state_id", verifyAdmin, deleteStateGSTConfig);
router.get("/states-gst/:state_id/debug", verifyAdmin, debugStateGSTMappings);

// GST Type Master CRUD
router.get("/gst-type", verifyNonUser, gstTypeMaster.getAll);
router.get("/gst-type/:id", verifyNonUser, gstTypeMaster.getById);
router.post("/gst-type", verifyNonUser, gstTypeMaster.create);
router.put("/gst-type/:id", verifyNonUser, gstTypeMaster.update);
router.delete("/gst-type/:id", verifyNonUser, gstTypeMaster.delete);

// Religion Master
router.get("/religion", verifyAdmin, religionMaster.getAll);
router.get("/religion/:id", verifyAdmin, religionMaster.getById);
router.post("/religion", verifyAdmin, religionMaster.create);
router.put("/religion/:id", verifyAdmin, religionMaster.update);
router.delete("/religion/:id", verifyAdmin, religionMaster.delete);

// Marital Status Master
router.get("/marital-status", verifyAdmin, maritalStatusMaster.getAll);
router.get("/marital-status/:id", verifyAdmin, maritalStatusMaster.getById);
router.post("/marital-status", verifyAdmin, maritalStatusMaster.create);
router.put("/marital-status/:id", verifyAdmin, maritalStatusMaster.update);
router.delete("/marital-status/:id", verifyAdmin, maritalStatusMaster.delete);

// Blood Group Master
router.get("/blood-group", verifyAdmin, bloodGroupMaster.getAll);
router.get("/blood-group/:id", verifyAdmin, bloodGroupMaster.getById);
router.post("/blood-group", verifyAdmin, bloodGroupMaster.create);
router.put("/blood-group/:id", verifyAdmin, bloodGroupMaster.update);
router.delete("/blood-group/:id", verifyAdmin, bloodGroupMaster.delete);

// Diet Master
router.get("/diet", verifyAdmin, dietMaster.getAll);
router.get("/diet/:id", verifyAdmin, dietMaster.getById);
router.post("/diet", verifyAdmin, dietMaster.create);
router.put("/diet/:id", verifyAdmin, dietMaster.update);
router.delete("/diet/:id", verifyAdmin, dietMaster.delete);

// Disability Master
router.get("/disability", verifyAdmin, disabilityMaster.getAll);
router.get("/disability/:id", verifyAdmin, disabilityMaster.getById);
router.post("/disability", verifyAdmin, disabilityMaster.create);
router.put("/disability/:id", verifyAdmin, disabilityMaster.update);
router.delete("/disability/:id", verifyAdmin, disabilityMaster.delete);

// Health Info Master
router.get("/health-info", verifyAdmin, healthInfoMaster.getAll);
router.get("/health-info/:id", verifyAdmin, healthInfoMaster.getById);
router.post("/health-info", verifyAdmin, healthInfoMaster.create);
router.put("/health-info/:id", verifyAdmin, healthInfoMaster.update);
router.delete("/health-info/:id", verifyAdmin, healthInfoMaster.delete);

// Gothra Master
router.get("/gothra", verifyAdmin, gothraMaster.getAll);
router.get("/gothra/:id", verifyAdmin, gothraMaster.getById);
router.post("/gothra", verifyAdmin, gothraMaster.create);
router.put("/gothra/:id", verifyAdmin, gothraMaster.update);
router.delete("/gothra/:id", verifyAdmin, gothraMaster.delete);

// Rasi Master
router.get("/rasi", verifyAdmin, rasiMaster.getAll);
router.get("/rasi/:id", verifyAdmin, rasiMaster.getById);
router.post("/rasi", verifyAdmin, rasiMaster.create);
router.put("/rasi/:id", verifyAdmin, rasiMaster.update);
router.delete("/rasi/:id", verifyAdmin, rasiMaster.delete);

// Nakshatra Master
router.get("/nakshatra", verifyAdmin, nakshatraMaster.getAll);
router.get("/nakshatra/:id", verifyAdmin, nakshatraMaster.getById);
router.post("/nakshatra", verifyAdmin, nakshatraMaster.create);
router.put("/nakshatra/:id", verifyAdmin, nakshatraMaster.update);
router.delete("/nakshatra/:id", verifyAdmin, nakshatraMaster.delete);

// Mother Tongue Master
router.get("/mother-tongue", verifyAdmin, motherTongueMaster.getAll);
router.get("/mother-tongue/:id", verifyAdmin, motherTongueMaster.getById);
router.post("/mother-tongue", verifyAdmin, motherTongueMaster.create);
router.put("/mother-tongue/:id", verifyAdmin, motherTongueMaster.update);
router.delete("/mother-tongue/:id", verifyAdmin, motherTongueMaster.delete);

// Profession Master
router.get("/profession", verifyAdmin, professionMaster.getAll);
router.get("/profession/:id", verifyAdmin, professionMaster.getById);
router.post("/profession", verifyAdmin, professionMaster.create);
router.put("/profession/:id", verifyAdmin, professionMaster.update);
router.delete("/profession/:id", verifyAdmin, professionMaster.delete);

// Working With Master
router.get("/working-with", verifyAdmin, workingWithMaster.getAll);
router.get("/working-with/:id", verifyAdmin, workingWithMaster.getById);
router.post("/working-with", verifyAdmin, workingWithMaster.create);
router.put("/working-with/:id", verifyAdmin, workingWithMaster.update);
router.delete("/working-with/:id", verifyAdmin, workingWithMaster.delete);

// Parent Occupation Master
router.get("/parent-occupation", verifyAdmin, parentOccupationMaster.getAll);
router.get("/parent-occupation/:id", verifyAdmin, parentOccupationMaster.getById);
router.post("/parent-occupation", verifyAdmin, parentOccupationMaster.create);
router.put("/parent-occupation/:id", verifyAdmin, parentOccupationMaster.update);
router.delete("/parent-occupation/:id", verifyAdmin, parentOccupationMaster.delete);

// Profile Managed By Master
router.get("/profile-managed-by", verifyAdmin, profileManagedByMaster.getAll);
router.get("/profile-managed-by/:id", verifyAdmin, profileManagedByMaster.getById);
router.post("/profile-managed-by", verifyAdmin, profileManagedByMaster.create);
router.put("/profile-managed-by/:id", verifyAdmin, profileManagedByMaster.update);
router.delete("/profile-managed-by/:id", verifyAdmin, profileManagedByMaster.delete);

// Ethnic Origin Master
router.get("/ethnic-origin", verifyAdmin, ethnicOriginMaster.getAll);
router.get("/ethnic-origin/:id", verifyAdmin, ethnicOriginMaster.getById);
router.post("/ethnic-origin", verifyAdmin, ethnicOriginMaster.create);
router.put("/ethnic-origin/:id", verifyAdmin, ethnicOriginMaster.update);
router.delete("/ethnic-origin/:id", verifyAdmin, ethnicOriginMaster.delete);

// Hobbies Master
router.get("/hobbies", verifyAdmin, hobbiesMaster.getAll);
router.get("/hobbies/:id", verifyAdmin, hobbiesMaster.getById);
router.post("/hobbies", verifyAdmin, hobbiesMaster.create);
router.put("/hobbies/:id", verifyAdmin, hobbiesMaster.update);
router.delete("/hobbies/:id", verifyAdmin, hobbiesMaster.delete);

// States Master
router.get("/states", verifyAdmin, statesMaster.getAll);
router.get("/states/:id", verifyAdmin, statesMaster.getById);
router.post("/states", verifyAdmin, statesMaster.create);
router.put("/states/:id", verifyAdmin, statesMaster.update);
router.delete("/states/:id", verifyAdmin, statesMaster.delete);

// Cities Master
router.get("/cities", verifyAdmin, citiesMaster.getAll);
router.get("/cities/:id", verifyAdmin, citiesMaster.getById);
router.post("/cities", verifyAdmin, citiesMaster.create);
router.put("/cities/:id", verifyAdmin, citiesMaster.update);
router.delete("/cities/:id", verifyAdmin, citiesMaster.delete);

// Drinking Master
router.get("/drinking", verifyAdmin, drinkingMaster.getAll);
router.get("/drinking/:id", verifyAdmin, drinkingMaster.getById);
router.post("/drinking", verifyAdmin, drinkingMaster.create);
router.put("/drinking/:id", verifyAdmin, drinkingMaster.update);
router.delete("/drinking/:id", verifyAdmin, drinkingMaster.delete);

// Smoking Master
router.get("/smoking", verifyAdmin, smokingMaster.getAll);
router.get("/smoking/:id", verifyAdmin, smokingMaster.getById);
router.post("/smoking", verifyAdmin, smokingMaster.create);
router.put("/smoking/:id", verifyAdmin, smokingMaster.update);
router.delete("/smoking/:id", verifyAdmin, smokingMaster.delete);

// Education Area Master
router.get("/education-area", verifyAdmin, educationAreaMaster.getAll);
router.get("/education-area/:id", verifyAdmin, educationAreaMaster.getById);
router.post("/education-area", verifyAdmin, educationAreaMaster.create);
router.put("/education-area/:id", verifyAdmin, educationAreaMaster.update);
router.delete("/education-area/:id", verifyAdmin, educationAreaMaster.delete);

// Subscription Features Master - New CRUD
router.get("/subscription-features", verifyAdmin, subscriptionFeaturesMasterCRUD.getAll);
router.get("/subscription-features/:id", verifyAdmin, subscriptionFeaturesMasterCRUD.getById);
router.post("/subscription-features", verifyAdmin, subscriptionFeaturesMasterCRUD.create);
router.put("/subscription-features/:id", verifyAdmin, subscriptionFeaturesMasterCRUD.update);
router.delete("/subscription-features/:id", verifyAdmin, subscriptionFeaturesMasterCRUD.delete);

// Subscription Addons Master - New CRUD
router.get("/subscription-addons", verifyAdmin, subscriptionAddonsMasterCRUD.getAll);
router.get("/subscription-addons/:id", verifyAdmin, subscriptionAddonsMasterCRUD.getById);
router.post("/subscription-addons", verifyAdmin, subscriptionAddonsMasterCRUD.create);
router.put("/subscription-addons/:id", verifyAdmin, subscriptionAddonsMasterCRUD.update);
router.delete("/subscription-addons/:id", verifyAdmin, subscriptionAddonsMasterCRUD.delete);

// Government ID Type Master
router.get("/government-id-type", verifyAdmin, governmentIdTypeMaster.getAll);
router.get("/government-id-type/:id", verifyAdmin, governmentIdTypeMaster.getById);
router.post("/government-id-type", verifyAdmin, governmentIdTypeMaster.create);
router.put("/government-id-type/:id", verifyAdmin, governmentIdTypeMaster.update);
router.delete("/government-id-type/:id", verifyAdmin, governmentIdTypeMaster.delete);

// Action Types Master
router.get("/action-types", verifyAdmin, actionTypesMaster.getAll);
router.get("/action-types/:id", verifyAdmin, actionTypesMaster.getById);
router.post("/action-types", verifyAdmin, actionTypesMaster.create);
router.put("/action-types/:id", verifyAdmin, actionTypesMaster.update);
router.delete("/action-types/:id", verifyAdmin, actionTypesMaster.delete);

// Alert Types Master
router.get("/alert-types", verifyAdmin, alertTypesMaster.getAll);
router.get("/alert-types/:id", verifyAdmin, alertTypesMaster.getById);
router.post("/alert-types", verifyAdmin, alertTypesMaster.create);
router.put("/alert-types/:id", verifyAdmin, alertTypesMaster.update);
router.delete("/alert-types/:id", verifyAdmin, alertTypesMaster.delete);

// Report Reasons Master
router.get("/report-reasons", verifyAdmin, reportReasonsMaster.getAll);
router.get("/report-reasons/:id", verifyAdmin, reportReasonsMaster.getById);
router.post("/report-reasons", verifyAdmin, reportReasonsMaster.create);
router.put("/report-reasons/:id", verifyAdmin, reportReasonsMaster.update);
router.delete("/report-reasons/:id", verifyAdmin, reportReasonsMaster.delete);

// Hide Profile Duration Master
router.get("/hide-profile-duration", verifyAdmin, hideProfileDurationMaster.getAll);
router.get("/hide-profile-duration/:id", verifyAdmin, hideProfileDurationMaster.getById);
router.post("/hide-profile-duration", verifyAdmin, hideProfileDurationMaster.create);
router.put("/hide-profile-duration/:id", verifyAdmin, hideProfileDurationMaster.update);
router.delete("/hide-profile-duration/:id", verifyAdmin, hideProfileDurationMaster.delete);

// Delete Account Reasons Master
router.get("/delete-account-reasons", verifyAdmin, deleteAccountReasonsMaster.getAll);
router.get("/delete-account-reasons/:id", verifyAdmin, deleteAccountReasonsMaster.getById);
router.post("/delete-account-reasons", verifyAdmin, deleteAccountReasonsMaster.create);
router.put("/delete-account-reasons/:id", verifyAdmin, deleteAccountReasonsMaster.update);
router.delete("/delete-account-reasons/:id", verifyAdmin, deleteAccountReasonsMaster.delete);

// Success Stories Management
router.get("/success-stories", verifyAdmin, getAllSuccessStories);
router.get("/success-stories/:id", verifyAdmin, getSuccessStoryById);
router.put("/success-stories/:id", verifyAdmin, updateSuccessStory);
router.put("/success-stories/:id/with-photo", verifyAdmin, uploadSuccessStoryPhotoMulter.single('photo'), updateSuccessStoryWithPhoto);
router.post("/success-stories/:id/upload-photo", verifyAdmin, uploadSuccessStoryPhotoMulter.single('photo'), uploadSuccessStoryPhoto);
router.delete("/success-stories/:id/photo", verifyAdmin, deleteSuccessStoryPhoto);
router.put("/success-stories/:id/approve", verifyAdmin, approveSuccessStory);
router.put("/success-stories/:id/reject", verifyAdmin, rejectSuccessStory);
router.put("/success-stories/:id/status", verifyAdmin, updateSuccessStoryStatus);
router.delete("/success-stories/:id", verifyAdmin, deleteSuccessStory);

// Refund Management
router.get("/refund-requests", verifyAdmin, getAllRefundRequests);
router.get("/refund-requests/statistics", verifyAdmin, getRefundStatistics);
router.get("/refund-requests/:id", verifyAdmin, getRefundRequestById);
router.put("/refund-requests/:id/approve", verifyAdmin, approveRefundRequest);
router.put("/refund-requests/:id/reject", verifyAdmin, rejectRefundRequest);
router.put("/refund-requests/:id/status", verifyAdmin, updateRefundRequestStatus);

// General Settings Management
router.get("/general-settings", verifyAdmin, getGeneralSettings);
router.get("/general_settings", getGeneralSettings);
router.put("/general-settings", verifyAdmin, updateGeneralSettings);
router.post("/upload-site-logo", verifyAdmin, uploadSiteLogo.single('logo'), uploadSiteLogoFile);

// Admin Profile Management
router.get("/profile", verifyAdmin, getAdminProfile);
router.put("/profile", verifyAdmin, updateAdminProfile);
router.put("/change-password", verifyAdmin, changeAdminPassword);

// Payment Management
router.get("/payments", verifyAdmin, getAllPaymentsHistory);
router.get("/payments/statistics", verifyAdmin, getPaymentStatistics);
router.get("/payments/:id", verifyAdmin, getPaymentById);
router.put("/payments/:id/status", verifyAdmin, updatePaymentStatus);
router.get("/users/:id/payments", verifyAdmin, getUserPaymentsHistory);

// Contact Management
router.get("/contact/submissions", verifyAdmin, contactController.getContactSubmissions);
router.get("/contact/submissions/:contact_id", verifyAdmin, contactController.getContactDetails);
router.put("/contact/submissions/:contact_id/status", verifyAdmin, contactController.updateContactStatus);
router.post("/contact/submissions/:contact_id/reply", verifyAdmin, contactController.sendAdminReply);
router.delete("/contact/submissions/:contact_id", verifyAdmin, contactController.deleteContactMessage);

// ============ ROLE & MENU MANAGEMENT ============

// Role CRUD (uses user_type_master)
router.get("/roles", verifyAdmin, roleManagement.getAll);
router.get("/roles/:id", verifyAdmin, roleManagement.getById);
router.post("/roles", verifyAdmin, roleManagement.create);
router.put("/roles/:id", verifyAdmin, roleManagement.update);
router.delete("/roles/:id", verifyAdmin, roleManagement.delete);

// Role-Menu Permissions
router.get("/roles/:roleId/permissions", verifyAdmin, roleMenuPermissions.getByRole);
router.put("/roles/:roleId/permissions", verifyAdmin, roleMenuPermissions.updateByRole);
router.delete("/roles/:roleId/permissions/:menuId", verifyAdmin, roleMenuPermissions.deleteOne);

// Menu CRUD
router.get("/menus", verifyAdmin, menuManagement.getAll);
router.get("/menus/accessible", verifyAdmin, roleMenuPermissions.getAccessibleMenus);
router.get("/menus/:id", verifyAdmin, menuManagement.getById);
router.post("/menus", verifyAdmin, menuManagement.create);
router.put("/menus/:id", verifyAdmin, menuManagement.update);
router.delete("/menus/:id", verifyAdmin, menuManagement.delete);

// Staff Management Routes (Updated to use new StaffController)
router.get("/staff", verifyAdmin, staffManagement.getAll);                                                    // Get all staff with pagination and filters
router.get("/staff/roles", verifyAdmin, staffManagement.getAvailableRoles);                                  // Get available staff roles
router.get("/staff/:id", verifyAdmin, staffManagement.getById);                                              // Get staff by ID
router.get("/staff/role/:roleId", verifyAdmin, staffManagement.getByRoleId);                                 // Get staff by role ID
router.post("/staff", verifyAdmin, uploadStaffImage.single('profile_image'), staffManagement.create);       // Create new staff member with image
router.put("/staff/:id", verifyAdmin, uploadStaffImage.single('profile_image'), staffManagement.update);    // Update staff member with image
router.put("/staff/:id/status", verifyAdmin, staffManagement.changeStatus);                                  // Change staff status
router.put("/staff/:userId/role", verifyAdmin, staffManagement.assignRole);                                  // Assign role (backward compatibility)
router.delete("/staff/:id", verifyAdmin, staffManagement.delete);                                            // Soft delete staff member

// ============ MULTI LANGUAGE / TRANSLATIONS ============

// Language Master
// Languages Public (without auth)
router.get("/languages", languageMaster.getAll);

// Languages Admin (with auth)
router.get("/admin/languages", verifyAdmin, languageMaster.getAll);
router.post("/languages", verifyAdmin, languageMaster.create);
router.put("/languages/:id", verifyAdmin, languageMaster.update);
router.delete("/languages/:id", verifyAdmin, languageMaster.delete);

// Translations Public
router.get("/translations", translations.getAll);
router.get("/translations/key/:text_key", translations.getByKey);
router.get("/translations/:id", translations.getById);

// Translations Admin
router.get("/translations/export", verifyAdmin, translations.exportByLanguage);
router.post("/translations", verifyAdmin, translations.create);
router.put("/translations/:id", verifyAdmin, translations.update);
router.put("/translations/:id/status", verifyAdmin, translations.updateStatus);
router.delete("/translations/:id", verifyAdmin, translations.delete);

// ============ EMAIL TEMPLATES MANAGEMENT ============

// Email Templates CRUD
router.get("/email-templates", verifyAdmin, EmailTemplateController.getAllTemplates);
router.get("/email-templates/stats", verifyAdmin, EmailTemplateController.getTemplateStats);
router.get("/email-templates/variables", verifyAdmin, EmailTemplateController.getTemplateVariables);
router.get("/email-templates/:id", verifyAdmin, EmailTemplateController.getTemplateById);
router.get("/email-templates/key/:key", verifyAdmin, EmailTemplateController.getTemplateByKey);
router.post("/email-templates", verifyAdmin, EmailTemplateController.createTemplate);
router.put("/email-templates/:id", verifyAdmin, EmailTemplateController.updateTemplate);
router.delete("/email-templates/:id", verifyAdmin, EmailTemplateController.deleteTemplate);
router.put("/email-templates/:id/restore", verifyAdmin, EmailTemplateController.restoreTemplate);
router.post("/email-templates/:id/preview", verifyAdmin, EmailTemplateController.previewTemplate);
router.post("/email-templates/:id/duplicate", verifyAdmin, EmailTemplateController.duplicateTemplate);

// ============ REVENUE REPORT ============
// router.get("/revenue-report", verifyAdmin, getRevenueReport);

// ============ GOOGLE ANALYTICS SETTINGS ============

// Google Analytics Settings Management
router.use("/google-analytics", verifyAdmin, googleAnalyticsRoutes);

// ============ SITE SETTINGS MANAGEMENT ============

// Site Settings CRUD
router.post("/site-settings", verifyAdmin, createSiteSetting);
router.get("/site-settings", verifyAdmin, getAllSiteSettings);
router.get("/site-settings/:id", verifyAdmin, getSiteSettingById);
router.put("/site-settings/:id", verifyAdmin, updateSiteSetting);
router.delete("/site-settings/:id", verifyAdmin, deleteSiteSetting);

// ============ CURRENCY SETTINGS MANAGEMENT ============

// Currency Settings CRUD
router.post("/currency-settings", verifyAdmin, createCurrencySetting);
router.get("/currency-settings", verifyAdmin, getAllCurrencySettings);
router.get("/currency-settings/:id", verifyAdmin, getCurrencySettingById);
router.put("/currency-settings/:id", verifyAdmin, updateCurrencySetting);
router.delete("/currency-settings/:id", verifyAdmin, deleteCurrencySetting);

// Currency Settings Helper Routes
router.get("/currency-formats", verifyAdmin, getCurrencyFormats);
router.post("/currency-formats", verifyAdmin, createCurrencyFormat);
router.put("/currency-formats/:id", verifyAdmin, updateCurrencyFormat);
router.delete("/currency-formats/:id", verifyAdmin, deleteCurrencyFormat);

router.get("/symbol-formats", verifyAdmin, getSymbolFormats);
router.post("/symbol-formats", verifyAdmin, createSymbolFormat);
router.put("/symbol-formats/:id", verifyAdmin, updateSymbolFormat);
router.delete("/symbol-formats/:id", verifyAdmin, deleteSymbolFormat);

router.get("/no-of-decimals", verifyAdmin, getNoOfDecimals);
router.post("/no-of-decimals", verifyAdmin, createNoOfDecimals);
router.put("/no-of-decimals/:id", verifyAdmin, updateNoOfDecimals);
router.delete("/no-of-decimals/:id", verifyAdmin, deleteNoOfDecimals);

// ============ VENDOR MANAGEMENT ============

// Vendor CRUD operations
router.post("/vendors", verifyAdmin, singleUpload, createVendor);
router.get("/vendors", verifyAdmin, getAllVendors);
router.get("/vendors/:id", verifyAdmin, getVendorById);
router.put("/vendors/:id", verifyAdmin, singleUpload, updateVendor);
router.delete("/vendors/:id", verifyAdmin, deleteVendor);
router.get("/vendors/category/:category_id", verifyAdmin, getVendorsByCategory);

// Vendor Categories CRUD
router.post("/vendor-categories", verifyAdmin, createVendorCategory);
router.get("/vendor-categories", verifyAdmin, getAllVendorCategories);
router.get("/vendor-categories/:id", verifyAdmin, getVendorCategoryById);
router.put("/vendor-categories/:id", verifyAdmin, updateVendorCategory);
router.delete("/vendor-categories/:id", verifyAdmin, deleteVendorCategory);

// Vendor Bank Details CRUD
router.post("/vendor-bank-details", verifyAdmin, createVendorBankDetails);
router.get("/vendor-bank-details", verifyAdmin, getAllVendorBankDetails);
router.get("/vendor-bank-details/:id", verifyAdmin, getVendorBankDetailsById);
router.put("/vendor-bank-details/:id", verifyAdmin, updateVendorBankDetails);
router.delete("/vendor-bank-details/:id", verifyAdmin, deleteVendorBankDetails);

// Vendor Services CRUD
router.post("/vendor-services", verifyAdmin, createVendorService);
router.get("/vendor-services", verifyAdmin, getAllVendorServices);
router.get("/vendor-services/:id", verifyAdmin, getVendorServiceById);
router.put("/vendor-services/:id", verifyAdmin, updateVendorService);
router.delete("/vendor-services/:id", verifyAdmin, deleteVendorService);

// Vendor Documents CRUD
router.post("/vendor-documents", verifyAdmin, singleDocumentUpload, createVendorDocument);
router.get("/vendor-documents", verifyAdmin, getAllVendorDocuments);
router.get("/vendor-documents/:id", verifyAdmin, getVendorDocumentById);
router.put("/vendor-documents/:id", verifyAdmin, singleDocumentUpload, updateVendorDocument);
router.delete("/vendor-documents/:id", verifyAdmin, deleteVendorDocument);

// Get vendor data by vendor ID
router.get("/vendors/:vendor_id/services", verifyAdmin, getVendorServicesByVendorId);
router.get("/vendors/:vendor_id/bank-details", verifyAdmin, getVendorBankDetailsByVendorId);
router.get("/vendors/:vendor_id/documents", verifyAdmin, getVendorDocumentsByVendorId);

// ============ VENDOR CONSULTATIONS MANAGEMENT ============

// Consultations CRUD (Admin)
router.get("/vendor-consultations", verifyAdmin, getAllConsultations);
router.get("/vendor-consultations/:id", verifyAdmin, getConsultationById);
router.put("/vendor-consultations/:id", verifyAdmin, updateConsultationAdmin);

// Vendor Earnings Management (Admin)
router.get("/vendor-earnings", verifyAdmin, getAllEarnings);
router.put("/vendor-earnings/:id/status", verifyAdmin, updateEarningStatus);

// Vendor Reviews Management (Admin)
router.get("/vendor-reviews", verifyAdmin, getAllReviews);
router.get("/vendor-reviews/:id", verifyAdmin, getReviewById);
router.put("/vendor-reviews/:id", verifyAdmin, updateReview);
router.delete("/vendor-reviews/:id", verifyAdmin, deleteReview);

// Vendor Dashboard Statistics (Admin)
router.get("/vendor-dashboard-stats", verifyAdmin, getVendorDashboardStats);

// ============ VENDOR REGISTRATION MANAGEMENT ============

// Get all vendor registrations (admin)
router.get("/vendor-registrations", verifyAdmin, getVendorRegistrations);

// Get specific registration details (admin)
router.get("/vendor-registrations/:temp_id", verifyAdmin, getRegistrationDetails);

// Retry failed registration (admin)
router.post("/vendor-registrations/:temp_id/retry", verifyAdmin, retryFailedRegistration);

// ============ VENDOR SUBSCRIPTION PLANS MANAGEMENT ============

// Vendor Subscription Plans CRUD (Admin)
router.get("/vendor-subscription-plans", verifyAdmin, getAllVendorSubscriptionPlans);
router.get("/vendor-subscription-plans/:id", verifyAdmin, getVendorSubscriptionPlanById);
router.post("/vendor-subscription-plans", verifyAdmin, createVendorSubscriptionPlan);
router.put("/vendor-subscription-plans/:id", verifyAdmin, updateVendorSubscriptionPlan);
router.delete("/vendor-subscription-plans/:id", verifyAdmin, deleteVendorSubscriptionPlan);

// ============ PUBLIC VENDOR APIS (NO TOKEN REQUIRED) ============

// Get all vendors without authentication
router.get("/public/vendors", getAllVendors);

// Get vendors by state_id without authentication (strict state_id matching)
router.get("/public/vendors/state/:state_id", async (req, res) => {
  try {
    const { state_id } = req.params;
    const pageNum = parseInt(req.query.page as string) || 1;
    const limitNum = parseInt(req.query.limit as string) || 10;
    const categoryId = req.query.category_id as string;
    const status = req.query.status as string;
    const city = req.query.city as string;
    const search = req.query.search as string;

    const offset = (pageNum - 1) * limitNum;
    let whereConditions: string[] = [];
    let queryParams: any[] = [];

    // Only match exact state_id (not null values)
    whereConditions.push("v.state_id = ?");
    queryParams.push(state_id);

    // Handle status filtering - support multiple approved statuses
    if (status) {
      if (status === 'approved' || status === 'verified') {
        whereConditions.push("v.status IN ('active', 'approved', 'verified')");
      } else {
        whereConditions.push("v.status = ?");
        queryParams.push(status);
      }
    } else {
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
    const countResult: any[] = await query(countQuery, queryParams);
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

    const vendors: any[] = await query(vendorsQuery, [...queryParams, limitNum, offset]);

    // Get vendor IDs for fetching services and reviews
    const vendorIds = vendors.map(v => v.id);

    // Fetch services for all vendors
    let servicesMap: { [key: number]: any[] } = {};
    if (vendorIds.length > 0) {
      const servicesQuery = `
        SELECT vs.*, cm.currency_name, cm.symbol as currency_symbol
        FROM vendor_services vs
        LEFT JOIN currency_master cm ON vs.currency_id = cm.id
        WHERE vs.vendor_id IN (${vendorIds.map(() => '?').join(',')}) AND vs.status = 'active'
        ORDER BY vs.created_at DESC
      `;
      const services: any[] = await query(servicesQuery, vendorIds);
      services.forEach(service => {
        if (!servicesMap[service.vendor_id]) servicesMap[service.vendor_id] = [];
        servicesMap[service.vendor_id].push(service);
      });
    }

    // Fetch reviews for all vendors
    let reviewsMap: { [key: number]: any[] } = {};
    if (vendorIds.length > 0) {
      const reviewsQuery = `
        SELECT id, vendor_id, reviewer_name, rating, review_text, review_date, status, is_verified, helpful_count
        FROM vendor_reviews
        WHERE vendor_id IN (${vendorIds.map(() => '?').join(',')}) AND status IN ('active', 'pending')
        ORDER BY review_date DESC
      `;
      const reviews: any[] = await query(reviewsQuery, vendorIds);
      reviews.forEach(review => {
        if (!reviewsMap[review.vendor_id]) reviewsMap[review.vendor_id] = [];
        reviewsMap[review.vendor_id].push(review);
      });
    }

    // Process vendors to include plan details, services, and reviews for self-registered vendors
    const processedVendors = vendors.map((vendor: any) => {
      const vendorData = { ...vendor };

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
        } else {
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

      return {
        ...vendorData,
        plan_details: planDetails,
        services: servicesMap[vendor.id] || [],
        reviews: reviewsMap[vendor.id] || []
      };
    });

    // Get state information
    const stateInfoQuery = `SELECT id, state_name FROM states_master WHERE id = ?`;
    const stateInfo: any[] = await query(stateInfoQuery, [state_id]);

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

  } catch (error: any) {
    console.error("Error fetching vendors by state:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
});

module.exports = router;