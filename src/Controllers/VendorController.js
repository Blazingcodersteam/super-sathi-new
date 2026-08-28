"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVendorDocumentsByVendorId = exports.getVendorBankDetailsByVendorId = exports.getVendorServicesByVendorId = exports.deleteVendorService = exports.getVendorServiceById = exports.getAllVendorServices = exports.createVendorService = exports.deleteVendorDocument = exports.updateVendorDocument = exports.getVendorDocumentById = exports.getAllVendorDocuments = exports.createVendorDocument = exports.updateVendorService = exports.deleteVendorBankDetails = exports.updateVendorBankDetails = exports.getVendorBankDetailsById = exports.getAllVendorBankDetails = exports.createVendorBankDetails = exports.getVendorsByCategory = exports.getVendorCategories = exports.deleteVendorCategory = exports.updateVendorCategory = exports.getVendorCategoryById = exports.getAllVendorCategories = exports.createVendorCategory = exports.deleteVendor = exports.getVendorById = exports.getAllVendors = exports.updateVendor = exports.createVendor = exports.singleUpload = exports.singleDocumentUpload = void 0;
const utils = require("util");
const client_s3_1 = require("@aws-sdk/client-s3");
const multer = require("multer");
const path = require("path");
const queryHelpers_1 = require("../utils/queryHelpers");
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
const DOCUMENT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const DOCUMENT_ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];
// Multer configuration for documents
const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: DOCUMENT_MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        if (DOCUMENT_ALLOWED_FORMATS.includes(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error(`Invalid file format. Only ${DOCUMENT_ALLOWED_FORMATS.join(', ')} are allowed.`));
        }
    },
});
exports.singleDocumentUpload = documentUpload.single('document');
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "images-2025-new";
// Normalize document_url: if stored as a relative path, prepend the S3 base URL
const normalizeDocumentUrl = (url) => {
    if (!url)
        return null;
    if (url.startsWith('http://') || url.startsWith('https://'))
        return url;
    const region = process.env.AWS_REGION || 'ap-south-1';
    return `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${url.replace(/^\//, '')}`;
};
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
// Multer configuration
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
exports.singleUpload = upload.single('profile_image');
// Create vendor with profile image upload
const createVendor = async (req, res) => {
    try {
        const { category_id, full_name, business_name, email, phone, address, city, state, pincode, years_of_experience, languages, working_hours_from, working_hours_to, willing_to_travel, short_bio } = req.body;
        // Validate required fields
        if (!category_id || !full_name || !email || !phone) {
            res.status(400).json({
                success: false,
                message: "Category ID, Full Name, Email, and Phone are required"
            });
            return;
        }
        // Parse and validate category_id
        const categoryIdNum = parseInt(category_id);
        if (isNaN(categoryIdNum)) {
            res.status(400).json({
                success: false,
                message: "Invalid category ID"
            });
            return;
        }
        // Check if email already exists
        const existingVendor = await query("SELECT id FROM vendors WHERE email = ?", [email]);
        if (existingVendor.length > 0) {
            res.status(400).json({
                success: false,
                message: "Email already exists"
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
        let profileImageUrl = null;
        // Handle profile image upload if file is provided
        if (req.file) {
            try {
                const fileExtension = path.extname(req.file.originalname);
                const fileName = `vendors/temp_${Date.now()}${fileExtension}`;
                // Upload to S3
                const uploadParams = {
                    Bucket: BUCKET_NAME,
                    Key: fileName,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
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
        category_id, name, full_name, business_name, email, mobile,
        address1, city, state, pincode, years_of_experience, languages,
        working_hours_from, working_hours_to, willing_to_travel, short_bio, 
        profile_picture_url, created_by_admin, payment_required, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'active')
    `;
        const result = await query(insertQuery, [
            categoryIdNum,
            full_name, // Using full_name for both name and full_name
            full_name,
            business_name || null,
            email,
            phone, // mobile field
            address || null, // address1 field
            city || null,
            state || null,
            pincode || null,
            years_of_experience ? parseInt(years_of_experience) : 0,
            languages ? JSON.stringify(languages.split(',').map(lang => lang.trim())) : null,
            working_hours_from || null,
            working_hours_to || null,
            willing_to_travel === 'true' || willing_to_travel === true ? 1 : 0,
            short_bio || null,
            profileImageUrl
            // created_by_admin = 1, payment_required = 0, status = 'active' are set in query
        ]);
        // Update S3 file path with vendor ID if image was uploaded
        if (profileImageUrl && req.file) {
            try {
                const fileExtension = path.extname(req.file.originalname);
                const newFileName = `vendors/${result.insertId}/profile_${Date.now()}${fileExtension}`;
                // Copy to new location
                const copyParams = {
                    Bucket: BUCKET_NAME,
                    CopySource: `${BUCKET_NAME}/${profileImageUrl.split('.amazonaws.com/')[1]}`,
                    Key: newFileName,
                };
                await s3Client.send(new client_s3_1.PutObjectCommand(Object.assign(Object.assign({}, copyParams), { Body: req.file.buffer, ContentType: req.file.mimetype })));
                const finalImageUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${newFileName}`;
                // Update database with final URL
                await query("UPDATE vendors SET profile_picture_url = ? WHERE id = ?", [finalImageUrl, result.insertId]);
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
        // Get complete vendor details with category info
        const createdVendor = await query(`
      SELECT
        v.*,
        vc.title as category_name,
        vc.description as category_description
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      WHERE v.id = ?
    `, [result.insertId]);
        res.status(201).json({
            success: true,
            message: "Vendor created successfully",
            data: createdVendor[0]
        });
    }
    catch (error) {
        console.error("Error creating vendor:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.createVendor = createVendor;
// Update vendor
const updateVendor = async (req, res) => {
    try {
        const { id } = req.params;
        const { category_id, full_name, business_name, email, phone, address, city, state, pincode, years_of_experience, languages, working_hours_from, working_hours_to, willing_to_travel, short_bio, status } = req.body;
        // Check if vendor exists
        const existingVendor = await query("SELECT id, profile_picture_url FROM vendors WHERE id = ?", [id]);
        if (existingVendor.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
            return;
        }
        // Check if email already exists for other vendors
        if (email) {
            const emailExists = await query("SELECT id FROM vendors WHERE email = ? AND id != ?", [email, id]);
            if (emailExists.length > 0) {
                res.status(400).json({
                    success: false,
                    message: "Email already exists"
                });
                return;
            }
        }
        // Check if category exists
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
                const fileName = `vendors/${id}/profile_${Date.now()}${fileExtension}`;
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
        email = COALESCE(?, email),
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
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
        await query(updateQuery, [
            category_id ? parseInt(category_id) : null,
            full_name, // name field
            full_name, // full_name field
            business_name,
            email,
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
            status,
            id
        ]);
        // Get updated vendor
        const updatedVendor = await query(`
      SELECT v.*, vc.title as category_name
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      WHERE v.id = ?
    `, [id]);
        res.json({
            success: true,
            message: "Vendor updated successfully",
            data: updatedVendor[0]
        });
    }
    catch (error) {
        console.error("Error updating vendor:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.updateVendor = updateVendor;
// Get all vendors (including inactive by default)
const getAllVendors = async (req, res) => {
    try {
        const pageNum = (0, queryHelpers_1.getNumberParam)(req.query.page, 1) || 1;
        const limitNum = (0, queryHelpers_1.getNumberParam)(req.query.limit, 10) || 10;
        const categoryId = (0, queryHelpers_1.getStringParam)(req.query.category_id);
        const status = (0, queryHelpers_1.getStringParam)(req.query.status);
        const city = (0, queryHelpers_1.getStringParam)(req.query.city);
        const state = (0, queryHelpers_1.getStringParam)(req.query.state);
        const search = (0, queryHelpers_1.getStringParam)(req.query.search);
        const activeOnly = (0, queryHelpers_1.getStringParam)(req.query.active_only) === 'true';
        const offset = (pageNum - 1) * limitNum;
        let whereConditions = [];
        let queryParams = [];
        // Build where conditions
        if (categoryId) {
            whereConditions.push("v.category_id = ?");
            queryParams.push(categoryId);
        }
        if (status) {
            if (status === 'approved' || status === 'verified') {
                whereConditions.push("v.status IN ('active', 'approved', 'verified')");
            }
            else {
                whereConditions.push("v.status = ?");
                queryParams.push(status);
            }
        }
        else if (activeOnly) {
            // Only show active vendors if activeOnly is true
            whereConditions.push("v.status = 'active'");
        }
        // If no status filter and activeOnly is false, show all vendors (including inactive)
        if (city) {
            whereConditions.push("v.city LIKE ?");
            queryParams.push(`%${city}%`);
        }
        if (state) {
            whereConditions.push("v.state LIKE ?");
            queryParams.push(`%${state}%`);
        }
        if (search) {
            whereConditions.push("(v.full_name LIKE ? OR v.business_name LIKE ? OR v.email LIKE ?)");
            queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      ${whereClause}
    `;
        const countResult = await query(countQuery, queryParams);
        const total = countResult[0].total;
        // Get vendors with pagination
        const vendorsQuery = `
      SELECT
        v.*,
        vc.title as category_name,
        vc.description as category_description,
        vsp.id as plan_id,
        vsp.plan_name,
        vsp.plan_description,
        vsp.duration_months,
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
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
    `;
        const vendors = await query(vendorsQuery, [...queryParams, limitNum, offset]);
        // Get vendor IDs for fetching services and reviews
        const vendorIds = vendors.map(v => v.id);
        // Fetch services for all vendors
        let servicesMap = {};
        if (vendorIds.length > 0) {
            const servicesQuery = `
        SELECT vs.*, cm.currency_name, cm.symbol as currency_symbol
        FROM vendor_services vs
        LEFT JOIN currency_master cm ON vs.currency_id = cm.id
        WHERE vs.vendor_id IN (${vendorIds.map(() => '?').join(',')}) AND vs.status = 'active'
        ORDER BY vs.created_at DESC
      `;
            const services = await query(servicesQuery, vendorIds);
            services.forEach(service => {
                if (!servicesMap[service.vendor_id])
                    servicesMap[service.vendor_id] = [];
                servicesMap[service.vendor_id].push(service);
            });
        }
        // Fetch reviews for all vendors
        let reviewsMap = {};
        if (vendorIds.length > 0) {
            const reviewsQuery = `
        SELECT id, vendor_id, reviewer_name, rating, review_text, review_date, status, is_verified, helpful_count
        FROM vendor_reviews
        WHERE vendor_id IN (${vendorIds.map(() => '?').join(',')}) AND status IN ('active', 'pending')
        ORDER BY review_date DESC
      `;
            const reviews = await query(reviewsQuery, vendorIds);
            reviews.forEach(review => {
                if (!reviewsMap[review.vendor_id])
                    reviewsMap[review.vendor_id] = [];
                reviewsMap[review.vendor_id].push(review);
            });
        }
        // Process vendors to include plan details, services, and reviews
        const processedVendors = vendors.map((vendor) => {
            const vendorData = Object.assign({}, vendor);
            // Add created_by information
            vendorData.created_by = vendorData.created_by_admin === 1 ? 'admin' : 'self';
            // Prepare plan details for self-registered vendors
            let planDetails = null;
            if (vendorData.created_by_admin === 0 && vendorData.plan_id) {
                planDetails = {
                    plan_id: vendorData.plan_id,
                    plan_name: vendorData.plan_name,
                    plan_description: vendorData.plan_description,
                    duration_months: vendorData.duration_months,
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
            delete vendorData.duration_months;
            delete vendorData.monthly_price;
            delete vendorData.plan_features;
            delete vendorData.subscription_start_date;
            delete vendorData.subscription_end_date;
            delete vendorData.subscription_status;
            delete vendorData.auto_renewal;
            delete vendorData.next_billing_date;
            return Object.assign(Object.assign({}, vendorData), { plan_details: planDetails, services: servicesMap[vendor.id] || [], reviews: reviewsMap[vendor.id] || [] });
        });
        // Get status summary
        const statusSummaryQuery = `
      SELECT
        v.status,
        COUNT(*) as count
      FROM vendors v
      ${whereConditions.filter(condition => !condition.includes('v.status')).length > 0
            ? `WHERE ${whereConditions.filter(condition => !condition.includes('v.status')).join(' AND ')}`
            : ''}
      GROUP BY v.status
    `;
        // Build parameters for status summary query (excluding status-related params)
        const nonStatusConditions = whereConditions.filter(condition => !condition.includes('v.status'));
        let nonStatusParams = [];
        let paramIndex = 0;
        for (const condition of whereConditions) {
            if (condition.includes('v.category_id')) {
                nonStatusParams.push(queryParams[paramIndex]);
                paramIndex++;
            }
            else if (condition.includes('v.city')) {
                nonStatusParams.push(queryParams[paramIndex]);
                paramIndex++;
            }
            else if (condition.includes('v.state')) {
                nonStatusParams.push(queryParams[paramIndex]);
                paramIndex++;
            }
            else if (condition.includes('v.full_name')) {
                // Search condition has 3 parameters
                nonStatusParams.push(queryParams[paramIndex], queryParams[paramIndex + 1], queryParams[paramIndex + 2]);
                paramIndex += 3;
            }
            else if (condition.includes('v.status')) {
                // Skip status parameter
                paramIndex++;
            }
        }
        const statusSummary = await query(statusSummaryQuery, nonStatusParams);
        res.json({
            success: true,
            data: processedVendors,
            pagination: {
                current_page: pageNum,
                per_page: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            },
            status_summary: statusSummary.reduce((acc, item) => {
                acc[item.status] = item.count;
                return acc;
            }, {})
        });
    }
    catch (error) {
        console.error("Error fetching vendors:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getAllVendors = getAllVendors;
// Get vendor by ID
const getVendorById = async (req, res) => {
    try {
        const { id } = req.params;
        const vendorQuery = `
      SELECT
        v.*,
        vc.title as category_name,
        vc.description as category_description,
        vsp.id as plan_id,
        vsp.plan_name,
        vsp.plan_description,
        vsp.duration_months,
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
        const vendor = await query(vendorQuery, [id]);
        if (vendor.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
            return;
        }
        const vendorData = Object.assign({}, vendor[0]);
        // Add created_by information
        vendorData.created_by = vendorData.created_by_admin === 1 ? 'admin' : 'self';
        // Prepare plan details for self-registered vendors
        let planDetails = null;
        if (vendorData.created_by_admin === 0 && vendorData.plan_id) {
            planDetails = {
                plan_id: vendorData.plan_id,
                plan_name: vendorData.plan_name,
                plan_description: vendorData.plan_description,
                duration_months: vendorData.duration_months,
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
        delete vendorData.duration_months;
        delete vendorData.monthly_price;
        delete vendorData.plan_features;
        delete vendorData.subscription_start_date;
        delete vendorData.subscription_end_date;
        delete vendorData.subscription_status;
        delete vendorData.auto_renewal;
        delete vendorData.next_billing_date;
        res.json({
            success: true,
            data: Object.assign(Object.assign({}, vendorData), { plan_details: planDetails })
        });
    }
    catch (error) {
        console.error("Error fetching vendor:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorById = getVendorById;
// Delete vendor (soft delete - always set to inactive)
const deleteVendor = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if vendor exists
        const existingVendor = await query("SELECT id, status, full_name FROM vendors WHERE id = ?", [id]);
        if (existingVendor.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
            return;
        }
        // Always set status to inactive (soft delete)
        await query("UPDATE vendors SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
        res.json({
            success: true,
            message: "Vendor deactivated successfully",
            data: {
                id: parseInt(id),
                status: 'inactive'
            }
        });
    }
    catch (error) {
        console.error("Error deleting vendor:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.deleteVendor = deleteVendor;
// Create new vendor category
const createVendorCategory = async (req, res) => {
    try {
        const { title, description, status } = req.body;
        // Validate required fields
        if (!title) {
            res.status(400).json({
                success: false,
                message: "Title is required"
            });
            return;
        }
        // Check if category with same title already exists
        const existingCategory = await query("SELECT id FROM vendor_categories WHERE title = ?", [title]);
        if (existingCategory.length > 0) {
            res.status(400).json({
                success: false,
                message: "Category with this title already exists"
            });
            return;
        }
        const insertQuery = `
      INSERT INTO vendor_categories (title, description, status)
      VALUES (?, ?, ?)
    `;
        const result = await query(insertQuery, [
            title,
            description || null,
            status !== undefined ? (status === 'active' || status === true || status === 1 ? 1 : 0) : 1
        ]);
        res.status(201).json({
            success: true,
            message: "Vendor category created successfully",
            data: {
                id: result.insertId,
                title,
                description: description || null,
                status: status !== undefined ? (status === 'active' || status === true || status === 1 ? 1 : 0) : 1
            }
        });
    }
    catch (error) {
        console.error("Error creating vendor category:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.createVendorCategory = createVendorCategory;
// Get all vendor categories (including inactive)
const getAllVendorCategories = async (req, res) => {
    try {
        const pageNum = (0, queryHelpers_1.getNumberParam)(req.query.page, 1) || 1;
        const limitNum = (0, queryHelpers_1.getNumberParam)(req.query.limit, 10) || 10;
        const status = (0, queryHelpers_1.getStringParam)(req.query.status);
        const search = (0, queryHelpers_1.getStringParam)(req.query.search);
        const includeInactive = (0, queryHelpers_1.getStringParam)(req.query.include_inactive) === 'true';
        const offset = (pageNum - 1) * limitNum;
        let whereConditions = [];
        let queryParams = [];
        // Build where conditions
        if (status && !includeInactive) {
            whereConditions.push("status = ?");
            queryParams.push(status === 'active' ? 1 : 0);
        }
        else if (!includeInactive && !status) {
            // Default to active only if not explicitly requesting inactive
            whereConditions.push("status = 1");
        }
        if (search) {
            whereConditions.push("(title LIKE ? OR description LIKE ?)");
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM vendor_categories ${whereClause}`;
        const countResult = await query(countQuery, queryParams);
        const total = countResult[0].total;
        // Get categories with pagination
        const categoriesQuery = `
      SELECT id, title, description, status, created_at
      FROM vendor_categories
      ${whereClause}
      ORDER BY title ASC
      LIMIT ? OFFSET ?
    `;
        const categories = await query(categoriesQuery, [...queryParams, limitNum, offset]);
        res.json({
            success: true,
            data: categories,
            pagination: {
                current_page: pageNum,
                per_page: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            }
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
exports.getAllVendorCategories = getAllVendorCategories;
// Get vendor category by ID
const getVendorCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        const categoryQuery = `
      SELECT id, title, description, status, created_at
      FROM vendor_categories
      WHERE id = ?
    `;
        const category = await query(categoryQuery, [id]);
        if (category.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor category not found"
            });
            return;
        }
        res.json({
            success: true,
            data: category[0]
        });
    }
    catch (error) {
        console.error("Error fetching vendor category:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorCategoryById = getVendorCategoryById;
// Update vendor category
const updateVendorCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, status } = req.body;
        // Check if category exists
        const existingCategory = await query("SELECT id FROM vendor_categories WHERE id = ?", [id]);
        if (existingCategory.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor category not found"
            });
            return;
        }
        // Check if title already exists for other categories
        if (title) {
            const titleExists = await query("SELECT id FROM vendor_categories WHERE title = ? AND id != ?", [title, id]);
            if (titleExists.length > 0) {
                res.status(400).json({
                    success: false,
                    message: "Category with this title already exists"
                });
                return;
            }
        }
        const updateQuery = `
      UPDATE vendor_categories SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        status = COALESCE(?, status)
      WHERE id = ?
    `;
        await query(updateQuery, [
            title,
            description,
            status !== undefined ? (status === 'active' || status === true || status === 1 ? 1 : 0) : null,
            id
        ]);
        // Get updated category
        const updatedCategory = await query("SELECT id, title, description, status, created_at FROM vendor_categories WHERE id = ?", [id]);
        res.json({
            success: true,
            message: "Vendor category updated successfully",
            data: updatedCategory[0]
        });
    }
    catch (error) {
        console.error("Error updating vendor category:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.updateVendorCategory = updateVendorCategory;
// Delete vendor category (soft delete)
const deleteVendorCategory = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if category exists
        const existingCategory = await query("SELECT id, title, status FROM vendor_categories WHERE id = ?", [id]);
        if (existingCategory.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor category not found"
            });
            return;
        }
        // Check if category is being used by any vendors
        const vendorsUsingCategory = await query("SELECT COUNT(*) as count FROM vendors WHERE category_id = ?", [id]);
        if (vendorsUsingCategory[0].count > 0) {
            // Soft delete - set status to inactive
            await query("UPDATE vendor_categories SET status = 0 WHERE id = ?", [id]);
            res.json({
                success: true,
                message: `Vendor category '${existingCategory[0].title}' deactivated successfully (${vendorsUsingCategory[0].count} vendors are using this category)`,
                data: {
                    id: parseInt(id),
                    status: 0,
                    vendors_count: vendorsUsingCategory[0].count
                }
            });
        }
        else {
            // Toggle status between active and inactive
            const newStatus = existingCategory[0].status === 1 ? 0 : 1;
            await query("UPDATE vendor_categories SET status = ? WHERE id = ?", [newStatus, id]);
            res.json({
                success: true,
                message: `Vendor category '${existingCategory[0].title}' ${newStatus === 0 ? 'deactivated' : 'activated'} successfully`,
                data: {
                    id: parseInt(id),
                    status: newStatus
                }
            });
        }
    }
    catch (error) {
        console.error("Error deleting vendor category:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.deleteVendorCategory = deleteVendorCategory;
// Get all vendor categories
const getVendorCategories = async (req, res) => {
    try {
        const pageNum = (0, queryHelpers_1.getNumberParam)(req.query.page, 1) || 1;
        const limitNum = (0, queryHelpers_1.getNumberParam)(req.query.limit, 10) || 10;
        const status = (0, queryHelpers_1.getStringParam)(req.query.status);
        const search = (0, queryHelpers_1.getStringParam)(req.query.search);
        const offset = (pageNum - 1) * limitNum;
        let whereConditions = [];
        let queryParams = [];
        // Build where conditions
        if (status) {
            whereConditions.push("status = ?");
            queryParams.push(status === 'active' ? 1 : 0);
        }
        if (search) {
            whereConditions.push("(title LIKE ? OR description LIKE ?)");
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        // Get total count
        const countQuery = `SELECT COUNT(*) as total FROM vendor_categories ${whereClause}`;
        const countResult = await query(countQuery, queryParams);
        const total = countResult[0].total;
        // Get categories with pagination
        const categoriesQuery = `
      SELECT id, title, description, status, created_at
      FROM vendor_categories
      ${whereClause}
      ORDER BY title ASC
      LIMIT ? OFFSET ?
    `;
        const categories = await query(categoriesQuery, [...queryParams, limitNum, offset]);
        res.json({
            success: true,
            data: categories,
            pagination: {
                current_page: pageNum,
                per_page: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            }
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
exports.getVendorCategories = getVendorCategories;
// Get vendors by category ID
const getVendorsByCategory = async (req, res) => {
    try {
        const { category_id } = req.params;
        const pageNum = (0, queryHelpers_1.getNumberParam)(req.query.page, 1) || 1;
        const limitNum = (0, queryHelpers_1.getNumberParam)(req.query.limit, 10) || 10;
        const status = (0, queryHelpers_1.getStringParam)(req.query.status) || 'active';
        const city = (0, queryHelpers_1.getStringParam)(req.query.city);
        const state = (0, queryHelpers_1.getStringParam)(req.query.state);
        const offset = (pageNum - 1) * limitNum;
        let whereConditions = ["v.category_id = ?"];
        let queryParams = [category_id];
        if (status) {
            whereConditions.push("v.status = ?");
            queryParams.push(status);
        }
        if (city) {
            whereConditions.push("v.city LIKE ?");
            queryParams.push(`%${city}%`);
        }
        if (state) {
            whereConditions.push("v.state LIKE ?");
            queryParams.push(`%${state}%`);
        }
        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
        // Check if category exists
        const categoryExists = await query("SELECT id, title FROM vendor_categories WHERE id = ?", [category_id]);
        if (categoryExists.length === 0) {
            res.status(404).json({
                success: false,
                message: "Category not found"
            });
            return;
        }
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM vendors v
      ${whereClause}
    `;
        const countResult = await query(countQuery, queryParams);
        const total = countResult[0].total;
        // Get vendors
        const vendorsQuery = `
      SELECT
        v.*,
        vc.title as category_name,
        vc.description as category_description
      FROM vendors v
      LEFT JOIN vendor_categories vc ON v.category_id = vc.id
      ${whereClause}
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
    `;
        const vendors = await query(vendorsQuery, [...queryParams, limitNum, offset]);
        res.json({
            success: true,
            data: vendors,
            category: categoryExists[0],
            pagination: {
                current_page: pageNum,
                per_page: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            }
        });
    }
    catch (error) {
        console.error("Error fetching vendors by category:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorsByCategory = getVendorsByCategory;
// ============ VENDOR BANK DETAILS MANAGEMENT ============
// Create vendor bank details
const createVendorBankDetails = async (req, res) => {
    try {
        const { vendor_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type = 'savings', upi_id, is_primary = false } = req.body;
        if (!vendor_id || !account_holder_name || !account_number || !ifsc_code || !bank_name) {
            res.status(400).json({
                success: false,
                message: 'Vendor ID, Account Holder Name, Account Number, IFSC Code, and Bank Name are required'
            });
            return;
        }
        // Validate vendor exists
        const vendorExists = await query("SELECT id FROM vendors WHERE id = ?", [vendor_id]);
        if (vendorExists.length === 0) {
            res.status(400).json({
                success: false,
                message: "Invalid vendor ID"
            });
            return;
        }
        // If setting as primary, unset other primary accounts
        if (is_primary) {
            await query('UPDATE vendor_bank_details SET is_primary = FALSE WHERE vendor_id = ?', [vendor_id]);
        }
        const insertQuery = `
      INSERT INTO vendor_bank_details
      (vendor_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, upi_id, is_primary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        const result = await query(insertQuery, [
            vendor_id, account_holder_name, account_number, ifsc_code, bank_name,
            branch_name, account_type, upi_id, is_primary
        ]);
        res.status(201).json({
            success: true,
            message: 'Vendor bank details created successfully',
            data: {
                id: result.insertId,
                vendor_id,
                account_holder_name,
                account_number,
                ifsc_code,
                bank_name,
                branch_name,
                account_type,
                upi_id,
                is_primary
            }
        });
    }
    catch (error) {
        console.error('Error creating vendor bank details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.createVendorBankDetails = createVendorBankDetails;
// Get all vendor bank details
const getAllVendorBankDetails = async (req, res) => {
    try {
        const pageNum = (0, queryHelpers_1.getNumberParam)(req.query.page, 1) || 1;
        const limitNum = (0, queryHelpers_1.getNumberParam)(req.query.limit, 10) || 10;
        const vendorId = (0, queryHelpers_1.getNumberParam)(req.query.vendor_id);
        const status = (0, queryHelpers_1.getStringParam)(req.query.status);
        const isPrimary = (0, queryHelpers_1.getBooleanParam)(req.query.is_primary);
        const offset = (pageNum - 1) * limitNum;
        let whereConditions = [];
        let queryParams = [];
        if (vendorId) {
            whereConditions.push('vbd.vendor_id = ?');
            queryParams.push(vendorId);
        }
        if (status) {
            whereConditions.push('vbd.status = ?');
            queryParams.push(status);
        }
        if (isPrimary !== undefined) {
            whereConditions.push('vbd.is_primary = ?');
            queryParams.push(isPrimary);
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM vendor_bank_details vbd
      ${whereClause}
    `;
        const countResult = await query(countQuery, queryParams);
        const total = countResult[0].total;
        // Get bank details with pagination
        const bankDetailsQuery = `
      SELECT vbd.*, v.business_name as vendor_name, v.full_name as vendor_full_name
      FROM vendor_bank_details vbd
      LEFT JOIN vendors v ON vbd.vendor_id = v.id
      ${whereClause}
      ORDER BY vbd.is_primary DESC, vbd.created_at DESC
      LIMIT ? OFFSET ?
    `;
        const bankDetails = await query(bankDetailsQuery, [...queryParams, limitNum, offset]);
        res.json({
            success: true,
            data: bankDetails,
            pagination: {
                current_page: pageNum,
                per_page: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            }
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
exports.getAllVendorBankDetails = getAllVendorBankDetails;
// Get vendor bank details by ID
const getVendorBankDetailsById = async (req, res) => {
    try {
        const { id } = req.params;
        const bankDetailsQuery = `
      SELECT vbd.*, v.business_name as vendor_name, v.full_name as vendor_full_name
      FROM vendor_bank_details vbd
      LEFT JOIN vendors v ON vbd.vendor_id = v.id
      WHERE vbd.id = ?
    `;
        const bankDetails = await query(bankDetailsQuery, [id]);
        if (bankDetails.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Vendor bank details not found'
            });
            return;
        }
        res.json({
            success: true,
            data: bankDetails[0]
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
exports.getVendorBankDetailsById = getVendorBankDetailsById;
// Update vendor bank details
const updateVendorBankDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, upi_id, is_primary, status } = req.body;
        const existingBankDetails = await query('SELECT * FROM vendor_bank_details WHERE id = ?', [id]);
        if (existingBankDetails.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Vendor bank details not found'
            });
            return;
        }
        // If setting as primary, unset other primary accounts for this vendor
        if (is_primary === true) {
            await query('UPDATE vendor_bank_details SET is_primary = FALSE WHERE vendor_id = ? AND id != ?', [existingBankDetails[0].vendor_id, id]);
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
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
        await query(updateQuery, [
            account_holder_name, account_number, ifsc_code, bank_name,
            branch_name, account_type, upi_id, is_primary, status, id
        ]);
        const updatedBankDetails = await query(`SELECT vbd.*, v.business_name as vendor_name, v.full_name as vendor_full_name
       FROM vendor_bank_details vbd
       LEFT JOIN vendors v ON vbd.vendor_id = v.id
       WHERE vbd.id = ?`, [id]);
        res.json({
            success: true,
            message: 'Vendor bank details updated successfully',
            data: updatedBankDetails[0]
        });
    }
    catch (error) {
        console.error('Error updating vendor bank details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.updateVendorBankDetails = updateVendorBankDetails;
// Delete vendor bank details (soft delete)
const deleteVendorBankDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const existingBankDetails = await query('SELECT id, account_holder_name, status FROM vendor_bank_details WHERE id = ?', [id]);
        if (existingBankDetails.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Vendor bank details not found'
            });
            return;
        }
        // Toggle status between active and inactive
        const newStatus = existingBankDetails[0].status === 'active' ? 'inactive' : 'active';
        await query('UPDATE vendor_bank_details SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, id]);
        res.json({
            success: true,
            message: `Vendor bank details for '${existingBankDetails[0].account_holder_name}' ${newStatus === 'inactive' ? 'deactivated' : 'activated'} successfully`,
            data: {
                id: parseInt(id),
                status: newStatus
            }
        });
    }
    catch (error) {
        console.error('Error deleting vendor bank details:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.deleteVendorBankDetails = deleteVendorBankDetails;
// Update vendor service
const updateVendorService = async (req, res) => {
    try {
        const { id } = req.params;
        const { service_name, description, duration, price, currency_id, category, category_id, status } = req.body;
        const existingService = await query("SELECT * FROM vendor_services WHERE id = ?", [id]);
        if (existingService.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor service not found"
            });
            return;
        }
        // Validate duration and price if provided
        if (duration !== undefined && duration <= 0) {
            res.status(400).json({
                success: false,
                message: "Duration must be a positive number"
            });
            return;
        }
        if (price !== undefined && price <= 0) {
            res.status(400).json({
                success: false,
                message: "Price must be a positive number"
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
      WHERE id = ?
    `;
        await query(updateQuery, [
            service_name, description, duration, price, currency_id,
            category, category_id, status, id
        ]);
        const updatedService = await query(`SELECT vs.*, v.full_name as vendor_name, v.business_name as vendor_business_name,
              cm.currency_name, cm.symbol as currency_symbol
       FROM vendor_services vs
       LEFT JOIN vendors v ON vs.vendor_id = v.id
       LEFT JOIN currency_master cm ON vs.currency_id = cm.id
       WHERE vs.id = ?`, [id]);
        res.json({
            success: true,
            message: "Vendor service updated successfully",
            data: updatedService[0]
        });
    }
    catch (error) {
        console.error("Error updating vendor service:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.updateVendorService = updateVendorService;
// ============ VENDOR DOCUMENTS MANAGEMENT ============
// Create vendor document
const createVendorDocument = async (req, res) => {
    try {
        const { vendor_id, document_name, document_type, document_number } = req.body;
        if (!vendor_id || !document_name || !document_type) {
            res.status(400).json({
                success: false,
                message: 'Vendor ID, Document Name, and Document Type are required'
            });
            return;
        }
        // Validate vendor exists
        const vendorExists = await query("SELECT id FROM vendors WHERE id = ?", [vendor_id]);
        if (vendorExists.length === 0) {
            res.status(400).json({
                success: false,
                message: "Invalid vendor ID"
            });
            return;
        }
        let documentUrl = null;
        let fileSize = null;
        // Handle document upload if file is provided
        if (req.file) {
            try {
                const fileExtension = path.extname(req.file.originalname);
                const fileName = `vendors/${vendor_id}/documents/${document_type}_${Date.now()}${fileExtension}`;
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
      (vendor_id, document_name, document_type, document_number, document_url, file_size)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
        const result = await query(insertQuery, [
            vendor_id, document_name, document_type, document_number, documentUrl, fileSize
        ]);
        res.status(201).json({
            success: true,
            message: 'Vendor document created successfully',
            data: {
                id: result.insertId,
                vendor_id,
                document_name,
                document_type,
                document_number,
                document_url: documentUrl,
                file_size: fileSize
            }
        });
    }
    catch (error) {
        console.error('Error creating vendor document:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.createVendorDocument = createVendorDocument;
// Get all vendor documents
const getAllVendorDocuments = async (req, res) => {
    try {
        const pageNum = (0, queryHelpers_1.getNumberParam)(req.query.page, 1) || 1;
        const limitNum = (0, queryHelpers_1.getNumberParam)(req.query.limit, 10) || 10;
        const vendorId = (0, queryHelpers_1.getNumberParam)(req.query.vendor_id);
        const documentType = (0, queryHelpers_1.getStringParam)(req.query.document_type);
        const status = (0, queryHelpers_1.getStringParam)(req.query.status);
        const offset = (pageNum - 1) * limitNum;
        let whereConditions = [];
        let queryParams = [];
        if (vendorId) {
            whereConditions.push('vd.vendor_id = ?');
            queryParams.push(vendorId);
        }
        if (documentType) {
            whereConditions.push('vd.document_type = ?');
            queryParams.push(documentType);
        }
        if (status) {
            whereConditions.push('vd.status = ?');
            queryParams.push(status);
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM vendor_documents vd
      ${whereClause}
    `;
        const countResult = await query(countQuery, queryParams);
        const total = countResult[0].total;
        // Get documents with pagination
        const documentsQuery = `
      SELECT vd.*, v.business_name as vendor_name, v.full_name as vendor_full_name
      FROM vendor_documents vd
      LEFT JOIN vendors v ON vd.vendor_id = v.id
      ${whereClause}
      ORDER BY vd.created_at DESC
      LIMIT ? OFFSET ?
    `;
        const documents = await query(documentsQuery, [...queryParams, limitNum, offset]);
        res.json({
            success: true,
            data: documents.map(d => (Object.assign(Object.assign({}, d), { document_url: normalizeDocumentUrl(d.document_url) }))),
            pagination: {
                current_page: pageNum,
                per_page: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            }
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
exports.getAllVendorDocuments = getAllVendorDocuments;
// Get vendor document by ID
const getVendorDocumentById = async (req, res) => {
    try {
        const { id } = req.params;
        const documentQuery = `
      SELECT vd.*, v.business_name as vendor_name, v.full_name as vendor_full_name
      FROM vendor_documents vd
      LEFT JOIN vendors v ON vd.vendor_id = v.id
      WHERE vd.id = ?
    `;
        const document = await query(documentQuery, [id]);
        if (document.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Vendor document not found'
            });
            return;
        }
        res.json({
            success: true,
            data: Object.assign(Object.assign({}, document[0]), { document_url: normalizeDocumentUrl(document[0].document_url) })
        });
    }
    catch (error) {
        console.error('Error fetching vendor document:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.getVendorDocumentById = getVendorDocumentById;
// Update vendor document
const updateVendorDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { document_name, document_type, document_number, status } = req.body;
        const existingDocument = await query('SELECT * FROM vendor_documents WHERE id = ?', [id]);
        if (existingDocument.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Vendor document not found'
            });
            return;
        }
        let documentUrl = existingDocument[0].document_url;
        let fileSize = existingDocument[0].file_size;
        // Handle document upload if file is provided
        if (req.file) {
            try {
                const fileExtension = path.extname(req.file.originalname);
                const fileName = `vendors/${existingDocument[0].vendor_id}/documents/${document_type || existingDocument[0].document_type}_${Date.now()}${fileExtension}`;
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
      WHERE id = ?
    `;
        await query(updateQuery, [
            document_name, document_type, document_number, documentUrl, fileSize, status, id
        ]);
        const updatedDocument = await query(`SELECT vd.*, v.business_name as vendor_name, v.full_name as vendor_full_name
       FROM vendor_documents vd
       LEFT JOIN vendors v ON vd.vendor_id = v.id
       WHERE vd.id = ?`, [id]);
        res.json({
            success: true,
            message: 'Vendor document updated successfully',
            data: updatedDocument[0]
        });
    }
    catch (error) {
        console.error('Error updating vendor document:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.updateVendorDocument = updateVendorDocument;
// Delete vendor document (soft delete)
const deleteVendorDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const existingDocument = await query('SELECT id, document_name, status FROM vendor_documents WHERE id = ?', [id]);
        if (existingDocument.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Vendor document not found'
            });
            return;
        }
        // Toggle status between active and inactive
        const newStatus = existingDocument[0].status === 'active' ? 'inactive' : 'active';
        await query('UPDATE vendor_documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newStatus, id]);
        res.json({
            success: true,
            message: `Vendor document '${existingDocument[0].document_name}' ${newStatus === 'inactive' ? 'deactivated' : 'activated'} successfully`,
            data: {
                id: parseInt(id),
                status: newStatus
            }
        });
    }
    catch (error) {
        console.error('Error deleting vendor document:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.deleteVendorDocument = deleteVendorDocument;
// ============ VENDOR SERVICES MANAGEMENT ============
// Create vendor service
const createVendorService = async (req, res) => {
    try {
        const { vendor_id, service_name, description, duration, price, currency_id, category, category_id, status } = req.body;
        // Validate required fields
        if (!vendor_id || !service_name || !duration || !price) {
            res.status(400).json({
                success: false,
                message: "Vendor ID, Service Name, Duration, and Price are required"
            });
            return;
        }
        // Validate vendor exists
        const vendorExists = await query("SELECT id FROM vendors WHERE id = ?", [vendor_id]);
        if (vendorExists.length === 0) {
            res.status(400).json({
                success: false,
                message: "Invalid vendor ID"
            });
            return;
        }
        // Validate duration and price are positive numbers
        if (duration <= 0 || price <= 0) {
            res.status(400).json({
                success: false,
                message: "Duration and Price must be positive numbers"
            });
            return;
        }
        const insertQuery = `
      INSERT INTO vendor_services (
        vendor_id, service_name, description, duration, price,
        currency_id, category, category_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        const result = await query(insertQuery, [
            vendor_id,
            service_name,
            description || null,
            duration,
            price,
            currency_id || 1,
            category || null,
            category_id || null,
            status || 'active'
        ]);
        res.status(201).json({
            success: true,
            message: "Vendor service created successfully",
            data: {
                id: result.insertId,
                vendor_id,
                service_name,
                description: description || null,
                duration,
                price,
                currency_id: currency_id || 1,
                category: category || null,
                category_id: category_id || null,
                status: status || 'active'
            }
        });
    }
    catch (error) {
        console.error("Error creating vendor service:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.createVendorService = createVendorService;
// Get all vendor services
const getAllVendorServices = async (req, res) => {
    try {
        const pageNum = (0, queryHelpers_1.getNumberParam)(req.query.page, 1) || 1;
        const limitNum = (0, queryHelpers_1.getNumberParam)(req.query.limit, 10) || 10;
        const vendorId = (0, queryHelpers_1.getNumberParam)(req.query.vendor_id);
        const status = (0, queryHelpers_1.getStringParam)(req.query.status);
        const category = (0, queryHelpers_1.getStringParam)(req.query.category);
        const categoryId = (0, queryHelpers_1.getNumberParam)(req.query.category_id);
        const search = (0, queryHelpers_1.getStringParam)(req.query.search);
        const offset = (pageNum - 1) * limitNum;
        let whereConditions = [];
        let queryParams = [];
        // Build where conditions
        if (vendorId) {
            whereConditions.push("vs.vendor_id = ?");
            queryParams.push(vendorId);
        }
        if (status) {
            whereConditions.push("vs.status = ?");
            queryParams.push(status);
        }
        if (category) {
            whereConditions.push("vs.category LIKE ?");
            queryParams.push(`%${category}%`);
        }
        if (categoryId) {
            whereConditions.push("vs.category_id = ?");
            queryParams.push(categoryId);
        }
        if (search) {
            whereConditions.push("(vs.service_name LIKE ? OR vs.description LIKE ?)");
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM vendor_services vs
      LEFT JOIN vendors v ON vs.vendor_id = v.id
      ${whereClause}
    `;
        const countResult = await query(countQuery, queryParams);
        const total = countResult[0].total;
        // Get services with pagination
        const servicesQuery = `
      SELECT
        vs.*,
        v.full_name as vendor_name,
        v.business_name as vendor_business_name,
        cm.currency_name,
        cm.symbol as currency_symbol
      FROM vendor_services vs
      LEFT JOIN vendors v ON vs.vendor_id = v.id
      LEFT JOIN currency_master cm ON vs.currency_id = cm.id
      ${whereClause}
      ORDER BY vs.created_at DESC
      LIMIT ? OFFSET ?
    `;
        const services = await query(servicesQuery, [...queryParams, limitNum, offset]);
        res.json({
            success: true,
            data: services,
            pagination: {
                current_page: pageNum,
                per_page: limitNum,
                total: total,
                total_pages: Math.ceil(total / limitNum)
            }
        });
    }
    catch (error) {
        console.error("Error fetching vendor services:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getAllVendorServices = getAllVendorServices;
// Get vendor service by ID
const getVendorServiceById = async (req, res) => {
    try {
        const { id } = req.params;
        const serviceQuery = `
      SELECT
        vs.*,
        v.full_name as vendor_name,
        v.business_name as vendor_business_name,
        v.email as vendor_email,
        v.mobile as vendor_phone,
        cm.currency_name,
        cm.symbol as currency_symbol
      FROM vendor_services vs
      LEFT JOIN vendors v ON vs.vendor_id = v.id
      LEFT JOIN currency_master cm ON vs.currency_id = cm.id
      WHERE vs.id = ?
    `;
        const service = await query(serviceQuery, [id]);
        if (service.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor service not found"
            });
            return;
        }
        res.json({
            success: true,
            data: service[0]
        });
    }
    catch (error) {
        console.error("Error fetching vendor service:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorServiceById = getVendorServiceById;
// Delete vendor service (soft delete)
const deleteVendorService = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if service exists
        const existingService = await query("SELECT id, service_name, status FROM vendor_services WHERE id = ?", [id]);
        if (existingService.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor service not found"
            });
            return;
        }
        // Toggle status between active and inactive
        const newStatus = existingService[0].status === 'active' ? 'inactive' : 'active';
        await query("UPDATE vendor_services SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [newStatus, id]);
        res.json({
            success: true,
            message: `Vendor service '${existingService[0].service_name}' ${newStatus === 'inactive' ? 'deactivated' : 'activated'} successfully`,
            data: {
                id: parseInt(id),
                status: newStatus
            }
        });
    }
    catch (error) {
        console.error("Error deleting vendor service:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.deleteVendorService = deleteVendorService;
// ============ GET BY VENDOR ID ENDPOINTS ============
// Get vendor services by vendor ID
const getVendorServicesByVendorId = async (req, res) => {
    try {
        const { vendor_id } = req.params;
        const status = (0, queryHelpers_1.getStringParam)(req.query.status);
        // Validate vendor exists
        const vendorExists = await query("SELECT id, full_name, business_name FROM vendors WHERE id = ?", [vendor_id]);
        if (vendorExists.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
            return;
        }
        let whereConditions = ["vs.vendor_id = ?"];
        let queryParams = [vendor_id];
        if (status) {
            whereConditions.push("vs.status = ?");
            queryParams.push(status);
        }
        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
        const servicesQuery = `
      SELECT
        vs.*,
        cm.currency_name,
        cm.symbol as currency_symbol
      FROM vendor_services vs
      LEFT JOIN currency_master cm ON vs.currency_id = cm.id
      ${whereClause}
      ORDER BY vs.created_at DESC
    `;
        const services = await query(servicesQuery, queryParams);
        res.json({
            success: true,
            data: services,
            vendor: vendorExists[0],
            total: services.length
        });
    }
    catch (error) {
        console.error("Error fetching vendor services by vendor ID:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorServicesByVendorId = getVendorServicesByVendorId;
// Get vendor bank details by vendor ID
const getVendorBankDetailsByVendorId = async (req, res) => {
    try {
        const { vendor_id } = req.params;
        const status = (0, queryHelpers_1.getStringParam)(req.query.status);
        // Validate vendor exists
        const vendorExists = await query("SELECT id, full_name, business_name FROM vendors WHERE id = ?", [vendor_id]);
        if (vendorExists.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
            return;
        }
        let whereConditions = ["vbd.vendor_id = ?"];
        let queryParams = [vendor_id];
        if (status) {
            whereConditions.push("vbd.status = ?");
            queryParams.push(status);
        }
        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
        const bankDetailsQuery = `
      SELECT vbd.*
      FROM vendor_bank_details vbd
      ${whereClause}
      ORDER BY vbd.is_primary DESC, vbd.created_at DESC
    `;
        const bankDetails = await query(bankDetailsQuery, queryParams);
        res.json({
            success: true,
            data: bankDetails,
            vendor: vendorExists[0],
            total: bankDetails.length
        });
    }
    catch (error) {
        console.error("Error fetching vendor bank details by vendor ID:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorBankDetailsByVendorId = getVendorBankDetailsByVendorId;
// Get vendor documents by vendor ID
const getVendorDocumentsByVendorId = async (req, res) => {
    try {
        const { vendor_id } = req.params;
        const status = (0, queryHelpers_1.getStringParam)(req.query.status);
        const documentType = (0, queryHelpers_1.getStringParam)(req.query.document_type);
        // Validate vendor exists
        const vendorExists = await query("SELECT id, full_name, business_name FROM vendors WHERE id = ?", [vendor_id]);
        if (vendorExists.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
            return;
        }
        let whereConditions = ["vd.vendor_id = ?"];
        let queryParams = [vendor_id];
        if (status) {
            whereConditions.push("vd.status = ?");
            queryParams.push(status);
        }
        if (documentType) {
            whereConditions.push("vd.document_type = ?");
            queryParams.push(documentType);
        }
        const whereClause = `WHERE ${whereConditions.join(' AND ')}`;
        const documentsQuery = `
      SELECT vd.*
      FROM vendor_documents vd
      ${whereClause}
      ORDER BY vd.created_at DESC
    `;
        const documents = await query(documentsQuery, queryParams);
        res.json({
            success: true,
            data: documents.map(d => (Object.assign(Object.assign({}, d), { document_url: normalizeDocumentUrl(d.document_url) }))),
            vendor: vendorExists[0],
            total: documents.length
        });
    }
    catch (error) {
        console.error("Error fetching vendor documents by vendor ID:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorDocumentsByVendorId = getVendorDocumentsByVendorId;
//# sourceMappingURL=VendorController.js.map