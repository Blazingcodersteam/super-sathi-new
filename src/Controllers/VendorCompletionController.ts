import { Request, Response } from "express";
import * as utils from "util";
import * as bcrypt from "bcrypt";
import { S3Client, CopyObjectCommand, DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import * as PDFDocument from 'pdfkit';
import { EmailService } from './EmailService';

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "images-2025-new";

// ============ COMPLETE VENDOR REGISTRATION AFTER PAYMENT ============

export const completeVendorRegistration = async (tempRegistrationId: string, transactionId: string): Promise<{ vendorId: number; subscriptionId: number }> => {
  const connection = await new Promise<any>((resolve, reject) => {
    db.getConnection((err: any, conn: any) => {
      if (err) reject(err);
      else resolve(conn);
    });
  });

  const queryAsync = (sql: string, params: any[] = []): Promise<any> => {
    return new Promise((resolve, reject) => {
      connection.query(sql, params, (err: any, results: any) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  };

  try {
    await new Promise<void>((resolve, reject) => {
      connection.beginTransaction((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Get temp registration data
    const tempRegQuery = `
      SELECT
        vrt.*,
        vsp.plan_name,
        vsp.monthly_price,
        vsp.features,
        vp.payment_id,
        vp.total_amount,
        vp.gateway_payment_id
      FROM vendor_registration_temp vrt
      JOIN vendor_subscription_plans vsp ON vrt.plan_id = vsp.id
      JOIN vendor_payments vp ON vrt.temp_id COLLATE utf8mb4_unicode_ci = vp.temp_registration_id
      WHERE vrt.temp_id = ? AND vrt.status = 'payment_completed'
    `;

    const tempReg: any[] = await queryAsync(tempRegQuery, [tempRegistrationId]);

    if (tempReg.length === 0) {
      throw new Error('Temporary registration not found or payment not completed');
    }

    const registration = tempReg[0];
    const registrationData = JSON.parse(registration.registration_data);
    const uploadedFiles = registration.uploaded_files ? JSON.parse(registration.uploaded_files) : null;

    // Hash password
    const hashedPassword = await bcrypt.hash(registrationData.password, 10);

    // Create vendor account
    const insertVendorQuery = `
      INSERT INTO vendors (
        name, category_id, full_name, business_name, email, mobile, password,
        address1, city, state, state_id, pincode, years_of_experience, languages,
        working_hours_from, working_hours_to, willing_to_travel, short_bio,
        profile_picture_url, status, created_by_admin, subscription_status,
        current_plan_id, payment_required, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 'active', ?, 1, NOW(), NOW())
    `;

    const vendorResult: any = await queryAsync(insertVendorQuery, [
      registrationData.full_name,
      registrationData.category_id,
      registrationData.full_name,
      registrationData.business_name || null,
      registrationData.email,
      registrationData.phone,
      hashedPassword,
      registrationData.address || null,
      registrationData.city || null,
      registrationData.state || null,
      registrationData.state_id || null,
      registrationData.pincode || null,
      registrationData.years_of_experience || 0,
      registrationData.languages ? JSON.stringify([registrationData.languages]) : null,
      registrationData.working_hours_from || null,
      registrationData.working_hours_to || null,
      registrationData.willing_to_travel ? 1 : 0,
      registrationData.short_bio || null,
      null,
      registration.plan_id
    ]);

    const vendorId = vendorResult.insertId;

    // Move files from temp to permanent location
    let profileImagePath = null;
    if (uploadedFiles?.profile_image) {
      const tempPath = uploadedFiles.profile_image.file_path;
      const permanentPath = `vendors/${vendorId}/profile_${Date.now()}_${uploadedFiles.profile_image.original_name}`;

      try {
        await s3Client.send(new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${tempPath}`,
          Key: permanentPath
        }));

        await s3Client.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: tempPath
        }));

        profileImagePath = permanentPath;
      } catch (fileError) {
        console.error('Error moving profile image:', fileError);
      }
    }

    // Update vendor with profile image
    if (profileImagePath) {
      await queryAsync(
        "UPDATE vendors SET profile_picture_url = ? WHERE id = ?",
        [profileImagePath, vendorId]
      );
    }

    // Handle document uploads
    if (uploadedFiles?.documents && uploadedFiles.documents.length > 0) {
      for (const doc of uploadedFiles.documents) {
        const tempPath = doc.file_path;
        const permanentPath = `vendors/${vendorId}/documents/doc_${doc.index}_${Date.now()}_${doc.original_name}`;

        try {
          await s3Client.send(new CopyObjectCommand({
            Bucket: BUCKET_NAME,
            CopySource: `${BUCKET_NAME}/${tempPath}`,
            Key: permanentPath
          }));

          await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: tempPath
          }));

          // Insert document record
          await queryAsync(`
            INSERT INTO vendor_documents (
              vendor_id, document_name, document_type, document_url,
              file_size, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, NOW())
          `, [
            vendorId,
            doc.original_name,
            `document_${doc.index}`,
            permanentPath,
            doc.file_size
          ]);
        } catch (fileError) {
          console.error(`Error moving document ${doc.index}:`, fileError);
        }
      }
    }

    // Handle bank details
    if (registrationData.bank_details && registrationData.bank_details.length > 0) {
      for (const bank of registrationData.bank_details) {
        await queryAsync(`
          INSERT INTO vendor_bank_details (
            vendor_id, bank_name, account_number, ifsc_code,
            account_holder_name, branch_name, account_type, upi_id, is_primary
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          vendorId,
          bank.bank_name,
          bank.account_number,
          bank.ifsc_code,
          bank.account_holder_name,
          bank.branch_name || null,
          (bank.account_type || 'savings').toLowerCase(),
          bank.upi_id || null,
          bank.is_primary ? 1 : 0
        ]);
      }
    }

    // Handle services
    if (registrationData.services && registrationData.services.length > 0) {
      for (const service of registrationData.services) {
        await queryAsync(`
          INSERT INTO vendor_services (
            vendor_id, service_name, description,
            price, duration
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          vendorId,
          service.service_name,
          service.description || null,
          service.price || null,
          service.duration || 0
        ]);
      }
    }

    // Create subscription record
    const subscriptionStartDate = new Date();
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);

    const insertSubscriptionQuery = `
      INSERT INTO vendor_subscriptions (
        vendor_id, plan_id, payment_id, subscription_start_date,
        subscription_end_date, amount_paid,
        auto_renewal, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
    `;

    const subscriptionResult: any = await queryAsync(insertSubscriptionQuery, [
      vendorId,
      registration.plan_id,
      registration.payment_id,
      subscriptionStartDate,
      subscriptionEndDate,
      registration.total_amount
    ]);

    const subscriptionId = subscriptionResult.insertId;

    // Generate and upload invoice
    const invoiceUrl = await generateVendorInvoice({
      vendor_id: vendorId,
      vendor_name: registrationData.full_name,
      vendor_email: registrationData.email,
      plan_name: registration.plan_name,
      amount: registration.total_amount,
      transaction_id: registration.gateway_payment_id || transactionId,
      payment_date: new Date(),
      subscription_start: subscriptionStartDate,
      subscription_end: subscriptionEndDate
    });

    // Update payment record with invoice
    await queryAsync(
      "UPDATE vendor_payments SET invoice_url = ?, updated_at = NOW() WHERE temp_registration_id = ?",
      [invoiceUrl, tempRegistrationId]
    );

    // Mark temp registration as completed
    await queryAsync(
      "UPDATE vendor_registration_temp SET status = 'completed', vendor_id = ?, subscription_id = ?, completed_at = NOW(), updated_at = NOW() WHERE temp_id = ?",
      [vendorId, subscriptionId, tempRegistrationId]
    );

    await new Promise<void>((resolve, reject) => {
      connection.commit((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Send welcome email
    try {
      await EmailService.sendVendorRegistrationSuccessEmail(registrationData.email, {
        vendor_name: registrationData.full_name,
        vendor_id: vendorId.toString(),
        plan_name: registration.plan_name,
        subscription_end_date: subscriptionEndDate.toLocaleDateString(),
        login_url: process.env.VENDOR_LOGIN_URL || 'https://vivaaha.net/admin/vendor/login',
        invoice_url: invoiceUrl
      });
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
    }

    return { vendorId, subscriptionId };

  } catch (error) {
    await new Promise<void>((resolve) => {
      connection.rollback(() => resolve());
    });
    throw error;
  } finally {
    connection.release();
  }
};

// ============ GENERATE VENDOR INVOICE PDF ============

const generateVendorInvoice = async (invoiceData: any): Promise<string> => {
  try {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));

    const pdfPromise = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // Header
    doc.fontSize(20).text('VENDOR SUBSCRIPTION INVOICE', 50, 50);
    doc.fontSize(12).text(`Invoice Date: ${new Date().toLocaleDateString()}`, 50, 80);
    doc.text(`Transaction ID: ${invoiceData.transaction_id}`, 50, 100);

    // Vendor Details
    doc.fontSize(14).text('Vendor Details:', 50, 140);
    doc.fontSize(12)
       .text(`Name: ${invoiceData.vendor_name}`, 50, 160)
       .text(`Email: ${invoiceData.vendor_email}`, 50, 180)
       .text(`Vendor ID: ${invoiceData.vendor_id}`, 50, 200);

    // Subscription Details
    doc.fontSize(14).text('Subscription Details:', 50, 240);
    doc.fontSize(12)
       .text(`Plan: ${invoiceData.plan_name}`, 50, 260)
       .text(`Start Date: ${invoiceData.subscription_start.toLocaleDateString()}`, 50, 280)
       .text(`End Date: ${invoiceData.subscription_end.toLocaleDateString()}`, 50, 300);

    // Payment Details
    doc.fontSize(14).text('Payment Details:', 50, 340);
    doc.fontSize(12)
       .text(`Amount Paid: ₹${invoiceData.amount}`, 50, 360)
       .text(`Payment Date: ${invoiceData.payment_date.toLocaleDateString()}`, 50, 380)
       .text(`Status: Completed`, 50, 400);

    // Footer
    doc.fontSize(10).text('Thank you for choosing our vendor services!', 50, 500);
    doc.text('For support, contact: support@vivaaha.net', 50, 520);

    doc.end();

    const pdfBuffer = await pdfPromise;
    const fileName = `invoices/vendor_${invoiceData.vendor_id}_${Date.now()}.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: pdfBuffer,
      ContentType: 'application/pdf'
    }));

    return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${fileName}`;

  } catch (error) {
    console.error('Error generating invoice:', error);
    throw error;
  }
};

// ============ ADMIN: GET VENDOR REGISTRATIONS ============

export const getVendorRegistrations = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = utils.promisify(db.query).bind(db);
    const {
      status = 'all',
      page = 1,
      limit = 20,
      search = '',
      plan_id,
      date_from,
      date_to
    } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    let whereConditions = [];
    let queryParams: any[] = [];

    // Status filter
    if (status !== 'all') {
      whereConditions.push('vrt.status = ?');
      queryParams.push(status);
    }

    // Search filter
    if (search) {
      whereConditions.push('(vrt.email LIKE ? OR vrt.phone LIKE ? OR JSON_EXTRACT(vrt.registration_data, "$.full_name") LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Plan filter
    if (plan_id) {
      whereConditions.push('vrt.plan_id = ?');
      queryParams.push(plan_id);
    }

    // Date range filter
    if (date_from) {
      whereConditions.push('DATE(vrt.created_at) >= ?');
      queryParams.push(date_from);
    }
    if (date_to) {
      whereConditions.push('DATE(vrt.created_at) <= ?');
      queryParams.push(date_to);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Get registrations with state information
    const registrationsQuery = `
      SELECT
        vrt.*,
        vsp.plan_name,
        vsp.monthly_price,
        vp.payment_status,
        vp.total_amount,
        vp.transaction_id,
        vp.paid_at,
        v.id as vendor_id,
        vs.id as subscription_id,
        sm.state_name,
        sm.state_code
      FROM vendor_registration_temp vrt
      LEFT JOIN vendor_subscription_plans vsp ON vrt.plan_id = vsp.id
      LEFT JOIN vendor_payments vp ON vrt.temp_id = vp.temp_registration_id
      LEFT JOIN vendors v ON vrt.vendor_id = v.id
      LEFT JOIN vendor_subscriptions vs ON vrt.subscription_id = vs.id
      LEFT JOIN states_master sm ON vrt.billing_state_id = sm.id
      ${whereClause}
      ORDER BY vrt.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit as string), offset);
    const registrations: any[] = await query(registrationsQuery, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM vendor_registration_temp vrt
      LEFT JOIN vendor_subscription_plans vsp ON vrt.plan_id = vsp.id
      LEFT JOIN vendor_payments vp ON vrt.temp_id = vp.temp_registration_id
      ${whereClause}
    `;

    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const totalResult: any[] = await query(countQuery, countParams);
    const total = totalResult[0].total;

    // Format response
    const formattedRegistrations = registrations.map(reg => {
      const registrationData = reg.registration_data ? JSON.parse(reg.registration_data) : {};
      return {
        temp_id: reg.temp_id,
        vendor_id: reg.vendor_id,
        subscription_id: reg.subscription_id,
        status: reg.status,
        plan_details: {
          id: reg.plan_id,
          name: reg.plan_name,
          price: reg.monthly_price
        },
        vendor_details: {
          full_name: registrationData.full_name,
          email: reg.email,
          phone: reg.phone,
          business_name: registrationData.business_name,
          state_name: reg.state_name,
          state_code: reg.state_code
        },
        payment_details: {
          status: reg.payment_status,
          total_amount: reg.total_amount,
          transaction_id: reg.transaction_id,
          paid_at: reg.paid_at
        },
        created_at: reg.created_at,
        expires_at: reg.expires_at,
        completed_at: reg.completed_at
      };
    });

    res.json({
      success: true,
      data: {
        registrations: formattedRegistrations,
        pagination: {
          current_page: parseInt(page as string),
          per_page: parseInt(limit as string),
          total: total,
          total_pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error: any) {
    console.error("Error fetching vendor registrations:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============ ADMIN: GET REGISTRATION DETAILS ============

export const getRegistrationDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = utils.promisify(db.query).bind(db);
    const { temp_id } = req.params;

    const detailsQuery = `
      SELECT
        vrt.*,
        vsp.plan_name,
        vsp.plan_description,
        vsp.monthly_price,
        vsp.features,
        vp.payment_id,
        vp.payment_status,
        vp.total_amount,
        vp.transaction_id,
        vp.gateway_payment_id,
        vp.paid_at,
        vp.invoice_url,
        v.id as vendor_id,
        v.status as vendor_status,
        vs.id as subscription_id,
        vs.subscription_end_date,
        sm.state_name,
        sm.state_code
      FROM vendor_registration_temp vrt
      LEFT JOIN vendor_subscription_plans vsp ON vrt.plan_id = vsp.id
      LEFT JOIN vendor_payments vp ON vrt.temp_id = vp.temp_registration_id
      LEFT JOIN vendors v ON vrt.vendor_id = v.id
      LEFT JOIN vendor_subscriptions vs ON vrt.subscription_id = vs.id
      LEFT JOIN states_master sm ON vrt.billing_state_id = sm.id
      WHERE vrt.temp_id = ?
    `;

    const details: any[] = await query(detailsQuery, [temp_id]);

    if (details.length === 0) {
      res.status(404).json({
        success: false,
        message: "Registration not found"
      });
      return;
    }

    const registration = details[0];
    const registrationData = registration.registration_data ? JSON.parse(registration.registration_data) : {};
    const uploadedFiles = registration.uploaded_files ? JSON.parse(registration.uploaded_files) : null;
    const calculatedGst = registration.calculated_gst ? JSON.parse(registration.calculated_gst) : null;

    res.json({
      success: true,
      data: {
        temp_id: registration.temp_id,
        vendor_id: registration.vendor_id,
        subscription_id: registration.subscription_id,
        status: registration.status,
        plan_details: {
          id: registration.plan_id,
          name: registration.plan_name,
          description: registration.plan_description,
          price: registration.monthly_price,
          features: registration.features ? JSON.parse(registration.features) : []
        },
        vendor_details: registrationData,
        state_info: {
          state_name: registration.state_name,
          state_code: registration.state_code,
          billing_state_id: registration.billing_state_id
        },
        uploaded_files: uploadedFiles,
        payment_details: {
          payment_id: registration.payment_id,
          status: registration.payment_status,
          total_amount: registration.total_amount,
          transaction_id: registration.gateway_payment_id,
          gateway_payment_id: registration.gateway_payment_id,
          paid_at: registration.paid_at,
          invoice_url: registration.invoice_url,
          gst_calculation: calculatedGst
        },
        vendor_status: registration.vendor_status,
        subscription_end_date: registration.subscription_end_date,
        created_at: registration.created_at,
        expires_at: registration.expires_at,
        completed_at: registration.completed_at
      }
    });

  } catch (error: any) {
    console.error("Error fetching registration details:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============ RETRY FAILED REGISTRATION ============

export const retryFailedRegistration = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = utils.promisify(db.query).bind(db);
    const { temp_id } = req.params;

    // Check if registration exists and is in failed state
    const registration: any[] = await query(
      "SELECT * FROM vendor_registration_temp WHERE temp_id = ? AND status IN ('payment_failed', 'cancelled')",
      [temp_id]
    );

    if (registration.length === 0) {
      res.status(404).json({
        success: false,
        message: "Registration not found or not in failed state"
      });
      return;
    }

    // Reset status and extend expiry
    const newExpiryTime = new Date();
    newExpiryTime.setHours(newExpiryTime.getHours() + 2);

    await query(
      "UPDATE vendor_registration_temp SET status = 'pending', expires_at = ?, updated_at = NOW() WHERE temp_id = ?",
      [newExpiryTime, temp_id]
    );

    // Reset any failed payment records
    await query(
      "UPDATE vendor_payments SET payment_status = 'pending' WHERE temp_registration_id = ? AND payment_status = 'failed'",
      [temp_id]
    );

    res.json({
      success: true,
      message: "Registration reset successfully. You can now retry payment.",
      data: {
        temp_id: temp_id,
        expires_at: newExpiryTime
      }
    });

  } catch (error: any) {
    console.error("Error retrying registration:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};