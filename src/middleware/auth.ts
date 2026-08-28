import * as jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET_KEY;
const db = require("../database");
const utils = require("util");
const query = utils.promisify(db.query).bind(db);

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // Check if user still exists and is not deleted (status = 4)
    try {
      const [dbUser] = await query(
        "SELECT id, status FROM users WHERE id = ? LIMIT 1",
        [user.user_id]
      );
      if (!dbUser || dbUser.status === 4) {
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

async function getSubscriptionRestrictionsEnabled() {
  const [general] = await query(
    `SELECT subscription_restrictions FROM general_settings
     LIMIT 1`
  );

  // 0 = Restrictions disabled
  return !(general && general.subscription_restrictions === 0);
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