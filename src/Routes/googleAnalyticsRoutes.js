"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const GoogleAnalyticsController_1 = require("../Controllers/GoogleAnalyticsController");
const router = (0, express_1.Router)();
// Middleware for admin authentication (assuming you have this)
// const { authenticateAdmin } = require('../middleware/auth');
/**
 * @route   GET /api/admin/google-analytics
 * @desc    Get Google Analytics settings
 * @access  Admin
 */
router.get('/', GoogleAnalyticsController_1.GoogleAnalyticsController.getSettings);
/**
 * @route   PUT /api/admin/google-analytics
 * @desc    Update Google Analytics settings
 * @access  Admin
 */
router.put('/', GoogleAnalyticsController_1.GoogleAnalyticsController.updateSettings);
/**
 * @route   POST /api/admin/google-analytics/toggle
 * @desc    Toggle Google Analytics activation
 * @access  Admin
 */
router.post('/toggle', GoogleAnalyticsController_1.GoogleAnalyticsController.toggleActivation);
/**
 * @route   GET /api/admin/google-analytics/status
 * @desc    Get Google Analytics status for frontend
 * @access  Admin
 */
router.get('/status', GoogleAnalyticsController_1.GoogleAnalyticsController.getStatus);
/**
 * @route   POST /api/admin/google-analytics/reset
 * @desc    Reset Google Analytics settings to default
 * @access  Admin
 */
router.post('/reset', GoogleAnalyticsController_1.GoogleAnalyticsController.resetSettings);
/**
 * @route   GET /api/admin/google-analytics/history
 * @desc    Get Google Analytics settings history
 * @access  Admin
 */
router.get('/history', GoogleAnalyticsController_1.GoogleAnalyticsController.getHistory);
/**
 * @route   POST /api/admin/google-analytics/validate
 * @desc    Validate Google Analytics key format
 * @access  Admin
 */
router.post('/validate', GoogleAnalyticsController_1.GoogleAnalyticsController.validateKey);
exports.default = router;
//# sourceMappingURL=googleAnalyticsRoutes.js.map