"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.singleDocumentUpload = exports.getVendorMenuPermissions = exports.deleteDocument = exports.updateDocument = exports.addDocument = exports.getMyDocuments = exports.deleteService = exports.updateService = exports.addService = exports.getMyServices = exports.deleteBankDetail = exports.updateBankDetail = exports.addBankDetail = exports.getMyBankDetails = exports.getVendorCategoriesPublic = exports.updateVendorProfile = exports.getVendorProfile = exports.vendorLogin = exports.vendorSignup = exports.singleUpload = exports.signupUploadFields = void 0;
const utils = require("util");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const client_s3_1 = require("@aws-sdk/client-s3");
const multer = require("multer");
const path = require("path");
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
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
// Helper function to get status messages
const getStatusMessage = (status) => {
    switch (status) {
        case 'active':
            return 'Your account is active and ready to use.';
        case 'pending':
            return 'Your account is pending approval. Please wait for admin verification.';
        case 'suspended':
            return 'Your account has been suspended. Please contact support for assistance.';
        case 'rejected':
            return 'Your account application has been rejected. Please contact support for more information.';
        case 'inactive':
            return 'Your account is inactive. Please contact support to reactivate.';
        default:
            return 'Account status unknown. Please contact support.';
    }
};
// Multer configuration for vendor profile images
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        if (ALLOWED_FORMATS.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Invalid file format. Only ${ALLOWED_FORMATS.join(', ')} are allowed.`));
        }
    },
});
// Multer configuration for signup with multiple files
const signupUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // Increased to 10MB per file
        files: 15 // Max 15 files total (1 profile + up to 14 documents)
    },
    fileFilter: (req, file, cb) => {
        console.log('File filter - fieldname:', file.fieldname, 'originalname:', file.originalname);
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        if (file.fieldname === 'profile_image') {
            // Profile image validation
            const allowedImageFormats = ['jpg', 'jpeg', 'png', 'webp'];
            if (allowedImageFormats.includes(ext)) {
                console.log('Profile image accepted:', file.originalname);
                cb(null, true);
            }
            else {
                console.log('Profile image rejected:', file.originalname, 'ext:', ext);
                cb(new Error(`Invalid profile image format. Only ${allowedImageFormats.join(', ')} are allowed.`));
            }
        }
        else if (file.fieldname.startsWith('document_file_')) {
            // Document file validation - more permissive for debugging
            const allowedDocFormats = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx', 'txt'];
            if (allowedDocFormats.includes(ext)) {
                console.log('Document file accepted:', file.originalname, 'fieldname:', file.fieldname);
                cb(null, true);
            }
            else {
                console.log('Document file rejected:', file.originalname, 'ext:', ext, 'fieldname:', file.fieldname);
                cb(new Error(`Invalid document format. Only ${allowedDocFormats.join(', ')} are allowed.`));
            }
        }
        else {
            console.log('Unknown field:', file.fieldname, 'file:', file.originalname);
            cb(new Error('Invalid file field'));
        }
    },
});
// Configure fields for signup
const signupFields = [
    { name: 'profile_image', maxCount: 1 },
    { name: 'document_file_0', maxCount: 1 },
    { name: 'document_file_1', maxCount: 1 },
    { name: 'document_file_2', maxCount: 1 },
    { name: 'document_file_3', maxCount: 1 },
    { name: 'document_file_4', maxCount: 1 },
    { name: 'document_file_5', maxCount: 1 },
    { name: 'document_file_6', maxCount: 1 },
    { name: 'document_file_7', maxCount: 1 },
    { name: 'document_file_8', maxCount: 1 },
    { name: 'document_file_9', maxCount: 1 }
];
exports.signupUploadFields = signupUpload.fields(signupFields);
// Single upload for profile updates
exports.singleUpload = upload.single('profile_image');
// Vendor Signup
const vendorSignup = async (req, res) => {
    try {
        const { category_id, full_name, business_name, email, phone, password, address, city, state, pincode, years_of_experience, languages, working_hours_from, working_hours_to, willing_to_travel, short_bio } = req.body;
        // Parse JSON arrays from form data
        let bank_details = [];
        let services = [];
        let documents = [];
        try {
            if (req.body.bank_details) {
                bank_details = typeof req.body.bank_details === 'string'
                    ? JSON.parse(req.body.bank_details)
                    : req.body.bank_details;
            }
            if (req.body.services) {
                services = typeof req.body.services === 'string'
                    ? JSON.parse(req.body.services)
                    : req.body.services;
            }
            if (req.body.documents) {
                documents = typeof req.body.documents === 'string'
                    ? JSON.parse(req.body.documents)
                    : req.body.documents;
            }
        }
        catch (parseError) {
            res.status(400).json({
                success: false,
                message: "Invalid JSON format in bank_details, services, or documents"
            });
            return;
        }
        // Validate required fields
        if (!category_id || !full_name || !email || !phone || !password) {
            res.status(400).json({
                success: false,
                message: "Category ID, Full Name, Email, Phone, and Password are required"
            });
            return;
        }
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({
                success: false,
                message: "Invalid email format"
            });
            return;
        }
        // Validate password strength
        if (password.length < 6) {
            res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters long"
            });
            return;
        }
        // Parse and validate category_id
        const categoryIdNum = parseInt(category_id.toString());
        if (isNaN(categoryIdNum)) {
            res.status(400).json({
                success: false,
                message: "Invalid category ID"
            });
            return;
        }
        // Check if email already exists in vendors table
        const existingVendor = await query("SELECT id FROM vendors WHERE email = ?", [email]);
        if (existingVendor.length > 0) {
            res.status(400).json({
                success: false,
                message: "Email already exists"
            });
            return;
        }
        // Check if email exists in users table
        const existingUser = await query("SELECT id FROM users WHERE email = ?", [email]);
        if (existingUser.length > 0) {
            res.status(400).json({
                success: false,
                message: "Email already exists in the system"
            });
            return;
        }
        // Check if category exists
        const categoryExists = await query("SELECT id FROM vendor_categories WHERE id = ? AND status = 1", [categoryIdNum]);
        if (categoryExists.length === 0) {
            res.status(400).json({
                success: false,
                message: "Invalid category ID"
            });
            return;
        }
        // Get vendor user type ID
        const vendorUserType = await query("SELECT id FROM user_type_master WHERE type_name = 'vendor' AND is_active = 1", []);
        if (vendorUserType.length === 0) {
            res.status(500).json({
                success: false,
                message: "Vendor user type not configured"
            });
            return;
        }
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        let profileImageUrl = null;
        // Handle profile image upload if file is provided
        const uploadedFiles = req.files;
        console.log('Uploaded files:', uploadedFiles); // Debug log
        if (uploadedFiles && uploadedFiles.profile_image && uploadedFiles.profile_image[0]) {
            const profileFile = uploadedFiles.profile_image[0];
            try {
                const fileExtension = path.extname(profileFile.originalname);
                const fileName = `vendors/temp_${Date.now()}${fileExtension}`;
                // Upload to S3
                const uploadParams = {
                    Bucket: BUCKET_NAME,
                    Key: fileName,
                    Body: profileFile.buffer,
                    ContentType: profileFile.mimetype,
                };
                await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
                profileImageUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
            }
            catch (uploadError) {
                console.error('Profile image upload error:', uploadError);
                res.status(500).json({
                    success: false,
                    message: 'Failed to upload profile image'
                });
                return;
            }
        }
        const insertQuery = `
      INSERT INTO vendors (
        user_type_id, category_id, name, full_name, business_name, email, mobile, password,
        address1, city, state, pincode, years_of_experience, languages,
        working_hours_from, working_hours_to, willing_to_travel, short_bio, profile_picture_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `;
        const result = await query(insertQuery, [
            vendorUserType[0].id,
            categoryIdNum,
            full_name, // Using full_name for both name and full_name
            full_name,
            business_name || null,
            email,
            phone, // mobile field
            hashedPassword,
            address || null, // address1 field
            city || null,
            state || null,
            pincode || null,
            years_of_experience ? parseInt(years_of_experience.toString()) : 0,
            languages ? JSON.stringify(languages.split(',').map(lang => lang.trim())) : null,
            working_hours_from || null,
            working_hours_to || null,
            (typeof willing_to_travel === 'string' && willing_to_travel === 'true') || willing_to_travel === true ? 1 : 0,
            short_bio || null,
            profileImageUrl
        ]);
        const vendorId = result.insertId;
        // Update S3 file path with vendor ID if image was uploaded
        if (profileImageUrl && uploadedFiles && uploadedFiles.profile_image && uploadedFiles.profile_image[0]) {
            const profileFile = uploadedFiles.profile_image[0];
            try {
                const fileExtension = path.extname(profileFile.originalname);
                const newFileName = `vendors/${vendorId}/profile_${Date.now()}${fileExtension}`;
                // Copy to new location
                await s3Client.send(new client_s3_1.PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: newFileName,
                    Body: profileFile.buffer,
                    ContentType: profileFile.mimetype,
                }));
                const finalImageUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFileName}`;
                // Update database with final URL
                await query("UPDATE vendors SET profile_picture_url = ? WHERE id = ?", [finalImageUrl, vendorId]);
                // Delete temporary file
                try {
                    const oldKey = profileImageUrl.split('.amazonaws.com/')[1];
                    await s3Client.send(new client_s3_1.DeleteObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: oldKey
                    }));
                }
                catch (deleteError) {
                    console.error('Error deleting temporary file:', deleteError);
                }
                profileImageUrl = finalImageUrl;
            }
            catch (moveError) {
                console.error('Error moving uploaded file:', moveError);
            }
        }
        let createdBankDetails = [];
        let createdServices = [];
        let createdDocuments = [];
        // Insert Bank Details if provided
        if (bank_details && bank_details.length > 0) {
            for (let i = 0; i < bank_details.length; i++) {
                const bankDetail = bank_details[i];
                // Validate required bank detail fields
                if (!bankDetail.account_holder_name || !bankDetail.account_number || !bankDetail.ifsc_code || !bankDetail.bank_name) {
                    res.status(400).json({
                        success: false,
                        message: `Bank detail ${i + 1}: Account Holder Name, Account Number, IFSC Code, and Bank Name are required`
                    });
                    return;
                }
                // If this is the first bank detail or explicitly marked as primary, make it primary
                const isPrimary = i === 0 || bankDetail.is_primary;
                // If setting as primary, unset other primary accounts
                if (isPrimary && i > 0) {
                    await query('UPDATE vendor_bank_details SET is_primary = FALSE WHERE vendor_id = ?', [vendorId]);
                }
                const bankInsertQuery = `
          INSERT INTO vendor_bank_details
          (vendor_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, upi_id, is_primary, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `;
                const bankResult = await query(bankInsertQuery, [
                    vendorId,
                    bankDetail.account_holder_name,
                    bankDetail.account_number,
                    bankDetail.ifsc_code,
                    bankDetail.bank_name,
                    bankDetail.branch_name || null,
                    bankDetail.account_type || 'savings',
                    bankDetail.upi_id || null,
                    isPrimary
                ]);
                createdBankDetails.push(Object.assign(Object.assign({ id: bankResult.insertId }, bankDetail), { is_primary: isPrimary, status: 'active' }));
            }
        }
        // Insert Services if provided
        if (services && services.length > 0) {
            for (let i = 0; i < services.length; i++) {
                const service = services[i];
                // Validate required service fields
                if (!service.service_name || !service.duration || !service.price) {
                    res.status(400).json({
                        success: false,
                        message: `Service ${i + 1}: Service Name, Duration, and Price are required`
                    });
                    return;
                }
                // Validate duration and price are positive numbers
                if (service.duration <= 0 || service.price <= 0) {
                    res.status(400).json({
                        success: false,
                        message: `Service ${i + 1}: Duration and Price must be positive numbers`
                    });
                    return;
                }
                const serviceInsertQuery = `
          INSERT INTO vendor_services (
            vendor_id, service_name, description, duration, price,
            currency_id, category, category_id, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `;
                const serviceResult = await query(serviceInsertQuery, [
                    vendorId,
                    service.service_name,
                    service.description || null,
                    service.duration,
                    service.price,
                    service.currency_id || 1,
                    service.category || null,
                    service.category_id || null
                ]);
                createdServices.push(Object.assign(Object.assign({ id: serviceResult.insertId }, service), { currency_id: service.currency_id || 1, status: 'active' }));
            }
        }
        // Insert Documents with file uploads if provided
        if (documents && documents.length > 0) {
            for (let i = 0; i < documents.length; i++) {
                const document = documents[i];
                // Validate required document fields
                if (!document.document_name || !document.document_type) {
                    res.status(400).json({
                        success: false,
                        message: `Document ${i + 1}: Document Name and Document Type are required`
                    });
                    return;
                }
                let documentUrl = null;
                let fileSize = null;
                // Check if there's a corresponding file upload
                const documentFileField = `document_file_${i}`;
                console.log(`Checking for document file field: ${documentFileField}`, uploadedFiles ? Object.keys(uploadedFiles) : 'No files'); // Debug log
                if (uploadedFiles && uploadedFiles[documentFileField] && uploadedFiles[documentFileField][0]) {
                    const documentFile = uploadedFiles[documentFileField][0];
                    try {
                        const fileExtension = path.extname(documentFile.originalname);
                        const fileName = `vendors/${vendorId}/documents/${document.document_type}_${Date.now()}_${i}${fileExtension}`;
                        // Upload to S3
                        const uploadParams = {
                            Bucket: BUCKET_NAME,
                            Key: fileName,
                            Body: documentFile.buffer,
                            ContentType: documentFile.mimetype,
                        };
                        await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
                        documentUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
                        fileSize = documentFile.size;
                    }
                    catch (uploadError) {
                        console.error(`Document ${i + 1} upload error:`, uploadError);
                        res.status(500).json({
                            success: false,
                            message: `Failed to upload document ${i + 1}: ${document.document_name}`
                        });
                        return;
                    }
                }
                const documentInsertQuery = `
          INSERT INTO vendor_documents
          (vendor_id, document_name, document_type, document_number, document_url, file_size, status)
          VALUES (?, ?, ?, ?, ?, ?, 'active')
        `;
                const documentResult = await query(documentInsertQuery, [
                    vendorId,
                    document.document_name,
                    document.document_type,
                    document.document_number || null,
                    documentUrl,
                    fileSize
                ]);
                createdDocuments.push(Object.assign(Object.assign({ id: documentResult.insertId }, document), { document_url: documentUrl, file_size: fileSize, status: 'active' }));
            }
        }
        // Generate JWT token
        const token = jwt.sign({
            id: vendorId,
            email: email,
            user_type: 'vendor',
            user_type_id: vendorUserType[0].id
        }, process.env.JWT_SECRET_KEY || 'your-secret-key', { expiresIn: '7d' });
        // Get complete vendor details with category info
        const createdVendor = await query(`
      SELECT
        v.*,
        vc.title as category_name,
        vc.description as category_description
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      WHERE v.id = ?
    `, [vendorId]);
        // Remove password from response
        const vendorData = Object.assign({}, createdVendor[0]);
        delete vendorData.password;
        res.status(201).json({
            success: true,
            message: "Vendor account created successfully",
            data: {
                vendor: vendorData,
                bank_details: createdBankDetails,
                services: createdServices,
                documents: createdDocuments,
                token: token
            }
        });
    }
    catch (error) {
        console.error("Error creating vendor account:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.vendorSignup = vendorSignup;
// Vendor Login
const vendorLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        // Validate required fields
        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
            return;
        }
        // Find vendor by email with plan details
        const vendor = await query(`
      SELECT
        v.*,
        vc.title as category_name,
        vc.description as category_description,
        vsp.id as plan_id,
        vsp.plan_name,
        vsp.plan_description,
        vsp.monthly_price,
        vsp.features as plan_features,
        vs.subscription_start_date,
        vs.subscription_end_date,
        vs.status as subscription_status,
        vs.auto_renewal,
        vs.next_billing_date
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      LEFT JOIN vendor_subscription_plans vsp ON v.current_plan_id = vsp.id
      LEFT JOIN vendor_subscriptions vs ON v.id = vs.vendor_id AND vs.status = 'active'
      WHERE v.email = ?
    `, [email]);
        if (vendor.length === 0) {
            res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
            return;
        }
        const vendorData = vendor[0];
        // Note: Removed status check to allow login for all statuses
        // Frontend will handle different statuses based on the returned status value
        // Verify password
        const isPasswordValid = await bcrypt.compare(password, vendorData.password);
        if (!isPasswordValid) {
            res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
            return;
        }
        // Generate JWT token
        const token = jwt.sign({
            id: vendorData.id,
            email: vendorData.email,
            user_type: 'vendor',
            user_type_id: vendorData.user_type_id
        }, process.env.JWT_SECRET_KEY || 'your-secret-key', { expiresIn: '7d' });
        // Get menu permissions for the vendor user type
        const menuPermissions = await query(`SELECT 
        mm.id as menu_id,
        mm.menu_name,
        mm.menu_slug,
        mm.menu_icon,
        mm.parent_id,
        mm.sort_order,
        mm.route_path,
        mm.is_active as menu_active,
        rmp.can_view,
        rmp.can_create,
        rmp.can_edit,
        rmp.can_delete
       FROM menu_master mm
       INNER JOIN role_menu_permissions rmp ON mm.id = rmp.menu_id
       WHERE rmp.role_id = ? AND mm.is_active = 1 AND rmp.can_view = 1
       ORDER BY mm.parent_id ASC, mm.sort_order ASC`, [vendorData.user_type_id]);
        // Organize menus in hierarchical structure
        const organizeMenus = (menus) => {
            const menuMap = new Map();
            const rootMenus = [];
            // First pass: create menu objects
            menus.forEach(menu => {
                menuMap.set(menu.menu_id, {
                    id: menu.menu_id,
                    menu_name: menu.menu_name,
                    menu_slug: menu.menu_slug,
                    menu_icon: menu.menu_icon,
                    parent_id: menu.parent_id,
                    sort_order: menu.sort_order,
                    route_path: menu.route_path,
                    permissions: {
                        can_view: menu.can_view,
                        can_create: menu.can_create,
                        can_edit: menu.can_edit,
                        can_delete: menu.can_delete
                    },
                    children: []
                });
            });
            // Second pass: organize hierarchy
            menuMap.forEach(menu => {
                if (menu.parent_id === null || menu.parent_id === 0) {
                    rootMenus.push(menu);
                }
                else {
                    const parent = menuMap.get(menu.parent_id);
                    if (parent) {
                        parent.children.push(menu);
                    }
                }
            });
            return rootMenus;
        };
        const organizedMenus = organizeMenus(menuPermissions);
        // Remove password from response
        delete vendorData.password;
        // Prepare plan details for self-registered vendors
        let planDetails = null;
        if (vendorData.created_by_admin === 0 && vendorData.plan_id) {
            planDetails = {
                plan_id: vendorData.plan_id,
                plan_name: vendorData.plan_name,
                plan_description: vendorData.plan_description,
                monthly_price: vendorData.monthly_price,
                features: vendorData.plan_features ? JSON.parse(vendorData.plan_features) : [],
                subscription: {
                    start_date: vendorData.subscription_start_date,
                    end_date: vendorData.subscription_end_date,
                    status: vendorData.subscription_status,
                    auto_renewal: vendorData.auto_renewal,
                    next_billing_date: vendorData.next_billing_date,
                    days_remaining: vendorData.subscription_end_date ?
                        Math.ceil((new Date(vendorData.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null
                }
            };
        }
        // Clean up plan-related fields from vendor data
        delete vendorData.plan_id;
        delete vendorData.plan_name;
        delete vendorData.plan_description;
        delete vendorData.monthly_price;
        delete vendorData.plan_features;
        delete vendorData.subscription_start_date;
        delete vendorData.subscription_end_date;
        delete vendorData.subscription_status;
        delete vendorData.auto_renewal;
        delete vendorData.next_billing_date;
        // Get vendor's bank details
        const bankDetails = await query(`
      SELECT * FROM vendor_bank_details 
      WHERE vendor_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at DESC
    `, [vendorData.id]);
        // Get vendor's services
        const services = await query(`
      SELECT
        vs.*,
        cm.currency_name,
        cm.symbol as currency_symbol
      FROM vendor_services vs
      LEFT JOIN currency_master cm ON vs.currency_id = cm.id
      WHERE vs.vendor_id = ? AND vs.status = 'active'
      ORDER BY vs.created_at DESC
    `, [vendorData.id]);
        // Get vendor's documents
        const documents = await query(`
      SELECT * FROM vendor_documents 
      WHERE vendor_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `, [vendorData.id]);
        res.json({
            success: true,
            message: "Login successful",
            data: {
                vendor: Object.assign(Object.assign({}, vendorData), { created_by: vendorData.created_by_admin === 1 ? 'admin' : 'self' }),
                plan_details: planDetails, // Only included for self-registered vendors
                bank_details: bankDetails,
                services: services,
                documents: documents,
                token: token,
                menus: organizedMenus,
                permissions_summary: {
                    total_menus: menuPermissions.length,
                    viewable_menus: menuPermissions.filter(m => m.can_view).length,
                    editable_menus: menuPermissions.filter(m => m.can_edit).length,
                    creatable_menus: menuPermissions.filter(m => m.can_create).length,
                    deletable_menus: menuPermissions.filter(m => m.can_delete).length
                },
                account_status: {
                    status: vendorData.status,
                    is_active: vendorData.status === 'active',
                    is_pending: vendorData.status === 'pending',
                    is_suspended: vendorData.status === 'suspended',
                    is_rejected: vendorData.status === 'rejected',
                    status_message: getStatusMessage(vendorData.status)
                }
            }
        });
    }
    catch (error) {
        console.error("Error during vendor login:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.vendorLogin = vendorLogin;
// Get Vendor Profile (After Login)
const getVendorProfile = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const vendorQuery = `
      SELECT
        v.*,
        vc.title as category_name,
        vc.description as category_description,
        vsp.id as plan_id,
        vsp.plan_name,
        vsp.plan_description,
        vsp.monthly_price,
        vsp.features as plan_features,
        vs.subscription_start_date,
        vs.subscription_end_date,
        vs.status as subscription_status,
        vs.auto_renewal,
        vs.next_billing_date
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      LEFT JOIN vendor_subscription_plans vsp ON v.current_plan_id = vsp.id
      LEFT JOIN vendor_subscriptions vs ON v.id = vs.vendor_id AND vs.status = 'active'
      WHERE v.id = ?
    `;
        const vendor = await query(vendorQuery, [vendorId]);
        if (vendor.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor profile not found"
            });
            return;
        }
        // Remove password from response
        const vendorData = Object.assign({}, vendor[0]);
        delete vendorData.password;
        // Prepare plan details for self-registered vendors
        let planDetails = null;
        if (vendorData.created_by_admin === 0 && vendorData.plan_id) {
            planDetails = {
                plan_id: vendorData.plan_id,
                plan_name: vendorData.plan_name,
                plan_description: vendorData.plan_description,
                monthly_price: vendorData.monthly_price,
                features: vendorData.plan_features ? JSON.parse(vendorData.plan_features) : [],
                subscription: {
                    start_date: vendorData.subscription_start_date,
                    end_date: vendorData.subscription_end_date,
                    status: vendorData.subscription_status,
                    auto_renewal: vendorData.auto_renewal,
                    next_billing_date: vendorData.next_billing_date,
                    days_remaining: vendorData.subscription_end_date ?
                        Math.ceil((new Date(vendorData.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : null
                }
            };
        }
        // Clean up plan-related fields from vendor data
        delete vendorData.plan_id;
        delete vendorData.plan_name;
        delete vendorData.plan_description;
        delete vendorData.monthly_price;
        delete vendorData.plan_features;
        delete vendorData.subscription_start_date;
        delete vendorData.subscription_end_date;
        delete vendorData.subscription_status;
        delete vendorData.auto_renewal;
        delete vendorData.next_billing_date;
        // Get vendor's bank details
        const bankDetails = await query(`
      SELECT * FROM vendor_bank_details 
      WHERE vendor_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at DESC
    `, [vendorId]);
        // Get vendor's services
        const services = await query(`
      SELECT
        vs.*,
        cm.currency_name,
        cm.symbol as currency_symbol
      FROM vendor_services vs
      LEFT JOIN currency_master cm ON vs.currency_id = cm.id
      WHERE vs.vendor_id = ? AND vs.status = 'active'
      ORDER BY vs.created_at DESC
    `, [vendorId]);
        // Get vendor's documents
        const documents = await query(`
      SELECT * FROM vendor_documents 
      WHERE vendor_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `, [vendorId]);
        res.json({
            success: true,
            data: {
                vendor: Object.assign(Object.assign({}, vendorData), { created_by: vendorData.created_by_admin === 1 ? 'admin' : 'self' }),
                plan_details: planDetails, // Only included for self-registered vendors
                bank_details: bankDetails,
                services: services,
                documents: documents
            }
        });
    }
    catch (error) {
        console.error("Error fetching vendor profile:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorProfile = getVendorProfile;
// Update Vendor Profile (After Login)
const updateVendorProfile = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { category_id, full_name, business_name, phone, address, city, state, pincode, years_of_experience, languages, working_hours_from, working_hours_to, willing_to_travel, short_bio } = req.body;
        // Check if vendor exists
        const existingVendor = await query("SELECT id, profile_picture_url, email FROM vendors WHERE id = ?", [vendorId]);
        if (existingVendor.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
            return;
        }
        // Check if category exists (if provided)
        if (category_id) {
            const categoryIdNum = parseInt(category_id);
            if (isNaN(categoryIdNum)) {
                res.status(400).json({
                    success: false,
                    message: "Invalid category ID"
                });
                return;
            }
            const categoryExists = await query("SELECT id FROM vendor_categories WHERE id = ? AND status = 1", [categoryIdNum]);
            if (categoryExists.length === 0) {
                res.status(400).json({
                    success: false,
                    message: "Invalid category ID"
                });
                return;
            }
        }
        let profileImageUrl = existingVendor[0].profile_picture_url;
        // Handle profile image upload if file is provided
        if (req.file) {
            try {
                const fileExtension = path.extname(req.file.originalname);
                const fileName = `vendors/${vendorId}/profile_${Date.now()}${fileExtension}`;
                // Upload to S3
                const uploadParams = {
                    Bucket: BUCKET_NAME,
                    Key: fileName,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                };
                await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
                profileImageUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
                // Delete old image from S3 if exists
                if (existingVendor[0].profile_picture_url) {
                    try {
                        const oldKey = existingVendor[0].profile_picture_url.split('.amazonaws.com/')[1];
                        await s3Client.send(new client_s3_1.DeleteObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: oldKey
                        }));
                    }
                    catch (deleteError) {
                        console.error('Error deleting old image:', deleteError);
                    }
                }
            }
            catch (uploadError) {
                console.error('Profile image upload error:', uploadError);
                res.status(500).json({
                    success: false,
                    message: 'Failed to upload profile image'
                });
                return;
            }
        }
        const updateQuery = `
      UPDATE vendors SET
        category_id = COALESCE(?, category_id),
        name = COALESCE(?, name),
        full_name = COALESCE(?, full_name),
        business_name = COALESCE(?, business_name),
        mobile = COALESCE(?, mobile),
        address1 = COALESCE(?, address1),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        pincode = COALESCE(?, pincode),
        years_of_experience = COALESCE(?, years_of_experience),
        languages = COALESCE(?, languages),
        working_hours_from = COALESCE(?, working_hours_from),
        working_hours_to = COALESCE(?, working_hours_to),
        willing_to_travel = COALESCE(?, willing_to_travel),
        short_bio = COALESCE(?, short_bio),
        profile_picture_url = COALESCE(?, profile_picture_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
        await query(updateQuery, [
            category_id ? parseInt(category_id) : null,
            full_name, // name field
            full_name, // full_name field
            business_name,
            phone, // mobile field
            address, // address1 field
            city,
            state,
            pincode,
            years_of_experience ? parseInt(years_of_experience) : null,
            languages ? (typeof languages === 'string' ? JSON.stringify(languages.split(',').map(lang => lang.trim())) : JSON.stringify(languages)) : null,
            working_hours_from,
            working_hours_to,
            willing_to_travel !== undefined ? (willing_to_travel === 'true' || willing_to_travel === true ? 1 : 0) : null,
            short_bio,
            profileImageUrl,
            vendorId
        ]);
        // Get updated vendor
        const updatedVendor = await query(`
      SELECT v.*, vc.title as category_name, vc.description as category_description
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      WHERE v.id = ?
    `, [vendorId]);
        // Remove password from response
        const vendorData = Object.assign({}, updatedVendor[0]);
        delete vendorData.password;
        // Get vendor's bank details
        const bankDetails = await query(`
      SELECT * FROM vendor_bank_details 
      WHERE vendor_id = ? AND status = 'active'
      ORDER BY is_primary DESC, created_at DESC
    `, [vendorId]);
        // Get vendor's services
        const services = await query(`
      SELECT
        vs.*,
        cm.currency_name,
        cm.symbol as currency_symbol
      FROM vendor_services vs
      LEFT JOIN currency_master cm ON vs.currency_id = cm.id
      WHERE vs.vendor_id = ? AND vs.status = 'active'
      ORDER BY vs.created_at DESC
    `, [vendorId]);
        // Get vendor's documents
        const documents = await query(`
      SELECT * FROM vendor_documents 
      WHERE vendor_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `, [vendorId]);
        res.json({
            success: true,
            message: "Profile updated successfully",
            data: {
                vendor: vendorData,
                bank_details: bankDetails,
                services: services,
                documents: documents
            }
        });
    }
    catch (error) {
        console.error("Error updating vendor profile:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.updateVendorProfile = updateVendorProfile;
// Get Vendor Categories (Public - for signup form)
const getVendorCategoriesPublic = async (req, res) => {
    try {
        const categoriesQuery = `
      SELECT id, title, description
      FROM vendor_categories
      WHERE status = 1
      ORDER BY title ASC
    `;
        const categories = await query(categoriesQuery, []);
        res.json({
            success: true,
            data: categories
        });
    }
    catch (error) {
        console.error("Error fetching vendor categories:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorCategoriesPublic = getVendorCategoriesPublic;
// ============ VENDOR BANK DETAILS MANAGEMENT (SELF) ============
// Get vendor's own bank details
const getMyBankDetails = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const bankDetailsQuery = `
      SELECT * FROM vendor_bank_details 
      WHERE vendor_id = ? 
      ORDER BY is_primary DESC, created_at DESC
    `;
        const bankDetails = await query(bankDetailsQuery, [vendorId]);
        res.json({
            success: true,
            data: bankDetails
        });
    }
    catch (error) {
        console.error('Error fetching vendor bank details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.getMyBankDetails = getMyBankDetails;
// Add new bank detail
const addBankDetail = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type = 'savings', upi_id, is_primary = false } = req.body;
        if (!account_holder_name || !account_number || !ifsc_code || !bank_name) {
            res.status(400).json({
                success: false,
                message: 'Account Holder Name, Account Number, IFSC Code, and Bank Name are required'
            });
            return;
        }
        // If setting as primary, unset other primary accounts
        if (is_primary) {
            await query('UPDATE vendor_bank_details SET is_primary = FALSE WHERE vendor_id = ?', [vendorId]);
        }
        const insertQuery = `
      INSERT INTO vendor_bank_details
      (vendor_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, upi_id, is_primary, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `;
        const result = await query(insertQuery, [
            vendorId, account_holder_name, account_number, ifsc_code, bank_name,
            branch_name, account_type, upi_id, is_primary
        ]);
        res.status(201).json({
            success: true,
            message: 'Bank details added successfully',
            data: {
                id: result.insertId,
                vendor_id: vendorId,
                account_holder_name,
                account_number,
                ifsc_code,
                bank_name,
                branch_name,
                account_type,
                upi_id,
                is_primary,
                status: 'active'
            }
        });
    }
    catch (error) {
        console.error('Error adding bank details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.addBankDetail = addBankDetail;
// Update bank detail
const updateBankDetail = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params;
        const { account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, upi_id, is_primary } = req.body;
        // Check if bank detail belongs to this vendor
        const existingBankDetail = await query('SELECT * FROM vendor_bank_details WHERE id = ? AND vendor_id = ?', [id, vendorId]);
        if (existingBankDetail.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Bank details not found'
            });
            return;
        }
        // If setting as primary, unset other primary accounts for this vendor
        if (is_primary === true) {
            await query('UPDATE vendor_bank_details SET is_primary = FALSE WHERE vendor_id = ? AND id != ?', [vendorId, id]);
        }
        const updateQuery = `
      UPDATE vendor_bank_details SET
        account_holder_name = COALESCE(?, account_holder_name),
        account_number = COALESCE(?, account_number),
        ifsc_code = COALESCE(?, ifsc_code),
        bank_name = COALESCE(?, bank_name),
        branch_name = COALESCE(?, branch_name),
        account_type = COALESCE(?, account_type),
        upi_id = COALESCE(?, upi_id),
        is_primary = COALESCE(?, is_primary),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND vendor_id = ?
    `;
        await query(updateQuery, [
            account_holder_name, account_number, ifsc_code, bank_name,
            branch_name, account_type, upi_id, is_primary, id, vendorId
        ]);
        const updatedBankDetail = await query('SELECT * FROM vendor_bank_details WHERE id = ? AND vendor_id = ?', [id, vendorId]);
        res.json({
            success: true,
            message: 'Bank details updated successfully',
            data: updatedBankDetail[0]
        });
    }
    catch (error) {
        console.error('Error updating bank details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.updateBankDetail = updateBankDetail;
// Delete bank detail
const deleteBankDetail = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params;
        // Check if bank detail belongs to this vendor
        const existingBankDetail = await query('SELECT id, account_holder_name FROM vendor_bank_details WHERE id = ? AND vendor_id = ?', [id, vendorId]);
        if (existingBankDetail.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Bank details not found'
            });
            return;
        }
        // Soft delete - set status to inactive
        await query('UPDATE vendor_bank_details SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND vendor_id = ?', ['inactive', id, vendorId]);
        res.json({
            success: true,
            message: `Bank details for '${existingBankDetail[0].account_holder_name}' deleted successfully`
        });
    }
    catch (error) {
        console.error('Error deleting bank details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.deleteBankDetail = deleteBankDetail;
// ============ VENDOR SERVICES MANAGEMENT (SELF) ============
// Get vendor's own services
const getMyServices = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const servicesQuery = `
      SELECT
        vs.*,
        cm.currency_name,
        cm.symbol as currency_symbol
      FROM vendor_services vs
      LEFT JOIN currency_master cm ON vs.currency_id = cm.id
      WHERE vs.vendor_id = ? AND vs.status = 'active'
      ORDER BY vs.created_at DESC
    `;
        const services = await query(servicesQuery, [vendorId]);
        res.json({
            success: true,
            data: services
        });
    }
    catch (error) {
        console.error('Error fetching vendor services:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.getMyServices = getMyServices;
// Add new service
const addService = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { service_name, description, duration, price, currency_id, category, category_id } = req.body;
        if (!service_name || !duration || !price) {
            res.status(400).json({
                success: false,
                message: 'Service Name, Duration, and Price are required'
            });
            return;
        }
        if (duration <= 0 || price <= 0) {
            res.status(400).json({
                success: false,
                message: 'Duration and Price must be positive numbers'
            });
            return;
        }
        const insertQuery = `
      INSERT INTO vendor_services (
        vendor_id, service_name, description, duration, price,
        currency_id, category, category_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `;
        const result = await query(insertQuery, [
            vendorId,
            service_name,
            description || null,
            duration,
            price,
            currency_id || 1,
            category || null,
            category_id || null
        ]);
        res.status(201).json({
            success: true,
            message: 'Service added successfully',
            data: {
                id: result.insertId,
                vendor_id: vendorId,
                service_name,
                description: description || null,
                duration,
                price,
                currency_id: currency_id || 1,
                category: category || null,
                category_id: category_id || null,
                status: 'active'
            }
        });
    }
    catch (error) {
        console.error('Error adding service:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.addService = addService;
// Update service
const updateService = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params;
        const { service_name, description, duration, price, currency_id, category, category_id, status } = req.body;
        // Check if service belongs to this vendor
        const existingService = await query('SELECT * FROM vendor_services WHERE id = ? AND vendor_id = ?', [id, vendorId]);
        if (existingService.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Service not found'
            });
            return;
        }
        if (duration !== undefined && duration <= 0) {
            res.status(400).json({
                success: false,
                message: 'Duration must be a positive number'
            });
            return;
        }
        if (price !== undefined && price <= 0) {
            res.status(400).json({
                success: false,
                message: 'Price must be a positive number'
            });
            return;
        }
        const updateQuery = `
      UPDATE vendor_services SET
        service_name = COALESCE(?, service_name),
        description = COALESCE(?, description),
        duration = COALESCE(?, duration),
        price = COALESCE(?, price),
        currency_id = COALESCE(?, currency_id),
        category = COALESCE(?, category),
        category_id = COALESCE(?, category_id),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND vendor_id = ?
    `;
        await query(updateQuery, [
            service_name, description, duration, price, currency_id,
            category, category_id, status, id, vendorId
        ]);
        const updatedService = await query(`SELECT vs.*, cm.currency_name, cm.symbol as currency_symbol
       FROM vendor_services vs
       LEFT JOIN currency_master cm ON vs.currency_id = cm.id
       WHERE vs.id = ? AND vs.vendor_id = ?`, [id, vendorId]);
        res.json({
            success: true,
            message: 'Service updated successfully',
            data: updatedService[0]
        });
    }
    catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.updateService = updateService;
// Delete service
const deleteService = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params;
        // Check if service belongs to this vendor
        const existingService = await query('SELECT id, service_name FROM vendor_services WHERE id = ? AND vendor_id = ?', [id, vendorId]);
        if (existingService.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Service not found'
            });
            return;
        }
        // Soft delete - set status to inactive
        await query('UPDATE vendor_services SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND vendor_id = ?', ['inactive', id, vendorId]);
        res.json({
            success: true,
            message: `Service '${existingService[0].service_name}' deleted successfully`
        });
    }
    catch (error) {
        console.error('Error deleting service:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.deleteService = deleteService;
// ============ VENDOR DOCUMENTS MANAGEMENT (SELF) ============
// Get vendor's own documents
const getMyDocuments = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const documentsQuery = `
      SELECT * FROM vendor_documents 
      WHERE vendor_id = ? 
      ORDER BY created_at DESC
    `;
        const documents = await query(documentsQuery, [vendorId]);
        res.json({
            success: true,
            data: documents
        });
    }
    catch (error) {
        console.error('Error fetching vendor documents:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.getMyDocuments = getMyDocuments;
// Add new document
const addDocument = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { document_name, document_type, document_number } = req.body;
        if (!document_name || !document_type) {
            res.status(400).json({
                success: false,
                message: 'Document Name and Document Type are required'
            });
            return;
        }
        let documentUrl = null;
        let fileSize = null;
        // Handle document upload if file is provided
        if (req.file) {
            try {
                const fileExtension = path.extname(req.file.originalname);
                const fileName = `vendors/${vendorId}/documents/${document_type}_${Date.now()}${fileExtension}`;
                // Upload to S3
                const uploadParams = {
                    Bucket: BUCKET_NAME,
                    Key: fileName,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                };
                await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
                documentUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
                fileSize = req.file.size;
            }
            catch (uploadError) {
                console.error('Document upload error:', uploadError);
                res.status(500).json({
                    success: false,
                    message: 'Failed to upload document'
                });
                return;
            }
        }
        const insertQuery = `
      INSERT INTO vendor_documents
      (vendor_id, document_name, document_type, document_number, document_url, file_size, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `;
        const result = await query(insertQuery, [
            vendorId, document_name, document_type, document_number, documentUrl, fileSize
        ]);
        res.status(201).json({
            success: true,
            message: 'Document added successfully',
            data: {
                id: result.insertId,
                vendor_id: vendorId,
                document_name,
                document_type,
                document_number,
                document_url: documentUrl,
                file_size: fileSize,
                status: 'active'
            }
        });
    }
    catch (error) {
        console.error('Error adding document:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.addDocument = addDocument;
// Update document
const updateDocument = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params;
        const { document_name, document_type, document_number, status } = req.body;
        // Check if document belongs to this vendor
        const existingDocument = await query('SELECT * FROM vendor_documents WHERE id = ? AND vendor_id = ?', [id, vendorId]);
        if (existingDocument.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Document not found'
            });
            return;
        }
        let documentUrl = existingDocument[0].document_url;
        let fileSize = existingDocument[0].file_size;
        // Handle document upload if file is provided
        if (req.file) {
            try {
                const fileExtension = path.extname(req.file.originalname);
                const fileName = `vendors/${vendorId}/documents/${document_type || existingDocument[0].document_type}_${Date.now()}${fileExtension}`;
                // Upload to S3
                const uploadParams = {
                    Bucket: BUCKET_NAME,
                    Key: fileName,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                };
                await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
                documentUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
                fileSize = req.file.size;
                // Delete old document from S3 if exists
                if (existingDocument[0].document_url) {
                    try {
                        const oldKey = existingDocument[0].document_url.split('.amazonaws.com/')[1];
                        await s3Client.send(new client_s3_1.DeleteObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: oldKey
                        }));
                    }
                    catch (deleteError) {
                        console.error('Error deleting old document:', deleteError);
                    }
                }
            }
            catch (uploadError) {
                console.error('Document upload error:', uploadError);
                res.status(500).json({
                    success: false,
                    message: 'Failed to upload document'
                });
                return;
            }
        }
        const updateQuery = `
      UPDATE vendor_documents SET
        document_name = COALESCE(?, document_name),
        document_type = COALESCE(?, document_type),
        document_number = COALESCE(?, document_number),
        document_url = COALESCE(?, document_url),
        file_size = COALESCE(?, file_size),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND vendor_id = ?
    `;
        await query(updateQuery, [
            document_name, document_type, document_number, documentUrl, fileSize, status, id, vendorId
        ]);
        const updatedDocument = await query('SELECT * FROM vendor_documents WHERE id = ? AND vendor_id = ?', [id, vendorId]);
        res.json({
            success: true,
            message: 'Document updated successfully',
            data: updatedDocument[0]
        });
    }
    catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.updateDocument = updateDocument;
// Delete document
const deleteDocument = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params;
        // Check if document belongs to this vendor
        const existingDocument = await query('SELECT id, document_name FROM vendor_documents WHERE id = ? AND vendor_id = ?', [id, vendorId]);
        if (existingDocument.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Document not found'
            });
            return;
        }
        // Soft delete - set status to inactive
        await query('UPDATE vendor_documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND vendor_id = ?', ['inactive', id, vendorId]);
        res.json({
            success: true,
            message: `Document '${existingDocument[0].document_name}' deleted successfully`
        });
    }
    catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.deleteDocument = deleteDocument;
// Multer configuration for single document upload
const documentUploadConfig = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        const allowedFormats = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
        if (allowedFormats.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Invalid file format. Only ${allowedFormats.join(', ')} are allowed.`));
        }
    },
});
// Get Vendor Menu Permissions
const getVendorMenuPermissions = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const userTypeId = req.user.user_type_id;
        if (!userTypeId) {
            res.status(400).json({
                success: false,
                message: 'User type information not found in token'
            });
            return;
        }
        // Get menu permissions for the vendor user type
        const menuPermissions = await query(`SELECT 
        mm.id as menu_id,
        mm.menu_name,
        mm.menu_slug,
        mm.menu_icon,
        mm.parent_id,
        mm.sort_order,
        mm.route_path,
        mm.is_active as menu_active,
        rmp.can_view,
        rmp.can_create,
        rmp.can_edit,
        rmp.can_delete
       FROM menu_master mm
       INNER JOIN role_menu_permissions rmp ON mm.id = rmp.menu_id
       WHERE rmp.role_id = ? AND mm.is_active = 1 AND rmp.can_view = 1
       ORDER BY mm.parent_id ASC, mm.sort_order ASC`, [userTypeId]);
        // Organize menus in hierarchical structure
        const organizeMenus = (menus) => {
            const menuMap = new Map();
            const rootMenus = [];
            // First pass: create menu objects
            menus.forEach(menu => {
                menuMap.set(menu.menu_id, {
                    id: menu.menu_id,
                    menu_name: menu.menu_name,
                    menu_slug: menu.menu_slug,
                    menu_icon: menu.menu_icon,
                    parent_id: menu.parent_id,
                    sort_order: menu.sort_order,
                    route_path: menu.route_path,
                    permissions: {
                        can_view: menu.can_view,
                        can_create: menu.can_create,
                        can_edit: menu.can_edit,
                        can_delete: menu.can_delete
                    },
                    children: []
                });
            });
            // Second pass: organize hierarchy
            menuMap.forEach(menu => {
                if (menu.parent_id === null || menu.parent_id === 0) {
                    rootMenus.push(menu);
                }
                else {
                    const parent = menuMap.get(menu.parent_id);
                    if (parent) {
                        parent.children.push(menu);
                    }
                }
            });
            return rootMenus;
        };
        const organizedMenus = organizeMenus(menuPermissions);
        res.status(200).json({
            success: true,
            message: 'Menu permissions retrieved successfully',
            data: {
                menus: organizedMenus,
                permissions_summary: {
                    total_menus: menuPermissions.length,
                    viewable_menus: menuPermissions.filter(m => m.can_view).length,
                    editable_menus: menuPermissions.filter(m => m.can_edit).length,
                    creatable_menus: menuPermissions.filter(m => m.can_create).length,
                    deletable_menus: menuPermissions.filter(m => m.can_delete).length
                }
            }
        });
    }
    catch (error) {
        console.error("Get Vendor Menu Permissions Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
exports.getVendorMenuPermissions = getVendorMenuPermissions;
exports.singleDocumentUpload = documentUploadConfig.single('document_file');
//# sourceMappingURL=VendorAuthController.js.map