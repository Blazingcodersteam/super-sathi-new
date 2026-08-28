import { Request, Response } from "express";
import * as utils from "util";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import * as path from "path";
import { v4 as uuidv4 } from 'uuid';

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "images-2025-new";

interface VendorRegistrationData {
  category_id: number;
  full_name: string;
  business_name?: string;
  email: string;
  phone: string;
  password: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  years_of_experience?: number;
  languages?: string;
  working_hours_from?: string;
  working_hours_to?: string;
  willing_to_travel?: boolean;
  short_bio?: string;
  bank_details?: any[];
  services?: any[];
  documents?: any[];
}

// ============ VENDOR REGISTRATION - STEP 1: INITIATE REGISTRATION ============

export const initiateVendorRegistration = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      plan_id,
      payment_method = 'razorpay', // Default to razorpay
      gst_applicable = true,
      billing_state_id,
      ...registrationData
    } = req.body;

    // Generate random 6-digit alphanumeric password
    const generateRandomPassword = (): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let password = '';
      for (let i = 0; i < 6; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    // Generate password if not provided
    if (!registrationData.password) {
      registrationData.password = generateRandomPassword();
    }

    // Parse JSON string fields sent via multipart/form-data
    if (registrationData.bank_details && typeof registrationData.bank_details === 'string') {
      try { registrationData.bank_details = JSON.parse(registrationData.bank_details); } catch { registrationData.bank_details = []; }
    }
    if (registrationData.services && typeof registrationData.services === 'string') {
      try { registrationData.services = JSON.parse(registrationData.services); } catch { registrationData.services = []; }
    }
    if (registrationData.documents && typeof registrationData.documents === 'string') {
      try { registrationData.documents = JSON.parse(registrationData.documents); } catch { registrationData.documents = []; }
    }

    // Validate required fields including state_id
    if (!plan_id || !registrationData.category_id || !registrationData.full_name || 
        !registrationData.email || !registrationData.phone || !registrationData.state_id) {
      res.status(400).json({
        success: false,
        message: "Plan ID, Category ID, Full Name, Email, Phone, and State ID are required"
      });
      return;
    }

    // Validate state
    const state: any[] = await query(
      "SELECT id, state_name FROM states_master WHERE id = ? AND status = 1",
      [registrationData.state_id]
    );

    if (state.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid state ID"
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(registrationData.email)) {
      res.status(400).json({
        success: false,
        message: "Invalid email format"
      });
      return;
    }

    // Password is now auto-generated as 6 characters, so no validation needed

    // Check if email already exists in vendors table
    const existingVendor: any[] = await query(
      "SELECT id FROM vendors WHERE email = ?",
      [registrationData.email]
    );

    if (existingVendor.length > 0) {
      res.status(400).json({
        success: false,
        message: "Email already exists"
      });
      return;
    }


    // Check if phone already exists
    const existingPhone: any[] = await query(
      "SELECT id FROM vendors WHERE mobile = ?",
      [registrationData.phone]
    );

    if (existingPhone.length > 0) {
      res.status(400).json({
        success: false,
        message: "Phone number already exists"
      });
      return;
    }

    // Validate subscription plan
    const plan: any[] = await query(
      "SELECT * FROM vendor_subscription_plans WHERE id = ? AND is_active = 1",
      [plan_id]
    );

    if (plan.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid or inactive subscription plan"
      });
      return;
    }

    // Validate category
    const category: any[] = await query(
      "SELECT id FROM vendor_categories WHERE id = ? AND status = 1",
      [registrationData.category_id]
    );

    if (category.length === 0) {
      res.status(400).json({
        success: false,
        message: "Invalid category ID"
      });
      return;
    }

    // Calculate GST if applicable - Simplified for Rajasthan client
    let gstCalculation = {
      base_amount: parseFloat(plan[0].monthly_price),
      gst_rate: 0,
      gst_amount: 0,
      cgst_rate: 0,
      cgst_amount: 0,
      sgst_rate: 0,
      sgst_amount: 0,
      igst_rate: 0,
      igst_amount: 0,
      total_amount: parseFloat(plan[0].monthly_price),
      gst_type: 'NO_GST'
    };

    if (gst_applicable) {
      const RAJASTHAN_STATE_ID = 33; // Rajasthan state ID
      const GST_RATE = 18.00; // Total GST rate
      const CGST_RATE = 9.00;
      const SGST_RATE = 9.00;
      const IGST_RATE = 18.00;
      
      const baseAmount = parseFloat(plan[0].monthly_price);
      const vendorStateId = parseInt(registrationData.state_id);
      
      if (vendorStateId === RAJASTHAN_STATE_ID) {
        // Rajasthan vendor - CGST + SGST
        gstCalculation.cgst_rate = CGST_RATE;
        gstCalculation.sgst_rate = SGST_RATE;
        gstCalculation.cgst_amount = Math.round((baseAmount * CGST_RATE) / 100 * 100) / 100;
        gstCalculation.sgst_amount = Math.round((baseAmount * SGST_RATE) / 100 * 100) / 100;
        gstCalculation.gst_amount = gstCalculation.cgst_amount + gstCalculation.sgst_amount;
        gstCalculation.gst_type = 'CGST_SGST';
      } else {
        // Other state vendor - IGST
        gstCalculation.igst_rate = IGST_RATE;
        gstCalculation.igst_amount = Math.round((baseAmount * IGST_RATE) / 100 * 100) / 100;
        gstCalculation.gst_amount = gstCalculation.igst_amount;
        gstCalculation.gst_type = 'IGST';
      }
      
      gstCalculation.gst_rate = GST_RATE;
      gstCalculation.total_amount = parseFloat((baseAmount + gstCalculation.gst_amount).toFixed(2));
    }

    // Generate unique temp ID
    const tempId = `VREG_${Date.now()}_${uuidv4().substring(0, 8)}`;
    
    // Set expiration time (24 hours from now)
    // This gives vendors enough time to fill bank details and complete payment
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Handle file uploads if any
    let uploadedFiles = null;
    const uploadedFilesData = (req as any).files;
    
    if (uploadedFilesData) {
      uploadedFiles = {};
      
      // Handle profile image
      if (uploadedFilesData.profile_image && uploadedFilesData.profile_image[0]) {
        const profileFile = uploadedFilesData.profile_image[0];
        const fileExtension = path.extname(profileFile.originalname);
        const fileName = `temp/vendor_registrations/${tempId}/profile_${Date.now()}${fileExtension}`;
        
        try {
          await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: profileFile.buffer,
            ContentType: profileFile.mimetype,
          }));
          
          uploadedFiles.profile_image = {
            original_name: profileFile.originalname,
            file_path: fileName,
            file_size: profileFile.size,
            mime_type: profileFile.mimetype
          };
        } catch (uploadError) {
          console.error('Profile image upload error:', uploadError);
        }
      }
      
      // Handle document files
      uploadedFiles.documents = [];
      for (let i = 0; i < 10; i++) {
        const fieldName = `document_file_${i}`;
        if (uploadedFilesData[fieldName] && uploadedFilesData[fieldName][0]) {
          const docFile = uploadedFilesData[fieldName][i];
          const fileExtension = path.extname(docFile.originalname);
          const fileName = `temp/vendor_registrations/${tempId}/doc_${i}_${Date.now()}${fileExtension}`;
          
          try {
            await s3Client.send(new PutObjectCommand({
              Bucket: BUCKET_NAME,
              Key: fileName,
              Body: docFile.buffer,
              ContentType: docFile.mimetype,
            }));
            
            uploadedFiles.documents.push({
              index: i,
              original_name: docFile.originalname,
              file_path: fileName,
              file_size: docFile.size,
              mime_type: docFile.mimetype
            });
          } catch (uploadError) {
            console.error(`Document ${i} upload error:`, uploadError);
          }
        }
      }
    }

    // Store temporary registration data
    const insertTempQuery = `
      INSERT INTO vendor_registration_temp (
        temp_id, plan_id, email, phone, registration_data, uploaded_files,
        payment_method, gst_applicable, billing_state_id, vendor_state_id, calculated_gst,
        total_amount, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await query(insertTempQuery, [
      tempId,
      plan_id,
      registrationData.email,
      registrationData.phone,
      JSON.stringify(registrationData),
      uploadedFiles ? JSON.stringify(uploadedFiles) : null,
      payment_method,
      gst_applicable ? 1 : 0,
      billing_state_id,
      registrationData.state_id, // Store vendor's operating state
      JSON.stringify(gstCalculation),
      gstCalculation.total_amount,
      expiresAt
    ]);

    res.status(201).json({
      success: true,
      message: "Registration data saved. Proceed to payment.",
      data: {
        temp_registration_id: tempId,
        generated_password: registrationData.password, // Include generated password
        plan_details: {
          id: plan[0].id,
          plan_name: plan[0].plan_name,
          monthly_price: plan[0].monthly_price,
          features: plan[0].features ? JSON.parse(plan[0].features) : []
        },
        payment_details: {
          base_amount: gstCalculation.base_amount,
          gst_applicable: gst_applicable,
          gst_calculation: gstCalculation,
          payment_method: payment_method
        },
        expires_at: expiresAt
      }
    });

  } catch (error: any) {
    console.error("Error initiating vendor registration:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============ GET TEMP REGISTRATION DETAILS ============

export const getTempRegistrationDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp_id } = req.params;

    const tempRegQuery = `
      SELECT 
        vrt.*,
        vsp.plan_name,
        vsp.plan_description,
        vsp.monthly_price,
        vsp.features
      FROM vendor_registration_temp vrt
      JOIN vendor_subscription_plans vsp ON vrt.plan_id = vsp.id
      WHERE vrt.temp_id = ? AND vrt.status IN ('pending', 'payment_initiated')
      AND vrt.expires_at > NOW()
    `;

    const tempReg: any[] = await query(tempRegQuery, [temp_id]);

    if (tempReg.length === 0) {
      res.status(404).json({
        success: false,
        message: "Temporary registration not found or expired"
      });
      return;
    }

    const registration = tempReg[0];
    const registrationData = JSON.parse(registration.registration_data);
    const calculatedGst = JSON.parse(registration.calculated_gst);

    res.json({
      success: true,
      data: {
        temp_id: registration.temp_id,
        plan_details: {
          id: registration.plan_id,
          plan_name: registration.plan_name,
          plan_description: registration.plan_description,
          monthly_price: registration.monthly_price,
          features: registration.features ? JSON.parse(registration.features) : []
        },
        vendor_details: {
          full_name: registrationData.full_name,
          email: registrationData.email,
          phone: registrationData.phone,
          business_name: registrationData.business_name
        },
        payment_details: {
          payment_method: registration.payment_method,
          gst_applicable: Boolean(registration.gst_applicable),
          gst_calculation: calculatedGst,
          total_amount: registration.total_amount
        },
        status: registration.status,
        expires_at: registration.expires_at
      }
    });

  } catch (error: any) {
    console.error("Error fetching temp registration details:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============ CANCEL TEMP REGISTRATION ============

export const cancelTempRegistration = async (req: Request, res: Response): Promise<void> => {
  try {
    const { temp_id } = req.params;

    // Get temp registration details
    const tempReg: any[] = await query(
      "SELECT * FROM vendor_registration_temp WHERE temp_id = ?",
      [temp_id]
    );

    if (tempReg.length === 0) {
      res.status(404).json({
        success: false,
        message: "Temporary registration not found"
      });
      return;
    }

    // Clean up uploaded files from S3
    if (tempReg[0].uploaded_files) {
      try {
        const uploadedFiles = JSON.parse(tempReg[0].uploaded_files);
        
        // Delete profile image
        if (uploadedFiles.profile_image) {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: uploadedFiles.profile_image.file_path
          }));
        }
        
        // Delete document files
        if (uploadedFiles.documents && uploadedFiles.documents.length > 0) {
          for (const doc of uploadedFiles.documents) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: doc.file_path
            }));
          }
        }
      } catch (cleanupError) {
        console.error('Error cleaning up files:', cleanupError);
      }
    }

    // Update status to cancelled
    await query(
      "UPDATE vendor_registration_temp SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE temp_id = ?",
      [temp_id]
    );

    res.json({
      success: true,
      message: "Registration cancelled successfully"
    });

  } catch (error: any) {
    console.error("Error cancelling temp registration:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};