"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyUpgradePayment = void 0;
const utils = require("util");
const crypto = require('crypto');
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// ============ VERIFY UPGRADE PAYMENT ============
const verifyUpgradePayment = async (req, res) => {
    var _a;
    try {
        const vendorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, payment_method } = req.body;
        if (!vendorId || typeof vendorId !== 'number') {
            res.status(401).json({ success: false, message: "Vendor not authenticated" });
            return;
        }
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            res.status(400).json({ success: false, message: "Missing payment verification parameters" });
            return;
        }
        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");
        if (expectedSignature !== razorpay_signature) {
            res.status(400).json({ success: false, message: "Invalid payment signature" });
            return;
        }
        // Get payment record with new plan_id (handles both upgrade and renewal)
        const paymentRecord = await query("SELECT * FROM vendor_payments WHERE vendor_id = ? AND gateway_order_id = ? AND payment_type IN ('monthly_subscription', 'renewal')", [vendorId, razorpay_order_id]);
        if (paymentRecord.length === 0) {
            res.status(404).json({ success: false, message: "Payment record not found. Make sure payment was initiated." });
            return;
        }
        const paymentType = paymentRecord[0].payment_type;
        const newPlanId = paymentRecord[0].plan_id;
        // Update payment status
        await query("UPDATE vendor_payments SET payment_status = 'success', gateway_payment_id = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?", [razorpay_payment_id, paymentRecord[0].id]);
        // Update subscription with new plan_id
        const newEndDate = new Date();
        newEndDate.setMonth(newEndDate.getMonth() + 1);
        // For both upgrade and renewal, update the subscription
        await query("UPDATE vendor_subscriptions SET plan_id = ?, subscription_end_date = ?, status = 'active', next_billing_date = ? WHERE vendor_id = ? AND status = 'active'", [newPlanId, newEndDate.toISOString().split('T')[0], newEndDate.toISOString().split('T')[0], vendorId]);
        // Log payment type for debugging
        console.log(`Payment verified: type=${paymentType}, vendor_id=${vendorId}, plan_id=${newPlanId}`);
        res.json({
            success: true,
            message: "Payment verified successfully",
            data: { payment_id: razorpay_payment_id }
        });
    }
    catch (error) {
        console.error("Error verifying payment:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
exports.verifyUpgradePayment = verifyUpgradePayment;
//# sourceMappingURL=UpgradePaymentVerificationController.js.map