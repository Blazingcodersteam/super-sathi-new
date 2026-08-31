import * as admin from 'firebase-admin';
import * as path from 'path';

let initialized = false;
let firebaseProjectId = '';

function connectPerfNow(): number {
  return performance.now();
}

function connectPerfElapsed(start: number): number {
  return Math.round(connectPerfNow() - start);
}

function connectPerfMeta(perf): string {
  if (!perf) return "";
  const parts = [`request=${perf.requestId}`];
  if (perf.userId !== undefined) parts.push(`user=${perf.userId}`);
  if (perf.targetUserId !== undefined) parts.push(`target=${perf.targetUserId}`);
  if (perf.connectionId !== undefined) parts.push(`connection=${perf.connectionId}`);
  return parts.join(" ");
}

function logConnectPerf(perf, label: string, start: number, extra = "") {
  if (!perf) return;
  const suffix = extra ? ` ${extra}` : "";
  console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} ${label}: ${connectPerfElapsed(start)}ms${suffix}`);
}

function getApp(): admin.app.App {
  if (!initialized) {
    // 1. Try env var first (production)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseProjectId = serviceAccount.project_id || '';
    } else {
      // 2. Fallback: load the service account JSON file directly
      const serviceAccountPath = path.resolve(
        __dirname,
        'super-sathi-universe-firebase-adminsdk-fbsvc-0f8cb206bd.json'
      );
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

export interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotification(payload: PushPayload, perf: any = null): Promise<string | null> {
  try {
    const appStart = perf ? connectPerfNow() : 0;
    const app = getApp();
    logConnectPerf(perf, "firebase-get-app", appStart);
    const isCall = payload.data?.type === 'incoming_call';
    const tokenSuffix = payload.token ? payload.token.slice(-8) : 'missing';
    const message: admin.messaging.Message = {
      token: payload.token,
      data: {
        ...payload.data ?? {},
        title: payload.title,
        body: payload.body,
      },
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
      type: payload.data?.type || 'unknown',
      title: payload.title,
      android_priority: message.android?.priority,
      android_channel: message.android?.notification?.channelId,
      data_keys: Object.keys(message.data || {}),
    });
    const firebaseSendStart = perf ? connectPerfNow() : 0;
    const messageId = await app.messaging().send(message);
    logConnectPerf(perf, "firebase-send", firebaseSendStart);
    console.log(`[FCM] Firebase send success message_id=${messageId} token_suffix=${tokenSuffix} type=${payload.data?.type || 'unknown'}`);
    return messageId;
  } catch (err: any) {
    const errorCode = err?.errorInfo?.code || err?.code;
    console.error('[FCM] sendPushNotification error:', {
      code: errorCode,
      message: err?.message,
      errorInfo: err?.errorInfo,
      type: payload.data?.type || 'unknown',
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
