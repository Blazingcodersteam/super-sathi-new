import * as utils from "util";
import { areSubscriptionRestrictionsEnabled } from "../utils/subscriptionAccess";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// Get Available Subscription Plans
export async function getSubscriptionPlans(req, res) {
  try {
    const plans = await query(`
      SELECT sp.*, cm.currency_code, cm.symbol
      FROM subscription_plans sp
      LEFT JOIN currency_master cm ON sp.currency_id = cm.id
      WHERE sp.user_status_id = 1
      ORDER BY sp.duration_months ASC, sp.price ASC
    `);

    // Get features for each plan
    for (let plan of plans) {
      const features = await query(`
        SELECT spf.*, sfm.feature_name, sfm.feature_description
        FROM subscription_plan_features spf
        LEFT JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
        WHERE spf.plan_id = ? AND spf.user_status_id = 1
      `, [plan.id]);

      plan.features = features;
      plan.per_month_price = (plan.price / plan.duration_months).toFixed(0);
    }

    const addons = await query(`
      SELECT sam.*, cm.currency_code, cm.symbol
      FROM subscription_addons_master sam
      LEFT JOIN currency_master cm ON sam.currency_id = cm.id
      WHERE sam.is_active = 1
      ORDER BY sam.price ASC
    `);

    res.json({
      success: true,
      plans,
      addons
    });
  } catch (error) {
    console.error("Get Subscription Plans Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Subscription Details (Enhanced)
export async function getSubscriptionDetails(req, res) {
  try {
    const plans = await query(`
      SELECT sp.*, cm.currency_code, cm.symbol
      FROM subscription_plans sp
      LEFT JOIN currency_master cm ON sp.currency_id = cm.id
      WHERE sp.user_status_id = 1
      ORDER BY sp.duration_months ASC, sp.price ASC
    `);

    const formattedPlans = [];

    for (let plan of plans) {
      const features = await query(`
        SELECT spf.*, sfm.feature_name, sfm.feature_description
        FROM subscription_plan_features spf
        LEFT JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
        WHERE spf.plan_id = ? AND spf.user_status_id = 1
      `, [plan.id]);

      // Format features for display
      const formattedFeatures = [];
      features.forEach(feature => {
        switch(feature.feature_name) {
          case 'unlimited_messages':
            formattedFeatures.push({
              name: 'Send unlimited Messages',
              value: feature.feature_value,
              enabled: true
            });
            break;
          case 'contact_numbers':
            formattedFeatures.push({
              name: `View upto ${feature.feature_value} Contact Numbers`,
              value: feature.feature_value,
              enabled: true
            });
            break;
          case 'standout_profile':
            formattedFeatures.push({
              name: 'Standout from other Profiles',
              value: feature.feature_value,
              enabled: feature.feature_value === 'true'
            });
            break;
          case 'let_matches_contact':
            formattedFeatures.push({
              name: 'Let Matches contact you directly',
              value: feature.feature_value,
              enabled: feature.feature_value === 'true'
            });
            break;
        }
      });

      // Add Shaadi Live passes based on plan
      let shadiPasses = '';
      if (plan.plan_name.includes('Gold')) {
        shadiPasses = plan.plan_name.includes('Plus') ? '6 Shaadi Live passes worth INR500' : '5 Shaadi Live passes worth INR500';
      } else if (plan.plan_name.includes('Diamond')) {
        shadiPasses = plan.plan_name.includes('Plus') ? '9 Shaadi Live passes worth INR4500' : '8 Shaadi Live passes worth INR4000';
      } else if (plan.plan_name.includes('Platinum')) {
        shadiPasses = '15 Shaadi Live passes worth INR7500';
      }

      if (shadiPasses) {
        formattedFeatures.push({
          name: shadiPasses,
          enabled: true
        });
      }

      formattedPlans.push({
        id: plan.id,
        name: plan.plan_name,
        duration: `${plan.duration_months} Months`,
        price: plan.price,
        original_price: plan.original_price,
        discount_percentage: plan.discount_percentage,
        per_month_price: Math.round(plan.price / plan.duration_months),
        currency_symbol: plan.symbol,
        is_top_seller: plan.is_top_seller,
        is_best_value: plan.is_best_value,
        features: formattedFeatures
      });
    }

    res.json({
      success: true,
      message: "Subscription plans retrieved successfully",
      data: formattedPlans
    });
  } catch (error) {
    console.error("Get Subscription Details Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}



// Get User Subscription Status
export async function getUserSubscription(req, res) {
  try {
    console.log('getUserSubscription called');
    console.log('Request user:', req.user);
    
    // Check if user is authenticated
    if (!req.user || !req.user.user_id) {
      console.error('No user found in request');
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const userId = req.user.user_id;
    console.log('User ID:', userId);

    // Test database connection first
    try {
      await query('SELECT 1 as test');
      console.log('Database connection successful');
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return res.status(500).json({
        success: false,
        message: "Database connection error"
      });
    }

    const [subscription] = await query(`
      SELECT us.*, sp.plan_name, sp.price, sp.duration_months, sp.original_price, sp.discount_percentage,
             CASE
               WHEN us.subscription_status_id = 1 AND us.end_date >= CURRENT_DATE THEN 'active'
               WHEN us.subscription_status_id = 1 AND us.end_date < CURRENT_DATE THEN 'expired'
               WHEN us.subscription_status_id = 3 THEN 'cancelled'
               ELSE 'inactive'
             END as subscription_status,
             cm.symbol as currency_symbol,
             DATEDIFF(us.end_date, CURRENT_DATE) as days_remaining,
             p.payment_method, p.payment_date, p.amount as paid_amount
      FROM user_subscriptions us
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN currency_master cm ON sp.currency_id = cm.id
      LEFT JOIN payments p ON us.payment_id = p.id
      WHERE us.user_id = ? AND us.is_active = TRUE
      ORDER BY us.created_at DESC LIMIT 1
    `, [userId]);

    console.log('Subscription query result:', subscription);

    let subscriptionData = null;
    if (subscription) {
      // Get plan features
      const features = await query(`
        SELECT spf.*, sfm.feature_name, sfm.feature_description
        FROM subscription_plan_features spf
        LEFT JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
        WHERE spf.plan_id = ? AND spf.user_status_id = 1
      `, [subscription.plan_id]);

      // Get addons
      const addons = await query(`
        SELECT pa.*, sam.addon_name, sam.addon_description
        FROM payment_addons pa
        LEFT JOIN subscription_addons_master sam ON pa.addon_id = sam.id
        WHERE pa.payment_id = ?
      `, [subscription.payment_id]);

      subscriptionData = {
        ...subscription,
        features,
        addons,
        is_active: subscription.subscription_status === 'active'
      };
    }

    console.log('Final subscription data:', subscriptionData);

    res.json({
      success: true,
      subscription: subscriptionData
    });
  } catch (error) {
    console.error("Get User Subscription Error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ 
      success: false, 
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}



// Get Subscription Features
export async function getSubscriptionFeatures(req, res) {
  try {
    const features = await query(`
      SELECT * FROM subscription_features_master
      WHERE user_status_id = 1
      ORDER BY id ASC
    `);

    res.json({
      success: true,
      features
    });
  } catch (error) {
    console.error("Get Subscription Features Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Subscription Add-ons
export async function getSubscriptionAddons(req, res) {
  try {
    const addons = await query(`
      SELECT sam.*, cm.currency_code, cm.symbol
      FROM subscription_addons_master sam
      LEFT JOIN currency_master cm ON sam.currency_id = cm.id
      WHERE sam.is_active = 1
      ORDER BY sam.price ASC
    `);

    res.json({
      success: true,
      addons
    });
  } catch (error) {
    console.error("Get Subscription Add-ons Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Check Subscription Status
export async function checkSubscriptionStatus(req, res) {
  try {
    const userId = req.user.user_id;

    const [subscription] = await query(`
      SELECT us.*, sp.plan_name,
             CASE
               WHEN us.subscription_status_id = 1 AND us.end_date >= CURRENT_DATE THEN 'active'
               WHEN us.subscription_status_id = 1 AND us.end_date < CURRENT_DATE THEN 'expired'
               WHEN us.subscription_status_id = 3 THEN 'cancelled'
               ELSE 'inactive'
             END as status,
             DATEDIFF(us.end_date, CURRENT_DATE) as days_remaining
      FROM user_subscriptions us
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ?
      ORDER BY us.created_at DESC LIMIT 1
    `, [userId]);

    const hasActiveSubscription = !!(subscription && subscription.status === 'active');

    // is_premium_user answers "may this member use premium features?", which is not the same
    // question as "did they pay?". With the admin subscription-restrictions switch off every
    // member may, so it resolves true for everyone. has_active_subscription stays literal —
    // it still reports whether a real subscription exists — and the flag is echoed back so a
    // client can tell the two apart without a second request.
    const restrictionsEnabled = await areSubscriptionRestrictionsEnabled();
    const isPremiumUser = restrictionsEnabled ? hasActiveSubscription : true;

    res.json({
      success: true,
      has_active_subscription: hasActiveSubscription,
      is_premium_user: isPremiumUser,
      subscription_restrictions: restrictionsEnabled ? 1 : 0,
      subscription_details: subscription || null
    });
  } catch (error) {
    console.error("Check Subscription Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}



// Simple Request Refund
export async function requestRefund(req, res) {
  try {
    const userId = req.user.user_id;
    const { subscription_id, refund_reason } = req.body;

    if (!subscription_id || !refund_reason) {
      return res.status(400).json({
        success: false,
        message: "Subscription ID and refund reason are required"
      });
    }

    // Get user and subscription details
    const [userDetails] = await query(`
      SELECT u.email, u.phone, us.id as subscription_id, us.payment_id, p.amount
      FROM users u
      LEFT JOIN user_subscriptions us ON u.id = us.user_id
      LEFT JOIN payments p ON us.payment_id = p.id
      WHERE u.id = ? AND us.id = ?
    `, [userId, subscription_id]);

    if (!userDetails) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found"
      });
    }

    // Check if refund already requested
    const [existingRequest] = await query(`
      SELECT id FROM refund_requests WHERE user_id = ? AND subscription_id = ?
    `, [userId, subscription_id]);

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: "Refund request already submitted for this subscription"
      });
    }

    // Calculate refund amount (example: 80% of paid amount)
    const refundAmount = Math.round(userDetails.amount * 0.8);

    // Create refund request
    await query(`
      INSERT INTO refund_requests (user_id, payment_id, subscription_id, user_email, user_mobile, refund_reason, refund_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, userDetails.payment_id, subscription_id, userDetails.email, userDetails.phone, refund_reason, refundAmount]);

    // Immediately mark subscription as cancelled so user can re-subscribe
    await query(`
      UPDATE user_subscriptions
      SET subscription_status_id = 3, is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `, [subscription_id, userId]);

    res.status(201).json({
      success: true,
      message: "Subscription cancelled successfully. You can now subscribe to a new plan."
    });
  } catch (error) {
    console.error("Request Refund Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get My Refund Requests
export async function getMyRefundRequests(req, res) {
  try {
    const userId = req.user.user_id;

    const refundRequests = await query(`
      SELECT rr.*, sp.plan_name, sp.price
      FROM refund_requests rr
      LEFT JOIN user_subscriptions us ON rr.subscription_id = us.id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE rr.user_id = ?
      ORDER BY rr.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      data: refundRequests
    });
  } catch (error) {
    console.error("Get My Refund Requests Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Refund Status
export async function getRefundStatus(req, res) {
  try {
    const userId = req.user.user_id;
    const { subscriptionId } = req.params;

    const [refundRequest] = await query(`
      SELECT rr.*, sp.plan_name, us.start_date, us.end_date
      FROM refund_requests rr
      LEFT JOIN user_subscriptions us ON rr.subscription_id = us.id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE rr.subscription_id = ? AND rr.user_id = ?
      ORDER BY rr.created_at DESC LIMIT 1
    `, [subscriptionId, userId]);

    if (!refundRequest) {
      return res.status(404).json({
        success: false,
        message: "No refund request found for this subscription"
      });
    }

    res.json({
      success: true,
      data: {
        refund_request_id: refundRequest.id,
        subscription_id: refundRequest.subscription_id,
        plan_name: refundRequest.plan_name,
        original_amount: refundRequest.original_amount,
        refund_amount: refundRequest.refund_amount,
        status: refundRequest.refund_status,
        reason: refundRequest.refund_reason,
        admin_notes: refundRequest.admin_notes,
        days_used: refundRequest.days_used,
        total_days: refundRequest.total_days,
        requested_at: refundRequest.created_at,
        processed_at: refundRequest.processed_at,
        breakdown: {
          fixed_charges: refundRequest.fixed_charges,
          prorated_charges: refundRequest.prorated_charges,
          gst_amount: refundRequest.gst_amount
        }
      }
    });
  } catch (error) {
    console.error("Get Refund Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}