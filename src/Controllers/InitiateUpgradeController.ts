import { Request, Response } from "express";
import * as utils from "util";
const Razorpay = require('razorpay');
import { CCAvenue } from '../utils/ccavenue';

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ============ INITIATE UPGRADE ============

export const initiateUpgrade = async (req: Request, res: Response): Promise<void> => {
  try {
    const vendorId = (req as any).user?.id;
    const { new_plan_id, payment_method = 'razorpay' } = req.body;

    if (!vendorId || typeof vendorId !== 'number') {
      res.status(401).json({ success: false, message: "Vendor not authenticated" });
      return;
    }

    if (!new_plan_id) {
      res.status(400).json({ success: false, message: "new_plan_id is required" });
      return;
    }

    // Get current subscription
    const currentSub: any[] = await query(
      "SELECT vs.*, vsp.monthly_price as current_price FROM vendor_subscriptions vs JOIN vendor_subscription_plans vsp ON vs.plan_id = vsp.id WHERE vs.vendor_id = ?",
      [vendorId]
    );

    if (currentSub.length === 0) {
      res.status(404).json({ success: false, message: "No active subscription found" });
      return;
    }

    // Get new plan details
    const newPlan: any[] = await query(
      "SELECT * FROM vendor_subscription_plans WHERE id = ? AND is_active = 1",
      [new_plan_id]
    );

    if (newPlan.length === 0) {
      res.status(404).json({ success: false, message: "New plan not found" });
      return;
    }

    const current = currentSub[0];
    const newPlanPrice = parseFloat(newPlan[0].monthly_price);
    const currentPrice = parseFloat(current.current_price);

    // Validation: Same plan check
    if (current.plan_id === new_plan_id) {
      res.status(400).json({ success: false, message: "Cannot upgrade to the same plan" });
      return;
    }

    // Validation: Downgrade check
    if (newPlanPrice <= currentPrice) {
      res.status(400).json({ success: false, message: "New plan must have higher price than current plan" });
      return;
    }

    // Calculate proration
    const daysRemaining = Math.ceil(
      (new Date(current.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    const dailyRateOld = currentPrice / 30;
    const creditAmount = dailyRateOld * daysRemaining;
    const dailyRateNew = newPlanPrice / 30;
    const chargeForRemaining = dailyRateNew * daysRemaining;
    let proratedAmount = Math.max(0, chargeForRemaining - creditAmount);

    // If the current subscription has already expired, charge full new plan price
    if (daysRemaining <= 0) {
      proratedAmount = newPlanPrice;
    }

    // Validation: Minimum amount check
    if (proratedAmount < 1 && proratedAmount > 0) {
      res.status(400).json({ 
        success: false, 
        message: "Upgrade amount is too small. Minimum amount required is 1 INR",
        data: { prorated_amount: proratedAmount.toFixed(2) }
      });
      return;
    }

    if (proratedAmount === 0) {
      res.status(400).json({ 
        success: false, 
        message: "No additional charge for this upgrade",
        data: { prorated_amount: 0 }
      });
      return;
    }

    // Create payment record
    const paymentId = `VP_UPGRADE_${Date.now()}_${vendorId}`;
    const orderId = `upgrade_${Date.now()}_${vendorId}`;

    const insertPaymentQuery = `
      INSERT INTO vendor_payments (
        vendor_id, plan_id, payment_type, payment_id, order_id,
        amount, total_amount, currency, payment_method, payment_status,
        billing_period_start, billing_period_end
      ) VALUES (?, ?, 'monthly_subscription', ?, ?, ?, ?, 'INR', ?, 'pending', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH))
    `;

    await query(insertPaymentQuery, [
      vendorId,
      new_plan_id,
      paymentId,
      orderId,
      proratedAmount,
      proratedAmount,
      payment_method
    ]);

    // Create Razorpay order
    if (payment_method === 'razorpay') {
      const options = {
        amount: Math.round(proratedAmount * 100),
        currency: 'INR',
        receipt: `upgrade_${vendorId}_${Date.now()}`,
        payment_capture: 1,
        notes: {
          vendor_id: vendorId.toString(),
          current_plan_id: current.plan_id.toString(),
          new_plan_id: new_plan_id.toString(),
          payment_type: 'upgrade'
        }
      };

      const razorpayOrder = await razorpay.orders.create(options);

      await query(
        "UPDATE vendor_payments SET gateway_order_id = ? WHERE payment_id = ?",
        [razorpayOrder.id, paymentId]
      );

      res.json({
        success: true,
        payment_method: 'razorpay',
        data: {
          payment_id: paymentId,
          order_id: razorpayOrder.id,
          amount: proratedAmount,
          key: process.env.RAZORPAY_KEY_ID,
          current_plan: {
            id: current.plan_id,
            price: currentPrice
          },
          new_plan: {
            id: new_plan_id,
            name: newPlan[0].plan_name,
            price: newPlanPrice
          },
          proration: {
            days_remaining: daysRemaining,
            credit_amount: creditAmount.toFixed(2),
            charge_for_remaining: chargeForRemaining.toFixed(2),
            prorated_amount: proratedAmount.toFixed(2)
          }
        }
      });
    } else {
      res.json({
        success: true,
        payment_method: 'ccavenue',
        data: {
          payment_id: paymentId,
          order_id: orderId,
          amount: proratedAmount,
          new_plan: {
            id: new_plan_id,
            name: newPlan[0].plan_name,
            price: newPlanPrice
          },
          proration: {
            days_remaining: daysRemaining,
            prorated_amount: proratedAmount.toFixed(2)
          }
        }
      });
    }

  } catch (error: any) {
    console.error("Error initiating upgrade:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
