import { Router } from 'express';
import { GoogleAnalyticsController } from '../Controllers/GoogleAnalyticsController';

const router = Router();

// Middleware for admin authentication (assuming you have this)
// const { authenticateAdmin } = require('../middleware/auth');

/**
 * @route   GET /api/admin/google-analytics
 * @desc    Get Google Analytics settings
 * @access  Admin
 */
router.get('/', GoogleAnalyticsController.getSettings);

/**
 * @route   PUT /api/admin/google-analytics
 * @desc    Update Google Analytics settings
 * @access  Admin
 */
router.put('/', GoogleAnalyticsController.updateSettings);

/**
 * @route   POST /api/admin/google-analytics/toggle
 * @desc    Toggle Google Analytics activation
 * @access  Admin
 */
router.post('/toggle', GoogleAnalyticsController.toggleActivation);

/**
 * @route   GET /api/admin/google-analytics/status
 * @desc    Get Google Analytics status for frontend
 * @access  Admin
 */
router.get('/status', GoogleAnalyticsController.getStatus);

/**
 * @route   POST /api/admin/google-analytics/reset
 * @desc    Reset Google Analytics settings to default
 * @access  Admin
 */
router.post('/reset', GoogleAnalyticsController.resetSettings);

/**
 * @route   GET /api/admin/google-analytics/history
 * @desc    Get Google Analytics settings history
 * @access  Admin
 */
router.get('/history', GoogleAnalyticsController.getHistory);

/**
 * @route   POST /api/admin/google-analytics/validate
 * @desc    Validate Google Analytics key format
 * @access  Admin
 */
router.post('/validate', GoogleAnalyticsController.validateKey);

export default router;