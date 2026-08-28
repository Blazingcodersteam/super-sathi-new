"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const CallController_1 = require("../Controllers/CallController");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_1.authenticateToken);
const requireCallFeature = (req, res, next) => {
    var _a;
    const callType = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.call_type) || 'voice').toLowerCase();
    const featureName = callType === 'video' ? 'video_chat_enabled' : 'audio_chat_enabled';
    const message = callType === 'video'
        ? 'Your active subscription plan does not allow video chat.'
        : 'Your active subscription plan does not allow audio chat.';
    return (0, auth_1.requireSubscriptionFeature)(req, res, next, featureName, message);
};
// Create a new call session
router.post('/create', requireCallFeature, CallController_1.createCall);
// Accept an incoming call
router.post('/accept', CallController_1.acceptCall);
// Decline an incoming call
router.post('/decline', CallController_1.declineCall);
// End an active call
router.post('/end', CallController_1.endCall);
// Get call history (global)
router.get('/history', CallController_1.getCallHistory);
// Get call history with a specific user
router.get('/history/with/:user_id', CallController_1.getCallHistoryWithUser);
// Get specific call status
router.get('/status/:call_id', CallController_1.getCallStatus);
// Refresh Agora token for long calls
router.post('/refresh-token', CallController_1.refreshToken);
// Get incoming calls for notifications
router.get('/incoming', CallController_1.getIncomingCalls);
exports.default = router;
//# sourceMappingURL=callRoutes.js.map