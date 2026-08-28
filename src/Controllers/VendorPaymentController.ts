import { Request, Response } from "express";
import * as utils from "util";
import * as PDFDocument from 'pdfkit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as path from 'path';
import * as fs from 'fs';
const Razorpay = require('razorpay');
const crypto = require('crypto');
import { CCAvenue } from '../utils/ccavenue';
import { EmailService } from './EmailService';
import { completeVendorRegistration } from './VendorCompletionController';

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

// ============ VENDOR GST CALCULATION ============

interface VendorGSTCalculation {
  baseAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGstAmount: number;
  totalAmount: number;
  gstType: 'CGST_SGST' | 'IGST';
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
}

const calculateVendorGST = async (baseAmount: number, billingStateId?: number): Promise<VendorGSTCalculation> => {
  const RAJASTHAN_STATE_ID = 33;
  const CGST_RATE = 9.00;
  const SGST_RATE = 9.00;
  const IGST_RATE = 18.00;

  const amount = Math.max(0, parseFloat(baseAmount.toString()));
  if (isNaN(amount)) {
    throw new Error('Invalid base amount provided');
  }

  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;
  let gstType: 'CGST_SGST' | 'IGST';

  if (billingStateId === RAJASTHAN_STATE_ID) {
    cgstAmount = parseFloat(((amount * CGST_RATE) / 100).toFixed(2));
    sgstAmount = parseFloat(((amount * SGST_RATE) / 100).toFixed(2));
    gstType = 'CGST_SGST';
  } else {
    igstAmount = parseFloat(((amount * IGST_RATE) / 100).toFixed(2));
    gstType = 'IGST';
  }

  const totalGstAmount = cgstAmount + sgstAmount + igstAmount;
  const totalAmount = parseFloat((amount + totalGstAmount).toFixed(2));

  return {
    baseAmount: amount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalGstAmount,
    totalAmount,
    gstType,
    cgstRate: gstType === 'CGST_SGST' ? CGST_RATE : 0,
    sgstRate: gstType === 'CGST_SGST' ? SGST_RATE : 0,
    igstRate: gstType === 'IGST' ? IGST_RATE : 0
  };
};

// ============ VENDOR PAYMENT INITIATION ============

