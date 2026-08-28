"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentSubscription = void 0;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// ============ GET CURRENT SUBSCRIPTION ============
const getCurrentSubscription = async (req, res) => {
    var _a;
    try {
        const vendorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!vendorId || typeof vendorId !== 'number') {
            res.status(401).json({
                success: false,
                message: "Vendor not authenticated"
            });
            return;
        }
        // First, try to get existing subscription
        let subscriptionQuery = `
      SELECT 
        vs.id,
        vs.vendor_id,
        vs.plan_id,
        vs.subscription_start_date,
        vs.subscription_end_date,
        vs.status,
        vs.auto_renewal,
        vs.next_billing_date,
        vsp.plan_name,
        vsp.plan_description,
        vsp.monthly_price,
        vsp.setup_fee,
        vsp.features,
        vsp.max_services,
        vsp.max_consultations_per_month,
        vsp.commission_rate,
        vsp.duration_months
      FROM vendor_subscriptions vs
      JOIN vendor_subscription_plans vsp ON vs.plan_id = vsp.id
      WHERE vs.vendor_id = ?
      ORDER BY vs.subscription_start_date DESC
      LIMIT 1
    `;
        let subscriptions = await query(subscriptionQuery, [vendorId]);
        // If no subscription found, check vendor's current plan and create one
        if (subscriptions.length === 0) {
            const vendorQuery = `SELECT current_plan_id FROM vendors WHERE id = ?`;
            const vendors = await query(vendorQuery, [vendorId]);
            if (vendors.length === 0) {
                res.status(404).json({
                    success: false,
                    message: "Vendor not found"
                });
                return;
            }
            const currentPlanId = vendors[0].current_plan_id;
            if (currentPlanId) {
                // Create a subscription record for the vendor's current plan
                const createSubQuery = `
          INSERT INTO vendor_subscriptions (
            vendor_id, plan_id, subscription_start_date, subscription_end_date,
            status, auto_renewal, next_billing_date, created_at, updated_at
          ) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 1 YEAR), 'active', 0, DATE_ADD(NOW(), INTERVAL 1 YEAR), NOW(), NOW())
        `;
                await query(createSubQuery, [vendorId, currentPlanId]);
                // Fetch the newly created subscription
                subscriptions = await query(subscriptionQuery, [vendorId]);
            }
        }
        if (subscriptions.length === 0) {
            res.status(404).json({
                success: false,
                message: "No subscription found"
            });
            return;
        }
        const subscription = subscriptions[0];
        const endDate = new Date(subscription.subscription_end_date);
        const now = new Date();
        const daysRemaining = endDate < now ? 0 : Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        res.json({
            success: true,
            data: {
                subscription_id: subscription.id,
                plan: {
                    id: subscription.plan_id,
                    name: subscription.plan_name,
                    description: subscription.plan_description,
                    monthly_price: Number(subscription.monthly_price),
                    setup_fee: Number(subscription.setup_fee),
                    duration_months: subscription.duration_months,
                    features: subscription.features ? (() => {
                        try {
                            return JSON.parse(subscription.features);
                        }
                        catch (e) {
                            console.error('Error parsing features:', e);
                            return [];
                        }
                    })() : [],
                    max_services: subscription.max_services,
                    max_consultations_per_month: subscription.max_consultations_per_month,
                    commission_rate: Number(subscription.commission_rate)
                },
                subscription_details: {
                    status: subscription.status,
                    start_date: subscription.subscription_start_date,
                    end_date: subscription.subscription_end_date,
                    days_remaining: daysRemaining,
                    auto_renewal: Boolean(subscription.auto_renewal),
                    next_billing_date: subscription.next_billing_date
                }
            }
        });
    }
    catch (error) {
        console.error("Error fetching current subscription:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};
exports.getCurrentSubscription = getCurrentSubscription;
//# sourceMappingURL=VendorSubscriptionManagementController.js.map