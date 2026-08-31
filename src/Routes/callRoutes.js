"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const subscriptionAccess_1 = require("../utils/subscriptionAccess");
const CallController_1 = require("../Controllers/CallController");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_1.authenticateToken);
const requireCallFeature = async (req, res, next) => {
    var _a;
    const callType = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.call_type) || 'voice').toLowerCase();
    // Global admin switch first (general_settings.audio_restrictions / video_restrictions).
    // When an admin turns a call type off it is off for everyone, whatever their plan — so
    // this is checked before the per-plan feature. The receiver's own preference
    // (privacy_settings.voice_call_enabled / video_call_enabled) is checked later, in
    // CallController.createCall; all three have to pass.
    if (!(await (0, subscriptionAccess_1.isCallTypeGloballyEnabled)(callType))) {
        return res.status(403).json({
            success: false,
            call_type_disabled: true,
            error_code: 'CALL_TYPE_DISABLED',
            message: callType === 'video'
                ? 'Video calling is currently unavailable.'
                : 'Voice calling is currently unavailable.',
        });
    }
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