export const initiateVendorPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp_registration_id, payment_method = 'razorpay' } = req.body;

    if (!temp_registration_id) {
      res.status(400).json({
        success: false,
        message: "Temporary registration ID is required"
      });
      return;
    }

    if (!['razorpay', 'ccavenue'].includes(payment_method)) {
      res.status(400).json({
        success: false,
        message: "Invalid payment method. Use 'razorpay' or 'ccavenue'"
      });
      return;
    }

    // Get temp registration details
    const tempRegQuery = `
      SELECT 
        vrt.*,
        vsp.plan_name,
        vsp.monthly_price,
        vsp.features
      FROM vendor_registration_temp vrt
      JOIN vendor_subscription_plans vsp ON vrt.plan_id = vsp.id
      WHERE vrt.temp_id = ? AND vrt.status = 'pending'
      AND vrt.expires_at > NOW()
    `;

    const tempReg: any[] = await query(tempRegQuery, [temp_registration_id]);

    if (tempReg.length === 0) {
      res.status(404).json({
        success: false,
        message: "Temporary registration not found or expired"
      });
      return;
    }

    const registration = tempReg[0];
    let registrationData;
    try {
      registrationData = JSON.parse(registration.registration_data);
    } catch (parseError) {
      res.status(400).json({
        success: false,
        message: "Invalid registration data format"
      });
      return;
    }

    // Check if payment already initiated
    const existingPayment: any[] = await query(
      "SELECT * FROM vendor_payments WHERE temp_registration_id = ? AND payment_status IN ('pending', 'processing')",
      [temp_registration_id]
    );

    if (existingPayment.length > 0) {
      res.status(400).json({
        success: false,
        message: "Payment already initiated for this registration",
        existing_payment: {
          payment_id: existingPayment[0].payment_id,
          order_id: existingPayment[0].order_id,
          status: existingPayment[0].payment_status
        }
      });
      return;
    }

    // Calculate GST
    let gstCalculation: VendorGSTCalculation;
    if (registration.gst_applicable) {
      gstCalculation = await calculateVendorGST(parseFloat(registration.monthly_price), registration.billing_state_id);
    } else {
      const baseAmount = parseFloat(registration.monthly_price);
      gstCalculation = {
        baseAmount,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalGstAmount: 0,
        totalAmount: baseAmount,
        gstType: 'IGST',
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 0
      };
    }

    // Generate payment ID and order ID
    const paymentId = `VP_${Date.now()}_${temp_registration_id.substring(5, 13)}`;
    const orderId = payment_method === 'ccavenue' 
      ? CCAvenue.generateOrderId() 
      : `razorpay_${Date.now()}_${temp_registration_id.substring(5, 13)}`;

    // Create vendor payment record
    const insertPaymentQuery = `
      INSERT INTO vendor_payments (
        temp_registration_id, plan_id, payment_type, payment_id, order_id,
        amount, gst_rate, gst_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
        igst_rate, igst_amount, total_amount, currency, payment_method, payment_status,
        billing_period_start, billing_period_end
      ) VALUES (?, ?, 'registration', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INR', ?, 'pending', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH))
    `;

    await query(insertPaymentQuery, [
      temp_registration_id,
      registration.plan_id,
      paymentId,
      orderId,
      gstCalculation.baseAmount,
      registration.gst_applicable ? (gstCalculation.cgstRate + gstCalculation.sgstRate + gstCalculation.igstRate) : 0,
      gstCalculation.totalGstAmount,
      gstCalculation.cgstRate,
      gstCalculation.cgstAmount,
      gstCalculation.sgstRate,
      gstCalculation.sgstAmount,
      gstCalculation.igstRate,
      gstCalculation.igstAmount,
      gstCalculation.totalAmount,
      payment_method
    ]);

    // Update temp registration status
    await query(
      "UPDATE vendor_registration_temp SET status = 'payment_initiated', payment_order_id = ?, payment_method = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE temp_id = ?",
      [orderId, payment_method, gstCalculation.totalAmount, temp_registration_id]
    );

    if (payment_method === 'razorpay') {
      await createVendorRazorpayOrder(registration, registrationData, gstCalculation, paymentId, orderId, res);
    } else {
      await createVendorCCAvenueOrder(registration, registrationData, gstCalculation, paymentId, orderId, res);
    }

  } catch (error: any) {
    console.error("Error initiating vendor payment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// ============ RAZORPAY ORDER CREATION ============

const createVendorRazorpayOrder = async (
  registration: any,
  registrationData: any,
  gstCalculation: VendorGSTCalculation,
  paymentId: string,
  orderId: string,
  res: Response
) => {
  const receipt = `vendor_${Date.now()}_${registration.temp_id.substring(5, 13)}`;
  
  const options = {
    amount: Math.round(gstCalculation.totalAmount * 100), // Amount in paise
    currency: 'INR',
    receipt: receipt,
    payment_capture: 1,
    notes: {
      temp_registration_id: registration.temp_id,
      plan_id: registration.plan_id.toString(),
      plan_name: registration.plan_name,
      vendor_email: registrationData.email,
      vendor_phone: registrationData.phone,
      payment_type: 'vendor_registration'
    }
  };

  try {
    const razorpayOrder = await razorpay.orders.create(options);

    // Update payment record with Razorpay order ID
    await query(
      "UPDATE vendor_payments SET gateway_order_id = ?, gateway_response = ? WHERE payment_id = ?",
      [razorpayOrder.id, JSON.stringify(razorpayOrder), paymentId]
    );

    res.json({
      success: true,
      payment_method: 'razorpay',
      data: {
        payment_id: paymentId,
        order_id: razorpayOrder.id,
        amount: gstCalculation.totalAmount,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID,
        plan_name: registration.plan_name,
        receipt: receipt,
        temp_registration_id: registration.temp_id,
        gst_breakdown: {
          base_amount: gstCalculation.baseAmount.toFixed(2),
          gst_type: gstCalculation.gstType,
          ...(gstCalculation.gstType === 'CGST_SGST' ? {
            cgst: {
              rate: `${gstCalculation.cgstRate.toFixed(2)}%`,
              amount: gstCalculation.cgstAmount.toFixed(2)
            },
            sgst: {
              rate: `${gstCalculation.sgstRate.toFixed(2)}%`,
              amount: gstCalculation.sgstAmount.toFixed(2)
            }
          } : {
            igst: {
              rate: `${gstCalculation.igstRate.toFixed(2)}%`,
              amount: gstCalculation.igstAmount.toFixed(2)
            }
          }),
          total_gst: gstCalculation.totalGstAmount.toFixed(2),
          total_amount: gstCalculation.totalAmount.toFixed(2)
        }
      }
    });

  } catch (error: any) {
    console.error('Razorpay order creation error:', error);
    
    // Update payment status to failed
    await query(
      "UPDATE vendor_payments SET payment_status = 'failed', failure_reason = ? WHERE payment_id = ?",
      [error.message, paymentId]
    );

    res.status(500).json({
      success: false,
      message: "Failed to create Razorpay order",
      error: error.message
    });
  }
};

// ============ CCAVENUE ORDER CREATION ============

const createVendorCCAvenueOrder = async (
  registration: any,
  registrationData: any,
  gstCalculation: VendorGSTCalculation,
  paymentId: string,
  orderId: string,
  res: Response
) => {
  try {
    // Prepare CCAvenue request data
    const ccavenueData = {
      merchant_id: process.env.CCAVENUE_MERCHANT_ID,
      order_id: orderId,
      amount: gstCalculation.totalAmount.toFixed(2),
      currency: 'INR',
      redirect_url: `${process.env.BACKEND_URL}/api/vendor/payment/ccavenue/callback`,
      cancel_url: `${process.env.BACKEND_URL}/api/vendor/payment/ccavenue/cancel`,
      language: 'EN',
      billing_name: registrationData.full_name,
      billing_email: registrationData.email,
      billing_tel: registrationData.phone,
      billing_address: registrationData.address || 'NA',
      billing_city: registrationData.city || 'NA',
      billing_state: registrationData.state || 'NA',
      billing_zip: registrationData.pincode || '000000',
      billing_country: 'India',
      delivery_name: registrationData.full_name,
      delivery_address: registrationData.address || 'NA',
      delivery_city: registrationData.city || 'NA',
      delivery_state: registrationData.state || 'NA',
      delivery_zip: registrationData.pincode || '000000',
      delivery_country: 'India',
      delivery_tel: registrationData.phone,
      merchant_param1: registration.temp_id,
      merchant_param2: registration.plan_id.toString(),
      merchant_param3: registration.plan_name,
      merchant_param4: paymentId,
      merchant_param5: 'vendor_registration'
    };

    const encryptedData = CCAvenue.encryptRequest(ccavenueData);

    // Update payment record with CCAvenue data
    await query(
      "UPDATE vendor_payments SET gateway_order_id = ?, gateway_response = ? WHERE payment_id = ?",
      [orderId, JSON.stringify(ccavenueData), paymentId]
    );

    const ccavenueUrl = process.env.CCAVENUE_MODE === 'production'
      ? 'https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction'
      : 'https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction';

    res.json({
      success: true,
      payment_method: 'ccavenue',
      data: {
        payment_id: paymentId,
        order_id: orderId,
        amount: gstCalculation.totalAmount,
        currency: 'INR',
        access_code: process.env.CCAVENUE_ACCESS_CODE,
        encrypted_data: encryptedData,
        ccavenue_url: ccavenueUrl,
        plan_name: registration.plan_name,
        temp_registration_id: registration.temp_id,
        gst_breakdown: {
          base_amount: gstCalculation.baseAmount.toFixed(2),
          gst_type: gstCalculation.gstType,
          ...(gstCalculation.gstType === 'CGST_SGST' ? {
            cgst: {
              rate: `${gstCalculation.cgstRate.toFixed(2)}%`,
              amount: gstCalculation.cgstAmount.toFixed(2)
            },
            sgst: {
              rate: `${gstCalculation.sgstRate.toFixed(2)}%`,
              amount: gstCalculation.sgstAmount.toFixed(2)
            }
          } : {
            igst: {
              rate: `${gstCalculation.igstRate.toFixed(2)}%`,
              amount: gstCalculation.igstAmount.toFixed(2)
            }
          }),
          total_gst: gstCalculation.totalGstAmount.toFixed(2),
          total_amount: gstCalculation.totalAmount.toFixed(2)
        }
      }
    });

  } catch (error: any) {
    console.error('CCAvenue order creation error:', error);
    
    // Update payment status to failed
    await query(
      "UPDATE vendor_payments SET payment_status = 'failed', failure_reason = ? WHERE payment_id = ?",
      [error.message, paymentId]
    );

    res.status(500).json({
      success: false,
      message: "Failed to create CCAvenue order",
      error: error.message
    });
  }
};

// ============ RAZORPAY PAYMENT VERIFICATION ============

export const verifyVendorRazorpayPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      temp_registration_id
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !temp_registration_id) {
      res.status(400).json({
        success: false,
        message: "Missing required payment verification parameters"
      });
      return;
    }

    // Check if payment record exists
    const paymentRecord: any[] = await query(
      "SELECT * FROM vendor_payments WHERE gateway_order_id = ? AND temp_registration_id = ?",
      [razorpay_order_id, temp_registration_id]
    );

    if (paymentRecord.length === 0) {
      res.status(404).json({
        success: false,
        message: "Payment record not found",
        details: { razorpay_order_id, temp_registration_id }
      });
      return;
    }

    // Check if payment is already processed
    if (paymentRecord[0].payment_status === 'completed') {
      res.status(400).json({
        success: false,
        message: "Payment already processed",
        data: {
          payment_id: paymentRecord[0].payment_id,
          gateway_payment_id: paymentRecord[0].gateway_payment_id,
          status: paymentRecord[0].payment_status
        }
      });
      return;
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await query(
        "UPDATE vendor_payments SET payment_status = 'failed', failure_reason = 'Invalid signature', updated_at = CURRENT_TIMESTAMP WHERE gateway_order_id = ? AND temp_registration_id = ?",
        [razorpay_order_id, temp_registration_id]
      );
      res.status(400).json({
        success: false,
        message: "Invalid payment signature"
      });
      return;
    }

    // Get payment details from Razorpay
    let razorpayPayment;
    try {
      razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (razorpayError: any) {
      console.error('Error fetching Razorpay payment:', razorpayError);
      
      await query(
        "UPDATE vendor_payments SET payment_status = 'failed', failure_reason = ? WHERE gateway_order_id = ? AND temp_registration_id = ?",
        [`Razorpay API error: ${razorpayError.message}`, razorpay_order_id, temp_registration_id]
      );
      
      res.status(400).json({
        success: false,
        message: "Failed to fetch payment details from Razorpay",
        error: razorpayError.message
      });
      return;
    }

    if (razorpayPayment.status !== 'captured') {
      await query(
        "UPDATE vendor_payments SET payment_status = 'failed', failure_reason = ? WHERE gateway_order_id = ? AND temp_registration_id = ?",
        [`Payment not captured. Status: ${razorpayPayment.status}`, razorpay_order_id, temp_registration_id]
      );
      
      res.status(400).json({
        success: false,
        message: "Payment not captured",
        payment_status: razorpayPayment.status,
        razorpay_payment_id
      });
      return;
    }

    // Update vendor payment record
    await query(`
      UPDATE vendor_payments SET
        payment_status = 'completed',
        gateway_payment_id = ?,
        gateway_response = ?,
        paid_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE gateway_order_id = ? AND temp_registration_id = ?
    `, [
      razorpay_payment_id,
      JSON.stringify(razorpayPayment),
      razorpay_order_id,
      temp_registration_id
    ]);

    // Update temp registration status to payment_completed
    await query(
      "UPDATE vendor_registration_temp SET status = 'payment_completed', updated_at = CURRENT_TIMESTAMP WHERE temp_id = ?",
      [temp_registration_id]
    );

    // Complete vendor registration
    let registrationResult;
    try {
      registrationResult = await completeVendorRegistration(temp_registration_id, razorpay_payment_id);
      console.log('Vendor registration completed:', registrationResult);
    } catch (registrationError: any) {
      console.error('Error completing vendor registration:', registrationError);
      
      // Update payment status but don't fail the verification since payment is successful
      await query(
        "UPDATE vendor_payments SET gateway_response = ? WHERE gateway_order_id = ? AND temp_registration_id = ?",
        [JSON.stringify({ ...razorpayPayment, registration_error: registrationError.message }), razorpay_order_id, temp_registration_id]
      );
      
      res.status(500).json({
        success: false,
        message: "Payment verified but registration completion failed",
        payment_verified: true,
        registration_error: registrationError.message,
        data: {
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
          status: 'payment_success_registration_failed'
        }
      });
      return;
    }

    // Send payment receipt email
    try {
      const tempReg: any[] = await query(
        "SELECT vrt.*, vsp.plan_name FROM vendor_registration_temp vrt JOIN vendor_subscription_plans vsp ON vrt.plan_id = vsp.id WHERE vrt.temp_id = ?",
        [temp_registration_id]
      );
      
      if (tempReg.length > 0) {
        let registrationData;
        try {
          registrationData = JSON.parse(tempReg[0].registration_data);
        } catch (parseError) {
          console.error('Error parsing registration data:', parseError);
          return;
        }
        await EmailService.sendVendorPaymentReceiptEmail(registrationData.email, {
          vendor_name: registrationData.full_name,
          plan_name: tempReg[0].plan_name,
          amount_paid: (razorpayPayment.amount / 100).toFixed(2),
          transaction_id: razorpay_payment_id,
          payment_date: new Date().toLocaleDateString()
        });
      }
    } catch (emailError) {
      console.error('Error sending payment receipt email:', emailError);
    }

    res.json({
      success: true,
      message: "Payment verified successfully. Vendor registration completed.",
      data: {
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id,
        status: 'success'
      }
    });

  } catch (error: any) {
    console.error("Error verifying Razorpay payment:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// ============ CCAVENUE CALLBACK HANDLERS ============

export const handleVendorCCAvenueCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Vendor CCAvenue Callback received');
    
    const { encResp } = req.body;

    if (!encResp) {
      console.error('No encResp in request body');
      res.status(400).send(`
        <html><body>
          <h2>Invalid Callback Data</h2>
          <p>Missing encrypted response parameter</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body></html>
      `);
      return;
    }

    const decryptedData = CCAvenue.decryptResponse(encResp);
    
    const orderId = decryptedData.order_id;
    const orderStatus = decryptedData.order_status;
    const trackingId = decryptedData.tracking_id;
    const bankRefNo = decryptedData.bank_ref_no;
    const amount = parseFloat(decryptedData.amount);
    const tempRegistrationId = decryptedData.merchant_param1;

    // Get payment record
    const payment: any[] = await query(
      "SELECT * FROM vendor_payments WHERE gateway_order_id = ? AND temp_registration_id = ?",
      [orderId, tempRegistrationId]
    );

    if (payment.length === 0) {
      console.error('Payment record not found for:', { orderId, tempRegistrationId });
      res.status(404).send(`
        <html><body>
          <h2>Payment Record Not Found</h2>
          <p>Order ID: ${orderId}</p>
          <p>Registration ID: ${tempRegistrationId}</p>
          <script>setTimeout(() => window.close(), 5000);</script>
        </body></html>
      `);
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
        WHERE gateway_order_id = ? AND temp_registration_id = ?
      `, [
        trackingId,
        JSON.stringify(decryptedData),
        orderId,
        tempRegistrationId
      ]);

      // Update temp registration status to payment_completed
      await query(
        "UPDATE vendor_registration_temp SET status = 'payment_completed', updated_at = CURRENT_TIMESTAMP WHERE temp_id = ?",
        [tempRegistrationId]
      );

      // Complete vendor registration
      await completeVendorRegistration(tempRegistrationId, trackingId);

      // Send payment receipt email
      try {
        const tempReg: any[] = await query(
          "SELECT vrt.*, vsp.plan_name FROM vendor_registration_temp vrt JOIN vendor_subscription_plans vsp ON vrt.plan_id = vsp.id WHERE vrt.temp_id = ?",
          [tempRegistrationId]
        );
        
        if (tempReg.length > 0) {
          const registrationData = JSON.parse(tempReg[0].registration_data);
          await EmailService.sendVendorPaymentReceiptEmail(registrationData.email, {
            vendor_name: registrationData.full_name,
            plan_name: tempReg[0].plan_name,
            amount_paid: amount.toFixed(2),
            transaction_id: trackingId,
            payment_date: new Date().toLocaleDateString()
          });
        }
      } catch (emailError) {
        console.error('Error sending payment receipt email:', emailError);
      }

      // Redirect to success page
      const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
      res.redirect(`${frontendUrl}/vendor/payment/success?order_id=${orderId}&tracking_id=${trackingId}&amount=${amount}&status=success`);
    } else {
      // Payment failed
      await query(`
        UPDATE vendor_payments SET
          payment_status = 'failed',
          failure_reason = ?,
          gateway_response = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE gateway_order_id = ? AND temp_registration_id = ?
      `, [
        decryptedData.failure_message || 'Payment failed',
        JSON.stringify(decryptedData),
        orderId,
        tempRegistrationId
      ]);

      // Send payment failure email
      try {
        const tempReg: any[] = await query(
          "SELECT vrt.*, vsp.plan_name FROM vendor_registration_temp vrt JOIN vendor_subscription_plans vsp ON vrt.plan_id = vsp.id WHERE vrt.temp_id = ?",
          [tempRegistrationId]
        );
        
        if (tempReg.length > 0) {
          const registrationData = JSON.parse(tempReg[0].registration_data);
          const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
          await EmailService.sendVendorPaymentFailedEmail(registrationData.email, {
            vendor_name: registrationData.full_name,
            plan_name: tempReg[0].plan_name,
            amount: amount.toFixed(2),
            failure_reason: decryptedData.failure_message || 'Payment failed',
            retry_url: `${frontendUrl}/vendor/register/payment?temp_id=${tempRegistrationId}`
          });
        }
      } catch (emailError) {
        console.error('Error sending payment failure email:', emailError);
      }

      // Redirect to failure page
      const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
      res.redirect(`${frontendUrl}/vendor/payment/failed?order_id=${orderId}&tracking_id=${trackingId}&status=failed&message=${encodeURIComponent(decryptedData.failure_message || 'Payment failed')}`);
    }

  } catch (error: any) {
    console.error("Vendor CCAvenue Callback Error:", error);
    const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
    res.redirect(`${frontendUrl}/vendor/payment/failed?status=error&message=${encodeURIComponent('Server error occurred')}`);
  }
};

export const handleVendorCCAvenueCancel = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Vendor CCAvenue Cancel received');
    console.log('Request body:', req.body);
    
    const { encResp } = req.body;

    if (!encResp) {
      console.error('No encResp in cancel request');
      const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
      res.redirect(`${frontendUrl}/vendor/payment/cancelled?status=cancelled&error=missing_data`);
      return;
    }

    const decryptedData = CCAvenue.decryptResponse(encResp);
    const orderId = decryptedData.order_id;
    const tempRegistrationId = decryptedData.merchant_param1;

    // Update payment status to cancelled
    await query(`
      UPDATE vendor_payments SET
        payment_status = 'cancelled',
        failure_reason = 'Payment cancelled by user',
        gateway_response = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE gateway_order_id = ? AND temp_registration_id = ?
    `, [
      JSON.stringify(decryptedData),
      orderId,
      tempRegistrationId
    ]);

    // Redirect to cancelled page
    const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
    res.redirect(`${frontendUrl}/vendor/payment/cancelled?order_id=${orderId}&status=cancelled`);

  } catch (error: any) {
    console.error("Vendor CCAvenue Cancel Error:", error);
    const frontendUrl = process.env.FRONTEND_URL || 'https://vivaaha.net';
    res.redirect(`${frontendUrl}/vendor/payment/cancelled?status=error&message=${encodeURIComponent('Server error occurred')}`);
  }
};

// ============ COMPLETE VENDOR REGISTRATION ============
// This function is now implemented in VendorCompletionController
// and imported above for use in payment verification

// ============ GET PAYMENT STATUS ============

export const getVendorPaymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp_registration_id } = req.params;

    const paymentQuery = `
      SELECT 
        vp.*,
        vrt.email,
        vrt.phone,
        vsp.plan_name,
        vsp.monthly_price
      FROM vendor_payments vp
      JOIN vendor_registration_temp vrt ON vp.temp_registration_id COLLATE utf8mb4_general_ci = vrt.temp_id COLLATE utf8mb4_general_ci
      JOIN vendor_subscription_plans vsp ON vp.plan_id = vsp.id
      WHERE vp.temp_registration_id COLLATE utf8mb4_general_ci = ? COLLATE utf8mb4_general_ci
      ORDER BY vp.created_at DESC
      LIMIT 1
    `;

    const payment: any[] = await query(paymentQuery, [temp_registration_id]);

    if (payment.length === 0) {
      res.status(404).json({
        success: false,
        message: "Payment record not found"
      });
      return;
    }

    res.json({
      success: true,
      data: {
        payment_id: payment[0].payment_id,
        order_id: payment[0].order_id,
        amount: payment[0].amount,
        total_amount: payment[0].total_amount,
        payment_status: payment[0].payment_status,
        payment_method: payment[0].payment_method,
        gateway_payment_id: payment[0].gateway_payment_id,
        paid_at: payment[0].paid_at,
        plan_name: payment[0].plan_name,
        email: payment[0].email,
        phone: payment[0].phone,
        gst_breakdown: {
          base_amount: payment[0].amount,
          cgst_amount: payment[0].cgst_amount,
          sgst_amount: payment[0].sgst_amount,
          igst_amount: payment[0].igst_amount,
          total_gst: payment[0].gst_amount,
          total_amount: payment[0].total_amount
        }
      }
    });

  } catch (error: any) {
    console.error("Error fetching payment status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============ GST PREVIEW FOR VENDOR REGISTRATION ============

export const getVendorGSTPreview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { plan_id, billing_state_id, gst_applicable = 'true' } = req.query;

    if (!plan_id) {
      res.status(400).json({
        success: false,
        message: 'plan_id is required'
      });
      return;
    }

    // Get plan details
    const plan: any[] = await query(
      "SELECT * FROM vendor_subscription_plans WHERE id = ? AND is_active = 1",
      [plan_id]
    );

    if (plan.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
      return;
    }

    const baseAmount = parseFloat(plan[0].monthly_price);
    let gstCalculation: VendorGSTCalculation;

    if (gst_applicable === 'true') {
      gstCalculation = await calculateVendorGST(baseAmount, billing_state_id ? parseInt(billing_state_id as string) : undefined);
    } else {
      gstCalculation = {
        baseAmount,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalGstAmount: 0,
        totalAmount: baseAmount,
        gstType: 'IGST',
        cgstRate: 0,
        sgstRate: 0,
        igstRate: 0
      };
    }

    res.json({
      success: true,
      data: {
        plan_name: plan[0].plan_name,
        plan_description: plan[0].plan_description,
        monthly_price: baseAmount,
        gst_applicable: gst_applicable === 'true',
        gst_breakdown: {
          base_amount: gstCalculation.baseAmount.toFixed(2),
          gst_type: gstCalculation.gstType,
          ...(gstCalculation.gstType === 'CGST_SGST' ? {
            cgst: {
              rate: `${gstCalculation.cgstRate.toFixed(2)}%`,
              amount: gstCalculation.cgstAmount.toFixed(2)
            },
            sgst: {
              rate: `${gstCalculation.sgstRate.toFixed(2)}%`,
              amount: gstCalculation.sgstAmount.toFixed(2)
            }
          } : {
            igst: {
              rate: `${gstCalculation.igstRate.toFixed(2)}%`,
              amount: gstCalculation.igstAmount.toFixed(2)
            }
          }),
          total_gst: gstCalculation.totalGstAmount.toFixed(2),
          total_amount: gstCalculation.totalAmount.toFixed(2)
        }
      }
    });

  } catch (error: any) {
    console.error('Vendor GST Preview Error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};