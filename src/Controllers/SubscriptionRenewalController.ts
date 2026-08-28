import { Request, Response } from "express";
import * as utils from "util";
const Razorpay = require('razorpay');
const crypto = require('crypto');
import { CCAvenue } from '../utils/ccavenue';

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ============ RENEWAL FLOW ============
// 1st Registration: Uses temp_registration_id
// 2nd+ Renewals: Uses vendor_id from auth token (authenticated)

// ============ INITIATE RENEWAL - FOR AUTHENTICATED VENDORS (2nd+ renewals) ============

export const initiateAuthenticatedRenewal = async (req: Request, res: Response): Promise<void> => {
  try {
    const vendorId = (req as any).user?.id;
    const { payment_method = 'razorpay' } = req.body;

    if (!vendorId || typeof vendorId !== 'number') {
      res.status(401).json({ success: false, message: "Vendor not authenticated" });
      return;
    }

    if (!['razorpay', 'ccavenue'].includes(payment_method)) {
      res.status(400).json({ success: false, message: "Invalid payment method. Use 'razorpay' or 'ccavenue'" });
      return;
    }

    // Get current subscription
    const subscription: any[] = await query(
      `SELECT vs.*, vsp.monthly_price, vsp.plan_name 
       FROM vendor_subscriptions vs 
       JOIN vendor_subscription_plans vsp ON vs.plan_id = vsp.id 
       WHERE vs.vendor_id = ? 
       ORDER BY vs.subscription_end_date DESC LIMIT 1`,
      [vendorId]
    );

    if (subscription.length === 0) {
      res.status(404).json({ success: false, message: "No subscription found" });
      return;
    }

    const sub = subscription[0];
    let planPrice = parseFloat(sub.monthly_price);
    
    // Validate amount is at least ₹1 (100 paise)
    if (isNaN(planPrice) || planPrice < 1) {
      console.error('Invalid plan price:', { monthly_price: sub.monthly_price, parsed: planPrice });
      res.status(400).json({ 
        success: false, 
        message: "Invalid plan price. Minimum amount is ₹1",
        debug: { monthly_price: sub.monthly_price, parsed: planPrice }
      });
      return;
    }

    const paymentId = `VP_RENEW_${Date.now()}_${vendorId}`;
    const orderId = `renew_${Date.now()}_${vendorId}`;

    // Create renewal payment record
    await query(
      `INSERT INTO vendor_payments 
       (vendor_id, plan_id, payment_type, payment_id, order_id, amount, total_amount, 
        currency, payment_method, payment_status, billing_period_start, billing_period_end) 
       VALUES (?, ?, 'renewal', ?, ?, ?, ?, 'INR', ?, 'pending', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH))`,
      [vendorId, sub.plan_id, paymentId, orderId, planPrice, planPrice, payment_method]
    );

    if (payment_method === 'razorpay') {
      // Create Razorpay order
      const receipt = `renewal_${Date.now()}_${vendorId}`;
      const amountInPaise = Math.round(planPrice * 100);
      
      console.log('Creating Razorpay order:', {
        vendor_id: vendorId,
        plan_price: planPrice,
        amount_in_paise: amountInPaise,
        plan_name: sub.plan_name
      });

      const razorpayOrder = await razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: receipt,
        payment_capture: 1,
        notes: {
          vendor_id: vendorId.toString(),
          plan_id: sub.plan_id.toString(),
          plan_name: sub.plan_name,
          payment_type: 'renewal'
        }
      });

      // Update payment with Razorpay order ID
      await query(
        "UPDATE vendor_payments SET gateway_order_id = ?, gateway_response = ? WHERE payment_id = ?",
        [razorpayOrder.id, JSON.stringify(razorpayOrder), paymentId]
      );

      res.json({
        success: true,
        message: "Renewal initiated",
        data: {
          payment_id: paymentId,
          order_id: razorpayOrder.id,
          amount: planPrice,
          amount_in_paise: amountInPaise,
          currency: 'INR',
          key: process.env.RAZORPAY_KEY_ID,
          plan_name: sub.plan_name,
          receipt: receipt,
          vendor_id: vendorId
        }
      });
    } else if (payment_method === 'ccavenue') {
      // Get vendor details for CCAvenue
      const vendor: any[] = await query(
        "SELECT email, phone FROM vendors WHERE id = ?",
        [vendorId]
      );

      if (vendor.length === 0) {
        res.status(404).json({ success: false, message: "Vendor not found" });
        return;
      }

      const ccavenueData = {
        merchant_id: process.env.CCAVENUE_MERCHANT_ID,
        order_id: orderId,
        amount: planPrice.toFixed(2),
        currency: 'INR',
        redirect_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/vendor/payment/ccavenue/renewal/callback`,
        cancel_url: `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/vendor/payment/ccavenue/renewal/cancel`,
        language: 'EN',
        billing_name: `Vendor ${vendorId}`,
        billing_email: vendor[0].email,
        billing_tel: vendor[0].phone,
        billing_address: 'NA',
        billing_city: 'NA',
        billing_state: 'NA',
        billing_zip: '000000',
        billing_country: 'India',
        delivery_name: `Vendor ${vendorId}`,
        delivery_address: 'NA',
        delivery_city: 'NA',
        delivery_state: 'NA',
        delivery_zip: '000000',
        delivery_country: 'India',
        delivery_tel: vendor[0].phone,
        merchant_param1: vendorId.toString(),
        merchant_param2: sub.plan_id.toString(),
        merchant_param3: sub.plan_name,
        merchant_param4: paymentId,
        merchant_param5: 'renewal'
      };

      const encryptedData = CCAvenue.encryptRequest(ccavenueData);

      // Update payment with CCAvenue data
      await query(
        "UPDATE vendor_payments SET gateway_order_id = ?, gateway_response = ? WHERE payment_id = ?",
        [orderId, JSON.stringify(ccavenueData), paymentId]
      );

      const ccavenueUrl = process.env.CCAVENUE_MODE === 'production'
        ? 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction'
        : 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction';

      res.json({
        success: true,
        message: "Renewal initiated",
        data: {
          payment_id: paymentId,
          order_id: orderId,
          amount: planPrice,
          currency: 'INR',
          access_code: process.env.CCAVENUE_ACCESS_CODE,
          encrypted_data: encryptedData,
          ccavenue_url: ccavenueUrl,
          plan_name: sub.plan_name,
          vendor_id: vendorId
        }
      });
    }

  } catch (error: any) {
    console.error("Error initiating renewal:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// ============ VERIFY RENEWAL PAYMENT - FOR RAZORPAY ============

export const verifyAuthenticatedRenewalPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const vendorId = (req as any).user?.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!vendorId) {
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

    // Get payment record
    const payment: any[] = await query(
      "SELECT * FROM vendor_payments WHERE vendor_id = ? AND gateway_order_id = ? AND payment_type = 'renewal'",
      [vendorId, razorpay_order_id]
    );

    if (payment.length === 0) {
      res.status(404).json({ success: false, message: "Payment record not found" });
      return;
    }

    // Check if already processed
    if (payment[0].payment_status === 'completed') {
      res.status(400).json({ 
        success: false, 
        message: "Payment already processed",
        data: { payment_id: payment[0].payment_id, status: 'completed' }
      });
      return;
    }

    // Fetch payment from Razorpay
    let razorpayPayment;
    try {
      razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (razorpayError: any) {
      console.error('Error fetching Razorpay payment:', razorpayError);
      res.status(400).json({ success: false, message: "Failed to fetch payment details from Razorpay" });
      return;
    }

    if (razorpayPayment.status !== 'captured') {
      res.status(400).json({ 
        success: false, 
        message: "Payment not captured",
        payment_status: razorpayPayment.status
      });
      return;
    }

    // Update payment status
    await query(
      `UPDATE vendor_payments SET 
       payment_status = 'completed', 
       gateway_payment_id = ?, 
       gateway_response = ?,
       paid_at = CURRENT_TIMESTAMP 
       WHERE vendor_id = ? AND gateway_order_id = ?`,
      [razorpay_payment_id, JSON.stringify(razorpayPayment), vendorId, razorpay_order_id]
    );

    // Update subscription end date
    const currentSub: any[] = await query(
      "SELECT * FROM vendor_subscriptions WHERE vendor_id = ? ORDER BY subscription_end_date DESC LIMIT 1",
      [vendorId]
    );

    if (currentSub.length > 0) {
      const newEndDate = new Date(currentSub[0].subscription_end_date);
      newEndDate.setMonth(newEndDate.getMonth() + 1);

      await query(
        "UPDATE vendor_subscriptions SET subscription_end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE vendor_id = ? AND id = ?",
        [newEndDate, vendorId, currentSub[0].id]
      );
    }

    res.json({
      success: true,
      message: "Renewal payment verified successfully",
      data: {
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
        status: 'success',
        new_subscription_end_date: currentSub.length > 0 ? new Date(currentSub[0].subscription_end_date).toISOString().split('T')[0] : null
      }
    });

  } catch (error: any) {
    console.error("Error verifying renewal payment:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// ============ HANDLE CCAVENUE RENEWAL CALLBACK ============

export const handleCCAvenueRenewalCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('CCAvenue Renewal Callback received');
    const { encResp } = req.body;

    if (!encResp) {
      res.status(400).send(`<html><body><h2>Invalid Callback Data</h2><script>setTimeout(() => window.close(), 3000);</script></body></html>`);
      return;
    }

    const decryptedData = CCAvenue.decryptResponse(encResp);
    const orderId = decryptedData.order_id;
    const orderStatus = decryptedData.order_status;
    const trackingId = decryptedData.tracking_id;
    const vendorId = parseInt(decryptedData.merchant_param1);

    // Get payment record
    const payment: any[] = await query(
      "SELECT * FROM vendor_payments WHERE gateway_order_id = ? AND vendor_id = ? AND payment_type = 'renewal'",
      [orderId, vendorId]
    );

    if (payment.length === 0) {
      res.status(404).send(`<html><body><h2>Payment Record Not Found</h2><script>setTimeout(() => window.close(), 5000);</script></body></html>`);
      return;
    }

    if (orderStatus === 'Success') {
      // Update payment record
      await query(`
        UPDATE vendor_payments SET
          payment_status = 'completed',
          gateway_payment_id = ?,
          gateway_response = ?,
          paid_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE gateway_order_id = ? AND vendor_id = ?
      `, [trackingId, JSON.stringify(decryptedData), orderId, vendorId]);

      // Update subscription end date
      const currentSub: any[] = await query(
        "SELECT * FROM vendor_subscriptions WHERE vendor_id = ? ORDER BY subscription_end_date DESC LIMIT 1",
        [vendorId]
      );

      if (currentSub.length > 0) {
        const newEndDate = new Date(currentSub[0].subscription_end_date);
        newEndDate.setMonth(newEndDate.getMonth() + 1);

        await query(
          "UPDATE vendor_subscriptions SET subscription_end_date = ?, updated_at = CURRENT_TIMESTAMP WHERE vendor_id = ? AND id = ?",
          [newEndDate, vendorId, currentSub[0].id]
        );
      }

      const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
      res.redirect(`${frontendUrl}/vendor/renewal/success?order_id=${orderId}&tracking_id=${trackingId}&status=success`);
    } else {
      // Payment failed
      await query(`
        UPDATE vendor_payments SET
          payment_status = 'failed',
          failure_reason = ?,
          gateway_response = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE gateway_order_id = ? AND vendor_id = ?
      `, [decryptedData.failure_message || 'Payment failed', JSON.stringify(decryptedData), orderId, vendorId]);

      const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
      res.redirect(`${frontendUrl}/vendor/renewal/failed?order_id=${orderId}&status=failed&message=${encodeURIComponent(decryptedData.failure_message || 'Payment failed')}`);
    }

  } catch (error: any) {
    console.error("CCAvenue Renewal Callback Error:", error);
    const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
    res.redirect(`${frontendUrl}/vendor/renewal/failed?status=error&message=${encodeURIComponent('Server error occurred')}`);
  }
};

// ============ HANDLE CCAVENUE RENEWAL CANCEL ============

export const handleCCAvenueRenewalCancel = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('CCAvenue Renewal Cancel received');
    const { encResp } = req.body;

    if (!encResp) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
      res.redirect(`${frontendUrl}/vendor/renewal/cancelled?status=cancelled&error=missing_data`);
      return;
    }

    const decryptedData = CCAvenue.decryptResponse(encResp);
    const orderId = decryptedData.order_id;
    const vendorId = parseInt(decryptedData.merchant_param1);

    // Update payment status to cancelled
    await query(`
      UPDATE vendor_payments SET
        payment_status = 'cancelled',
        failure_reason = 'Payment cancelled by user',
        gateway_response = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE gateway_order_id = ? AND vendor_id = ?
    `, [JSON.stringify(decryptedData), orderId, vendorId]);

    const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
    res.redirect(`${frontendUrl}/vendor/renewal/cancelled?order_id=${orderId}&status=cancelled`);

  } catch (error: any) {
    console.error("CCAvenue Renewal Cancel Error:", error);
    const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
    res.redirect(`${frontendUrl}/vendor/renewal/cancelled?status=error&message=${encodeURIComponent('Server error occurred')}`);
  }
};

// ============ GET RENEWAL STATUS ============

export const getRenewalStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const vendorId = (req as any).user?.id;

    if (!vendorId) {
      res.status(401).json({ success: false, message: "Vendor not authenticated" });
      return;
    }

    // Get current subscription
    const subscription: any[] = await query(
      `SELECT vs.*, vsp.plan_name, vsp.monthly_price 
       FROM vendor_subscriptions vs 
       JOIN vendor_subscription_plans vsp ON vs.plan_id = vsp.id 
       WHERE vs.vendor_id = ? 
       ORDER BY vs.subscription_end_date DESC LIMIT 1`,
      [vendorId]
    );

    if (subscription.length === 0) {
      res.status(404).json({ success: false, message: "No subscription found" });
      return;
    }

    const sub = subscription[0];
    const now = new Date();
    const endDate = new Date(sub.subscription_end_date);
    const isExpired = now > endDate;
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    res.json({
      success: true,
      data: {
        plan_name: sub.plan_name,
        plan_id: sub.plan_id,
        subscription_start_date: sub.subscription_start_date,
        subscription_end_date: sub.subscription_end_date,
        is_expired: isExpired,
        days_remaining: daysRemaining,
        monthly_price: sub.monthly_price,
        status: sub.status
      }
    });

  } catch (error: any) {
    console.error("Error getting renewal status:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};
