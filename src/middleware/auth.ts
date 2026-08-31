import * as jwt from "jsonwebtoken";
import { areSubscriptionRestrictionsEnabled } from "../utils/subscriptionAccess";

const JWT_SECRET = process.env.JWT_SECRET_KEY;
const db = require("../database");
const utils = require("util");
const query = utils.promisify(db.query).bind(db);

function isConnectPerfRequest(req): boolean {
  return req?.method === "POST" && req?.originalUrl?.includes("/match-actions/connect-now");
}

function connectPerfNow(): number {
  return performance.now();
}

function connectPerfElapsed(start: number): number {
  return Math.round(connectPerfNow() - start);
}

function getConnectPerf(req) {
  if (!isConnectPerfRequest(req)) return null;
  if (!req.connectPerf) {
    req.connectPerf = {
      requestId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: connectPerfNow(),
    };
    console.log(`[CONNECT-PERF] request=${req.connectPerf.requestId} Request started`);
  }
  return req.connectPerf;
}

function connectPerfMeta(perf): string {
  if (!perf) return "";
  const parts = [`request=${perf.requestId}`];
  if (perf.userId !== undefined) parts.push(`user=${perf.userId}`);
  if (perf.targetUserId !== undefined) parts.push(`target=${perf.targetUserId}`);
  return parts.join(" ");
}

export function authenticateToken(req, res, next) {
  const perf = getConnectPerf(req);
  const authStart = perf ? connectPerfNow() : 0;
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    if (perf) console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} authentication-validation: ${connectPerfElapsed(authStart)}ms (missing-token)`);
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      if (perf) console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} authentication-validation: ${connectPerfElapsed(authStart)}ms (invalid-token)`);
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token",
      });
    }
    if (perf) perf.userId = user?.user_id;

    // Check if user still exists and is not deleted (status = 4)
    try {
      const dbStart = perf ? connectPerfNow() : 0;
      const [dbUser] = await query(
        "SELECT id, status FROM users WHERE id = ? LIMIT 1",
        [user.user_id]
      );
      if (perf) console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} auth-user-db-query: ${connectPerfElapsed(dbStart)}ms`);
      if (!dbUser || dbUser.status === 4) {
        if (perf) console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} authentication-validation: ${connectPerfElapsed(authStart)}ms (account-deleted)`);
        return res.status(401).json({
          success: false,
          account_deleted: true,
          message: "Your account has been deleted. Please contact admin.",
        });
      }
    } catch (_) {
      // DB error — allow through to avoid blocking valid users
    }

    req.user = user;
    if (perf) console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} authentication-validation: ${connectPerfElapsed(authStart)}ms`);
    next();
  });
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }
  next();
}

const PREMIUM_CHAT_MESSAGE = 'In the interest of our Premium Members, only Premium users can read and send messages.';

// Delegates to the shared helper so this file, the privacy filter, the feature meter and
// the socket layer all agree on the flag. The old inline version compared with `=== 0`,
// which silently kept restrictions ON whenever the driver handed back "0" as a string.
async function getSubscriptionRestrictionsEnabled() {
  return areSubscriptionRestrictionsEnabled();
}

export async function requireSubscriptionFeature(req, res, next, featureName, message = PREMIUM_CHAT_MESSAGE) {
  try {
    const userId = req.user?.user_id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const restrictionsEnabled = await getSubscriptionRestrictionsEnabled();
    if (!restrictionsEnabled) {
      return next();
    }

    const featureNames = Array.isArray(featureName) ? featureName : [featureName];
    const [feature] = await query(
      `SELECT us.id, us.plan_id, sfm.feature_name, spf.feature_value
       FROM user_subscriptions us
       LEFT JOIN subscription_plan_features spf
         ON spf.plan_id = us.plan_id AND spf.user_status_id = 1
       LEFT JOIN subscription_features_master sfm
         ON sfm.id = spf.feature_id AND sfm.user_status_id = 1
       WHERE us.user_id = ?
         AND us.subscription_status_id = 1
         AND us.end_date > NOW()
         AND sfm.feature_name IN (?)
       ORDER BY us.end_date DESC, us.id DESC
       LIMIT 1`,
      [userId, featureNames]
    );

    const featureValue = String(feature?.feature_value ?? '').trim().toLowerCase();
    const allowed = !!feature && !['0', 'false', 'no', 'disabled', 'disable', ''].includes(featureValue);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        premium_required: true,
        feature_required: featureNames.join(','),
        message,
      });
    }

    next();
  } catch (err) {
    console.error('[requireSubscriptionFeature]', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Section 8 - Chat is Premium-only.
// Rejects with 403 + premium_required flag so Flutter can show the upgrade wall.
export async function requirePremium(req, res, next) {
  return requireSubscriptionFeature(req, res, next, ['normal_chat_enabled', 'unlimited_chat'], PREMIUM_CHAT_MESSAGE);
}