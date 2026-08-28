"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = sendPushNotification;
const admin = require("firebase-admin");
const path = require("path");
let initialized = false;
let firebaseProjectId = '';
function getApp() {
    if (!initialized) {
        // 1. Try env var first (production)
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (serviceAccountJson) {
            const serviceAccount = JSON.parse(serviceAccountJson);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            firebaseProjectId = serviceAccount.project_id || '';
        }
        else {
            // 2. Fallback: load the service account JSON file directly
            const serviceAccountPath = path.resolve(__dirname, 'super-sathi-universe-firebase-adminsdk-fbsvc-0f8cb206bd.json');
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            firebaseProjectId = serviceAccount.project_id || '';
        }
        initialized = true;
        console.log(`[FCM] Firebase Admin initialized project=${firebaseProjectId || 'unknown'}`);
    }
    return admin.app();
}
async function sendPushNotification(payload) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const app = getApp();
        const isCall = ((_a = payload.data) === null || _a === void 0 ? void 0 : _a.type) === 'incoming_call';
        const tokenSuffix = payload.token ? payload.token.slice(-8) : 'missing';
        const message = {
            token: payload.token,
            data: Object.assign(Object.assign({}, (_b = payload.data) !== null && _b !== void 0 ? _b : {}), { title: payload.title, body: payload.body }),
            android: {
                priority: 'high',
                notification: isCall ? {
                    sound: 'default',
                    channelId: 'call_channel',
                    priority: 'max',
                    icon: 'ic_notification',
                } : {
                    sound: 'default',
                    channelId: 'vivaaha_channel',
                    priority: 'high',
                    icon: 'ic_notification',
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                        contentAvailable: true,
                        mutableContent: true,
                    },
                },
                headers: {
                    'apns-priority': '10',
                    'apns-push-type': 'alert',
                },
            },
            notification: {
                title: payload.title,
                body: payload.body,
            },
        };
        console.log('[FCM] Sending push:', {
            project: firebaseProjectId || 'unknown',
            token_suffix: tokenSuffix,
            type: ((_c = payload.data) === null || _c === void 0 ? void 0 : _c.type) || 'unknown',
            title: payload.title,
            android_priority: (_d = message.android) === null || _d === void 0 ? void 0 : _d.priority,
            android_channel: (_f = (_e = message.android) === null || _e === void 0 ? void 0 : _e.notification) === null || _f === void 0 ? void 0 : _f.channelId,
            data_keys: Object.keys(message.data || {}),
        });
        const messageId = await app.messaging().send(message);
        console.log(`[FCM] Firebase send success message_id=${messageId} token_suffix=${tokenSuffix} type=${((_g = payload.data) === null || _g === void 0 ? void 0 : _g.type) || 'unknown'}`);
        return messageId;
    }
    catch (err) {
        const errorCode = ((_h = err === null || err === void 0 ? void 0 : err.errorInfo) === null || _h === void 0 ? void 0 : _h.code) || (err === null || err === void 0 ? void 0 : err.code);
        console.error('[FCM] sendPushNotification error:', {
            code: errorCode,
            message: err === null || err === void 0 ? void 0 : err.message,
            errorInfo: err === null || err === void 0 ? void 0 : err.errorInfo,
            type: ((_j = payload.data) === null || _j === void 0 ? void 0 : _j.type) || 'unknown',
            token_suffix: payload.token ? payload.token.slice(-8) : 'missing',
            project: firebaseProjectId || 'unknown',
        });
        const invalidTokenCodes = [
            'messaging/registration-token-not-registered',
            'messaging/invalid-registration-token',
        ];
        if (invalidTokenCodes.includes(errorCode)) {
            throw Object.assign(err, { invalidToken: true, firebaseCode: errorCode });
        }
        if (errorCode === 'messaging/mismatched-credential') {
            throw Object.assign(err, { credentialMismatch: true, firebaseCode: errorCode });
        }
        throw Object.assign(err, { firebaseCode: errorCode });
    }
}
//# sourceMappingURL=fcm.js.map