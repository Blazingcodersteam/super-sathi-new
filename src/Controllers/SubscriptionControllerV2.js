"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubscriptionPlans = getSubscriptionPlans;
exports.getPostPurchaseAddons = getPostPurchaseAddons;
exports.getFeatureUsage = getFeatureUsage;
exports.purchaseVerificationBadge = purchaseVerificationBadge;
exports.getVerificationBadgeStatus = getVerificationBadgeStatus;
exports.confirmMarriage = confirmMarriage;
exports.changePlan = changePlan;
exports.activateFreeSubscription = activateFreeSubscription;
const utils = require("util");
const subscriptionAccess_1 = require("../utils/subscriptionAccess");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// ============================================
// VIVAAHA ELITE & SIGNATURE SUBSCRIPTION API
// ============================================
/**
 * Get Subscription Plans (Elite & Signature)
 * Returns: 2 plans with Elite variants
 */
async function getSubscriptionPlans(req, res) {
    try {
        // Get all active plans dynamically
        const allPlans = await query(`
      SELECT sp.*, cm.currency_code, cm.symbol
      FROM subscription_plans sp
      LEFT JOIN currency_master cm ON sp.currency_id = cm.id
      WHERE sp.user_status_id = 1
      ORDER BY sp.duration_months ASC, sp.price ASC
    `);
        // Get features for each plan
        const formattedPlans = [];
        for (let plan of allPlans) {
            const features = await query(`
        SELECT spf.*, sfm.feature_name, sfm.feature_description
        FROM subscription_plan_features spf
        LEFT JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
        WHERE spf.plan_id = ?
      `, [plan.id]);
            formattedPlans.push({
                plan_id: plan.id,
                plan_name: plan.plan_name,
                duration_months: plan.duration_months,
                price: plan.price,
                original_price: plan.original_price,
                discount_percentage: plan.discount_percentage,
                per_month_price: Math.round(plan.price / plan.duration_months),
                is_top_seller: !!plan.is_top_seller,
                is_best_value: !!plan.is_best_value,
                currency_code: plan.currency_code,
                symbol: plan.symbol,
                features: features.map(f => ({
                    feature_name: f.feature_name,
                    feature_value: f.feature_value,
                    feature_description: f.feature_description
                }))
            });
        }
        // Get public addons
        const addons = await query(`
      SELECT sam.*, cm.currency_code, cm.symbol
      FROM subscription_addons_master sam
      LEFT JOIN currency_master cm ON sam.currency_id = cm.id
      WHERE sam.is_active = 1
      AND sam.availability = 'public'
    `);
        res.json({
            success: true,
            plans: formattedPlans,
            addons: addons
        });
    }
    catch (error) {
        console.error("Get Subscription Plans Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
/**
 * Get Post-Purchase Addons (RM Services)
 * Only accessible after subscription purchase
 */
async function getPostPurchaseAddons(req, res) {
    try {
        const userId = req.user.user_id;
        // Check if user has active subscription
        const [subscription] = await query(`
      SELECT id FROM user_subscriptions
      WHERE user_id = ? AND is_active = 1
    `, [userId]);
        if (!subscription) {
            return res.status(403).json({
                success: false,
                message: "Active subscription required to view addons"
            });
        }
        // Get post-purchase addons
        const addons = await query(`
      SELECT sam.*, cm.currency_code, cm.symbol
      FROM subscription_addons_master sam
      LEFT JOIN currency_master cm ON sam.currency_id = cm.id
      WHERE sam.is_active = 1
      AND sam.availability IN ('post_purchase_only', 'post_purchase_only_admin')
      ORDER BY sam.price ASC
    `);
        res.json({
            success: true,
            addons: addons.map(addon => ({
                id: addon.id,
                addon_name: addon.addon_name,
                addon_description: addon.addon_description,
                price: addon.price,
                duration_months: addon.id === 201 ? 3 : addon.id === 202 ? 6 : null,
                currency_code: addon.currency_code,
                symbol: addon.symbol,
                availability: addon.availability,
                note: addon.id === 203 ? "Admin-controlled pricing – contact support" : null
            }))
        });
    }
    catch (error) {
        console.error("Get Post-Purchase Addons Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
/**
 * Get User's Feature Usage
 * Shows remaining contacts, boosts, etc.
 */
async function getFeatureUsage(req, res) {
    var _a, _b, _c, _d;
    try {
        const userId = req.user.user_id;
        // Kill-switch off: report everything as unlimited so the UI never renders a quota bar
        // or an "upgrade to unlock" prompt. Stored counters are left untouched — they are still
        // there, unchanged, when restrictions are switched back on.
        if (!(await (0, subscriptionAccess_1.areSubscriptionRestrictionsEnabled)())) {
            return res.json({
                success: true,
                has_subscription: true,
                restrictions_disabled: true,
                plan: null,
                unlimited: true,
                features: {
                    contacts: "unlimited",
                    boosts: "unlimited"
                }
            });
        }
        // Get active subscription (must not be expired)
        const [subscription] = await query(`
      SELECT us.*, sp.plan_name, us.plan_symbol
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ? AND us.is_active = 1 AND us.end_date >= CURRENT_DATE
    `, [userId]);
        if (!subscription) {
            // Also mark any expired subscriptions as inactive
            await query(`
        UPDATE user_subscriptions
        SET is_active = 0, subscription_status_id = 4, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND is_active = 1 AND end_date < CURRENT_DATE
      `, [userId]);
            return res.json({
                success: true,
                has_subscription: false,
                message: "No active subscription"
            });
        }
        // Check if Signature (unlimited)
        const isSignature = subscription.plan_name.includes('Signature');
        if (isSignature) {
            return res.json({
                success: true,
                has_subscription: true,
                plan: subscription.plan_name,
                plan_symbol: subscription.plan_symbol,
                unlimited: true,
                features: {
                    contacts: "unlimited",
                    boosts: "unlimited (soft throttle: 1 per day)",
                    search_ranking: "highest",
                    strategy_calls: 2,
                    profile_optimization: 1
                }
            });
        }
        // Elite plans - get limits and usage
        const contactLimit = await query(`
      SELECT spf.feature_value
      FROM subscription_plan_features spf
      JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
      WHERE spf.plan_id = ? AND sfm.feature_name = 'contact_unlock'
    `, [subscription.plan_id]);
        const boostLimit = await query(`
      SELECT spf.feature_value
      FROM subscription_plan_features spf
      JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
      WHERE spf.plan_id = ? AND sfm.feature_name IN ('profile_boost_cycles', 'profile_boost')
      ORDER BY CAST(spf.feature_value AS UNSIGNED) DESC LIMIT 1
    `, [subscription.plan_id]);
        // Get usage — use only canonical feature names (same as FeatureController stores)
        const contactUsageResult = await query(`
      SELECT COALESCE(SUM(usage_count), 0) as usage_count FROM user_feature_usage
      WHERE user_id = ? AND feature_name = 'contact_unlock'
    `, [userId]);
        const boostUsageResult = await query(`
      SELECT COALESCE(SUM(usage_count), 0) as usage_count FROM user_feature_usage
      WHERE user_id = ? AND feature_name = 'profile_boost_cycles'
    `, [userId]);
        const contactTotal = parseInt(((_a = contactLimit[0]) === null || _a === void 0 ? void 0 : _a.feature_value) || '0');
        const boostTotal = parseInt(((_b = boostLimit[0]) === null || _b === void 0 ? void 0 : _b.feature_value) || '0');
        const contactUsed = Math.min(parseInt(((_c = contactUsageResult[0]) === null || _c === void 0 ? void 0 : _c.usage_count) || 0), contactTotal);
        const boostUsed = Math.min(parseInt(((_d = boostUsageResult[0]) === null || _d === void 0 ? void 0 : _d.usage_count) || 0), boostTotal);
        res.json({
            success: true,
            has_subscription: true,
            plan: subscription.plan_name,
            plan_symbol: subscription.plan_symbol,
            unlimited: false,
            features: {
                contacts: {
                    total: contactTotal,
                    used: contactUsed,
                    remaining: Math.max(0, contactTotal - contactUsed)
                },
                boosts: {
                    total: boostTotal,
                    used: boostUsed,
                    remaining: Math.max(0, boostTotal - boostUsed)
                }
            }
        });
    }
    catch (error) {
        console.error("Get Feature Usage Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
/**
 * Purchase Verification Badge (₹199)
 */
async function purchaseVerificationBadge(req, res) {
    try {
        const userId = req.user.user_id;
        // Check if already has badge
        const [existing] = await query(`
      SELECT * FROM user_verification_badges
      WHERE user_id = ? AND verification_status IN ('approved', 'pending')
    `, [userId]);
        if (existing) {
            return res.status(400).json({
                success: false,
                message: existing.verification_status === 'approved'
                    ? "You already have a verified badge"
                    : "Your verification request is pending approval"
            });
        }
        // Create payment order for ₹199
        // This should integrate with payment gateway
        // For now, create pending verification request
        await query(`
      INSERT INTO user_verification_badges (user_id, verification_status, amount_paid)
      VALUES (?, 'pending', 199.00)
    `, [userId]);
        res.json({
            success: true,
            message: "Verification badge purchase initiated. Please complete payment.",
            amount: 199.00,
            next_step: "payment_gateway"
        });
    }
    catch (error) {
        console.error("Purchase Verification Badge Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
/**
 * Get Verification Badge Status
 */
async function getVerificationBadgeStatus(req, res) {
    try {
        const userId = req.user.user_id;
        const [badge] = await query(`
      SELECT * FROM user_verification_badges
      WHERE user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `, [userId]);
        if (!badge) {
            return res.json({
                success: true,
                has_badge: false,
                can_purchase: true
            });
        }
        res.json({
            success: true,
            has_badge: badge.verification_status === 'approved',
            status: badge.verification_status,
            verified_at: badge.verified_at,
            can_purchase: badge.verification_status === 'rejected'
        });
    }
    catch (error) {
        console.error("Get Verification Badge Status Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
/**
 * Confirm Marriage (Signature Only)
 */
async function confirmMarriage(req, res) {
    try {
        const userId = req.user.user_id;
        const { confirmation_date, proof_document_url } = req.body;
        // Check if user has Signature subscription
        const [subscription] = await query(`
      SELECT us.*, sp.plan_name
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ? AND us.is_active = 1 
      AND sp.plan_name LIKE '%Signature%'
    `, [userId]);
        if (!subscription) {
            return res.status(403).json({
                success: false,
                message: "Marriage confirmation is only available for Signature members"
            });
        }
        // Create marriage confirmation request
        await query(`
      INSERT INTO marriage_confirmations (
        user_id, subscription_id, confirmation_date, proof_document_url
      ) VALUES (?, ?, ?, ?)
    `, [userId, subscription.id, confirmation_date, proof_document_url]);
        res.json({
            success: true,
            message: "Marriage confirmation submitted. Admin will verify and update your subscription status.",
            note: "Your subscription will be terminated upon admin approval as per till-marriage policy."
        });
    }
    catch (error) {
        console.error("Confirm Marriage Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Export all existing functions from original SubscriptionController
__exportStar(require("./SubscriptionController"), exports);
/**
 * Change Plan — Cancel active subscription + start new plan in one step.
 * If new plan amount = 0 (100% discount) → activate directly.
 * If new plan amount > 0 → create Razorpay/CCAvenue order.
 * No pro-rata credit — user acknowledged remaining days/amount won't carry over.
 */
async function changePlan(req, res) {
    try {
        const userId = req.user.user_id;
        const { new_plan_id, payment_gateway = 'razorpay' } = req.body;
        if (!new_plan_id) {
            return res.status(400).json({
                success: false,
                message: "new_plan_id is required"
            });
        }
        if (!['razorpay', 'ccavenue'].includes(payment_gateway)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment_gateway. Use 'razorpay' or 'ccavenue'"
            });
        }
        // Check if user has an active subscription
        const [activeSubscription] = await query(`
      SELECT us.*, sp.plan_name as current_plan_name
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ? AND us.is_active = 1 AND us.subscription_status_id = 1
    `, [userId]);
        if (!activeSubscription) {
            return res.status(400).json({
                success: false,
                message: "No active subscription found. Use /payments/create-order or /subscription/v2/activate-free for new subscription."
            });
        }
        // Get new plan details
        const [newPlan] = await query(`SELECT * FROM subscription_plans WHERE id = ? AND user_status_id = 1`, [new_plan_id]);
        if (!newPlan) {
            return res.status(404).json({
                success: false,
                message: "New plan not found or inactive"
            });
        }
        // Prevent switching to same plan
        if (activeSubscription.plan_id === new_plan_id) {
            return res.status(400).json({
                success: false,
                message: "You are already on this plan"
            });
        }
        // Prevent downgrade — only upgrades allowed
        const [currentPlan] = await query(`SELECT * FROM subscription_plans WHERE id = ?`, [activeSubscription.plan_id]);
        if (currentPlan && parseFloat(newPlan.price) < parseFloat(currentPlan.price)) {
            return res.status(400).json({
                success: false,
                message: "Plan downgrade is not allowed. You can only upgrade to a higher plan."
            });
        }
        // Calculate final amount after discount
        const discount = parseInt(newPlan.discount_percentage) || 0;
        const finalAmount = parseFloat(newPlan.price) - (parseFloat(newPlan.price) * discount / 100);
        // If amount = 0 → cancel old plan + activate new directly (atomic — no payment risk)
        if (finalAmount <= 0) {
            // Cancel old subscription NOW (safe — no payment needed)
            await query(`
        UPDATE user_subscriptions 
        SET is_active = 0, subscription_status_id = 3, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND user_id = ?
      `, [activeSubscription.id, userId]);
            await query(`
        INSERT INTO subscription_logs (user_id, subscription_id, plan_id, action, old_status, new_status, notes)
        VALUES (?, ?, ?, 'cancelled', 'active', 'cancelled', ?)
      `, [userId, activeSubscription.id, activeSubscription.plan_id, `Cancelled for plan change to ${newPlan.plan_name} (free)`]);
            // Create payment record (amount = 0)
            const paymentResult = await query(`
        INSERT INTO payments (
          user_id, plan_id, order_id, payment_id, amount, base_amount,
          cgst_amount, sgst_amount, igst_amount, gst_type, total_gst_amount,
          currency_id, payment_method, payment_status_id, payment_date, gateway_response
        ) VALUES (?, ?, ?, ?, 0.00, 0.00, 0.00, 0.00, 0.00, NULL, 0.00, 1, 'free_plan_change', 1, CURRENT_TIMESTAMP, ?)
      `, [
                userId,
                new_plan_id,
                `CHANGE_FREE_${Date.now()}_${userId}`,
                `change_free_${Date.now()}_${userId}`,
                JSON.stringify({ type: 'plan_change_free', discount_percentage: 100, original_price: newPlan.price, previous_plan: activeSubscription.current_plan_name })
            ]);
            // Create new subscription
            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + newPlan.duration_months);
            const subscriptionResult = await query(`
        INSERT INTO user_subscriptions (
          user_id, plan_id, payment_id, payment_order_id, start_date, end_date,
          activated_at, subscription_status_id, payment_status_id, is_active, plan_symbol
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 1, 1, ?)
      `, [
                userId,
                new_plan_id,
                paymentResult.insertId,
                `CHANGE_FREE_${Date.now()}_${userId}`,
                startDate,
                endDate,
                newPlan.plan_name
            ]);
            // Log activation
            await query(`
        INSERT INTO subscription_logs (user_id, subscription_id, plan_id, action, new_status, payment_id, notes)
        VALUES (?, ?, ?, 'activated', 'active', ?, 'Plan changed from ${activeSubscription.current_plan_name} to ${newPlan.plan_name} (free)')
      `, [userId, subscriptionResult.insertId, new_plan_id, `change_free_${Date.now()}_${userId}`]);
            // Generate invoice
            const invoiceNumber = `INV-${new Date().getFullYear()}-${String(paymentResult.insertId).padStart(6, '0')}`;
            await query(`UPDATE payments SET invoice_number = ? WHERE id = ?`, [invoiceNumber, paymentResult.insertId]);
            return res.json({
                success: true,
                message: "Plan changed successfully",
                data: {
                    subscription_id: subscriptionResult.insertId,
                    plan_name: newPlan.plan_name,
                    plan_id: newPlan.id,
                    duration_months: newPlan.duration_months,
                    start_date: startDate,
                    end_date: endDate,
                    amount_paid: 0,
                    discount_percentage: 100,
                    previous_plan: activeSubscription.current_plan_name,
                    invoice_number: invoiceNumber
                }
            });
        }
        // Amount > 0 → create payment order
        // Import GSTHelper and Razorpay inline to avoid circular deps
        const { GSTHelper } = require('../utils/gstHelper');
        const Razorpay = require('razorpay');
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        // Get user's state for GST
        const [userLocation] = await query(`SELECT state_id FROM location_details WHERE user_id = ?`, [userId]);
        const gstCalculation = await GSTHelper.calculateGST(finalAmount, userLocation === null || userLocation === void 0 ? void 0 : userLocation.state_id);
        const totalAmount = gstCalculation.totalAmount;
        if (payment_gateway === 'razorpay') {
            const receipt = `change_${Date.now()}_${userId}`;
            const order = await razorpay.orders.create({
                amount: Math.round(totalAmount * 100),
                currency: 'INR',
                receipt: receipt,
                payment_capture: 1,
                notes: {
                    user_id: userId.toString(),
                    plan_id: new_plan_id.toString(),
                    plan_name: newPlan.plan_name,
                    type: 'plan_change',
                    previous_plan: activeSubscription.current_plan_name
                }
            });
            // Save payment order
            await query(`
        INSERT INTO payment_orders (
          user_id, plan_id, order_id, amount, base_amount, cgst_amount, sgst_amount, igst_amount,
          gst_type, total_gst_amount, currency, receipt, notes, payment_gateway
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, 'razorpay')
      `, [
                userId, new_plan_id, order.id, totalAmount,
                gstCalculation.baseAmount, gstCalculation.cgstAmount, gstCalculation.sgstAmount,
                gstCalculation.igstAmount, gstCalculation.gstType, gstCalculation.totalGstAmount,
                receipt, JSON.stringify({ addons: [], type: "plan_change", previous_plan: activeSubscription.current_plan_name, old_subscription_id: activeSubscription.id })
            ]);
            return res.json({
                success: true,
                payment_required: true,
                payment_gateway: 'razorpay',
                message: "Previous plan cancelled. Complete payment to activate new plan.",
                data: {
                    order_id: order.id,
                    amount: totalAmount,
                    currency: 'INR',
                    key: process.env.RAZORPAY_KEY_ID,
                    plan_name: newPlan.plan_name,
                    duration: newPlan.duration_months,
                    receipt: receipt,
                    previous_plan: activeSubscription.current_plan_name,
                    gst_breakdown: GSTHelper.formatGSTBreakdown(gstCalculation)
                }
            });
        }
        else {
            // CCAvenue
            const { CCAvenue } = require('../utils/ccavenue');
            const orderId = CCAvenue.generateOrderId();
            const receipt = `ccav_change_${Date.now()}_${userId}`;
            // Get user details
            const [user] = await query(`
        SELECT u.email, u.phone, up.first_name, up.last_name
        FROM users u LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE u.id = ?
      `, [userId]);
            // Save payment order
            await query(`
        INSERT INTO payment_orders (
          user_id, plan_id, order_id, ccavenue_order_id, amount, base_amount, cgst_amount, sgst_amount,
          igst_amount, gst_type, total_gst_amount, currency, receipt, notes, payment_gateway
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, 'ccavenue')
      `, [
                userId, new_plan_id, orderId, orderId, totalAmount,
                gstCalculation.baseAmount, gstCalculation.cgstAmount, gstCalculation.sgstAmount,
                gstCalculation.igstAmount, gstCalculation.gstType, gstCalculation.totalGstAmount,
                receipt, JSON.stringify({ addons: [], type: "plan_change", previous_plan: activeSubscription.current_plan_name, old_subscription_id: activeSubscription.id })
            ]);
            const ccavenueData = {
                merchant_id: process.env.CCAVENUE_MERCHANT_ID,
                order_id: orderId,
                amount: totalAmount.toFixed(2),
                currency: 'INR',
                redirect_url: process.env.CCAVENUE_REDIRECT_URL,
                cancel_url: process.env.CCAVENUE_CANCEL_URL,
                language: 'EN',
                billing_name: `${(user === null || user === void 0 ? void 0 : user.first_name) || ''} ${(user === null || user === void 0 ? void 0 : user.last_name) || ''}`.trim() || 'Customer',
                billing_email: (user === null || user === void 0 ? void 0 : user.email) || '',
                billing_tel: (user === null || user === void 0 ? void 0 : user.phone) || '',
                billing_address: 'NA',
                billing_city: 'NA',
                billing_state: 'NA',
                billing_zip: '000000',
                billing_country: 'India',
                delivery_name: `${(user === null || user === void 0 ? void 0 : user.first_name) || ''} ${(user === null || user === void 0 ? void 0 : user.last_name) || ''}`.trim() || 'Customer',
                delivery_address: 'NA',
                delivery_city: 'NA',
                delivery_state: 'NA',
                delivery_zip: '000000',
                delivery_country: 'India',
                delivery_tel: (user === null || user === void 0 ? void 0 : user.phone) || '',
                merchant_param1: userId.toString(),
                merchant_param2: new_plan_id.toString(),
                merchant_param3: newPlan.plan_name,
                merchant_param4: newPlan.duration_months.toString(),
                merchant_param5: receipt
            };
            const encryptedData = CCAvenue.encryptRequest(ccavenueData);
            const ccavenueUrl = process.env.CCAVENUE_MODE === 'production'
                ? 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction'
                : 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction';
            return res.json({
                success: true,
                payment_required: true,
                payment_gateway: 'ccavenue',
                message: "Previous plan cancelled. Complete payment to activate new plan.",
                data: {
                    order_id: orderId,
                    amount: totalAmount,
                    currency: 'INR',
                    access_code: process.env.CCAVENUE_ACCESS_CODE,
                    encrypted_data: encryptedData,
                    ccavenue_url: ccavenueUrl,
                    plan_name: newPlan.plan_name,
                    duration: newPlan.duration_months,
                    receipt: receipt,
                    previous_plan: activeSubscription.current_plan_name,
                    gst_breakdown: GSTHelper.formatGSTBreakdown(gstCalculation)
                }
            });
        }
    }
    catch (error) {
        console.error("Change Plan Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
/**
 * Activate Free Subscription (0 amount — 100% discount plans)
 * No payment gateway needed
 */
async function activateFreeSubscription(req, res) {
    try {
        const userId = req.user.user_id;
        const { plan_id } = req.body;
        if (!plan_id) {
            return res.status(400).json({
                success: false,
                message: "plan_id is required"
            });
        }
        // Get plan details
        const [plan] = await query(`SELECT * FROM subscription_plans WHERE id = ? AND user_status_id = 1`, [plan_id]);
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: "Plan not found or inactive"
            });
        }
        // Calculate final amount after discount
        const discount = parseInt(plan.discount_percentage) || 0;
        const finalAmount = parseFloat(plan.price) - (parseFloat(plan.price) * discount / 100);
        if (finalAmount > 0) {
            return res.status(400).json({
                success: false,
                message: "This plan requires payment. Use /payments/create-order instead.",
                amount: finalAmount
            });
        }
        // Check if user already has an active subscription
        const [activeSubscription] = await query(`
      SELECT id FROM user_subscriptions
      WHERE user_id = ? AND is_active = 1 AND subscription_status_id = 1
    `, [userId]);
        if (activeSubscription) {
            return res.status(400).json({
                success: false,
                message: "You already have an active subscription. Use /subscription/v2/change-plan to switch plans."
            });
        }
        // Create payment record (amount = 0)
        const paymentResult = await query(`
      INSERT INTO payments (
        user_id, plan_id, order_id, payment_id, amount, base_amount,
        cgst_amount, sgst_amount, igst_amount, gst_type, total_gst_amount,
        currency_id, payment_method, payment_status_id, payment_date, gateway_response
      ) VALUES (?, ?, ?, ?, 0.00, 0.00, 0.00, 0.00, 0.00, NULL, 0.00, 1, 'free', 1, CURRENT_TIMESTAMP, ?)
    `, [
            userId,
            plan_id,
            `FREE_${Date.now()}_${userId}`,
            `free_${Date.now()}_${userId}`,
            JSON.stringify({ type: 'free_subscription', discount_percentage: 100, original_price: plan.price })
        ]);
        // Create subscription
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + plan.duration_months);
        const subscriptionResult = await query(`
      INSERT INTO user_subscriptions (
        user_id, plan_id, payment_id, payment_order_id, start_date, end_date,
        activated_at, subscription_status_id, payment_status_id, is_active, plan_symbol
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 1, 1, ?)
    `, [
            userId,
            plan_id,
            paymentResult.insertId,
            `FREE_${Date.now()}_${userId}`,
            startDate,
            endDate,
            plan.plan_name
        ]);
        // Log subscription activation
        await query(`
      INSERT INTO subscription_logs (user_id, subscription_id, plan_id, action, new_status, payment_id, notes)
      VALUES (?, ?, ?, 'activated', 'active', ?, 'Free subscription activated (100% discount)')
    `, [userId, subscriptionResult.insertId, plan_id, `free_${Date.now()}_${userId}`]);
        // Generate invoice
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(paymentResult.insertId).padStart(6, '0')}`;
        await query(`UPDATE payments SET invoice_number = ? WHERE id = ?`, [invoiceNumber, paymentResult.insertId]);
        res.json({
            success: true,
            message: "Free subscription activated successfully",
            data: {
                subscription_id: subscriptionResult.insertId,
                plan_name: plan.plan_name,
                plan_id: plan.id,
                duration_months: plan.duration_months,
                start_date: startDate,
                end_date: endDate,
                amount_paid: 0,
                discount_percentage: 100,
                invoice_number: invoiceNumber
            }
        });
    }
    catch (error) {
        console.error("Activate Free Subscription Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=SubscriptionControllerV2.js.map