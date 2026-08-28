"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCall = createCall;
exports.acceptCall = acceptCall;
exports.declineCall = declineCall;
exports.endCall = endCall;
exports.getCallHistory = getCallHistory;
exports.getCallStatus = getCallStatus;
exports.refreshToken = refreshToken;
exports.getCallHistoryWithUser = getCallHistoryWithUser;
exports.getIncomingCalls = getIncomingCalls;
const utils = require("util");
const agora_token_1 = require("agora-token");
const EmailService_1 = require("./EmailService");
const SocketManager_1 = require("../socket/SocketManager");
const fcm_1 = require("../utils/fcm");
const AlertsController_1 = require("./AlertsController");
const db = require('../database');
const query = utils.promisify(db.query).bind(db);
const AGORA_APP_ID = process.env.AGORA_APP_ID || 'aa2478188cc6474b95078488cfe7db79';
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || '5acc66fdc26044a18e6df737a7a41259';
const TOKEN_EXPIRATION_TIME = 3600;
const CALL_RING_TIMEOUT_SECONDS = 45;
var CallStatus;
(function (CallStatus) {
    CallStatus["INITIATED"] = "initiated";
    CallStatus["RINGING"] = "ringing";
    CallStatus["ACCEPTED"] = "accepted";
    CallStatus["DECLINED"] = "declined";
    CallStatus["ENDED"] = "ended";
    CallStatus["MISSED"] = "missed";
    CallStatus["FAILED"] = "failed";
})(CallStatus || (CallStatus = {}));
// alert_types_master IDs
const ALERT_INCOMING_CALL = 6;
const ALERT_CALL_ACCEPTED = 7;
const ALERT_CALL_DECLINED = 8;
const ALERT_CALL_ENDED = 9;
const ALERT_CALL_MISSED = 10;
function generateAgoraToken(channelName, uid) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + TOKEN_EXPIRATION_TIME;
    return agora_token_1.RtcTokenBuilder.buildTokenWithUid(AGORA_APP_ID, AGORA_APP_CERTIFICATE, channelName, uid, agora_token_1.RtcRole.PUBLISHER, // FIX: PUBLISHER so users can send audio/video streams
    privilegeExpiredTs, privilegeExpiredTs);
}
async function validateCallPermission(callerId, receiverId) {
    try {
        const [connection] = await query(`
      SELECT id FROM connect_now_requests
      WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      AND status = 'accepted'
    `, [callerId, receiverId, receiverId, callerId]);
        return !!connection;
    }
    catch (error) {
        console.error('Error validating call permission:', error);
        return false;
    }
}
// Auto-expire calls that have been RINGING (not yet accepted) for more than CALL_RING_TIMEOUT_SECONDS
async function autoExpireMissedCalls() {
    try {
        // Only expire calls still in initiated/ringing — never touch accepted calls
        const expiredCalls = await query(`
      SELECT id, caller_id, receiver_id FROM call_sessions
      WHERE status IN (?, ?)
      AND accepted_at IS NULL
      AND TIMESTAMPDIFF(SECOND, created_at, NOW()) > ?
    `, [CallStatus.INITIATED, CallStatus.RINGING, CALL_RING_TIMEOUT_SECONDS]);
        if (expiredCalls.length > 0) {
            const expiredIds = expiredCalls.map((c) => c.id);
            await query(`
        UPDATE call_sessions
        SET status = ?, updated_at = NOW()
        WHERE id IN (?) AND status IN (?, ?) AND accepted_at IS NULL
      `, [CallStatus.MISSED, expiredIds, CallStatus.INITIATED, CallStatus.RINGING]);
            // Create missed call alerts
            for (const call of expiredCalls) {
                await (0, AlertsController_1.createCallAlert)(call.receiver_id, ALERT_CALL_MISSED, call.caller_id, 'Missed Call', 'You missed a call');
                await (0, AlertsController_1.createCallAlert)(call.caller_id, ALERT_CALL_MISSED, call.receiver_id, 'Call Not Answered', 'Your call was not answered');
            }
        }
    }
    catch (error) {
        console.error('Auto expire missed calls error:', error);
    }
}
// Create Call Session
async function createCall(req, res) {
    var _a, _b, _c, _d, _e, _f;
    try {
        const userId = req.user.user_id;
        const { receiver_id, call_type = 'voice' } = req.body;
        if (!receiver_id) {
            return res.status(400).json({ success: false, message: 'receiver_id is required' });
        }
        const hasPermission = await validateCallPermission(userId, receiver_id);
        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: 'You can only call users in your connections list'
            });
        }
        // Check receiver's call preferences & availability
        const [receiverPrivacy] = await query(`SELECT video_call_enabled, voice_call_enabled, availability_time_slot,
              availability_start_time, availability_end_time, availability_days
       FROM privacy_settings WHERE user_id = ?`, [receiver_id]);
        if (receiverPrivacy) {
            // Check if the call type is enabled
            if (call_type === 'video' && receiverPrivacy.video_call_enabled === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'This user is not available for video calls at the moment',
                    error_code: 'CALL_DISABLED'
                });
            }
            if (call_type === 'voice' && receiverPrivacy.voice_call_enabled === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'This user is not available for voice calls at the moment',
                    error_code: 'CALL_DISABLED'
                });
            }
            // Check availability time slot
            if (receiverPrivacy.availability_time_slot === 'specific_time' &&
                receiverPrivacy.availability_start_time && receiverPrivacy.availability_end_time) {
                const now = new Date();
                // Check day availability
                if (receiverPrivacy.availability_days) {
                    let days = [];
                    try {
                        days = typeof receiverPrivacy.availability_days === 'string'
                            ? JSON.parse(receiverPrivacy.availability_days)
                            : receiverPrivacy.availability_days;
                    }
                    catch (_) { }
                    if (days.length > 0) {
                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const today = dayNames[now.getDay()];
                        if (!days.includes(today)) {
                            return res.status(403).json({
                                success: false,
                                message: 'This user is not available for calls at the moment',
                                error_code: 'NOT_AVAILABLE'
                            });
                        }
                    }
                }
                // Check time window
                const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                const startTime = receiverPrivacy.availability_start_time.substring(0, 5);
                const endTime = receiverPrivacy.availability_end_time.substring(0, 5);
                if (currentTime < startTime || currentTime > endTime) {
                    return res.status(403).json({
                        success: false,
                        message: 'This user is not available for calls at the moment',
                        error_code: 'NOT_AVAILABLE'
                    });
                }
            }
        }
        // Block check — bidirectional
        const [blocked] = await query(`
      SELECT id FROM user_actions 
      WHERE (user_id = ? AND target_user_id = ? AND action_type_id = 3)
         OR (user_id = ? AND target_user_id = ? AND action_type_id = 3)
      LIMIT 1
    `, [userId, receiver_id, receiver_id, userId]);
        if (blocked) {
            return res.status(403).json({ success: false, message: 'Cannot call this user' });
        }
        const [receiver] = await query(`
      SELECT u.id, u.email, up.first_name, up.last_name,
             ph.photo_url as photo_url
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_photos ph ON u.id = ph.user_id AND ph.is_primary = 1
      WHERE u.id = ? AND u.status = 1
    `, [receiver_id]);
        if (!receiver) {
            return res.status(404).json({ success: false, message: 'Receiver not found or inactive' });
        }
        const [caller] = await query(`
      SELECT up.first_name, up.last_name,
             ph.photo_url as photo_url
      FROM user_profiles up
      LEFT JOIN user_photos ph ON up.user_id = ph.user_id AND ph.is_primary = 1
      WHERE up.user_id = ?
    `, [userId]);
        const channelName = `call_${userId}_${receiver_id}_${Date.now()}`;
        // Generate tokens using actual user IDs as Agora UIDs
        const callerToken = generateAgoraToken(channelName, userId);
        const receiverToken = generateAgoraToken(channelName, receiver_id);
        const callResult = await query(`
      INSERT INTO call_sessions (
        caller_id, receiver_id, channel_name, call_type, status,
        caller_token, receiver_token, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `, [userId, receiver_id, channelName, call_type, CallStatus.INITIATED, callerToken, receiverToken]);
        const callId = callResult.insertId;
        // Insert notification into user_alerts
        await (0, AlertsController_1.createCallAlert)(receiver_id, ALERT_INCOMING_CALL, userId, 'Incoming Call', `You have an incoming ${call_type} call`, {}, { call_type, call_id: callId });
        try {
            await EmailService_1.EmailService.sendTemplateEmail('incoming_call', receiver.email, {
                user_name: `${receiver.first_name} ${receiver.last_name}`,
                caller_name: `${caller.first_name} ${caller.last_name}`,
                call_type,
                call_id: callId,
            }, {
                fallbackSubject: `Incoming ${call_type.charAt(0).toUpperCase() + call_type.slice(1)} Call - Vivaaha Matrimony`,
                fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2>📞 Incoming ${call_type} Call</h2><p>You have an incoming ${call_type} call from <strong>${caller.first_name} ${caller.last_name}</strong>.</p><p>Please open your Vivaaha app to accept or decline the call.</p><p>Best regards,<br>Vivaaha Matrimony Team</p></div>`,
            });
        }
        catch (emailError) {
            console.error('Failed to send call notification email:', emailError);
        }
        await query(`
      UPDATE call_sessions SET status = ?, updated_at = NOW() WHERE id = ?
    `, [CallStatus.RINGING, callId]);
        // Build call payload for socket + FCM
        const callPayload = {
            id: callId,
            call_id: callId,
            caller_id: userId,
            receiver_id: receiver_id,
            channel_name: channelName,
            receiver_token: receiverToken,
            agora_app_id: AGORA_APP_ID,
            call_type: call_type,
            caller_first_name: caller === null || caller === void 0 ? void 0 : caller.first_name,
            caller_last_name: caller === null || caller === void 0 ? void 0 : caller.last_name,
            caller_photo_url: caller === null || caller === void 0 ? void 0 : caller.photo_url,
            is_incoming: true,
        };
        // Emit incoming_call via socket (works when app is open)
        try {
            const io = (0, SocketManager_1.getIO)();
            io.to(`user_${receiver_id}`).emit('incoming_call', callPayload);
        }
        catch (_) { }
        // Send FCM push notification (works when app is background/killed)
        try {
            const [receiverUser] = await query('SELECT fcm_token FROM users WHERE id = ?', [receiver_id]);
            if (receiverUser === null || receiverUser === void 0 ? void 0 : receiverUser.fcm_token) {
                await (0, fcm_1.sendPushNotification)({
                    token: receiverUser.fcm_token,
                    title: `Incoming ${call_type === 'video' ? 'Video' : 'Voice'} Call`,
                    body: `${(_a = caller === null || caller === void 0 ? void 0 : caller.first_name) !== null && _a !== void 0 ? _a : ''} ${(_b = caller === null || caller === void 0 ? void 0 : caller.last_name) !== null && _b !== void 0 ? _b : ''} is calling you`,
                    data: {
                        type: 'incoming_call',
                        call_id: String(callId),
                        caller_id: String(userId),
                        receiver_id: String(receiver_id),
                        channel_name: channelName,
                        receiver_token: receiverToken,
                        agora_app_id: AGORA_APP_ID,
                        call_type: call_type,
                        caller_first_name: (_c = caller === null || caller === void 0 ? void 0 : caller.first_name) !== null && _c !== void 0 ? _c : '',
                        caller_last_name: (_d = caller === null || caller === void 0 ? void 0 : caller.last_name) !== null && _d !== void 0 ? _d : '',
                        caller_photo_url: (_e = caller === null || caller === void 0 ? void 0 : caller.photo_url) !== null && _e !== void 0 ? _e : '',
                    },
                });
            }
            else {
                console.log(`[Call] receiver ${receiver_id} has no FCM token — relying on socket/polling`);
            }
        }
        catch (fcmError) {
            if (fcmError === null || fcmError === void 0 ? void 0 : fcmError.invalidToken) {
                // Stale/unregistered token — clear it so we don't retry on future calls
                await query('UPDATE users SET fcm_token = NULL WHERE id = ?', [receiver_id]);
                console.warn(`[Call] Cleared stale FCM token for user ${receiver_id}`);
            }
            else {
                console.error('[Call] FCM push error:', (_f = fcmError === null || fcmError === void 0 ? void 0 : fcmError.message) !== null && _f !== void 0 ? _f : fcmError);
            }
        }
        res.json({
            success: true,
            message: 'Call initiated successfully',
            data: {
                call_id: callId,
                caller_id: userId,
                receiver_id: receiver_id,
                channel_name: channelName,
                caller_token: callerToken,
                agora_app_id: AGORA_APP_ID,
                call_type: call_type,
                receiver_first_name: receiver.first_name,
                receiver_last_name: receiver.last_name,
                receiver_photo_url: receiver.photo_url,
                caller_first_name: caller === null || caller === void 0 ? void 0 : caller.first_name,
                caller_last_name: caller === null || caller === void 0 ? void 0 : caller.last_name,
                caller_photo_url: caller === null || caller === void 0 ? void 0 : caller.photo_url,
            }
        });
    }
    catch (error) {
        console.error('Create Call Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create call session' });
    }
}
// Accept Call
async function acceptCall(req, res) {
    try {
        const userId = req.user.user_id;
        const { call_id } = req.body;
        if (!call_id) {
            return res.status(400).json({ success: false, message: 'call_id is required' });
        }
        const [call] = await query(`
      SELECT cs.*,
             cp.first_name as caller_first_name, cp.last_name as caller_last_name,
             cph.photo_url as caller_photo_url
      FROM call_sessions cs
      LEFT JOIN user_profiles cp ON cs.caller_id = cp.user_id
      LEFT JOIN user_photos cph ON cs.caller_id = cph.user_id AND cph.is_primary = 1
      WHERE cs.id = ? AND cs.receiver_id = ? AND cs.status IN (?, ?)
    `, [call_id, userId, CallStatus.INITIATED, CallStatus.RINGING]);
        if (!call) {
            // Check if call was already accepted (idempotency for duplicate tap)
            const [alreadyAccepted] = await query(`
        SELECT cs.*, cp.first_name as caller_first_name, cp.last_name as caller_last_name,
               cph.photo_url as caller_photo_url
        FROM call_sessions cs
        LEFT JOIN user_profiles cp ON cs.caller_id = cp.user_id
        LEFT JOIN user_photos cph ON cs.caller_id = cph.user_id AND cph.is_primary = 1
        WHERE cs.id = ? AND cs.receiver_id = ? AND cs.status = ?
      `, [call_id, userId, CallStatus.ACCEPTED]);
            if (alreadyAccepted) {
                return res.json({
                    success: true,
                    message: 'Call already accepted',
                    data: {
                        call_id: call_id,
                        caller_id: alreadyAccepted.caller_id,
                        receiver_id: userId,
                        channel_name: alreadyAccepted.channel_name,
                        receiver_token: alreadyAccepted.receiver_token,
                        agora_app_id: AGORA_APP_ID,
                        call_type: alreadyAccepted.call_type,
                        caller_first_name: alreadyAccepted.caller_first_name,
                        caller_last_name: alreadyAccepted.caller_last_name,
                        caller_photo_url: alreadyAccepted.caller_photo_url,
                    }
                });
            }
            // Check if call was cancelled/missed by caller
            const [cancelledCall] = await query(`
        SELECT status FROM call_sessions WHERE id = ? AND receiver_id = ?
      `, [call_id, userId]);
            if (cancelledCall && (cancelledCall.status === CallStatus.MISSED || cancelledCall.status === CallStatus.ENDED)) {
                return res.status(410).json({ success: false, message: 'Call was cancelled by the caller' });
            }
            return res.status(404).json({ success: false, message: 'Call not found or cannot be accepted' });
        }
        // CRITICAL FIX: Update status to ACCEPTED immediately to prevent getIncomingCalls from returning it
        await query(`
      UPDATE call_sessions SET status = ?, accepted_at = NOW(), updated_at = NOW() WHERE id = ? AND status IN (?, ?)
    `, [CallStatus.ACCEPTED, call_id, CallStatus.INITIATED, CallStatus.RINGING]);
        // Insert notification into user_alerts
        await (0, AlertsController_1.createCallAlert)(call.caller_id, ALERT_CALL_ACCEPTED, userId, 'Call Accepted', 'Your call has been accepted', {}, null);
        // Notify caller via socket that call was accepted
        try {
            const io = (0, SocketManager_1.getIO)();
            io.to(`user_${call.caller_id}`).emit('call_accepted', {
                call_id: call_id,
                receiver_id: userId,
                channel_name: call.channel_name,
                call_type: call.call_type,
            });
        }
        catch (_) { }
        res.json({
            success: true,
            message: 'Call accepted successfully',
            data: {
                call_id: call_id,
                caller_id: call.caller_id,
                receiver_id: userId,
                channel_name: call.channel_name,
                receiver_token: call.receiver_token,
                agora_app_id: AGORA_APP_ID,
                call_type: call.call_type,
                caller_first_name: call.caller_first_name,
                caller_last_name: call.caller_last_name,
                caller_photo_url: call.caller_photo_url,
            }
        });
    }
    catch (error) {
        console.error('Accept Call Error:', error);
        res.status(500).json({ success: false, message: 'Failed to accept call' });
    }
}
// Decline Call
async function declineCall(req, res) {
    try {
        const userId = req.user.user_id;
        const { call_id, reason } = req.body;
        if (!call_id) {
            return res.status(400).json({ success: false, message: 'call_id is required' });
        }
        const [call] = await query(`
      SELECT * FROM call_sessions
      WHERE id = ? AND receiver_id = ? AND status IN (?, ?)
    `, [call_id, userId, CallStatus.INITIATED, CallStatus.RINGING]);
        if (!call) {
            return res.status(404).json({ success: false, message: 'Call not found or cannot be declined' });
        }
        await query(`
      UPDATE call_sessions
      SET status = ?, declined_at = NOW(), decline_reason = ?, updated_at = NOW()
      WHERE id = ?
    `, [CallStatus.DECLINED, reason || 'User declined', call_id]);
        // Insert notification into user_alerts
        await (0, AlertsController_1.createCallAlert)(call.caller_id, ALERT_CALL_DECLINED, userId, 'Call Declined', 'Your call was declined', {}, null);
        // Notify caller via socket that call was declined
        try {
            const io = (0, SocketManager_1.getIO)();
            io.to(`user_${call.caller_id}`).emit('call_declined', {
                call_id: call_id,
                receiver_id: userId,
            });
        }
        catch (_) { }
        res.json({ success: true, message: 'Call declined successfully' });
    }
    catch (error) {
        console.error('Decline Call Error:', error);
        res.status(500).json({ success: false, message: 'Failed to decline call' });
    }
}
// End Call
async function endCall(req, res) {
    try {
        const userId = req.user.user_id;
        const { call_id } = req.body;
        if (!call_id) {
            return res.status(400).json({ success: false, message: 'call_id is required' });
        }
        // FIX: Allow ending calls in any active status (accepted, ringing, initiated)
        const [call] = await query(`
      SELECT * FROM call_sessions
      WHERE id = ? AND (caller_id = ? OR receiver_id = ?)
      AND status IN (?, ?, ?)
    `, [call_id, userId, userId, CallStatus.ACCEPTED, CallStatus.RINGING, CallStatus.INITIATED]);
        if (!call) {
            return res.status(404).json({ success: false, message: 'Call not found or already ended' });
        }
        // Calculate duration using server time for consistency across devices
        // Use TIMESTAMPDIFF in the update query itself to avoid timezone issues
        const finalStatus = call.status === CallStatus.ACCEPTED ? CallStatus.ENDED : CallStatus.MISSED;
        if (call.accepted_at) {
            // Use MySQL TIMESTAMPDIFF for accurate, consistent duration across devices
            await query(`
        UPDATE call_sessions
        SET status = ?, ended_at = NOW(), duration_seconds = TIMESTAMPDIFF(SECOND, accepted_at, NOW()), updated_at = NOW()
        WHERE id = ?
      `, [finalStatus, call_id]);
        }
        else {
            await query(`
        UPDATE call_sessions
        SET status = ?, ended_at = NOW(), duration_seconds = 0, updated_at = NOW()
        WHERE id = ?
      `, [finalStatus, call_id]);
        }
        // Fetch the actual stored duration for the response
        const [updatedCall] = await query(`SELECT duration_seconds FROM call_sessions WHERE id = ?`, [call_id]);
        const callDuration = (updatedCall === null || updatedCall === void 0 ? void 0 : updatedCall.duration_seconds) || 0;
        const otherUserId = userId === call.caller_id ? call.receiver_id : call.caller_id;
        // Insert notification into user_alerts
        await (0, AlertsController_1.createCallAlert)(otherUserId, ALERT_CALL_ENDED, userId, 'Call Ended', 'Call has ended', {}, { duration_seconds: callDuration, call_type: call.call_type });
        // Notify other party via socket that call ended
        try {
            const io = (0, SocketManager_1.getIO)();
            io.to(`user_${otherUserId}`).emit('call_ended', {
                call_id: call_id,
                ended_by: userId,
                duration_seconds: callDuration,
            });
        }
        catch (_) { }
        res.json({
            success: true,
            message: 'Call ended successfully',
            data: { duration_seconds: callDuration }
        });
    }
    catch (error) {
        console.error('End Call Error:', error);
        res.status(500).json({ success: false, message: 'Failed to end call' });
    }
}
// Get Call History
async function getCallHistory(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 20, call_type, status } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let whereConditions = [
            '(cs.caller_id = ? OR cs.receiver_id = ?)',
            `CASE WHEN cs.caller_id = ? THEN cs.receiver_id ELSE cs.caller_id END NOT IN (
        SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
        UNION
        SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
      )`,
            `CASE WHEN cs.caller_id = ? THEN cs.receiver_id ELSE cs.caller_id END IN (
        SELECT id FROM users WHERE status = 1
      )`
        ];
        let queryParams = [userId, userId, userId, userId, userId, userId];
        let countParams = [userId, userId, userId, userId, userId, userId];
        if (call_type) {
            whereConditions.push('cs.call_type = ?');
            queryParams.push(call_type);
            countParams.push(call_type);
        }
        if (status) {
            whereConditions.push('cs.status = ?');
            queryParams.push(status);
            countParams.push(status);
        }
        const whereClause = whereConditions.join(' AND ');
        queryParams.push(parseInt(limit), offset);
        const calls = await query(`
      SELECT cs.*,
             caller_profile.first_name as caller_first_name,
             caller_profile.last_name as caller_last_name,
             caller_photo.photo_url as caller_photo_url,
             caller_user.vivaaha_user_id as caller_vivaaha_id,
             receiver_profile.first_name as receiver_first_name,
             receiver_profile.last_name as receiver_last_name,
             receiver_photo.photo_url as receiver_photo_url,
             receiver_user.vivaaha_user_id as receiver_vivaaha_id,
             CASE WHEN cs.caller_id = ? THEN 'outgoing' ELSE 'incoming' END as call_direction
      FROM call_sessions cs
      LEFT JOIN user_profiles caller_profile ON cs.caller_id = caller_profile.user_id
      LEFT JOIN users caller_user ON cs.caller_id = caller_user.id
      LEFT JOIN user_photos caller_photo ON cs.caller_id = caller_photo.user_id AND caller_photo.is_primary = 1
      LEFT JOIN user_profiles receiver_profile ON cs.receiver_id = receiver_profile.user_id
      LEFT JOIN users receiver_user ON cs.receiver_id = receiver_user.id
      LEFT JOIN user_photos receiver_photo ON cs.receiver_id = receiver_photo.user_id AND receiver_photo.is_primary = 1
      WHERE ${whereClause}
      ORDER BY cs.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, ...queryParams]);
        const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM call_sessions cs WHERE ${whereClause}
    `, countParams);
        res.json({
            success: true,
            data: {
                calls,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: total,
                    total_pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    }
    catch (error) {
        console.error('Get Call History Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch call history' });
    }
}
// Get Active Call Status
async function getCallStatus(req, res) {
    try {
        const userId = req.user.user_id;
        const { call_id } = req.params;
        const [call] = await query(`
      SELECT cs.*,
             caller_profile.first_name as caller_first_name,
             caller_profile.last_name as caller_last_name,
             caller_photo.photo_url as caller_photo_url,
             receiver_profile.first_name as receiver_first_name,
             receiver_profile.last_name as receiver_last_name,
             receiver_photo.photo_url as receiver_photo_url
      FROM call_sessions cs
      LEFT JOIN user_profiles caller_profile ON cs.caller_id = caller_profile.user_id
      LEFT JOIN user_photos caller_photo ON cs.caller_id = caller_photo.user_id AND caller_photo.is_primary = 1
      LEFT JOIN user_profiles receiver_profile ON cs.receiver_id = receiver_profile.user_id
      LEFT JOIN user_photos receiver_photo ON cs.receiver_id = receiver_photo.user_id AND receiver_photo.is_primary = 1
      WHERE cs.id = ? AND (cs.caller_id = ? OR cs.receiver_id = ?)
    `, [call_id, userId, userId]);
        if (!call) {
            return res.status(404).json({ success: false, message: 'Call not found' });
        }
        res.json({ success: true, data: call });
    }
    catch (error) {
        console.error('Get Call Status Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch call status' });
    }
}
// Refresh Token (for long calls)
async function refreshToken(req, res) {
    try {
        const userId = req.user.user_id;
        const { call_id } = req.body;
        if (!call_id) {
            return res.status(400).json({ success: false, message: 'call_id is required' });
        }
        const [call] = await query(`
      SELECT * FROM call_sessions
      WHERE id = ? AND (caller_id = ? OR receiver_id = ?) AND status = ?
    `, [call_id, userId, userId, CallStatus.ACCEPTED]);
        if (!call) {
            return res.status(404).json({ success: false, message: 'Active call not found' });
        }
        // Generate new token using actual userId as Agora UID
        const newToken = generateAgoraToken(call.channel_name, userId);
        const tokenField = userId === call.caller_id ? 'caller_token' : 'receiver_token';
        await query(`
      UPDATE call_sessions SET ${tokenField} = ?, updated_at = NOW() WHERE id = ?
    `, [newToken, call_id]);
        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: { token: newToken }
        });
    }
    catch (error) {
        console.error('Refresh Token Error:', error);
        res.status(500).json({ success: false, message: 'Failed to refresh token' });
    }
}
// Get Call History with a specific user
async function getCallHistoryWithUser(req, res) {
    try {
        const userId = req.user.user_id;
        const { user_id } = req.params;
        const otherUserId = parseInt(user_id);
        if (!otherUserId || isNaN(otherUserId)) {
            return res.status(400).json({ success: false, message: 'user_id is required' });
        }
        const calls = await query(`
      SELECT
        cs.id,
        cs.call_type,
        cs.status,
        cs.duration_seconds,
        cs.created_at,
        cs.accepted_at,
        cs.ended_at,
        cs.declined_at,
        CASE WHEN cs.caller_id = ? THEN 'outgoing' ELSE 'incoming' END as call_direction
      FROM call_sessions cs
      WHERE (
        (cs.caller_id = ? AND cs.receiver_id = ?) OR
        (cs.caller_id = ? AND cs.receiver_id = ?)
      )
      AND cs.status IN ('ended', 'missed', 'declined')
      ORDER BY cs.created_at DESC
      LIMIT 50
    `, [userId, userId, otherUserId, otherUserId, userId]);
        res.json({ success: true, data: { calls } });
    }
    catch (error) {
        console.error('Get Call History With User Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch call history' });
    }
}
// Get Incoming Calls — auto-expires missed calls before returning
async function getIncomingCalls(req, res) {
    try {
        const userId = req.user.user_id;
        // FIX: Auto-expire missed calls before fetching
        await autoExpireMissedCalls();
        // CRITICAL FIX: Only return calls that are truly pending (not accepted, declined, ended, or missed)
        const incomingCalls = await query(`
      SELECT cs.*,
             caller_profile.first_name as caller_first_name,
             caller_profile.last_name as caller_last_name,
             caller_photo.photo_url as caller_photo_url,
             caller_user.vivaaha_user_id as caller_vivaaha_id
      FROM call_sessions cs
      LEFT JOIN user_profiles caller_profile ON cs.caller_id = caller_profile.user_id
      LEFT JOIN users caller_user ON cs.caller_id = caller_user.id
      LEFT JOIN user_photos caller_photo ON cs.caller_id = caller_photo.user_id AND caller_photo.is_primary = 1
      WHERE cs.receiver_id = ? 
        AND cs.status IN (?, ?) 
        AND cs.accepted_at IS NULL
        AND cs.caller_id NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
          UNION
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        )
      ORDER BY cs.created_at DESC
    `, [userId, CallStatus.INITIATED, CallStatus.RINGING, userId, userId]);
        res.json({
            success: true,
            data: { incoming_calls: incomingCalls }
        });
    }
    catch (error) {
        console.error('Get Incoming Calls Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch incoming calls' });
    }
}
//# sourceMappingURL=CallController.js.map