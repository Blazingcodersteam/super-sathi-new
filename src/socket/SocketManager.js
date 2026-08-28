"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
exports.getIO = getIO;
exports.getUserSocketStatus = getUserSocketStatus;
exports.isUserOnline = isUserOnline;
const socket_io_1 = require("socket.io");
const jwt = require("jsonwebtoken");
const utils = require("util");
const fcm_1 = require("../utils/fcm");
const db = require('../database');
const query = utils.promisify(db.query).bind(db);
const JWT_SECRET = process.env.JWT_SECRET_KEY;
let io;
const onlineUsers = new Map();
const CHAT_PUSH_LOG_PREFIX = '[ChatPush]';
const CONNECTION_ENDED_MESSAGE = 'This connection has ended. You can no longer send messages to this user.';
function getUserId(socket) {
    var _a, _b, _c;
    const rawUserId = (_b = (_a = socket.user) === null || _a === void 0 ? void 0 : _a.user_id) !== null && _b !== void 0 ? _b : (_c = socket.user) === null || _c === void 0 ? void 0 : _c.id;
    const userId = Number(rawUserId);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
}
function normalizeId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}
function getAllowedOrigins() {
    const origins = process.env.SOCKET_FRONTEND_URL;
    if (!origins)
        return '*';
    return origins.split(',').map((origin) => origin.trim()).filter(Boolean);
}
function trackSocket(userId, socketId) {
    var _a;
    const sockets = (_a = onlineUsers.get(userId)) !== null && _a !== void 0 ? _a : new Set();
    sockets.add(socketId);
    onlineUsers.set(userId, sockets);
}
function untrackSocket(userId, socketId) {
    const sockets = onlineUsers.get(userId);
    if (!sockets)
        return;
    sockets.delete(socketId);
    if (sockets.size === 0)
        onlineUsers.delete(userId);
}
function getActiveSocketIds(userId) {
    const sockets = onlineUsers.get(userId);
    if (!sockets || !io)
        return [];
    const activeSocketIds = [];
    for (const socketId of sockets) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket && !socket.disconnected) {
            activeSocketIds.push(socketId);
        }
        else {
            sockets.delete(socketId);
        }
    }
    if (sockets.size === 0) {
        onlineUsers.delete(userId);
    }
    return activeSocketIds;
}
async function getConversationForUser(conversationId, userId) {
    const [conversation] = await query(`SELECT id, user1_id, user2_id
     FROM chat_conversations
     WHERE id = ? AND (user1_id = ? OR user2_id = ?)
     LIMIT 1`, [conversationId, userId, userId]);
    return conversation || null;
}
function getOtherParticipant(conversation, userId) {
    return conversation.user1_id === userId ? conversation.user2_id : conversation.user1_id;
}
async function getExistingConversation(userId, receiverId) {
    const [conversation] = await query(`SELECT id, user1_id, user2_id
     FROM chat_conversations
     WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
     LIMIT 1`, [userId, receiverId, receiverId, userId]);
    return conversation || null;
}
async function hasBlockedRelationship(userId, receiverId) {
    const [blocked] = await query(`SELECT id
     FROM user_actions
     WHERE action_type_id IN (2, 3)
       AND (
         (user_id = ? AND target_user_id = ?)
         OR (user_id = ? AND target_user_id = ? AND action_type_id = 3)
       )
     LIMIT 1`, [userId, receiverId, receiverId, userId]);
    return !!blocked;
}
async function getConnectionStatus(userId, receiverId) {
    const [connection] = await query(`SELECT status
     FROM connect_now_requests
     WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
     ORDER BY updated_at DESC
     LIMIT 1`, [userId, receiverId, receiverId, userId]);
    return (connection === null || connection === void 0 ? void 0 : connection.status) || null;
}
async function ensureMessageAllowed(userId, receiverId) {
    const [receiver] = await query('SELECT id FROM users WHERE id = ? AND status = 1 LIMIT 1', [receiverId]);
    if (!receiver) {
        return { allowed: false, message: 'Receiver not found or inactive' };
    }
    if (await hasBlockedRelationship(userId, receiverId)) {
        return { allowed: false, message: 'You cannot message this user' };
    }
    const connectionStatus = await getConnectionStatus(userId, receiverId);
    if (connectionStatus !== 'accepted') {
        return { allowed: false, message: CONNECTION_ENDED_MESSAGE };
    }
    return { allowed: true };
}
async function isPremiumMessagingAllowed(userId) {
    const [general] = await query('SELECT subscription_restrictions FROM general_settings LIMIT 1');
    if (general && Number(general.subscription_restrictions) === 0)
        return true;
    const [sub] = await query(`SELECT id
     FROM user_subscriptions
     WHERE user_id = ? AND subscription_status_id = 1 AND end_date > NOW()
     LIMIT 1`, [userId]);
    return !!sub;
}
async function sendOfflineChatPushNotification(receiverId, payload) {
    var _a, _b;
    const socketStatus = getUserSocketStatus(receiverId);
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
        console.log(`${CHAT_PUSH_LOG_PREFIX} FCM triggered`, {
            message_id: payload.id,
            conversation_id: payload.conversation_id,
            receiver_id: receiverId,
            token_suffix: fcmToken.slice(-8),
            payload_type: 'chat_message',
        });
        const firebaseMessageId = await (0, fcm_1.sendPushNotification)({
            token: fcmToken,
            title: payload.sender_name || 'New message',
            body: payload.message_text || 'You received a new message',
            data: {
                type: 'chat_message',
                message_id: String(payload.id),
                conversation_id: String(payload.conversation_id),
                sender_id: String(payload.sender_id),
                receiver_id: String(payload.receiver_id),
                chat_message_type: String(payload.message_type || 'text'),
                message_text: String(payload.message_text || ''),
                sender_name: String(payload.sender_name || ''),
                sender_photo: String(payload.sender_photo || ''),
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
                firebase_code: (fcmError === null || fcmError === void 0 ? void 0 : fcmError.firebaseCode) || ((_a = fcmError === null || fcmError === void 0 ? void 0 : fcmError.errorInfo) === null || _a === void 0 ? void 0 : _a.code) || (fcmError === null || fcmError === void 0 ? void 0 : fcmError.code),
            });
        }
        else {
            console.error(`${CHAT_PUSH_LOG_PREFIX} FCM push error`, {
                message_id: payload.id,
                receiver_id: receiverId,
                firebase_code: (fcmError === null || fcmError === void 0 ? void 0 : fcmError.firebaseCode) || ((_b = fcmError === null || fcmError === void 0 ? void 0 : fcmError.errorInfo) === null || _b === void 0 ? void 0 : _b.code) || (fcmError === null || fcmError === void 0 ? void 0 : fcmError.code),
                message: fcmError === null || fcmError === void 0 ? void 0 : fcmError.message,
            });
        }
    }
}
function initSocket(server) {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: getAllowedOrigins(),
            methods: ['GET', 'POST'],
            credentials: process.env.SOCKET_FRONTEND_URL ? true : false
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
    });
    io.use((socket, next) => {
        var _a, _b, _c;
        const authHeader = (_b = (_a = socket.handshake.headers) === null || _a === void 0 ? void 0 : _a.authorization) === null || _b === void 0 ? void 0 : _b.toString();
        const token = ((_c = socket.handshake.auth) === null || _c === void 0 ? void 0 : _c.token) || ((authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer ')) ? authHeader.slice(7) : undefined);
        if (!token)
            return next(new Error('No token'));
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err)
                return next(new Error('Invalid token'));
            socket.user = user;
            next();
        });
    });
    io.on('connection', (socket) => {
        const userId = getUserId(socket);
        if (!userId) {
            socket.disconnect();
            return;
        }
        trackSocket(userId, socket.id);
        socket.join(`user_${userId}`);
        _updateLastActive(userId);
        console.log(`[Socket] connected userId=${userId} socketId=${socket.id}`);
        socket.on('join_user_room', () => {
            socket.join(`user_${userId}`);
        });
        socket.on('join_conversation', async ({ conversation_id }, ack) => {
            const conversationId = normalizeId(conversation_id);
            if (!conversationId)
                return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'conversation_id required' });
            try {
                const conversation = await getConversationForUser(conversationId, userId);
                if (!conversation)
                    return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'Conversation not found' });
                socket.join(`conv_${conversationId}`);
                ack === null || ack === void 0 ? void 0 : ack({ success: true, conversation_id: conversationId });
            }
            catch (err) {
                console.error('[Socket] join_conversation error:', err);
                ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'Server error' });
            }
        });
        socket.on('leave_conversation', ({ conversation_id }) => {
            const conversationId = normalizeId(conversation_id);
            if (conversationId)
                socket.leave(`conv_${conversationId}`);
        });
        socket.on('send_message', async (data, ack) => {
            var _a, _b;
            try {
                const receiverId = normalizeId(data === null || data === void 0 ? void 0 : data.receiver_id);
                const requestedConversationId = normalizeId(data === null || data === void 0 ? void 0 : data.conversation_id);
                const messageText = String((_a = data === null || data === void 0 ? void 0 : data.message_text) !== null && _a !== void 0 ? _a : '').trim();
                if (!receiverId || !messageText) {
                    return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'receiver_id and message_text required' });
                }
                if (receiverId === userId) {
                    return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'Cannot send message to yourself' });
                }
                if (!(await isPremiumMessagingAllowed(userId))) {
                    return ack === null || ack === void 0 ? void 0 : ack({
                        success: false,
                        message: 'In the interest of our Premium Members, only Premium users can read and send messages.'
                    });
                }
                let conversation = null;
                let hasExistingConversation = false;
                if (requestedConversationId) {
                    conversation = await getConversationForUser(requestedConversationId, userId);
                    if (!conversation)
                        return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'Conversation not found' });
                    const actualReceiverId = getOtherParticipant(conversation, userId);
                    if (actualReceiverId !== receiverId) {
                        return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'receiver_id does not match conversation' });
                    }
                    hasExistingConversation = true;
                }
                else {
                    conversation = await getExistingConversation(userId, receiverId);
                    hasExistingConversation = !!conversation;
                }
                const permission = await ensureMessageAllowed(userId, receiverId);
                if (!permission.allowed)
                    return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: permission.message });
                if (!conversation) {
                    const result = await query('INSERT INTO chat_conversations (user1_id, user2_id) VALUES (?, ?)', [Math.min(userId, receiverId), Math.max(userId, receiverId)]);
                    conversation = {
                        id: result.insertId,
                        user1_id: Math.min(userId, receiverId),
                        user2_id: Math.max(userId, receiverId)
                    };
                }
                const conversationId = conversation.id;
                const msgResult = await query('INSERT INTO chat_messages (conversation_id, sender_id, receiver_id, message_text, message_type) VALUES (?, ?, ?, ?, ?)', [conversationId, userId, receiverId, messageText, 'text']);
                await query(`UPDATE chat_conversations
           SET last_message_id = ?, last_message_time = NOW(),
               user1_unread_count = CASE WHEN user1_id = ? THEN user1_unread_count + 1 ELSE user1_unread_count END,
               user2_unread_count = CASE WHEN user2_id = ? THEN user2_unread_count + 1 ELSE user2_unread_count END
           WHERE id = ?`, [msgResult.insertId, receiverId, receiverId, conversationId]);
                const [sender] = await query('SELECT first_name, last_name, profile_picture FROM user_profiles WHERE user_id = ?', [userId]);
                const payload = {
                    id: msgResult.insertId,
                    conversation_id: conversationId,
                    sender_id: userId,
                    receiver_id: receiverId,
                    message_text: messageText,
                    message_type: 'text',
                    is_read: 0,
                    created_at: new Date().toISOString(),
                    sender_name: [sender === null || sender === void 0 ? void 0 : sender.first_name, sender === null || sender === void 0 ? void 0 : sender.last_name].filter(Boolean).join(' '),
                    sender_photo: (_b = sender === null || sender === void 0 ? void 0 : sender.profile_picture) !== null && _b !== void 0 ? _b : null,
                };
                io.to(`user_${receiverId}`).emit('new_message', payload);
                await sendOfflineChatPushNotification(receiverId, payload);
                ack === null || ack === void 0 ? void 0 : ack({ success: true, message_id: msgResult.insertId, conversation_id: conversationId });
            }
            catch (err) {
                console.error('[Socket] send_message error:', err);
                ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'Server error' });
            }
        });
        socket.on('typing_start', async ({ conversation_id }) => {
            try {
                const conversationId = normalizeId(conversation_id);
                if (!conversationId)
                    return;
                const conversation = await getConversationForUser(conversationId, userId);
                if (!conversation)
                    return;
                io.to(`user_${getOtherParticipant(conversation, userId)}`).emit('typing_start', {
                    conversation_id: conversationId,
                    sender_id: userId
                });
            }
            catch (err) {
                console.error('[Socket] typing_start error:', err);
            }
        });
        socket.on('typing_stop', async ({ conversation_id }) => {
            try {
                const conversationId = normalizeId(conversation_id);
                if (!conversationId)
                    return;
                const conversation = await getConversationForUser(conversationId, userId);
                if (!conversation)
                    return;
                io.to(`user_${getOtherParticipant(conversation, userId)}`).emit('typing_stop', {
                    conversation_id: conversationId,
                    sender_id: userId
                });
            }
            catch (err) {
                console.error('[Socket] typing_stop error:', err);
            }
        });
        socket.on('mark_read', async ({ conversation_id }, ack) => {
            try {
                const conversationId = normalizeId(conversation_id);
                if (!conversationId)
                    return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'conversation_id required' });
                const conversation = await getConversationForUser(conversationId, userId);
                if (!conversation)
                    return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'Conversation not found' });
                const senderId = getOtherParticipant(conversation, userId);
                await query('UPDATE chat_messages SET is_read = 1, read_at = NOW() WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0', [conversationId, userId]);
                await query(`UPDATE chat_conversations
           SET user1_unread_count = CASE WHEN user1_id = ? THEN 0 ELSE user1_unread_count END,
               user2_unread_count = CASE WHEN user2_id = ? THEN 0 ELSE user2_unread_count END
           WHERE id = ?`, [userId, userId, conversationId]);
                io.to(`user_${senderId}`).emit('messages_read', { conversation_id: conversationId, read_by: userId });
                ack === null || ack === void 0 ? void 0 : ack({ success: true, conversation_id: conversationId });
            }
            catch (err) {
                console.error('[Socket] mark_read error:', err);
                ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'Server error' });
            }
        });
        socket.on('rejoin_conversations', async (ack) => {
            try {
                const convs = await query('SELECT id FROM chat_conversations WHERE user1_id = ? OR user2_id = ?', [userId, userId]);
                for (const conv of convs) {
                    socket.join(`conv_${conv.id}`);
                }
                ack === null || ack === void 0 ? void 0 : ack({ success: true, count: convs.length });
            }
            catch (err) {
                console.error('[Socket] rejoin_conversations error:', err);
                ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'Server error' });
            }
        });
        socket.on('disconnect', () => {
            untrackSocket(userId, socket.id);
            _updateLastActive(userId);
            console.log(`[Socket] disconnected userId=${userId} socketId=${socket.id}`);
        });
    });
    return io;
}
async function _updateLastActive(userId) {
    try {
        await query('UPDATE users SET last_active_at = NOW() WHERE id = ?', [userId]);
    }
    catch (_) { }
}
function getIO() { return io; }
function getUserSocketStatus(userId) {
    const socketIds = getActiveSocketIds(userId);
    return {
        isOnline: socketIds.length > 0,
        socketCount: socketIds.length,
        socketIds,
    };
}
function isUserOnline(userId) { return getUserSocketStatus(userId).isOnline; }
//# sourceMappingURL=SocketManager.js.map