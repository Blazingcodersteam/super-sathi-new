"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renewSubscription = void 0;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// ============ RENEW SUBSCRIPTION ============
const renewSubscription = async (req, res) => {
    var _a;
    try {
        const vendorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { payment_method = 'razorpay' } = req.body;
        if (!vendorId || typeof vendorId !== 'number') {
            res.status(401).json({ success: false, message: "Vendor not authenticated" });
            return;
        }
        // Get current/expired subscription
        const subscription = await query("SELECT vs.*, vsp.monthly_price FROM vendor_subscriptions vs JOIN vendor_subscription_plans vsp ON vs.plan_id = vsp.id WHERE vs.vendor_id = ? ORDER BY vs.subscription_end_date DESC LIMIT 1", [vendorId]);
        if (subscription.length === 0) {
            res.status(404).json({ success: false, message: "No subscription found" });
            return;
        }
        const sub = subscription[0];
        const planPrice = parseFloat(sub.monthly_price);
        const paymentId = `VP_RENEW_${Date.now()}_${vendorId}`;
        const orderId = `renew_${Date.now()}_${vendorId}`;
        // Create payment record
        await query("INSERT INTO vendor_payments (vendor_id, plan_id, payment_type, payment_id, order_id, amount, total_amount, currency, payment_method, payment_status, billing_period_start, billing_period_end) VALUES (?, ?, 'renewal', ?, ?, ?, ?, 'INR', ?, 'pending', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH))", [vendorId, sub.plan_id, paymentId, orderId, planPrice, planPrice, payment_method]);
        res.json({
            success: true,
            message: "Renewal initiated",
            data: {
                payment_id: paymentId,
                order_id: orderId,
                amount: planPrice,
                plan_id: sub.plan_id
            }
        });
    }
    catch (error) {
        console.error("Error renewing subscription:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
exports.renewSubscription = renewSubscription;
//# sourceMappingURL=RenewSubscriptionController.js.map