"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocket = initSocket;
exports.getIO = getIO;
exports.isUserOnline = isUserOnline;
const socket_io_1 = require("socket.io");
const jwt = require("jsonwebtoken");
const utils = require("util");
const db = require('../database');
const query = utils.promisify(db.query).bind(db);
const JWT_SECRET = process.env.JWT_SECRET_KEY;
let io;
// userId -> socketId map
const onlineUsers = new Map();
function initSocket(server) {
    io = new socket_io_1.Server(server, {
        cors: {
            origin: process.env.SOCKET_FRONTEND_URL || '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'], // fallback to polling if websocket fails
    });
    // ── JWT Auth middleware ──────────────────────────────────────────────────────
    io.use((socket, next) => {
        var _a, _b, _c;
        const token = ((_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.token) ||
            ((_c = (_b = socket.handshake.headers) === null || _b === void 0 ? void 0 : _b.authorization) === null || _c === void 0 ? void 0 : _c.toString().split(' ')[1]);
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
        var _a;
        const userId = (_a = socket.user) === null || _a === void 0 ? void 0 : _a.user_id;
        if (!userId) {
            socket.disconnect();
            return;
        }
        onlineUsers.set(userId, socket.id);
        socket.join(`user_${userId}`);
        _updateLastActive(userId);
        console.log(`[Socket] connected userId=${userId}`);
        // ── Join user's personal room (for receiving messages on any screen) ────────
        socket.on('join_user_room', () => {
            socket.join(`user_${userId}`);
            console.log(`[Socket] userId=${userId} explicitly joined user_${userId}`);
        });
        // ── Join conversation room ─────────────────────────────────────────────────
        socket.on('join_conversation', async ({ conversation_id }) => {
            if (!conversation_id)
                return;
            try {
                const [conv] = await query('SELECT id FROM chat_conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)', [conversation_id, userId, userId]);
                if (conv) {
                    socket.join(`conv_${conversation_id}`);
                    console.log(`[Socket] userId=${userId} joined conv_${conversation_id}`);
                }
            }
            catch (_) { }
        });
        socket.on('leave_conversation', ({ conversation_id }) => {
            socket.leave(`conv_${conversation_id}`);
        });
        // ── Send message ───────────────────────────────────────────────────────────
        socket.on('send_message', async (data, ack) => {
            var _a, _b;
            try {
                const { receiver_id, message_text } = data;
                if (!receiver_id || !(message_text === null || message_text === void 0 ? void 0 : message_text.trim())) {
                    return ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'receiver_id and message_text required' });
                }
                // Section 8 — only premium users can send messages
                const [sub] = await query(`SELECT id FROM user_subscriptions
           WHERE user_id = ? AND subscription_status_id = 1 AND end_date > NOW()
           LIMIT 1`, [userId]);
                // if (!sub) {
                //   return ack?.({
                //     success: false,
                //     message: 'In the interest of our Premium Members, only Premium users can read and send messages.'
                //   });
                // }
                const [general] = await query(`SELECT subscription_restrictions FROM general_settings
          LIMIT 1`); //subscription_restrictions: 1, //1 is restrictions enable, 0 is restrictions disable
                // 0 = Restrictions disabled
                if (general && general.subscription_restrictions === 0) {
                }
                else {
                    if (!sub) {
                        return ack === null || ack === void 0 ? void 0 : ack({
                            success: false,
                            message: 'In the interest of our Premium Members, only Premium users can read and send messages.'
                        });
                    }
                }
                // Find or create conversation
                let conversationId = data.conversation_id;
                if (!conversationId) {
                    const [existing] = await query('SELECT id FROM chat_conversations WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)', [userId, receiver_id, receiver_id, userId]);
                    if (existing) {
                        conversationId = existing.id;
                    }
                    else {
                        const result = await query('INSERT INTO chat_conversations (user1_id, user2_id) VALUES (?, ?)', [Math.min(userId, receiver_id), Math.max(userId, receiver_id)]);
                        conversationId = result.insertId;
                    }
                }
                // Insert message
                const msgResult = await query('INSERT INTO chat_messages (conversation_id, sender_id, receiver_id, message_text, message_type) VALUES (?, ?, ?, ?, ?)', [conversationId, userId, receiver_id, message_text.trim(), 'text']);
                // Update conversation: increment unread count only for the RECEIVER
                await query(`UPDATE chat_conversations
           SET last_message_id = ?, last_message_time = NOW(),
               user1_unread_count = CASE WHEN user1_id = ? AND user1_id != ? THEN user1_unread_count + 1 ELSE user1_unread_count END,
               user2_unread_count = CASE WHEN user2_id = ? AND user2_id != ? THEN user2_unread_count + 1 ELSE user2_unread_count END
           WHERE id = ?`, [msgResult.insertId, receiver_id, userId, receiver_id, userId, conversationId]);
                // Get sender profile
                const [sender] = await query('SELECT first_name, last_name, profile_picture FROM user_profiles WHERE user_id = ?', [userId]);
                const payload = {
                    id: msgResult.insertId,
                    conversation_id: conversationId,
                    sender_id: userId,
                    receiver_id,
                    message_text: message_text.trim(),
                    message_type: 'text',
                    is_read: 0,
                    created_at: new Date().toISOString(),
                    sender_name: (_a = sender === null || sender === void 0 ? void 0 : sender.first_name) !== null && _a !== void 0 ? _a : '',
                    sender_photo: (_b = sender === null || sender === void 0 ? void 0 : sender.profile_picture) !== null && _b !== void 0 ? _b : null,
                };
                // Emit to conversation room for both users if joined.
                // Also emit to receiver's personal room in case they haven't joined the conv room.
                // Use except() to avoid double-delivery to sender.
                io.to(`conv_${conversationId}`).except(`user_${userId}`).emit('new_message', payload);
                io.to(`user_${receiver_id}`).emit('new_message', payload);
                ack === null || ack === void 0 ? void 0 : ack({ success: true, message_id: msgResult.insertId, conversation_id: conversationId });
            }
            catch (err) {
                console.error('[Socket] send_message error:', err);
                ack === null || ack === void 0 ? void 0 : ack({ success: false, message: 'Server error' });
            }
        });
        // ── Typing indicators ──────────────────────────────────────────────────────
        socket.on('typing_start', ({ conversation_id, receiver_id }) => {
            io.to(`user_${receiver_id}`).emit('typing_start', { conversation_id, sender_id: userId });
        });
        socket.on('typing_stop', ({ conversation_id, receiver_id }) => {
            io.to(`user_${receiver_id}`).emit('typing_stop', { conversation_id, sender_id: userId });
        });
        // ── Mark read ──────────────────────────────────────────────────────────────
        socket.on('mark_read', async ({ conversation_id, sender_id }) => {
            try {
                await query('UPDATE chat_messages SET is_read=1, read_at=NOW() WHERE conversation_id=? AND receiver_id=? AND is_read=0', [conversation_id, userId]);
                await query(`UPDATE chat_conversations
           SET user1_unread_count = CASE WHEN user1_id=? THEN 0 ELSE user1_unread_count END,
               user2_unread_count = CASE WHEN user2_id=? THEN 0 ELSE user2_unread_count END
           WHERE id=?`, [userId, userId, conversation_id]);
                io.to(`user_${sender_id}`).emit('messages_read', { conversation_id, read_by: userId });
            }
            catch (_) { }
        });
        // ── Reconnect: re-join all conversation rooms ──────────────────────────────
        socket.on('rejoin_conversations', async () => {
            try {
                const convs = await query('SELECT id FROM chat_conversations WHERE user1_id = ? OR user2_id = ?', [userId, userId]);
                for (const conv of convs) {
                    socket.join(`conv_${conv.id}`);
                }
                console.log(`[Socket] userId=${userId} rejoined ${convs.length} conversations`);
            }
            catch (_) { }
        });
        // ── Disconnect ─────────────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            onlineUsers.delete(userId);
            _updateLastActive(userId);
            console.log(`[Socket] disconnected userId=${userId}`);
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
function isUserOnline(userId) { return onlineUsers.has(userId); }
//# sourceMappingURL=SocketManager_old.js.map