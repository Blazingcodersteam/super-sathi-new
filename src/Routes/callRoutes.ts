import { Router } from 'express';
import { authenticateToken, requireSubscriptionFeature } from '../middleware/auth';
import {
  createCall,
  acceptCall,
  declineCall,
  endCall,
  getCallHistory,
  getCallHistoryWithUser,
  getCallStatus,
  refreshToken,
  getIncomingCalls
} from '../Controllers/CallController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

const requireCallFeature = (req, res, next) => {
  const callType = String(req.body?.call_type || 'voice').toLowerCase();
  const featureName = callType === 'video' ? 'video_chat_enabled' : 'audio_chat_enabled';
  const message = callType === 'video'
    ? 'Your active subscription plan does not allow video chat.'
    : 'Your active subscription plan does not allow audio chat.';

  return requireSubscriptionFeature(req, res, next, featureName, message);
};
// Create a new call session
router.post('/create', requireCallFeature, createCall);

// Accept an incoming call
router.post('/accept', acceptCall);

// Decline an incoming call
router.post('/decline', declineCall);

// End an active call
router.post('/end', endCall);

// Get call history (global)
router.get('/history', getCallHistory);

// Get call history with a specific user
router.get('/history/with/:user_id', getCallHistoryWithUser);

// Get specific call status
router.get('/status/:call_id', getCallStatus);

// Refresh Agora token for long calls
router.post('/refresh-token', refreshToken);

// Get incoming calls for notifications
router.get('/incoming', getIncomingCalls);

export default router;