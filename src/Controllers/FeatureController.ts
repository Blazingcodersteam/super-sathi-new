import * as utils from "util";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// Maps client-facing feature codes to DB feature_name in subscription_features_master
// Also handles common typos/aliases from client
const FEATURE_CODE_MAP: Record<string, string> = {
  contact_unblock: 'contact_unlock',  // common client typo
  boost_profile: 'profile_boost_cycles',  // alternate client name
  profile_boost: 'profile_boost_cycles',  // Elite plans use profile_boost_cycles
  // Add more mappings as needed
};

// Features that are truly unlimited for Signature plan
// These map to 'unlimited_contact_unlock' / 'unlimited_profile_boost' in Signature DB config
const UNLIMITED_FEATURES = new Set([
  'contact_unlock',
  'profile_boost_cycles',
  'search_ranking',
  'unlimited_chat',
]);

function resolveFeatureName(code: string): string {
  return FEATURE_CODE_MAP[code] || code;
}

/**
 * Check Feature Access
 * Validates if user can use a specific feature
 */
export async function checkFeatureAccess(req, res) {
  try {
    const userId = req.user.user_id;
    const { feature_code } = req.body;

    // Get active subscription
    const [subscription] = await query(`
      SELECT us.*, sp.plan_name
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ? AND us.is_active = 1
    `, [userId]);

    if (!subscription) {
      return res.json({
        success: false,
        allowed: false,
        message: "No active subscription"
      });
    }

    const isSignature = subscription.plan_name.includes('Signature');

    // Get feature limit (resolve client code to DB name)
    const dbFeatureName = resolveFeatureName(feature_code);
    const [featureLimit] = await query(`
      SELECT spf.feature_value
      FROM subscription_plan_features spf
      JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
      WHERE spf.plan_id = ? AND sfm.feature_name = ?
    `, [subscription.plan_id, dbFeatureName]);

    if (!featureLimit) {
      // Signature gets unlimited for features not explicitly listed
      if (isSignature) {
        return res.json({
          success: true,
          allowed: true,
          unlimited: true,
          message: "Signature plan - unlimited access"
        });
      }
      return res.json({
        success: false,
        allowed: false,
        message: "Feature not available in your plan"
      });
    }

    // If value is 'unlimited' or Signature with unlimited-type features
    const featureValue = featureLimit.feature_value;
    if (featureValue === 'unlimited' || (isSignature && UNLIMITED_FEATURES.has(dbFeatureName))) {
      return res.json({
        success: true,
        allowed: true,
        unlimited: true,
        message: "Unlimited access"
      });
    }

    // Numeric limit — check usage
    const limit = parseInt(featureValue);
    const [usage] = await query(`
      SELECT COALESCE(SUM(usage_count), 0) as usage_count FROM user_feature_usage
      WHERE user_id = ? AND feature_name = ?
    `, [userId, dbFeatureName]);

    const used = parseInt(usage?.usage_count || 0);
    const remaining = Math.max(0, limit - used);

    res.json({
      success: true,
      allowed: remaining > 0,
      limit: limit,
      used: used,
      remaining: remaining
    });
  } catch (error) {
    console.error("Check Feature Access Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

/**
 * Use Feature
 * Decrements usage count for a feature
 */
export async function useFeature(req, res) {
  try {
    const userId = req.user.user_id;
    const { feature_code, target_user_id } = req.body;

    // Check access first
    const accessCheck = await checkAccess(userId, feature_code);
    
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: accessCheck.message || "Feature limit reached"
      });
    }

    // Always use resolved feature name for storage consistency
    const resolvedCode = resolveFeatureName(feature_code);

    // If not unlimited, increment usage
    if (!accessCheck.unlimited) {
      await query(`
        INSERT INTO user_feature_usage (user_id, feature_name, usage_count)
        VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE usage_count = usage_count + 1
      `, [userId, resolvedCode]);
    }

    // Log the action
    await query(`
      INSERT INTO user_feature_usage_log (user_id, feature_name, target_user_id)
      VALUES (?, ?, ?)
    `, [userId, resolvedCode, target_user_id || null]);

    res.json({
      success: true,
      message: "Feature used successfully",
      remaining: accessCheck.unlimited ? "unlimited" : accessCheck.remaining - 1
    });
  } catch (error) {
    console.error("Use Feature Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

/**
 * Get Plan Comparison
 * Returns side-by-side comparison of all plans
 */
export async function getPlanComparison(req, res) {
  try {
    const plans = await query(`
      SELECT sp.*, cm.currency_code, cm.symbol
      FROM subscription_plans sp
      LEFT JOIN currency_master cm ON sp.currency_id = cm.id
      WHERE sp.user_status_id = 1
      ORDER BY sp.price ASC
    `);

    const comparison = [];
    for (let plan of plans) {
      const features = await query(`
        SELECT spf.*, sfm.feature_name, sfm.feature_description
        FROM subscription_plan_features spf
        LEFT JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
        WHERE spf.plan_id = ?
      `, [plan.id]);

      comparison.push({
        plan_id: plan.id,
        plan_name: plan.plan_name,
        duration_months: plan.duration_months,
        price: plan.price,
        per_month_price: Math.round(plan.price / plan.duration_months),
        plan_symbol: plan.plan_symbol,
        features: features.map(f => ({
          name: f.feature_name,
          value: f.feature_value,
          description: f.feature_description
        }))
      });
    }

    res.json({
      success: true,
      comparison: comparison
    });
  } catch (error) {
    console.error("Get Plan Comparison Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

/**
 * Get Marriage Confirmation Status
 */
export async function getMarriageConfirmationStatus(req, res) {
  try {
    const userId = req.user.user_id;

    const [confirmation] = await query(`
      SELECT * FROM marriage_confirmations
      WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `, [userId]);

    if (!confirmation) {
      return res.json({
        success: true,
        has_confirmation: false,
        status: "none"
      });
    }

    res.json({
      success: true,
      has_confirmation: true,
      status: confirmation.verification_status,
      confirmation_date: confirmation.confirmation_date,
      submitted_at: confirmation.created_at,
      verified_at: confirmation.verified_at
    });
  } catch (error) {
    console.error("Get Marriage Confirmation Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Helper function
async function checkAccess(userId, featureCode) {
  const [subscription] = await query(`
    SELECT us.*, sp.plan_name
    FROM user_subscriptions us
    JOIN subscription_plans sp ON us.plan_id = sp.id
    WHERE us.user_id = ? AND us.is_active = 1
  `, [userId]);

  if (!subscription) {
    return { allowed: false, message: "No active subscription" };
  }

  const isSignature = subscription.plan_name.includes('Signature');

  const dbFeatureName = resolveFeatureName(featureCode);
  const [featureLimit] = await query(`
    SELECT spf.feature_value
    FROM subscription_plan_features spf
    JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
    WHERE spf.plan_id = ? AND sfm.feature_name = ?
  `, [subscription.plan_id, dbFeatureName]);

  if (!featureLimit) {
    if (isSignature && UNLIMITED_FEATURES.has(dbFeatureName)) {
      return { allowed: true, unlimited: true };
    }
    return { allowed: false, message: "Feature not available" };
  }

  const featureValue = featureLimit.feature_value;
  if (featureValue === 'unlimited' || (isSignature && UNLIMITED_FEATURES.has(dbFeatureName))) {
    return { allowed: true, unlimited: true };
  }

  const [usage] = await query(`
    SELECT COALESCE(SUM(usage_count), 0) as usage_count FROM user_feature_usage
    WHERE user_id = ? AND feature_name = ?
  `, [userId, dbFeatureName]);

  const limit = parseInt(featureLimit.feature_value);
  const used = parseInt(usage?.usage_count || 0);

  return {
    allowed: used < limit,
    unlimited: false,
    limit: limit,
    used: used,
    remaining: Math.max(0, limit - used)
  };
}
