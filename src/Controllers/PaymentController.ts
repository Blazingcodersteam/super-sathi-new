import * as utils from "util";
import * as PDFDocument from 'pdfkit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as path from 'path';
import * as fs from 'fs';
const Razorpay = require('razorpay');
const crypto = require('crypto');
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

// Generate Invoice PDF
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

// Get Payment Details
export async function getPaymentDetails(req, res) {
  try {
    const { paymentId } = req.params;
    const userId = req.user.user_id;

    const [payment] = await query(`
      SELECT p.*, sp.plan_name, sp.duration_months,
             u.first_name, u.last_name, u.email
      FROM payments p
      LEFT JOIN subscription_plans sp ON p.subscription_id = sp.id
      LEFT JOIN user_profiles u ON p.user_id = u.user_id
      WHERE p.transaction_id = ? AND p.user_id = ?
    `, [paymentId, userId]);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    console.error("Get Payment Details Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Payment Methods
export async function getPaymentMethods(req, res) {
  try {
    const methods = [
      { id: 1, name: "Credit Card", type: "card", enabled: true },
      { id: 2, name: "Debit Card", type: "card", enabled: true },
      { id: 3, name: "UPI", type: "upi", enabled: true },
      { id: 4, name: "Net Banking", type: "netbanking", enabled: true },
      { id: 5, name: "Wallet", type: "wallet", enabled: true }
    ];

    res.json({ success: true, data: methods });
  } catch (error) {
    console.error("Get Payment Methods Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Payment Invoice
export async function getPaymentInvoice(req, res) {
  try {
    const { paymentId } = req.params;
    const userId = req.user.user_id;

    const [payment] = await query(`
      SELECT p.*, sp.plan_name, sp.duration_months, sp.price as plan_price,
             up.first_name, up.last_name, u.email, u.phone,
             ps.status_name as payment_status
      FROM payments p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON p.user_id = up.user_id
      LEFT JOIN payment_status_master ps ON p.payment_status_id = ps.id
      WHERE (p.order_id = ? OR p.payment_id = ? OR p.id = ?) AND p.user_id = ?
    `, [paymentId, paymentId, paymentId, userId]);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // Calculate GST if missing in database
    const totalAmount = parseFloat(payment.amount);
    const planPrice = parseFloat(payment.plan_price);
    let baseAmount = parseFloat(payment.base_amount) || 0;
    let totalGstAmount = parseFloat(payment.total_gst_amount) || 0;
    let igstAmount = parseFloat(payment.igst_amount) || 0;
    let cgstAmount = parseFloat(payment.cgst_amount) || 0;
    let sgstAmount = parseFloat(payment.sgst_amount) || 0;
    let gstType = payment.gst_type;
    
    // If GST data is missing, calculate it
    if (totalGstAmount === 0 && totalAmount > 0) {
      baseAmount = totalAmount / 1.18;
      totalGstAmount = totalAmount - baseAmount;
      igstAmount = totalGstAmount;
      gstType = 'IGST';
    }
    
    const addonAmount = baseAmount - planPrice;
    const refundAmount = payment.payment_status === 'failed' ? Math.round(baseAmount * 0.83) : null;
    const invoiceNumber = payment.invoice_number || `INV-${new Date(payment.payment_date).getFullYear()}-${String(payment.id).padStart(6, '0')}`;
    
    // Generate PDF if missing
    let pdfUrl = payment.invoice_pdf_url;
    if (!pdfUrl && payment.payment_status === 'paid') {
      try {
        const paymentData = {
          ...payment,
          invoice_number: invoiceNumber,
          base_amount: baseAmount,
          total_gst_amount: totalGstAmount
        };
        pdfUrl = await generateInvoicePDF(paymentData);
        
        // Update database with PDF URL
        await query(`
          UPDATE payments SET invoice_pdf_url = ?, invoice_number = ? WHERE id = ?
        `, [pdfUrl, invoiceNumber, payment.id]);
      } catch (pdfError) {
        console.error('PDF generation error:', pdfError);
      }
    }
    
    const invoice = {
      invoice_number: invoiceNumber,
      invoice_url: payment.invoice_url || `${process.env.FRONTEND_URL || 'http://127.0.0.1:9000'}/api/payments/invoice-view/${invoiceNumber}`,
      invoice_pdf_url: pdfUrl,
      date: new Date(payment.payment_date).toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
      }),
      status: payment.payment_status === 'failed' ? 'REFUNDED' : 
              payment.payment_status === 'paid' ? 'COMPLETED' : 'PENDING',
      customer: {
        name: `${payment.first_name || ''} ${payment.last_name || ''}`.trim(),
        email: payment.email,
        phone: payment.phone
      },
      description: `${payment.plan_name} (${payment.duration_months} Month${payment.duration_months > 1 ? 's' : ''})`,
      plan_amount: parseFloat(planPrice.toFixed(2)),
      addon_amount: addonAmount > 1 ? parseFloat(addonAmount.toFixed(2)) : 0,
      gst_breakdown: {
        type: gstType || 'IGST',
        ...(gstType === 'CGST_SGST' ? {
          cgst: parseFloat(cgstAmount.toFixed(2)),
          sgst: parseFloat(sgstAmount.toFixed(2))
        } : {
          igst: parseFloat(igstAmount.toFixed(2))
        }),
        total: parseFloat(totalGstAmount.toFixed(2))
      },
      total_amount: parseFloat(totalAmount.toFixed(2)),
      refund_amount: refundAmount,
      net_refunded: refundAmount,
      payment_method: payment.payment_method?.toUpperCase() || 'UPI',
      transaction_id: payment.order_id,
      refund_note: payment.payment_status === 'failed' ? 'This payment has been fully/partially refunded.' : null
    };

    res.json({ success: true, data: invoice });
  } catch (error) {
    console.error("Get Payment Invoice Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Invoice HTML by Invoice Number (Public)
export async function getInvoiceHtml(req, res) {
  try {
    const { invoiceNumber } = req.params;

    const [payment] = await query(`
      SELECT p.*, sp.plan_name, sp.duration_months,
             up.first_name, up.last_name, u.email, u.phone
      FROM payments p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON p.user_id = up.user_id
      WHERE p.invoice_number = ?
    `, [invoiceNumber]);

    if (!payment) {
      return res.status(404).send('<h1>Invoice Not Found</h1>');
    }

    const invoiceDate = new Date(payment.payment_date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    const customerName = `${payment.first_name || ''} ${payment.last_name || ''}`.trim() || 'Customer';
    const baseAmount = parseFloat(payment.base_amount || payment.amount);
    const gstAmount = parseFloat(payment.total_gst_amount || 0);
    const totalAmount = parseFloat(payment.amount);

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Invoice - ${payment.invoice_number}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;padding:20px}.invoice-container{max-width:800px;margin:0 auto;background:white;padding:60px;box-shadow:0 0 20px rgba(0,0,0,0.1)}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;gap:20px}.invoice-title{color:#2196F3;font-size:42px;font-weight:bold;letter-spacing:1px;white-space:nowrap;flex-shrink:0}.logo-section{text-align:right;flex-shrink:0;min-width:180px}.logo-icon{width:60px;height:60px;margin-bottom:10px}.logo-text{color:#FFA726;font-size:28px;font-weight:bold;letter-spacing:2px;white-space:nowrap}.support-email{color:#666;font-size:14px;margin-top:8px;white-space:nowrap}.invoice-info{margin-bottom:40px}.invoice-info p{margin:8px 0;font-size:15px;color:#333;word-break:break-word}.invoice-info strong{font-weight:600}.divider{border-top:2px solid #e0e0e0;margin:35px 0}.bill-to{margin-bottom:40px}.bill-to h3{font-size:18px;font-weight:600;margin-bottom:20px;color:#333}.bill-to p{margin:8px 0;color:#555;font-size:15px;word-break:break-word}.items-section{margin-bottom:40px}.items-table{width:100%;border-collapse:collapse;table-layout:fixed}.items-table thead tr{border-bottom:2px solid #e0e0e0}.items-table th{text-align:left;padding:15px 0;font-weight:600;font-size:16px;color:#333}.items-table th.amount-col{width:150px}.items-table td{padding:18px 0;font-size:15px;color:#555}.amount-col{text-align:right;white-space:nowrap}.total-row{border-top:2px solid #e0e0e0;font-weight:600;font-size:18px;color:#000}.total-row td{padding-top:20px}.payment-details{margin-bottom:40px;background:#f9f9f9;padding:25px;border-radius:4px}.payment-details h3{font-size:18px;font-weight:600;margin-bottom:15px;color:#333}.payment-details p{margin:10px 0;font-size:15px;color:#555;word-break:break-all}.footer{text-align:center;color:#666;font-size:14px;margin-top:50px;padding-top:30px;border-top:1px solid #e0e0e0;line-height:1.8}.print-btn{background:#2196F3;color:white;padding:12px 30px;border:none;border-radius:4px;cursor:pointer;margin-bottom:30px;font-size:15px;font-weight:500}@media print{.print-btn{display:none}body{background:white;padding:0}.invoice-container{box-shadow:none;padding:40px}}</style></head>
<body><div class="invoice-container"><button class="print-btn" onclick="window.print()">Print Invoice</button>
<div class="header"><div><div class="invoice-title">INVOICE</div></div><div class="logo-section"><svg class="logo-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="30" cy="25" r="12" fill="#FFA726"/><circle cx="70" cy="25" r="12" fill="#FFA726"/><path d="M 50 45 Q 30 55 20 75 Q 30 85 50 95 Q 70 85 80 75 Q 70 55 50 45 Z" fill="#FFA726"/><path d="M 50 50 L 50 80" stroke="#FFF" stroke-width="3"/><path d="M 40 65 L 50 75 L 60 65" stroke="#FFF" stroke-width="3" fill="none"/></svg><div class="logo-text">VIVAAHA</div><div class="support-email">support@vivaaha.net</div></div></div>
<div class="invoice-info"><p><strong>Invoice #:</strong> ${payment.invoice_number}</p><p><strong>Date:</strong> ${invoiceDate}</p></div><div class="divider"></div>
<div class="bill-to"><h3>Bill To:</h3><p><strong>${customerName}</strong></p><p>${payment.email}</p><p>${payment.phone || ''}</p></div>
<div class="items-section"><table class="items-table"><thead><tr><th>Description</th><th class="amount-col">Amount</th></tr></thead><tbody>
<tr><td>${payment.plan_name} (${payment.duration_months} Month${payment.duration_months > 1 ? 's' : ''})</td><td class="amount-col">₹${baseAmount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td></tr>
<tr><td>GST</td><td class="amount-col">₹${gstAmount.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</td></tr>
<tr class="total-row"><td><strong>Total Amount</strong></td><td class="amount-col"><strong>₹${totalAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</strong></td></tr></tbody></table></div>
<div class="payment-details"><h3>Payment Details</h3><p><strong>Payment Method:</strong> ${(payment.payment_method || 'UPI').toUpperCase()}</p>
<p><strong>Transaction ID:</strong> ${payment.payment_id || payment.order_id || 'undefined'}</p></div><div class="divider"></div>
<div class="footer"><p><strong>Thank you for your business!</strong></p><p>For any queries, contact us at support@vivaaha.net</p></div></div></body></html>`;

    res.send(html);
  } catch (error) {
    console.error("Get Invoice HTML Error:", error);
    res.status(500).send('Error loading invoice');
  }
}

// Update Payment Status
export async function updatePaymentStatus(req, res) {
  try {
    const { payment_id, status, notes } = req.body;

    if (!payment_id || !status) {
      return res.status(400).json({ 
        success: false, 
        message: "payment_id and status are required" 
      });
    }

    await query(`
      UPDATE payments 
      SET payment_status_id = ?, payment_date = CURRENT_TIMESTAMP
      WHERE transaction_id = ?
    `, [status, payment_id]);

    res.json({ success: true, message: "Payment status updated successfully" });
  } catch (error) {
    console.error("Update Payment Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Payment Analytics
export async function getPaymentAnalytics(req, res) {
  try {
    const { start_date, end_date } = req.query;
    const userId = req.user.user_id;

    if (!start_date || !end_date) {
      return res.status(400).json({ 
        success: false, 
        message: "start_date and end_date are required" 
      });
    }

    // Total payments
    const [totalPayments] = await query(`
      SELECT COUNT(*) as total_count, SUM(amount) as total_amount
      FROM payments 
      WHERE user_id = ? AND payment_date BETWEEN ? AND ?
    `, [userId, start_date, end_date]);

    // Successful payments
    const [successfulPayments] = await query(`
      SELECT COUNT(*) as success_count, SUM(amount) as success_amount
      FROM payments 
      WHERE user_id = ? AND payment_status_id = 1 AND payment_date BETWEEN ? AND ?
    `, [userId, start_date, end_date]);

    // Failed payments
    const [failedPayments] = await query(`
      SELECT COUNT(*) as failed_count
      FROM payments 
      WHERE user_id = ? AND payment_status_id = 3 AND payment_date BETWEEN ? AND ?
    `, [userId, start_date, end_date]);

    // Monthly breakdown
    const monthlyData = await query(`
      SELECT 
        DATE_FORMAT(payment_date, '%Y-%m') as month,
        COUNT(*) as payment_count,
        SUM(amount) as total_amount,
        SUM(CASE WHEN payment_status_id = 1 THEN amount ELSE 0 END) as success_amount
      FROM payments 
      WHERE user_id = ? AND payment_date BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      ORDER BY month
    `, [userId, start_date, end_date]);

    // Recent invoices
    const recentInvoices = await query(`
      SELECT invoice_number, amount, payment_date
      FROM payments
      WHERE user_id = ? AND payment_status_id = 1 AND payment_date BETWEEN ? AND ?
      ORDER BY payment_date DESC
      LIMIT 5
    `, [userId, start_date, end_date]);

      const analytics = {
      summary: {
        total_payments: totalPayments.total_count || 0,
        total_amount: totalPayments.total_amount || 0,
        successful_payments: successfulPayments.success_count || 0,
        successful_amount: successfulPayments.success_amount || 0,
        failed_payments: failedPayments.failed_count || 0,
        success_rate: totalPayments.total_count > 0 ? 
          ((successfulPayments.success_count || 0) / totalPayments.total_count * 100).toFixed(2) : 0
      },
      monthly_breakdown: monthlyData,
      recent_invoices: recentInvoices.map(inv => ({
        invoice_number: inv.invoice_number,
        invoice_url: `${process.env.FRONTEND_URL || 'http://127.0.0.1:9000'}/api/payments/invoice-view/${inv.invoice_number}`,
        amount: inv.amount,
        date: inv.payment_date
      }))
    };

    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error("Get Payment Analytics Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Create Order
export async function createOrder(req, res) {
  try {
    const userId = req.user.user_id;
    const { plan_id, addons = [] } = req.body;

    if (!plan_id) {
      return res.status(400).json({ 
        success: false, 
        message: "plan_id is required" 
      });
    }

    // Check if user already has active subscription
    const [activeSubscription] = await query(`
      SELECT id FROM user_subscriptions 
      WHERE user_id = ? AND subscription_status_id = 1 AND end_date > CURRENT_DATE
    `, [userId]);

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

    console.log('Plan details:', plan);

    // Calculate total amount including addons
    let totalAmount = parseFloat(plan.price) || 0;
    let addonAmount = 0;
    const selectedAddons = [];

    console.log('Base plan amount:', totalAmount);

    if (addons.length > 0) {
      for (const addon of addons) {
        if (addon.selected) {
          const [addonDetails] = await query(`
            SELECT * FROM subscription_addons_master WHERE id = ? AND is_active = 1
          `, [addon.id]);
          if (addonDetails) {
            addonAmount += parseFloat(addonDetails.price) || 0;
            selectedAddons.push(addonDetails);
          }
        }
      }
    }

    totalAmount += addonAmount;
    console.log('Total amount after addons:', totalAmount);

    if (totalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount calculated. Please check plan pricing."
      });
    }

    const receipt = `receipt_${Date.now()}_${userId}`;
    const options = {
      amount: Math.round(totalAmount * 100), // Razorpay expects amount in paise
      currency: 'INR',
      receipt: receipt,
      payment_capture: 1,
      notes: {
        user_id: userId.toString(),
        plan_id: plan_id.toString(),
        plan_name: plan.plan_name
      }
    };

    const order = await razorpay.orders.create(options);
    
    // Create payment order record
    await query(`
      INSERT INTO payment_orders (user_id, plan_id, order_id, amount, currency, receipt, notes)
      VALUES (?, ?, ?, ?, 'INR', ?, ?)
    `, [userId, plan_id, order.id, totalAmount, receipt, JSON.stringify({addons: selectedAddons})]);

    // Log payment creation
    await query(`
      INSERT INTO payment_logs (user_id, order_id, amount, currency, status)
      VALUES (?, ?, ?, 'INR', 'created')
    `, [userId, order.id, totalAmount]);

    res.json({
      success: true,
      data: {
        order_id: order.id,
        amount: totalAmount,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID,
        plan_name: plan.plan_name,
        duration: plan.duration_months,
        receipt: receipt
      }
    });
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Verify Payment
export async function verifyPayment(req, res) {
  try {
    const userId = req.user.user_id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        message: "All payment verification fields are required" 
      });
    }

    // Get payment order details
    const [paymentOrder] = await query(`
      SELECT * FROM payment_orders WHERE order_id = ? AND user_id = ?
    `, [razorpay_order_id, userId]);

    if (!paymentOrder) {
      return res.status(404).json({
        success: false,
        message: "Payment order not found"
      });
    }

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      // Log failed verification
      await query(`
        INSERT INTO payment_logs (user_id, order_id, payment_id, signature, amount, status, error_description)
        VALUES (?, ?, ?, ?, ?, 'failed', 'Signature verification failed')
      `, [userId, razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentOrder.amount]);

      await query(`
        UPDATE payment_orders SET status = 'failed' WHERE order_id = ?
      `, [razorpay_order_id]);

      return res.status(400).json({ 
        success: false, 
        message: "Payment verification failed" 
      });
    }

    try {
      // Fetch payment details from Razorpay
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      
      // Log successful payment
      await query(`
        INSERT INTO payment_logs (user_id, order_id, payment_id, signature, amount, method, status, gateway_response)
        VALUES (?, ?, ?, ?, ?, ?, 'captured', ?)
      `, [userId, razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentOrder.amount, payment.method, JSON.stringify(payment)]);

      // Update payment order status
      await query(`
        UPDATE payment_orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?
      `, [razorpay_order_id]);

      // Create payment record with GST details
      const paymentResult = await query(`
        INSERT INTO payments (user_id, plan_id, order_id, payment_id, razorpay_signature, amount, base_amount, cgst_amount, sgst_amount, igst_amount, gst_type, total_gst_amount, currency_id, payment_method, payment_status_id, payment_date, gateway_response)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, CURRENT_TIMESTAMP, ?)
      `, [userId, paymentOrder.plan_id, razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentOrder.amount, paymentOrder.base_amount, paymentOrder.cgst_amount, paymentOrder.sgst_amount, paymentOrder.igst_amount, paymentOrder.gst_type, paymentOrder.total_gst_amount, payment.method || 'test', JSON.stringify(payment || {})]);

      // Get plan details for subscription
      const [plan] = await query(`SELECT * FROM subscription_plans WHERE id = ?`, [paymentOrder.plan_id]);
      
      if (plan) {
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + plan.duration_months);

        // Create subscription
        const subscriptionResult = await query(`
          INSERT INTO user_subscriptions (user_id, plan_id, payment_id, payment_order_id, start_date, end_date, activated_at, subscription_status_id, payment_status_id, is_active, plan_symbol)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1, 1, 1, ?)
        `, [userId, paymentOrder.plan_id, paymentResult.insertId, razorpay_order_id, startDate, endDate, plan.plan_name]);

        // Log subscription activation
        await query(`
          INSERT INTO subscription_logs (user_id, subscription_id, plan_id, action, new_status, payment_id, notes)
          VALUES (?, ?, ?, 'activated', 'active', ?, 'Subscription activated after successful payment')
        `, [userId, subscriptionResult.insertId, paymentOrder.plan_id, razorpay_payment_id]);

        // Process addons if any
        if (paymentOrder.notes) {
          try {
            const orderNotes = JSON.parse(paymentOrder.notes);
            // If this is a plan change, cancel the old subscription now (after payment success)
            if (orderNotes.type === 'plan_change' && orderNotes.old_subscription_id) {
              await query(`
                UPDATE user_subscriptions 
                SET is_active = 0, subscription_status_id = 3, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ? AND user_id = ?
              `, [orderNotes.old_subscription_id, userId]);
              await query(`
                INSERT INTO subscription_logs (user_id, subscription_id, plan_id, action, old_status, new_status, notes)
                VALUES (?, ?, ?, 'cancelled', 'active', 'cancelled', 'Cancelled after successful plan change payment')
              `, [userId, orderNotes.old_subscription_id, paymentOrder.plan_id]);
            }
            if (orderNotes.addons && orderNotes.addons.length > 0) {
              for (const addon of orderNotes.addons) {
                await query(`
                  INSERT INTO user_subscription_addons (user_id, subscription_id, addon_id, quantity, amount_paid)
                  VALUES (?, ?, ?, 1, ?)
                `, [userId, subscriptionResult.insertId, addon.id, addon.price]);
              }
            }
          } catch (e) {
            console.log('No addons to process');
          }
        }
      }

      // Generate invoice details
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(paymentResult.insertId).padStart(6, '0')}`;
      const invoiceUrl = `${process.env.FRONTEND_URL || 'https://vivaaha.net'}/invoice/${invoiceNumber}`;

      // Get payment data for PDF
      const [paymentData] = await query(`
        SELECT p.*, sp.plan_name, sp.duration_months,
               up.first_name, up.last_name, u.email, u.phone
        FROM payments p
        LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN user_profiles up ON p.user_id = up.user_id
        WHERE p.id = ?
      `, [paymentResult.insertId]);

      paymentData.invoice_number = invoiceNumber;
      const pdfUrl = await generateInvoicePDF(paymentData);

      // Update payment with invoice details
      await query(`
        UPDATE payments SET invoice_number = ?, invoice_url = ?, invoice_pdf_url = ? WHERE id = ?
      `, [invoiceNumber, invoiceUrl, pdfUrl, paymentResult.insertId]);

      res.json({ 
        success: true, 
        message: "Payment verified and subscription activated successfully",
        data: {
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
          amount: paymentOrder.amount,
          plan_name: plan.plan_name,
          duration: plan.duration_months,
          invoice_number: invoiceNumber,
          invoice_url: invoiceUrl,
          invoice_pdf_url: pdfUrl
        }
      });
    } catch (razorpayError) {
      console.error("Razorpay API Error:", razorpayError);
      
      // Log the error
      await query(`
        INSERT INTO payment_logs (user_id, order_id, payment_id, signature, amount, status, error_code, error_description)
        VALUES (?, ?, ?, ?, ?, 'failed', ?, ?)
      `, [userId, razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentOrder.amount, razorpayError.error?.code || 'UNKNOWN', razorpayError.message]);

      await query(`
        UPDATE payment_orders SET status = 'failed' WHERE order_id = ?
      `, [razorpay_order_id]);

      res.status(500).json({ 
        success: false, 
        message: "Payment verification failed due to gateway error" 
      });
    }
  } catch (error) {
    console.error("Verify Payment Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Payment History
export async function getPaymentHistory(req, res) {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10, include_pending = 'false' } = req.query;
    const offset = (page - 1) * limit;

    // Get completed payments
    const payments = await query(`
      SELECT 
        p.id,
        p.order_id as transaction_id,
        p.amount,
        p.payment_date,
        p.payment_method,
        ps.status_name as payment_status,
        sp.plan_name,
        sp.duration_months,
        sp.price as plan_price,
        p.base_amount,
        p.total_gst_amount,
        p.cgst_amount,
        p.sgst_amount,
        p.igst_amount,
        p.gst_type,
        CASE 
          WHEN p.payment_status_id = 1 OR ps.status_name = 'paid' THEN 'Completed'
          WHEN p.payment_status_id = 6 OR ps.status_name = 'captured' THEN 'Completed'
          WHEN p.payment_status_id = 2 OR ps.status_name = 'pending' THEN 'Pending'
          WHEN p.payment_status_id = 4 OR ps.status_name = 'created' THEN 'Pending'
          WHEN p.payment_status_id = 3 OR ps.status_name = 'failed' THEN 'Failed'
          WHEN p.payment_status_id = 7 OR ps.status_name = 'refunded' THEN 'Refunded'
          WHEN p.payment_status_id = 8 OR ps.status_name = 'cancelled' THEN 'Cancelled'
          ELSE 'Completed'
        END as status,
        CONCAT('INV-', YEAR(p.payment_date), '-', LPAD(p.id, 3, '0')) as invoice_number,
        'completed' as order_type
      FROM payments p
      LEFT JOIN payment_status_master ps ON p.payment_status_id = ps.id
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      WHERE p.user_id = ?
      ORDER BY p.payment_date DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(limit), offset]);

    // Get pending orders if requested
    let pendingOrders = [];
    if (include_pending === 'true') {
      pendingOrders = await query(`
        SELECT 
          po.id,
          po.order_id as transaction_id,
          po.amount,
          po.created_at as payment_date,
          NULL as payment_method,
          po.status as payment_status,
          sp.plan_name,
          sp.duration_months,
          sp.price as subscription_amount,
          'Pending' as status,
          NULL as invoice_number,
          'pending' as order_type,
          po.payment_gateway
        FROM payment_orders po
        LEFT JOIN subscription_plans sp ON po.plan_id = sp.id
        WHERE po.user_id = ? AND po.status IN ('created', 'pending')
        ORDER BY po.created_at DESC
        LIMIT 5
      `, [userId]);
    }

    const [totalCount] = await query(`
      SELECT COUNT(*) as total FROM payments WHERE user_id = ?
    `, [userId]);

    const [pendingCount] = await query(`
      SELECT COUNT(*) as total FROM payment_orders WHERE user_id = ? AND status IN ('created', 'pending')
    `, [userId]);

    const formattedPayments = payments.map(payment => {
      const totalAmount = parseFloat(payment.amount);
      // Use base_amount from payments table (stored at payment time) — NOT current sp.price
      const planPrice = parseFloat(payment.base_amount || payment.amount) || parseFloat(payment.plan_price) || 0;
      
      // Calculate base amount and GST from database or reverse calculate
      let baseAmount, totalGst, cgst, sgst, igst, gstType;
      
      if (payment.base_amount && payment.total_gst_amount) {
        baseAmount = parseFloat(payment.base_amount);
        totalGst = parseFloat(payment.total_gst_amount);
        cgst = parseFloat(payment.cgst_amount || 0);
        sgst = parseFloat(payment.sgst_amount || 0);
        igst = parseFloat(payment.igst_amount || 0);
        gstType = payment.gst_type;
      } else {
        // Reverse calculate: total includes 18% GST
        baseAmount = totalAmount / 1.18;
        totalGst = totalAmount - baseAmount;
        igst = totalGst;
        cgst = 0;
        sgst = 0;
        gstType = 'IGST';
      }
      
      // Calculate addon amount
      const addonAmount = baseAmount - planPrice;
      
      return {
        id: payment.id,
        plan_name: payment.plan_name,
        invoice_number: payment.invoice_number,
        invoice_url: `${process.env.BACKEND_URL || 'http://127.0.0.1:9000'}/api/payments/invoice-view/${payment.invoice_number}`,
        payment_date: payment.payment_date,
        status: payment.status,
        plan_amount: parseFloat(planPrice.toFixed(2)),
        addon_amount: addonAmount > 1 ? parseFloat(addonAmount.toFixed(2)) : 0,
        gst_breakdown: {
          type: gstType,
          cgst: cgst > 0 ? parseFloat(cgst.toFixed(2)) : null,
          sgst: sgst > 0 ? parseFloat(sgst.toFixed(2)) : null,
          igst: igst > 0 ? parseFloat(igst.toFixed(2)) : null,
          total: parseFloat(totalGst.toFixed(2))
        },
        duration: `${payment.duration_months} Month${payment.duration_months > 1 ? 's' : ''}`,
        total_amount: parseFloat(totalAmount.toFixed(2)),
        payment_method: payment.payment_method?.toUpperCase() || 'UPI',
        transaction_id: payment.transaction_id,
        refund_amount: payment.status === 'Refunded' ? Math.round(baseAmount * 0.83) : null,
        order_type: 'completed'
      };
    });

    const formattedPendingOrders = pendingOrders.map(order => ({
      id: order.id,
      plan_name: order.plan_name,
      invoice_number: null,
      payment_date: order.payment_date,
      status: 'Pending Payment',
      subscription_amount: order.subscription_amount,
      gst_amount: Math.round(order.subscription_amount * 0.18),
      duration: `${order.duration_months} Month${order.duration_months > 1 ? 's' : ''}`,
      total_amount: order.amount,
      payment_method: order.payment_gateway?.toUpperCase() || 'RAZORPAY',
      transaction_id: order.transaction_id,
      refund_amount: null,
      order_type: 'pending'
    }));

    res.json({
      success: true,
      data: {
        payments: formattedPayments,
        pending_orders: formattedPendingOrders,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(totalCount.total / limit),
          total_records: totalCount.total,
          pending_orders_count: pendingCount.total,
          per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error("Get Payment History Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Cancel Payment Order
export async function cancelOrder(req, res) {
  try {
    const userId = req.user.user_id;
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID is required" 
      });
    }

    await query(`
      UPDATE payments 
      SET payment_status_id = 4 
      WHERE transaction_id = ? AND user_id = ?
    `, [order_id, userId]); // 4 = cancelled

    res.json({ success: true, message: "Order cancelled" });
  } catch (error) {
    console.error("Cancel Order Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Refund Requests (Admin)
export async function getRefundRequests(req, res) {
  try {
    const { status = 'pending', page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const refundRequests = await query(`
      SELECT rr.*, sp.plan_name, up.first_name, up.last_name, u.email,
             p.transaction_id, p.payment_method
      FROM refund_requests rr
      LEFT JOIN user_subscriptions us ON rr.subscription_id = us.id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN user_profiles up ON rr.user_id = up.user_id
      LEFT JOIN users u ON rr.user_id = u.id
      LEFT JOIN payments p ON rr.payment_id = p.id
      WHERE rr.refund_status = ?
      ORDER BY rr.created_at DESC
      LIMIT ? OFFSET ?
    `, [status, parseInt(limit), offset]);

    const [totalCount] = await query(`
      SELECT COUNT(*) as total FROM refund_requests WHERE refund_status = ?
    `, [status]);

    res.json({
      success: true,
      data: {
        refund_requests: refundRequests,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(totalCount.total / limit),
          total_records: totalCount.total,
          per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error("Get Refund Requests Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Handle Payment Failure
export async function handlePaymentFailure(req, res) {
  try {
    const userId = req.user.user_id;
    const { razorpay_order_id, error_code, error_description } = req.body;

    if (!razorpay_order_id) {
      return res.status(400).json({ 
        success: false, 
        message: "Order ID is required" 
      });
    }

    // Get payment order details
    const [paymentOrder] = await query(`
      SELECT * FROM payment_orders WHERE order_id = ? AND user_id = ?
    `, [razorpay_order_id, userId]);

    if (!paymentOrder) {
      return res.status(404).json({
        success: false,
        message: "Payment order not found"
      });
    }

    // Log payment failure
    await query(`
      INSERT INTO payment_logs (user_id, order_id, amount, status, error_code, error_description)
      VALUES (?, ?, ?, 'failed', ?, ?)
    `, [userId, razorpay_order_id, paymentOrder.amount, error_code || 'PAYMENT_FAILED', error_description || 'Payment failed']);

    // Update payment order status
    await query(`
      UPDATE payment_orders SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?
    `, [razorpay_order_id]);

    // Log subscription failure
    await query(`
      INSERT INTO subscription_logs (user_id, plan_id, action, new_status, notes)
      VALUES (?, ?, 'created', 'failed', 'Subscription creation failed due to payment failure')
    `, [userId, paymentOrder.plan_id]);

    res.json({ 
      success: true, 
      message: "Payment failure recorded" 
    });
  } catch (error) {
    console.error("Handle Payment Failure Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Razorpay Webhook Handler
export async function handleWebhook(req, res) {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (webhookSignature !== expectedSignature) {
        return res.status(400).json({ success: false, message: "Invalid webhook signature" });
      }
    }

    const { event, payload } = req.body;
    
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment.entity);
        break;
      case 'payment.failed':
        await handlePaymentFailedWebhook(payload.payment.entity);
        break;
      case 'order.paid':
        await handleOrderPaid(payload.order.entity);
        break;
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.json({ success: true, message: "Webhook processed" });
  } catch (error) {
    console.error("Webhook Handler Error:", error);
    res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
}

async function handlePaymentCaptured(payment) {
  try {
    const orderId = payment.order_id;
    
    // Get payment order
    const [paymentOrder] = await query(`
      SELECT * FROM payment_orders WHERE order_id = ?
    `, [orderId]);

    if (paymentOrder) {
      // Update payment logs
      await query(`
        INSERT INTO payment_logs (user_id, order_id, payment_id, amount, method, status, gateway_response)
        VALUES (?, ?, ?, ?, ?, 'captured', ?)
        ON DUPLICATE KEY UPDATE status = 'captured', gateway_response = VALUES(gateway_response)
      `, [paymentOrder.user_id, orderId, payment.id, payment.amount / 100, payment.method, JSON.stringify(payment)]);
    }
  } catch (error) {
    console.error("Handle Payment Captured Error:", error);
  }
}

async function handlePaymentFailedWebhook(payment) {
  try {
    const orderId = payment.order_id;
    
    // Get payment order
    const [paymentOrder] = await query(`
      SELECT * FROM payment_orders WHERE order_id = ?
    `, [orderId]);

    if (paymentOrder) {
      // Update payment order status
      await query(`
        UPDATE payment_orders SET status = 'failed' WHERE order_id = ?
      `, [orderId]);

      // Log payment failure
      await query(`
        INSERT INTO payment_logs (user_id, order_id, payment_id, amount, status, error_code, error_description, gateway_response)
        VALUES (?, ?, ?, ?, 'failed', ?, ?, ?)
      `, [paymentOrder.user_id, orderId, payment.id, payment.amount / 100, payment.error_code, payment.error_description, JSON.stringify(payment)]);
    }
  } catch (error) {
    console.error("Handle Payment Failed Webhook Error:", error);
  }
}

async function handleOrderPaid(order) {
  try {
    const orderId = order.id;
    
    // Get payment order
    const [paymentOrder] = await query(`
      SELECT * FROM payment_orders WHERE order_id = ?
    `, [orderId]);

    if (paymentOrder) {
      // Update payment order status
      await query(`
        UPDATE payment_orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?
      `, [orderId]);

      // Log order paid event
      await query(`
        INSERT INTO payment_logs (user_id, order_id, amount, status, gateway_response)
        VALUES (?, ?, ?, 'paid', ?)
      `, [paymentOrder.user_id, orderId, order.amount / 100, JSON.stringify(order)]);
    }
  } catch (error) {
    console.error("Handle Order Paid Error:", error);
  }
}

// Process Refund (Admin)
export async function processRefund(req, res) {
  try {
    const { refund_request_id, action, admin_notes } = req.body;

    if (!refund_request_id || !action) {
      return res.status(400).json({
        success: false,
        message: "Refund request ID and action are required"
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be 'approve' or 'reject'"
      });
    }

    // Get refund request details
    const [refundRequest] = await query(`
      SELECT rr.*, p.payment_id
      FROM refund_requests rr
      LEFT JOIN payments p ON rr.payment_id = p.id
      WHERE rr.id = ? AND rr.refund_status = 'pending'
    `, [refund_request_id]);

    if (!refundRequest) {
      return res.status(404).json({
        success: false,
        message: "Pending refund request not found"
      });
    }

    if (action === 'approve') {
      try {
        const refund = await razorpay.payments.refund(refundRequest.payment_id, {
          amount: Math.round(refundRequest.refund_amount * 100),
          notes: {
            reason: 'Subscription refund as per policy',
            admin_notes: admin_notes || 'Approved by admin'
          }
        });

        await query(`
          UPDATE refund_requests 
          SET refund_status = 'processed', 
              admin_notes = ?, 
              razorpay_refund_id = ?,
              processed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [admin_notes || 'Refund processed successfully', refund.id, refund_request_id]);

        // Log subscription refund
        await query(`
          INSERT INTO subscription_logs (user_id, subscription_id, plan_id, action, new_status, notes)
          VALUES (?, ?, ?, 'refunded', 'refunded', 'Subscription refunded by admin')
        `, [refundRequest.user_id, refundRequest.subscription_id, refundRequest.plan_id]);

        res.json({
          success: true,
          message: "Refund processed successfully",
          data: {
            refund_id: refund.id,
            amount: refundRequest.refund_amount,
            status: 'processed'
          }
        });
      } catch (razorpayError) {
        console.error("Razorpay Refund Error:", razorpayError);
        
        await query(`
          UPDATE refund_requests 
          SET refund_status = 'rejected', 
              admin_notes = ?
          WHERE id = ?
        `, [`Refund failed: ${razorpayError.message}`, refund_request_id]);

        res.status(500).json({
          success: false,
          message: "Failed to process refund through payment gateway"
        });
      }
    } else {
      await query(`
        UPDATE refund_requests 
        SET refund_status = 'rejected', 
            admin_notes = ?,
            processed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [admin_notes || 'Refund request rejected', refund_request_id]);

      res.json({
        success: true,
        message: "Refund request rejected",
        data: {
          status: 'rejected',
          admin_notes: admin_notes || 'Refund request rejected'
        }
      });
    }
  } catch (error) {
    console.error("Process Refund Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}