"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlocked = getBlocked;
exports.getChatListOLD = getChatListOLD;
exports.getChatList = getChatList;
exports.getMessages = getMessages;
exports.sendMessage = sendMessage;
const utils = require("util");
const client_s3_1 = require("@aws-sdk/client-s3");
const path = require("path");
const SocketManager_1 = require("../socket/SocketManager");
const fcm_1 = require("../utils/fcm");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// AWS S3 Configuration
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "vivaaha-s3";
const CHAT_PUSH_LOG_PREFIX = '[ChatPush]';
const CONNECTION_ENDED_MESSAGE = 'This connection has ended. You can no longer send messages to this user.';
// Helper function to format file size
function formatFileSize(sizeInBytes) {
    if (!sizeInBytes)
        return '0 B';
    if (sizeInBytes >= 1024 * 1024) {
        return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    else if (sizeInBytes >= 1024) {
        return `${(sizeInBytes / 1024).toFixed(2)} KB`;
    }
    return `${sizeInBytes} B`;
}
async function sendOfflineChatPushNotification(receiverId, payload) {
    var _a, _b, _c, _d;
    const socketStatus = (0, SocketManager_1.getUserSocketStatus)(receiverId);
    console.log(`${CHAT_PUSH_LOG_PREFIX} Message sent; receiver socket status`, {
        message_id: payload.id,
        conversation_id: payload.conversation_id,
        receiver_id: receiverId,
        is_online: socketStatus.isOnline,
        socket_count: socketStatus.socketCount,
        socket_ids: socketStatus.socketIds,
    });
    console.log(`${CHAT_PUSH_LOG_PREFIX} FCM will be attempted for chat message`, {
        message_id: payload.id,
        receiver_id: receiverId,
        is_online: socketStatus.isOnline,
    });
    try {
        const [receiverUser] = await query('SELECT fcm_token FROM users WHERE id = ?', [receiverId]);
        const fcmToken = typeof (receiverUser === null || receiverUser === void 0 ? void 0 : receiverUser.fcm_token) === 'string' ? receiverUser.fcm_token.trim() : '';
        if (!fcmToken) {
            console.log(`${CHAT_PUSH_LOG_PREFIX} FCM not triggered because receiver has no token`, {
                message_id: payload.id,
                receiver_id: receiverId,
            });
            return;
        }
        const senderName = ((_a = payload.sender) === null || _a === void 0 ? void 0 : _a.name) || 'New message';
        const body = payload.message_text || (payload.message_type === 'file' ? 'Sent you a file' : 'You received a new message');
        console.log(`${CHAT_PUSH_LOG_PREFIX} FCM triggered`, {
            message_id: payload.id,
            conversation_id: payload.conversation_id,
            receiver_id: receiverId,
            token_suffix: fcmToken.slice(-8),
            payload_type: 'chat_message',
        });
        const firebaseMessageId = await (0, fcm_1.sendPushNotification)({
            token: fcmToken,
            title: senderName,
            body,
            data: {
                type: 'chat_message',
                message_id: String(payload.id),
                conversation_id: String(payload.conversation_id),
                sender_id: String(payload.sender_id),
                receiver_id: String(payload.receiver_id),
                chat_message_type: String(payload.message_type || 'text'),
                message_text: String(payload.message_text || ''),
                sender_name: String(senderName),
                sender_photo: String(((_b = payload.sender) === null || _b === void 0 ? void 0 : _b.photo) || ''),
            },
        });
        console.log(`${CHAT_PUSH_LOG_PREFIX} Firebase response`, {
            message_id: payload.id,
            receiver_id: receiverId,
            firebase_message_id: firebaseMessageId,
        });
    }
    catch (fcmError) {
        if (fcmError === null || fcmError === void 0 ? void 0 : fcmError.invalidToken) {
            //await query('UPDATE users SET fcm_token = NULL WHERE id = ?', [receiverId]);
            console.warn(`${CHAT_PUSH_LOG_PREFIX} Cleared invalid FCM token`, {
                message_id: payload.id,
                receiver_id: receiverId,
                firebase_code: (fcmError === null || fcmError === void 0 ? void 0 : fcmError.firebaseCode) || ((_c = fcmError === null || fcmError === void 0 ? void 0 : fcmError.errorInfo) === null || _c === void 0 ? void 0 : _c.code) || (fcmError === null || fcmError === void 0 ? void 0 : fcmError.code),
            });
        }
        else {
            console.error(`${CHAT_PUSH_LOG_PREFIX} FCM push error`, {
                message_id: payload.id,
                receiver_id: receiverId,
                firebase_code: (fcmError === null || fcmError === void 0 ? void 0 : fcmError.firebaseCode) || ((_d = fcmError === null || fcmError === void 0 ? void 0 : fcmError.errorInfo) === null || _d === void 0 ? void 0 : _d.code) || (fcmError === null || fcmError === void 0 ? void 0 : fcmError.code),
                message: fcmError === null || fcmError === void 0 ? void 0 : fcmError.message,
            });
        }
    }
}
// Get Blocked Users (lightweight version for chat screen)
async function getBlocked(req, res) {
    try {
        const userId = req.user.user_id;
        const blocked = await query(`
      SELECT u.id
      FROM user_actions ua
      JOIN users u ON ua.target_user_id = u.id
      WHERE ua.user_id = ? AND ua.action_type_id = 3
    `, [userId]);
        res.json({
            success: true,
            data: {
                profiles: blocked.map(b => ({ id: b.id }))
            }
        });
    }
    catch (error) {
        console.error("Get Blocked Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Chat List (from connected matches and accepted connect requests)
async function getChatListOLD(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        // Get existing conversations with messages (excluding blocked users)
        const existingConversations = await query(`
      SELECT DISTINCT 
        cc.id as conversation_id,
        CASE 
          WHEN cc.user1_id = ? THEN cc.user2_id 
          ELSE cc.user1_id 
        END as other_user_id,
        u.vivaaha_user_id,
        up.first_name, up.middle_name, up.last_name, up.profile_picture, up.age, up.show_vivaaha_id, up.gender_id,
        CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name,
        cd.city_living_in, cd.occupation,
        CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', FLOOR(TIMESTAMPDIFF(DAY, u.last_active_at, NOW()) / 7), 'w ago') ELSE 'Offline' END as online_status,
        cm.message_text as last_message,
        cm.message_type as last_message_type,
        ca.file_name as last_file_name,
        cc.last_message_time,
        CASE 
          WHEN cc.user1_id = ? THEN cc.user1_unread_count 
          ELSE cc.user2_unread_count 
        END as unread_count,
        TIMESTAMPDIFF(MINUTE, cc.last_message_time, NOW()) as minutes_ago,
        cnr.status as connection_status,
        CASE WHEN cnr.status = 'accepted' THEN 1 ELSE 0 END as can_message,
        'existing' as chat_type
      FROM chat_conversations cc
      JOIN users u ON (
        CASE 
          WHEN cc.user1_id = ? THEN cc.user2_id = u.id
          ELSE cc.user1_id = u.id
        END
      )
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN chat_messages cm ON cc.last_message_id = cm.id
      LEFT JOIN chat_attachments ca ON cm.id = ca.message_id
      LEFT JOIN connect_now_requests cnr ON (
        (cnr.sender_id = cc.user1_id AND cnr.receiver_id = cc.user2_id)
        OR (cnr.sender_id = cc.user2_id AND cnr.receiver_id = cc.user1_id)
      )
      WHERE (cc.user1_id = ? OR cc.user2_id = ?)
        AND u.status = 1
        AND CASE WHEN cc.user1_id = ? THEN cc.user2_id ELSE cc.user1_id END NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
        )
        AND CASE WHEN cc.user1_id = ? THEN cc.user2_id ELSE cc.user1_id END NOT IN (
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId, userId, userId, userId, userId, userId, userId]);
        // Get accepted connect requests that don't have conversations yet (excluding blocked users)
        const acceptedConnections = await query(`
      SELECT DISTINCT
        NULL as conversation_id,
        CASE 
          WHEN cnr.sender_id = ? THEN cnr.receiver_id 
          ELSE cnr.sender_id 
        END as other_user_id,
        u.vivaaha_user_id,
        up.first_name, up.middle_name, up.last_name, up.profile_picture, up.age, up.show_vivaaha_id, up.gender_id,
        CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name,
        cd.city_living_in, cd.occupation,
        CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', FLOOR(TIMESTAMPDIFF(DAY, u.last_active_at, NOW()) / 7), 'w ago') ELSE 'Offline' END as online_status,
        'Start a conversation' as last_message,
        cnr.updated_at as last_message_time,
        0 as unread_count,
        TIMESTAMPDIFF(MINUTE, cnr.updated_at, NOW()) as minutes_ago,
        cnr.status as connection_status,
        1 as can_message,
        'new_connection' as chat_type
      FROM connect_now_requests cnr
      JOIN users u ON (
        CASE 
          WHEN cnr.sender_id = ? THEN cnr.receiver_id = u.id
          ELSE cnr.sender_id = u.id
        END
      )
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      WHERE cnr.status = 'accepted' 
        AND (cnr.sender_id = ? OR cnr.receiver_id = ?)
        AND u.status = 1
        AND NOT EXISTS (
          SELECT 1 FROM chat_conversations cc 
          WHERE (cc.user1_id = ? AND cc.user2_id = CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END)
             OR (cc.user2_id = ? AND cc.user1_id = CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END)
        )
        AND CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
        )
        AND CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END NOT IN (
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]);
        // Combine both results and keep only one chat row per other user.
        const conversationMap = new Map();
        [...existingConversations, ...acceptedConnections].forEach(conv => {
            const otherUserId = Number(conv.other_user_id);
            const existing = conversationMap.get(otherUserId);
            if (!existing) {
                conversationMap.set(otherUserId, conv);
                return;
            }
            const existingRank = existing.chat_type === 'existing' ? 1 : 0;
            const currentRank = conv.chat_type === 'existing' ? 1 : 0;
            const existingTime = new Date(existing.last_message_time).getTime() || 0;
            const currentTime = new Date(conv.last_message_time).getTime() || 0;
            if (currentRank > existingRank || (currentRank === existingRank && currentTime > existingTime)) {
                conversationMap.set(otherUserId, conv);
            }
        });
        const allConversations = Array.from(conversationMap.values());
        // Ensure profile pictures have full S3 URL
        allConversations.forEach(conv => {
            if (conv.profile_picture && !conv.profile_picture.startsWith('http')) {
                conv.profile_picture = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${conv.profile_picture}`;
            }
        });
        // Sort by last_message_time descending
        allConversations.sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());
        // Apply pagination
        const paginatedConversations = allConversations.slice(offset, offset + parseInt(limit));
        res.json({
            success: true,
            conversations: paginatedConversations
        });
    }
    catch (error) {
        console.error("Get Chat List Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Chat List (from connected matches and accepted connect requests)
async function getChatList(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        // Get existing conversations with messages (excluding blocked users)
        const existingConversations = await query(`
      SELECT DISTINCT 
        cc.id as conversation_id,
        CASE 
          WHEN cc.user1_id = ? THEN cc.user2_id 
          ELSE cc.user1_id 
        END as other_user_id,
        u.vivaaha_user_id,
        up.first_name, up.middle_name, up.last_name, up.profile_picture, up.age, up.show_vivaaha_id, up.gender_id,
        CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name,
        cd.city_living_in, cd.occupation,
        CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', FLOOR(TIMESTAMPDIFF(DAY, u.last_active_at, NOW()) / 7), 'w ago') ELSE 'Offline' END as online_status,
        cm.message_text as last_message,
        cm.message_type as last_message_type,
        ca.file_name as last_file_name,
        cc.last_message_time,
        CASE 
          WHEN cc.user1_id = ? THEN cc.user1_unread_count 
          ELSE cc.user2_unread_count 
        END as unread_count,
        TIMESTAMPDIFF(MINUTE, cc.last_message_time, NOW()) as minutes_ago,
        cnr.status as connection_status,
        CASE WHEN cnr.status = 'accepted' THEN 1 ELSE 0 END as can_message,
        'existing' as chat_type
      FROM chat_conversations cc
      JOIN users u ON (
        CASE 
          WHEN cc.user1_id = ? THEN cc.user2_id = u.id
          ELSE cc.user1_id = u.id
        END
      )
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN chat_messages cm ON cc.last_message_id = cm.id
      LEFT JOIN chat_attachments ca ON cm.id = ca.message_id
      LEFT JOIN connect_now_requests cnr ON (
        (cnr.sender_id = cc.user1_id AND cnr.receiver_id = cc.user2_id)
        OR (cnr.sender_id = cc.user2_id AND cnr.receiver_id = cc.user1_id)
      )
      WHERE (cc.user1_id = ? OR cc.user2_id = ?)
        AND u.status = 1
        AND CASE WHEN cc.user1_id = ? THEN cc.user2_id ELSE cc.user1_id END NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
        )
        AND CASE WHEN cc.user1_id = ? THEN cc.user2_id ELSE cc.user1_id END NOT IN (
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId, userId, userId, userId, userId, userId, userId]);
        // Get accepted connect requests that don't have conversations yet (excluding blocked users)
        const acceptedConnections = await query(`
      SELECT DISTINCT
        NULL as conversation_id,
        CASE 
          WHEN cnr.sender_id = ? THEN cnr.receiver_id 
          ELSE cnr.sender_id 
        END as other_user_id,
        u.vivaaha_user_id,
        up.first_name, up.middle_name, up.last_name, up.profile_picture, up.age, up.show_vivaaha_id, up.gender_id,
        CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name,
        cd.city_living_in, cd.occupation,
        CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', FLOOR(TIMESTAMPDIFF(DAY, u.last_active_at, NOW()) / 7), 'w ago') ELSE 'Offline' END as online_status,
        'Start a conversation' as last_message,
        cnr.updated_at as last_message_time,
        0 as unread_count,
        TIMESTAMPDIFF(MINUTE, cnr.updated_at, NOW()) as minutes_ago,
        cnr.status as connection_status,
        1 as can_message,
        'new_connection' as chat_type
      FROM connect_now_requests cnr
      JOIN users u ON (
        CASE 
          WHEN cnr.sender_id = ? THEN cnr.receiver_id = u.id
          ELSE cnr.sender_id = u.id
        END
      )
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      WHERE cnr.status = 'accepted' 
        AND (cnr.sender_id = ? OR cnr.receiver_id = ?)
        AND u.status = 1
        AND NOT EXISTS (
          SELECT 1 FROM chat_conversations cc 
          WHERE (cc.user1_id = ? AND cc.user2_id = CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END)
             OR (cc.user2_id = ? AND cc.user1_id = CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END)
        )
        AND CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
        )
        AND CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END NOT IN (
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]);
        // Combine both results and keep only one chat row per other user.
        const conversationMap = new Map();
        [...existingConversations, ...acceptedConnections].forEach(conv => {
            const otherUserId = Number(conv.other_user_id);
            const existing = conversationMap.get(otherUserId);
            if (!existing) {
                conversationMap.set(otherUserId, conv);
                return;
            }
            const existingRank = existing.chat_type === 'existing' ? 1 : 0;
            const currentRank = conv.chat_type === 'existing' ? 1 : 0;
            const existingTime = new Date(existing.last_message_time).getTime() || 0;
            const currentTime = new Date(conv.last_message_time).getTime() || 0;
            if (currentRank > existingRank || (currentRank === existingRank && currentTime > existingTime)) {
                conversationMap.set(otherUserId, conv);
            }
        });
        const allConversations = Array.from(conversationMap.values());
        // Ensure profile pictures have full S3 URL
        allConversations.forEach(conv => {
            if (conv.profile_picture && !conv.profile_picture.startsWith('http')) {
                conv.profile_picture = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${conv.profile_picture}`;
            }
        });
        // Sort by last_message_time descending
        allConversations.sort((a, b) => new Date(b.last_message_time).getTime() - new Date(a.last_message_time).getTime());
        // Apply pagination
        const paginatedConversations = allConversations.slice(offset, offset + parseInt(limit));
        res.json({
            success: true,
            conversations: paginatedConversations
        });
    }
    catch (error) {
        console.error("Get Chat List Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Messages - FIXED VERSION
async function getMessages(req, res) {
    try {
        const userId = req.user.user_id;
        const { conversation_id } = req.params;
        // Verify user has access to this conversation
        const [convAccess] = await query(`
      SELECT id, user1_id, user2_id FROM chat_conversations 
      WHERE id = ? AND (user1_id = ? OR user2_id = ?)
    `, [conversation_id, userId, userId]);
        if (!convAccess) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized access to this conversation"
            });
        }
        // Block check — if either user blocked the other, return blocked flag
        const otherUserId = convAccess.user1_id === userId ? convAccess.user2_id : convAccess.user1_id;
        const [blockRecord] = await query(`
      SELECT id FROM user_actions 
      WHERE (user_id = ? AND target_user_id = ? AND action_type_id = 3)
         OR (user_id = ? AND target_user_id = ? AND action_type_id = 3)
      LIMIT 1
    `, [userId, otherUserId, otherUserId, userId]);
        if (blockRecord) {
            return res.json({
                success: true,
                messages: [],
                is_blocked: true
            });
        }
        // Get all messages without pagination
        const messages = await query(`
      SELECT 
        cm.id,
        cm.sender_id,
        cm.receiver_id,
        cm.message_text,
        cm.message_type,
        cm.is_read,
        cm.read_at,
        cm.created_at,
        sp.first_name as sender_first_name,
        sp.last_name as sender_last_name,
        sp.profile_picture as sender_photo,
        sp.gender_id as sender_gender_id,
        sp.show_vivaaha_id as sender_show_vivaaha_id,
        su.vivaaha_user_id as sender_vivaaha_user_id,
        rp.first_name as receiver_first_name,
        rp.last_name as receiver_last_name,
        rp.profile_picture as receiver_photo,
        rp.gender_id as receiver_gender_id,
        rp.show_vivaaha_id as receiver_show_vivaaha_id,
        ru.vivaaha_user_id as receiver_vivaaha_user_id
      FROM chat_messages cm
      LEFT JOIN user_profiles sp ON cm.sender_id = sp.user_id
      LEFT JOIN users su ON cm.sender_id = su.id
      LEFT JOIN user_profiles rp ON cm.receiver_id = rp.user_id
      LEFT JOIN users ru ON cm.receiver_id = ru.id
      WHERE cm.conversation_id = ?
      ORDER BY cm.created_at ASC
    `, [conversation_id]);
        // Get attachments separately
        const attachments = await query(`
      SELECT message_id, file_name, file_url, file_type, file_size
      FROM chat_attachments
      WHERE message_id IN (SELECT id FROM chat_messages WHERE conversation_id = ?)
    `, [conversation_id]);
        // Mark messages as read
        await query(`
      UPDATE chat_messages 
      SET is_read = 1, read_at = NOW() 
      WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0
    `, [conversation_id, userId]);
        // Update unread count
        await query(`
      UPDATE chat_conversations 
      SET user1_unread_count = CASE WHEN user1_id = ? THEN 0 ELSE user1_unread_count END,
          user2_unread_count = CASE WHEN user2_id = ? THEN 0 ELSE user2_unread_count END
      WHERE id = ?
    `, [userId, userId, conversation_id]);
        // Format messages
        const attachmentMap = new Map();
        attachments.forEach(att => {
            if (!attachmentMap.has(att.message_id)) {
                attachmentMap.set(att.message_id, []);
            }
            attachmentMap.get(att.message_id).push(att);
        });
        // Helper to ensure profile picture has full URL
        const ensureFullUrl = (pic) => {
            if (!pic)
                return null;
            if (pic.startsWith('http'))
                return pic;
            return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${pic}`;
        };
        const formattedMessages = messages.map(msg => {
            const msgAttachments = attachmentMap.get(msg.id) || [];
            return Object.assign({ id: msg.id, sender_id: msg.sender_id, receiver_id: msg.receiver_id, message_text: msg.message_text, message_type: msg.message_type, is_read: msg.is_read, created_at: msg.created_at, read_at: msg.read_at, sender: {
                    id: msg.sender_id,
                    name: `${msg.sender_first_name || ''} ${msg.sender_last_name || ''}`.trim() || 'Unknown',
                    photo: ensureFullUrl(msg.sender_photo),
                    gender_id: msg.sender_gender_id || null,
                    show_vivaaha_id: msg.sender_show_vivaaha_id || 0,
                    vivaaha_user_id: msg.sender_vivaaha_user_id || null
                }, receiver: {
                    id: msg.receiver_id,
                    name: `${msg.receiver_first_name || ''} ${msg.receiver_last_name || ''}`.trim() || 'Unknown',
                    photo: ensureFullUrl(msg.receiver_photo),
                    gender_id: msg.receiver_gender_id || null,
                    show_vivaaha_id: msg.receiver_show_vivaaha_id || 0,
                    vivaaha_user_id: msg.receiver_vivaaha_user_id || null
                } }, (msgAttachments.length > 0 && {
                attachments: msgAttachments.map(att => ({
                    file_name: att.file_name,
                    file_url: att.file_url,
                    file_type: att.file_type,
                    file_size: formatFileSize(att.file_size)
                }))
            }));
        });
        res.json({
            success: true,
            messages: formattedMessages
        });
    }
    catch (error) {
        console.error("Get Messages Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Send Message (handles text, file, or both)
async function sendMessage(req, res) {
    try {
        const userId = req.user.user_id;
        const { receiver_id, message_text } = req.body;
        const file = req.file;
        if (!receiver_id || (!message_text && !file)) {
            return res.status(400).json({
                success: false,
                message: "Receiver ID and either message text or file is required"
            });
        }
        // Section 8 — only premium users can send messages
        const [sub] = await query(`SELECT id FROM user_subscriptions
       WHERE user_id = ? AND subscription_status_id = 1 AND end_date > NOW()
       LIMIT 1`, [userId]);
        // if (!sub) {
        //   return res.status(403).json({
        //     success: false,
        //     message: 'In the interest of our Premium Members, only Premium users can read and send messages.'
        //   });
        // }
        const [general] = await query(`SELECT subscription_restrictions FROM general_settings
       LIMIT 1`); //subscription_restrictions: 1, //1 is restrictions enable, 0 is restrictions disable
        console.log("Subscription Check:", { sub, general });
        // 0 = Restrictions disabled
        if (general && general.subscription_restrictions === 0) {
        }
        else {
            if (!sub) {
                return res.status(403).json({
                    success: false,
                    message: 'In the interest of our Premium Members, only Premium users can read and send messages.'
                });
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
            return res.status(403).json({ success: false, message: 'Cannot send message to this user' });
        }
        const [connection] = await query(`SELECT status FROM connect_now_requests
      WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      ORDER BY updated_at DESC
      LIMIT 1
    `, [userId, receiver_id, receiver_id, userId]);
        if (!connection || connection.status !== 'accepted') {
            return res.status(403).json({ success: false, message: CONNECTION_ENDED_MESSAGE });
        }
        // Find or create conversation
        let [conversation] = await query(`
      SELECT id FROM chat_conversations 
      WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
    `, [userId, receiver_id, receiver_id, userId]);
        let conversationId;
        if (!conversation) {
            const result = await query(`
        INSERT INTO chat_conversations (user1_id, user2_id) 
        VALUES (?, ?)
      `, [Math.min(userId, receiver_id), Math.max(userId, receiver_id)]);
            conversationId = result.insertId;
        }
        else {
            conversationId = conversation.id;
        }
        let fileUrl = null;
        // Handle file upload if present
        if (file) {
            const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
            const fileExtension = path.extname(safeName).toLowerCase();
            const fileName = `chat-files/${userId}/${Date.now()}${fileExtension}`;
            const uploadParams = {
                Bucket: BUCKET_NAME,
                Key: fileName,
                Body: file.buffer,
                ContentType: file.mimetype,
            };
            await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
            fileUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
        }
        // Determine message type
        const messageType = file ? 'file' : 'text';
        // Insert message
        const messageResult = await query(`
      INSERT INTO chat_messages (conversation_id, sender_id, receiver_id, message_text, message_type) 
      VALUES (?, ?, ?, ?, ?)
    `, [conversationId, userId, receiver_id, message_text || null, messageType]);
        // Insert attachment if file exists
        if (file) {
            await query(`
        INSERT INTO chat_attachments (message_id, file_name, file_url, file_type, file_size) 
        VALUES (?, ?, ?, ?, ?)
      `, [messageResult.insertId, file.originalname, fileUrl, file.mimetype, file.size]);
        }
        // Update conversation: increment unread only for the receiver
        await query(`
      UPDATE chat_conversations 
      SET last_message_id = ?, 
          last_message_time = NOW(),
          user1_unread_count = CASE WHEN user1_id = ? AND user1_id != ? THEN user1_unread_count + 1 ELSE user1_unread_count END,
          user2_unread_count = CASE WHEN user2_id = ? AND user2_id != ? THEN user2_unread_count + 1 ELSE user2_unread_count END
      WHERE id = ?
    `, [messageResult.insertId, receiver_id, userId, receiver_id, userId, conversationId]);
        // Get sender profile for socket payload
        const [senderProfile] = await query('SELECT first_name, last_name, profile_picture FROM user_profiles WHERE user_id = ?', [userId]);
        // Build attachment data
        const attachmentData = fileUrl ? {
            file_url: fileUrl,
            file_name: file === null || file === void 0 ? void 0 : file.originalname,
            file_type: file === null || file === void 0 ? void 0 : file.mimetype,
            file_size: formatFileSize((file === null || file === void 0 ? void 0 : file.size) || 0)
        } : null;
        const socketPayload = Object.assign({ id: messageResult.insertId, conversation_id: conversationId, sender_id: userId, receiver_id: parseInt(receiver_id), message_text: message_text || null, message_type: messageType, is_read: 0, created_at: new Date().toISOString(), sender: {
                id: userId,
                name: `${(senderProfile === null || senderProfile === void 0 ? void 0 : senderProfile.first_name) || ''} ${(senderProfile === null || senderProfile === void 0 ? void 0 : senderProfile.last_name) || ''}`.trim() || 'Unknown',
                photo: (senderProfile === null || senderProfile === void 0 ? void 0 : senderProfile.profile_picture) || null
            } }, (attachmentData && { attachments: [attachmentData] }));
        // Emit to conversation room + receiver's personal room only
        try {
            const io = (0, SocketManager_1.getIO)();
            io.to(`conv_${conversationId}`).emit('new_message', socketPayload);
            io.to(`user_${receiver_id}`).emit('new_message', socketPayload);
            console.log(`[Socket] Emitted message to conv_${conversationId} and user_${receiver_id}`);
        }
        catch (_) { }
        await sendOfflineChatPushNotification(parseInt(receiver_id), socketPayload);
        res.json(Object.assign({ success: true, message: "Message sent successfully", message_id: messageResult.insertId, conversation_id: conversationId, message_type: messageType }, (attachmentData && { attachments: [attachmentData] })));
    }
    catch (error) {
        console.error("Send Message Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=ChatController.js.map