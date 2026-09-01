import * as utils from "util";
import * as PDFDocument from 'pdfkit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as path from 'path';
import * as fs from 'fs';
const Razorpay = require('razorpay');
const crypto = require('crypto');
import { CCAvenue } from '../utils/ccavenue';
import { GSTHelper } from '../utils/gstHelper';

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function generateInvoicePDF(payment: any): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 60 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', async () => {
        const pdfBuffer = Buffer.concat(chunks);
        const fileName = `invoices/${payment.invoice_number}.pdf`;

        const uploadParams = {
          Bucket: process.env.AWS_BUCKET_NAME!,
          Key: fileName,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        };

        await s3Client.send(new PutObjectCommand(uploadParams));
        const pdfUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
        resolve(pdfUrl);
      });

      const invoiceDate = new Date(payment.payment_date).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      const customerName = `${payment.first_name || ''} ${payment.last_name || ''}`.trim() || 'Customer';
      const baseAmount = parseFloat(payment.base_amount || payment.amount);
      const gstAmount = parseFloat(payment.total_gst_amount || 0);
      const totalAmount = parseFloat(payment.amount);

      const pageWidth = 595.28; // A4 width in points
      const leftMargin = 60;
      const rightMargin = 60;
      const contentWidth = pageWidth - leftMargin - rightMargin; // ~475

      // Header - INVOICE (Blue)
      doc.fontSize(36).fillColor('#2196F3').text('INVOICE', leftMargin, 60, { width: 200 });

      // Right side - Logo and VIVAAHA (right-aligned within content area)
      try {
        const logoPath = path.resolve(process.cwd(), 'src/logo.png');
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, pageWidth - rightMargin - 50, 55, { width: 50, height: 50 });
        }
      } catch (err) {
        console.log('Logo not found, skipping');
      }
      doc.fontSize(20).fillColor('#FFA726').text('VIVAAHA', leftMargin, 110, { width: contentWidth, align: 'right' });
      doc.fontSize(9).fillColor('#666').text('support@vivaaha.net', leftMargin, 135, { width: contentWidth, align: 'right' });

      // Invoice Info
      doc.fontSize(11).fillColor('#000');
      doc.text(`Invoice #: ${payment.invoice_number}`, leftMargin, 160, { width: contentWidth });
      doc.text(`Date: ${invoiceDate}`, leftMargin, 178, { width: contentWidth });

      // Divider
      doc.moveTo(leftMargin, 210).lineTo(pageWidth - rightMargin, 210).stroke('#e0e0e0');

      // Bill To
      doc.fontSize(14).fillColor('#000').text('Bill To:', leftMargin, 230, { width: contentWidth });
      doc.fontSize(11).fillColor('#000');
      doc.text(customerName, leftMargin, 260, { width: contentWidth });
      doc.text(payment.email || '', leftMargin, 278, { width: contentWidth });
      doc.text(payment.phone || '', leftMargin, 296, { width: contentWidth });

      // Items Table Header
      doc.fontSize(12).fillColor('#000');
      doc.text('Description', leftMargin, 340, { width: 300 });
      doc.text('Amount', leftMargin, 340, { width: contentWidth, align: 'right' });

      // Line under header
      doc.moveTo(leftMargin, 360).lineTo(pageWidth - rightMargin, 360).stroke('#e0e0e0');

      // Table content
      doc.fontSize(11).fillColor('#000');
      doc.text(`${payment.plan_name} (${payment.duration_months} Month${payment.duration_months > 1 ? 's' : ''})`, leftMargin, 380, { width: 300 });
      doc.text(`₹${baseAmount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, leftMargin, 380, { width: contentWidth, align: 'right' });

      doc.text('GST', leftMargin, 410, { width: 300 });
      doc.text(`₹${gstAmount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, leftMargin, 410, { width: contentWidth, align: 'right' });

      // Total Amount with line above
      doc.moveTo(leftMargin, 440).lineTo(pageWidth - rightMargin, 440).stroke('#e0e0e0');
      doc.fontSize(13).fillColor('#000');
      doc.text('Total Amount', leftMargin, 455, { width: 300 });
      doc.text(`₹${totalAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, leftMargin, 455, { width: contentWidth, align: 'right' });

      // Divider
      doc.moveTo(leftMargin, 490).lineTo(pageWidth - rightMargin, 490).stroke('#e0e0e0');

      // Payment Details
      doc.fontSize(13).fillColor('#000').text('Payment Details', leftMargin, 510, { width: contentWidth });
      doc.fontSize(11).fillColor('#000');
      doc.text(`Payment Method: ${(payment.payment_method || 'UPI').toUpperCase()}`, leftMargin, 535, { width: contentWidth });
      doc.text(`Transaction ID: ${payment.payment_id || payment.order_id || 'N/A'}`, leftMargin, 553, { width: contentWidth });

      // Divider before footer
      doc.moveTo(leftMargin, 590).lineTo(pageWidth - rightMargin, 590).stroke('#e0e0e0');

      // Footer
      doc.fontSize(10).fillColor('#666');
      doc.text('Thank you for your business!', leftMargin, 720, { align: 'center', width: contentWidth });
      doc.text('For any queries, contact us at support@vivaaha.net', leftMargin, 738, { align: 'center', width: contentWidth });
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// GST Preview — calculate GST for a plan without creating an order (Authenticated)
export async function gstPreview(req, res) {
  try {
    const userId = req.user.user_id;
    const { plan_id, addon_ids = [] } = req.query;

    if (!plan_id) {
      return res.status(400).json({ success: false, message: 'plan_id is required' });
    }

    const [plan] = await query(
      `SELECT * FROM subscription_plans WHERE id = ? AND user_status_id = 1`, [plan_id]
    );
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    let baseAmount = parseFloat(plan.price) || 0;

    // Add addon prices if provided
    if (addon_ids && addon_ids.length > 0) {
      const ids = Array.isArray(addon_ids) ? addon_ids : [addon_ids];
      for (const id of ids) {
        const [addon] = await query(
          `SELECT price FROM subscription_addons_master WHERE id = ? AND is_active = 1`, [id]
        );
        if (addon) baseAmount += parseFloat(addon.price) || 0;
      }
    }

    const [userLocation] = await query(
      `SELECT state_id FROM location_details WHERE user_id = ?`, [userId]
    );

    let gstCalculation;
    try {
      gstCalculation = await GSTHelper.calculateGST(baseAmount, userLocation?.state_id);
    } catch (gstError: any) {
      if (gstError.message && gstError.message.includes('location')) {
        return res.status(400).json({ success: false, message: gstError.message });
      }
      throw gstError;
    }

    res.json({
      success: true,
      data: {
        plan_name: plan.plan_name,
        duration_months: plan.duration_months,
        gst_breakdown: GSTHelper.formatGSTBreakdown(gstCalculation),
      }
    });
  } catch (error) {
    console.error('GST Preview Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Public GST Preview — calculate GST for a plan without authentication
export async function publicGstPreview(req, res) {
  try {
    const { plan_id, addon_ids = [], state_id } = req.query;

    if (!plan_id) {
      return res.status(400).json({ success: false, message: 'plan_id is required' });
    }

    const [plan] = await query(
      `SELECT * FROM subscription_plans WHERE id = ? AND user_status_id = 1`, [plan_id]
    );
    if (!plan) {
      return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    let baseAmount = parseFloat(plan.price) || 0;

    // Add addon prices if provided
    if (addon_ids && addon_ids.length > 0) {
      const ids = Array.isArray(addon_ids) ? addon_ids : [addon_ids];
      for (const id of ids) {
        const [addon] = await query(
          `SELECT price FROM subscription_addons_master WHERE id = ? AND is_active = 1`, [id]
        );
        if (addon) baseAmount += parseFloat(addon.price) || 0;
      }
    }

    // Convert state_id to integer (query params are strings)
    const parsedStateId = state_id ? parseInt(state_id as string, 10) : null;

    let gstCalculation;
    try {
      gstCalculation = await GSTHelper.calculateGST(baseAmount, parsedStateId);
    } catch (gstError: any) {
      if (gstError.message && gstError.message.includes('location')) {
        return res.status(400).json({ success: false, message: gstError.message });
      }
      throw gstError;
    }

    res.json({
      success: true,
      data: {
        plan_name: plan.plan_name,
        duration_months: plan.duration_months,
        base_amount: parseFloat(gstCalculation.baseAmount.toFixed(2)),
        gst_breakdown: GSTHelper.formatGSTBreakdown(gstCalculation),
        total_amount: parseFloat(gstCalculation.totalAmount.toFixed(2))
      }
    });
  } catch (error) {
    console.error('Public GST Preview Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Create Order (Supports both Razorpay and CCAvenue)
export async function createOrder(req, res) {
  try {
    const userId = req.user.user_id;
    const { plan_id, addons = [], payment_gateway = 'razorpay' } = req.body;

    if (!plan_id) {
      return res.status(400).json({ 
        success: false, 
        message: "plan_id is required" 
      });
    }

    if (!['razorpay', 'ccavenue'].includes(payment_gateway)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment gateway. Use 'razorpay' or 'ccavenue'"
      });
    }

    // Check active subscription (exclude cancelled ones with pending refund)
    const [activeSubscription] = await query(`
      SELECT us.id FROM user_subscriptions us
      WHERE us.user_id = ? 
        AND us.subscription_status_id = 1 
        AND us.is_active = 1
        AND us.end_date > CURRENT_DATE
        AND NOT EXISTS (
          SELECT 1 FROM refund_requests rr 
          WHERE rr.subscription_id = us.id AND rr.user_id = ?
        )
    `, [userId, userId]);

    if (activeSubscription) {
      return res.status(400).json({
        success: false,
        message: "You already have an active subscription"
      });
    }

    // Get plan details
    const [plan] = await query(`
      SELECT * FROM subscription_plans WHERE id = ? AND user_status_id = 1
    `, [plan_id]);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found"
      });
    }

    // Calculate base amount (before GST)
    let baseAmount = parseFloat(plan.price) || 0;
    const selectedAddons = [];

    if (addons.length > 0) {
      for (const addon of addons) {
        if (addon.selected) {
          const [addonDetails] = await query(`
            SELECT * FROM subscription_addons_master WHERE id = ? AND is_active = 1
          `, [addon.id]);
          if (addonDetails) {
            baseAmount += parseFloat(addonDetails.price) || 0;
            selectedAddons.push(addonDetails);
          }
        }
      }
    }

    if (baseAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount calculated"
      });
    }

    // Get user's state from location_details for GST calculation
    const [userLocation] = await query(`
      SELECT ld.state_id 
      FROM location_details ld 
      WHERE ld.user_id = ?
    `, [userId]);

    // Calculate GST based on user's state
    // Rajasthan (state_id = 33) = CGST + SGST
    // All other states = IGST
    let gstCalculation;
    try {
      gstCalculation = await GSTHelper.calculateGST(baseAmount, userLocation?.state_id);
    } catch (gstError: any) {
      if (gstError.message && gstError.message.includes('location')) {
        return res.status(400).json({ success: false, message: gstError.message });
      }
      throw gstError;
    }
    const totalAmount = gstCalculation.totalAmount;

    // Get user details
    const [user] = await query(`
      SELECT u.email, u.phone, up.first_name, up.last_name
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id = ?
    `, [userId]);

    if (payment_gateway === 'razorpay') {
      return await createRazorpayOrder(userId, plan_id, plan, gstCalculation, selectedAddons, res);
    } else {
      return await createCCAvenueOrder(userId, plan_id, plan, gstCalculation, selectedAddons, user, res);
    }
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Razorpay Order Creation
async function createRazorpayOrder(userId, planId, plan, gstCalculation, selectedAddons, res) {
  const receipt = `receipt_${Date.now()}_${userId}`;
  const options = {
    amount: Math.round(gstCalculation.totalAmount * 100),
    currency: 'INR',
    receipt: receipt,
    payment_capture: 1,
    notes: {
      user_id: userId.toString(),
      plan_id: planId.toString(),
      plan_name: plan.plan_name,
      base_amount: gstCalculation.baseAmount.toString(),
      gst_type: gstCalculation.gstType,
      total_gst: gstCalculation.totalGstAmount.toString()
    }
  };

  const order = await razorpay.orders.create(options);
  
  await query(`
    INSERT INTO payment_orders (user_id, plan_id, order_id, amount, base_amount, cgst_amount, sgst_amount, igst_amount, gst_type, total_gst_amount, currency, receipt, notes, payment_gateway)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, 'razorpay')
  `, [userId, planId, order.id, gstCalculation.totalAmount, gstCalculation.baseAmount, gstCalculation.cgstAmount, gstCalculation.sgstAmount, gstCalculation.igstAmount, gstCalculation.gstType, gstCalculation.totalGstAmount, receipt, JSON.stringify({addons: selectedAddons})]);

  await query(`
    INSERT INTO payment_logs (user_id, order_id, amount, currency, status, payment_gateway)
    VALUES (?, ?, ?, 'INR', 'created', 'razorpay')
  `, [userId, order.id, gstCalculation.totalAmount]);

  res.json({
    success: true,
    payment_gateway: 'razorpay',
    data: {
      order_id: order.id,
      amount: gstCalculation.totalAmount,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID,
      plan_name: plan.plan_name,
      duration: plan.duration_months,
      receipt: receipt,
      gst_breakdown: GSTHelper.formatGSTBreakdown(gstCalculation)
    }
  });
}

// CCAvenue Order Creation
async function createCCAvenueOrder(userId, planId, plan, gstCalculation, selectedAddons, user, res) {
  const orderId = CCAvenue.generateOrderId();
  const receipt = `ccav_receipt_${Date.now()}_${userId}`;

  // Create payment order record
  await query(`
    INSERT INTO payment_orders (user_id, plan_id, order_id, ccavenue_order_id, amount, base_amount, cgst_amount, sgst_amount, igst_amount, gst_type, total_gst_amount, currency, receipt, notes, payment_gateway)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, 'ccavenue')
  `, [userId, planId, orderId, orderId, gstCalculation.totalAmount, gstCalculation.baseAmount, gstCalculation.cgstAmount, gstCalculation.sgstAmount, gstCalculation.igstAmount, gstCalculation.gstType, gstCalculation.totalGstAmount, receipt, JSON.stringify({addons: selectedAddons})]);

  await query(`
    INSERT INTO payment_logs (user_id, order_id, amount, currency, status, payment_gateway)
    VALUES (?, ?, ?, 'INR', 'created', 'ccavenue')
  `, [userId, orderId, gstCalculation.totalAmount]);

  // Prepare CCAvenue request data
  const ccavenueData = {
    merchant_id: process.env.CCAVENUE_MERCHANT_ID,
    order_id: orderId,
    amount: gstCalculation.totalAmount.toFixed(2),
    currency: 'INR',
    redirect_url: process.env.CCAVENUE_REDIRECT_URL,
    cancel_url: process.env.CCAVENUE_CANCEL_URL,
    language: 'EN',
    billing_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Customer',
    billing_email: user.email,
    billing_tel: user.phone || '',
    billing_address: 'NA',
    billing_city: 'NA',
    billing_state: 'NA',
    billing_zip: '000000',
    billing_country: 'India',
    delivery_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Customer',
    delivery_address: 'NA',
    delivery_city: 'NA',
    delivery_state: 'NA',
    delivery_zip: '000000',
    delivery_country: 'India',
    delivery_tel: user.phone || '',
    merchant_param1: userId.toString(),
    merchant_param2: planId.toString(),
    merchant_param3: plan.plan_name,
    merchant_param4: plan.duration_months.toString(),
    merchant_param5: receipt
  };

  const encryptedData = CCAvenue.encryptRequest(ccavenueData);

  const ccavenueUrl = process.env.CCAVENUE_MODE === 'production'
    ? 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction'
    : 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction';

  res.json({
    success: true,
    payment_gateway: 'ccavenue',
    data: {
      order_id: orderId,
      amount: gstCalculation.totalAmount,
      currency: 'INR',
      access_code: process.env.CCAVENUE_ACCESS_CODE,
      encrypted_data: encryptedData,
      ccavenue_url: ccavenueUrl,
      plan_name: plan.plan_name,
      duration: plan.duration_months,
      receipt: receipt,
      gst_breakdown: GSTHelper.formatGSTBreakdown(gstCalculation)
    }
  });
}

// CCAvenue Callback Handler
export async function handleCCAvenueCallback(req, res) {
  let connection: any = null;
  try {
    console.log('CCAvenue Callback received');
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    
    const { encResp } = req.body;

    if (!encResp) {
      console.error('No encResp in request body');
      return res.status(400).json({
        success: false,
        message: "Invalid callback data"
      });
    }

    const decryptedData = CCAvenue.decryptResponse(encResp);
    console.log('Decrypted CCAvenue data:', decryptedData);
    
    const orderId = decryptedData.order_id;
    const orderStatus = decryptedData.order_status;
    const trackingId = decryptedData.tracking_id;
    const bankRefNo = decryptedData.bank_ref_no;
    const amount = parseFloat(decryptedData.amount);

    // Get payment order
    const [paymentOrder] = await query(`
      SELECT * FROM payment_orders WHERE ccavenue_order_id = ?
    `, [orderId]);

    if (!paymentOrder) {
      return res.status(404).json({
        success: false,
        message: "Payment order not found"
      });
    }

    if (orderStatus === 'Success') {
      // Acquire dedicated connection for atomic post-capture transaction
      connection = await new Promise<any>((resolve, reject) => {
        db.getConnection((err: any, conn: any) => {
          if (err) reject(err);
          else resolve(conn);
        });
      });

      const queryConn = (sql: string, params: any[] = []): Promise<any> => {
        return new Promise((resolve, reject) => {
          connection.query(sql, params, (err: any, results: any) => {
            if (err) reject(err);
            else resolve(results);
          });
        });
      };

      await new Promise<void>((resolve, reject) => {
        connection.beginTransaction((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });

      let paymentInsertId: number;
      let invoiceNumber = '';
      let invoiceUrl = '';

      try {
        // 1. Log successful payment
        await queryConn(`
          INSERT INTO payment_logs (user_id, order_id, payment_id, amount, method, status, payment_gateway, gateway_response)
          VALUES (?, ?, ?, ?, ?, 'captured', 'ccavenue', ?)
        `, [paymentOrder.user_id, orderId, trackingId, amount, decryptedData.payment_mode, JSON.stringify(decryptedData)]);

        // 2. Update payment order
        await queryConn(`
          UPDATE payment_orders SET status = 'paid', ccavenue_tracking_id = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE ccavenue_order_id = ?
        `, [trackingId, orderId]);

        // 3. Create payment record with GST details
        const paymentResult = await queryConn(`
          INSERT INTO payments (user_id, plan_id, order_id, payment_id, ccavenue_tracking_id, ccavenue_bank_ref_no, amount, base_amount, cgst_amount, sgst_amount, igst_amount, gst_type, total_gst_amount, currency_id, payment_method, payment_status_id, payment_gateway, payment_date, gateway_response)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, 'ccavenue', CURRENT_TIMESTAMP, ?)
        `, [paymentOrder.user_id, paymentOrder.plan_id, orderId, trackingId, trackingId, bankRefNo, amount, paymentOrder.base_amount, paymentOrder.cgst_amount, paymentOrder.sgst_amount, paymentOrder.igst_amount, paymentOrder.gst_type, paymentOrder.total_gst_amount, decryptedData.payment_mode, JSON.stringify(decryptedData)]);

        paymentInsertId = paymentResult.insertId;

        // 4. Generate invoice number and update payment record
        invoiceNumber = `INV-${new Date().getFullYear()}-${String(paymentInsertId).padStart(6, '0')}`;
        invoiceUrl = `${process.env.FRONTEND_URL || 'https://vivaaha.net'}/api/payments/invoice-view/${invoiceNumber}`;

        await queryConn(`
          UPDATE payments SET invoice_number = ?, invoice_url = ? WHERE id = ?
        `, [invoiceNumber, invoiceUrl, paymentInsertId]);

        // 5. Get plan details and create subscription
        const [plan] = await queryConn(`SELECT * FROM subscription_plans WHERE id = ?`, [paymentOrder.plan_id]);
        
        if (plan) {
          const startDate = new Date();
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + plan.duration_months);

          const subscriptionResult = await queryConn(`
            INSERT INTO user_subscriptions (user_id, plan_id, payment_id, payment_order_id, start_date, end_date, activated_at, subscription_status_id, payment_status_id, is_active)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 1, 1)
          `, [paymentOrder.user_id, paymentOrder.plan_id, paymentInsertId, orderId, startDate, endDate]);

          await queryConn(`
            INSERT INTO subscription_logs (user_id, subscription_id, plan_id, action, new_status, payment_id, notes)
            VALUES (?, ?, ?, 'activated', 'active', ?, 'Subscription activated via CCAvenue')
          `, [paymentOrder.user_id, subscriptionResult.insertId, paymentOrder.plan_id, trackingId]);

          // 6. Process addons and plan change
          if (paymentOrder.notes) {
            try {
              const orderNotes = JSON.parse(paymentOrder.notes);
              // If plan change, cancel old subscription now
              if (orderNotes.type === 'plan_change' && orderNotes.old_subscription_id) {
                await queryConn(`
                  UPDATE user_subscriptions 
                  SET is_active = 0, subscription_status_id = 3, updated_at = CURRENT_TIMESTAMP 
                  WHERE id = ? AND user_id = ?
                `, [orderNotes.old_subscription_id, paymentOrder.user_id]);
                await queryConn(`
                  INSERT INTO subscription_logs (user_id, subscription_id, plan_id, action, old_status, new_status, notes)
                  VALUES (?, ?, ?, 'cancelled', 'active', 'cancelled', 'Cancelled after successful plan change payment via CCAvenue')
                `, [paymentOrder.user_id, orderNotes.old_subscription_id, paymentOrder.plan_id]);
              }
              if (orderNotes.addons && orderNotes.addons.length > 0) {
                for (const addon of orderNotes.addons) {
                  await queryConn(`
                    INSERT INTO user_subscription_addons (user_id, subscription_id, addon_id, quantity, amount_paid)
                    VALUES (?, ?, ?, 1, ?)
                  `, [paymentOrder.user_id, subscriptionResult.insertId, addon.id, addon.price]);
                }
              }
            } catch (e) {
              console.log('No addons to process or JSON parse error:', e);
            }
          }
        }

        // 7. COMMIT TRANSACTION
        await new Promise<void>((resolve, reject) => {
          connection.commit((err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });

      } catch (txnError: any) {
        // ROLLBACK on failure
        await new Promise<void>((resolve) => {
          connection.rollback(() => resolve());
        });

        // CRITICAL RECONCILIATION LOG
        console.error(`[CRITICAL PAYMENT RECONCILIATION NEEDED] CCAvenue payment captured, but DB transaction failed and was rolled back!`, {
          gateway: 'ccavenue',
          userId: paymentOrder.user_id,
          orderId,
          trackingId,
          bankRefNo,
          amount,
          error: txnError.message || txnError
        });

        // Record reconciliation alert in payment_logs on separate connection
        try {
          await query(`
            INSERT INTO payment_logs (user_id, order_id, payment_id, amount, status, payment_gateway, error_code, error_description, gateway_response)
            VALUES (?, ?, ?, ?, 'reconciliation_required', 'ccavenue', 'DB_TXN_FAILED', ?, ?)
          `, [
            paymentOrder.user_id,
            orderId,
            trackingId,
            amount,
            `CCAvenue captured payment but DB transaction failed: ${txnError.message}`,
            JSON.stringify(decryptedData)
          ]);
        } catch (logErr) {
          console.error("Failed to log CCAvenue reconciliation alert:", logErr);
        }

        return res.redirect(`https://vivaaha.net/payment/failed?order_id=${orderId}&tracking_id=${trackingId}&status=failed&message=${encodeURIComponent('Payment received but activation failed. Support has been notified for reconciliation.')}`);
      }

      // Post-commit PDF Generation (does not block subscription activation)
      try {
        const [paymentData] = await query(`
          SELECT p.*, sp.plan_name, sp.duration_months,
                 up.first_name, up.last_name, u.email, u.phone
          FROM payments p
          LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
          LEFT JOIN users u ON p.user_id = u.id
          LEFT JOIN user_profiles up ON p.user_id = up.user_id
          WHERE p.id = ?
        `, [paymentInsertId]);

        if (paymentData) {
          paymentData.invoice_number = invoiceNumber;
          const pdfUrl = await generateInvoicePDF(paymentData);
          await query(`
            UPDATE payments SET invoice_pdf_url = ? WHERE id = ?
          `, [pdfUrl, paymentInsertId]);
        }
      } catch (pdfErr) {
        console.error("Invoice PDF generation error (CCAvenue subscription already active):", pdfErr);
      }

      res.redirect(`https://vivaaha.net/payment/success?order_id=${orderId}&tracking_id=${trackingId}&amount=${amount}&status=success&invoice_number=${invoiceNumber}&invoice_url=${encodeURIComponent(invoiceUrl)}`);
    } else {
      // Payment failed
      await query(`
        INSERT INTO payment_logs (user_id, order_id, payment_id, amount, status, payment_gateway, error_description, gateway_response)
        VALUES (?, ?, ?, ?, 'failed', 'ccavenue', ?, ?)
      `, [paymentOrder.user_id, orderId, trackingId, amount, decryptedData.failure_message || 'Payment failed', JSON.stringify(decryptedData)]);

      await query(`
        UPDATE payment_orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE ccavenue_order_id = ?
      `, [orderId]);

      res.redirect(`https://vivaaha.net/payment/failed?order_id=${orderId}&tracking_id=${trackingId}&status=failed&message=${encodeURIComponent(decryptedData.failure_message || 'Payment failed')}`);
    }
  } catch (error) {
    console.error("CCAvenue Callback Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// CCAvenue Cancel Handler
export async function handleCCAvenueCancel(req, res) {
  try {
    const { encResp } = req.body;

    if (!encResp) {
      return res.status(400).json({
        success: false,
        message: "Invalid callback data"
      });
    }

    const decryptedData = CCAvenue.decryptResponse(encResp);
    const orderId = decryptedData.order_id;

    await query(`
      UPDATE payment_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
      WHERE ccavenue_order_id = ?
    `, [orderId]);

    await query(`
      INSERT INTO payment_logs (user_id, order_id, amount, status, payment_gateway, error_description)
      SELECT user_id, ccavenue_order_id, amount, 'failed', 'ccavenue', 'Payment cancelled by user'
      FROM payment_orders WHERE ccavenue_order_id = ?
    `, [orderId]);

    res.redirect(`https://vivaaha.net/payment/cancelled?order_id=${orderId}&status=cancelled`);
  } catch (error) {
    console.error("CCAvenue Cancel Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Export all existing functions from original PaymentController
export * from './PaymentController';
