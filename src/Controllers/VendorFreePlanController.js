"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeVendorPassword = exports.registerVendorFreePlan = void 0;
const utils = require("util");
const bcrypt = require("bcrypt");
const client_s3_1 = require("@aws-sdk/client-s3");
const path = require("path");
const EmailService_1 = require("./EmailService");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// AWS S3 Configuration
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "images-2025-new";
// Generate random 6-digit alphanumeric password
const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 6; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};
// Register vendor with FREE plan (no payment required)
const registerVendorFreePlan = async (req, res) => {
    try {
        const { category_id, full_name, email, phone, password, business_name, address, city, state, pincode, years_of_experience, languages, working_hours_from, working_hours_to, willing_to_travel, short_bio, bank_details, services, documents, state_id } = req.body;
        // Validate required fields
        if (!category_id || !full_name || !email || !phone) {
            res.status(400).json({
                success: false,
                message: "Category, full name, email, and phone are required"
            });
            return;
        }
        // Get FREE plan (plan with monthly_price = 0)
        const plan = await query("SELECT * FROM vendor_subscription_plans WHERE is_active = 1 AND monthly_price = 0 ORDER BY id LIMIT 1");
        if (plan.length === 0) {
            res.status(400).json({
                success: false,
                message: "Free plan not available"
            });
            return;
        }
        // Check email exists in vendors
        const existingVendor = await query("SELECT id FROM vendors WHERE email = ?", [email]);
        if (existingVendor.length > 0) {
            res.status(400).json({
                success: false,
                message: "Email already exists"
            });
            return;
        }
        // Check phone exists
        const existingPhone = await query("SELECT id FROM vendors WHERE mobile = ?", [phone]);
        if (existingPhone.length > 0) {
            res.status(400).json({
                success: false,
                message: "Phone number already exists"
            });
            return;
        }
        // Generate password if not provided
        const finalPassword = password || generatePassword();
        const hashedPassword = await bcrypt.hash(finalPassword, 10);
        // Convert languages to JSON array if it's a comma-separated string
        let languagesJson = null;
        if (languages) {
            if (typeof languages === 'string') {
                // Convert "English,Hindi,Marathi" to ["English","Hindi","Marathi"]
                const langArray = languages.split(',').map((lang) => lang.trim());
                languagesJson = JSON.stringify(langArray);
            }
            else if (Array.isArray(languages)) {
                languagesJson = JSON.stringify(languages);
            }
        }
        // Handle profile image upload
        let profilePictureUrl = null;
        const uploadedFiles = req.files;
        if (uploadedFiles && uploadedFiles.profile_image && uploadedFiles.profile_image[0]) {
            const profileFile = uploadedFiles.profile_image[0];
            const fileExtension = path.extname(profileFile.originalname);
            const fileName = `vendors/profiles/${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;
            try {
                await s3Client.send(new client_s3_1.PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: fileName,
                    Body: profileFile.buffer,
                    ContentType: profileFile.mimetype,
                }));
                profilePictureUrl = fileName;
            }
            catch (uploadError) {
                console.error('Profile image upload error:', uploadError);
            }
        }
        // Insert vendor
        const insertQuery = `
      INSERT INTO vendors (
        user_type_id, category_id, name, full_name, business_name, email, password, mobile,
        address1, city, state, pincode, years_of_experience, languages,
        working_hours_from, working_hours_to, willing_to_travel, short_bio,
        profile_picture_url, state_id, current_plan_id, subscription_status, 
        status, registered_date
      ) VALUES (7, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'pending', CURDATE())
    `;
        const result = await query(insertQuery, [
            category_id,
            full_name,
            full_name,
            business_name || null,
            email,
            hashedPassword,
            phone,
            address || null,
            city || null,
            state || null,
            pincode || null,
            years_of_experience || 0,
            languagesJson,
            working_hours_from || null,
            working_hours_to || null,
            willing_to_travel === 'true' || willing_to_travel === true ? 1 : 0,
            short_bio || null,
            profilePictureUrl,
            state_id || null,
            plan[0].id
        ]);
        const vendorId = result.insertId;
        // Insert bank details if provided
        if (bank_details) {
            try {
                const bankDetailsArray = typeof bank_details === 'string' ? JSON.parse(bank_details) : bank_details;
                if (Array.isArray(bankDetailsArray)) {
                    for (const bank of bankDetailsArray) {
                        await query(`INSERT INTO vendor_bank_details (
                vendor_id, account_holder_name, account_number, ifsc_code, 
                bank_name, branch_name, account_type, upi_id, is_primary
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                            vendorId,
                            bank.account_holder_name,
                            bank.account_number,
                            bank.ifsc_code,
                            bank.bank_name,
                            bank.branch_name || null,
                            bank.account_type || 'savings',
                            bank.upi_id || null,
                            bank.is_primary ? 1 : 0
                        ]);
                    }
                }
            }
            catch (bankError) {
                console.error('Error inserting bank details:', bankError);
            }
        }
        // Insert services if provided
        if (services) {
            try {
                const servicesArray = typeof services === 'string' ? JSON.parse(services) : services;
                if (Array.isArray(servicesArray)) {
                    for (const service of servicesArray) {
                        await query(`INSERT INTO vendor_services (
                vendor_id, service_name, description, duration, price, 
                currency_id, category, category_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                            vendorId,
                            service.service_name,
                            service.description || null,
                            service.duration || null,
                            service.price || null,
                            service.currency_id || 1,
                            service.category || null,
                            service.category_id || category_id
                        ]);
                    }
                }
            }
            catch (serviceError) {
                console.error('Error inserting services:', serviceError);
            }
        }
        // Insert documents if provided
        if (documents) {
            try {
                const documentsArray = typeof documents === 'string' ? JSON.parse(documents) : documents;
                if (Array.isArray(documentsArray)) {
                    for (let i = 0; i < documentsArray.length; i++) {
                        const doc = documentsArray[i];
                        let documentUrl = null;
                        // Upload document file if exists
                        const fieldName = `document_file_${i}`;
                        if (uploadedFiles && uploadedFiles[fieldName] && uploadedFiles[fieldName][0]) {
                            const docFile = uploadedFiles[fieldName][0];
                            const fileExtension = path.extname(docFile.originalname);
                            const fileName = `vendors/documents/${vendorId}/${Date.now()}_${i}${fileExtension}`;
                            try {
                                await s3Client.send(new client_s3_1.PutObjectCommand({
                                    Bucket: BUCKET_NAME,
                                    Key: fileName,
                                    Body: docFile.buffer,
                                    ContentType: docFile.mimetype,
                                }));
                                documentUrl = fileName;
                            }
                            catch (uploadError) {
                                console.error(`Document ${i} upload error:`, uploadError);
                            }
                        }
                        await query(`INSERT INTO vendor_documents (
                vendor_id, document_name, document_type, document_number, document_url
              ) VALUES (?, ?, ?, ?, ?)`, [
                            vendorId,
                            doc.document_name,
                            doc.document_type || 'other',
                            doc.document_number || null,
                            documentUrl
                        ]);
                    }
                }
            }
            catch (docError) {
                console.error('Error inserting documents:', docError);
            }
        }
        res.status(201).json({
            success: true,
            message: "Vendor registered successfully with free plan. Login credentials have been sent to your email.",
            data: {
                vendor_id: vendorId,
                full_name: full_name,
                business_name: business_name || null,
                email: email,
                phone: phone,
                password: finalPassword,
                plan_details: {
                    plan_id: plan[0].id,
                    plan_name: plan[0].plan_name,
                    plan_description: plan[0].plan_description,
                    monthly_price: plan[0].monthly_price,
                    features: plan[0].features ? JSON.parse(plan[0].features) : []
                },
                status: "pending",
                subscription_status: "active",
                registered_date: new Date().toISOString().split('T')[0],
                profile_picture_url: profilePictureUrl,
                bank_details_added: bank_details ? true : false,
                services_added: services ? true : false,
                documents_added: documents ? true : false
            }
        });
        // Send welcome email with credentials using EmailService
        try {
            await EmailService_1.EmailService.sendTemplateEmail('vendor_registration_free', email, {
                vendor_name: full_name,
                email: email,
                password: finalPassword,
                plan_name: plan[0].plan_name,
                login_url: process.env.VENDOR_LOGIN_URL || 'http://localhost:3000/vendor/login'
            }, {
                fallbackSubject: 'Welcome to {{sitename}} - Your Free Vendor Account is Ready!',
                fallbackHtml: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center;">
                <h1 style="margin: 0;">🎉 Welcome to {{sitename}}!</h1>
              </div>
              <div style="background: white; padding: 40px 30px;">
                <div style="background: #e8f5e9; padding: 20px; border-left: 4px solid #4caf50; margin: 20px 0; border-radius: 4px;">
                  <h2 style="color: #2e7d32; margin: 0 0 10px 0;">Registration Successful!</h2>
                  <p style="margin: 0;">Hello <strong>${full_name}</strong>, your vendor account has been successfully registered with our <strong>FREE</strong> plan.</p>
                </div>
                <div style="background: #fff3cd; padding: 20px; border-left: 4px solid #ffc107; margin: 20px 0; border-radius: 4px;">
                  <h3 style="color: #856404; margin: 0 0 15px 0;">🔐 Your Login Credentials</h3>
                  <p><strong>Email:</strong> ${email}</p>
                  <p><strong>Password:</strong> <span style="font-size: 24px; color: #667eea; font-weight: bold; font-family: monospace;">${finalPassword}</span></p>
                </div>
                <div style="background: #fff3e0; padding: 15px; border-left: 4px solid #ff9800; margin: 20px 0; border-radius: 4px;">
                  <p style="margin: 0; color: #e65100; font-weight: bold;">⚠️ IMPORTANT: Please change your password after your first login for security purposes.</p>
                </div>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.VENDOR_LOGIN_URL || 'http://localhost:3000/vendor/login'}" style="display: inline-block; padding: 15px 40px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Login to Your Account</a>
                </div>
                <div style="text-align: center; padding: 30px; color: #666; font-size: 14px; background: #f8f9fa;">
                  <p>© {{current_year}} {{sitename}}. All rights reserved.</p>
                </div>
              </div>
            </div>
          `
            });
            console.log(`✅ Welcome email sent to ${email}`);
        }
        catch (emailError) {
            console.error('❌ Failed to send welcome email:', emailError);
            // Don't fail registration if email fails
        }
    }
    catch (error) {
        console.error("Error registering vendor with free plan:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.registerVendorFreePlan = registerVendorFreePlan;
// Change vendor password
const changeVendorPassword = async (req, res) => {
    var _a;
    try {
        const vendorId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id; // From auth middleware
        const { current_password, new_password } = req.body;
        if (!vendorId || typeof vendorId !== 'number') {
            res.status(401).json({
                success: false,
                message: "Vendor not authenticated"
            });
            return;
        }
        // Validate inputs
        if (!current_password || !new_password) {
            res.status(400).json({
                success: false,
                message: "Current password and new password are required"
            });
            return;
        }
        if (new_password.length < 6) {
            res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters long"
            });
            return;
        }
        // Get vendor details
        const vendor = await query("SELECT id, email, password FROM vendors WHERE id = ?", [vendorId]);
        if (vendor.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
            return;
        }
        // Verify current password
        const isPasswordValid = await bcrypt.compare(current_password, vendor[0].password);
        if (!isPasswordValid) {
            res.status(401).json({
                success: false,
                message: "Current password is incorrect"
            });
            return;
        }
        // Hash new password
        const hashedNewPassword = await bcrypt.hash(new_password, 10);
        // Update password
        await query("UPDATE vendors SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [hashedNewPassword, vendorId]);
        res.json({
            success: true,
            message: "Password changed successfully"
        });
    }
    catch (error) {
        console.error("Error changing vendor password:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.changeVendorPassword = changeVendorPassword;
//# sourceMappingURL=VendorFreePlanController.js.map