"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testEmail = exports.getReviewForm = exports.submitReview = exports.getMyReviews = exports.getMyEarnings = exports.updateConsultation = exports.getMyConsultations = exports.createConsultation = void 0;
const utils = require("util");
const crypto = require("crypto");
const EmailService_1 = require("./EmailService");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Helper function to generate booking ID
const generateBookingId = () => {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `#BK-${year}-${randomNum}`;
};
// Helper function to generate transaction ID
const generateTransactionId = () => {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `TXN-${year}-${randomNum}`;
};
// Helper function to generate secure review token
const generateReviewToken = () => {
    return crypto.randomBytes(32).toString('hex');
};
// ============ VENDOR CONSULTATIONS MANAGEMENT ============
// Create new consultation (Vendor creates consultation form)
const createConsultation = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { client_name, client_email, client_phone, service_name, service_id, duration, consultation_date, consultation_time, amount_total, amount_paid = 0, payment_status = 'pending', notes } = req.body;
        // Validate required fields
        if (!client_name || !client_email || !service_name || !duration || !consultation_date || !consultation_time || !amount_total) {
            res.status(400).json({
                success: false,
                message: "Client name, email, service name, duration, date, time, and total amount are required"
            });
            return;
        }
        // Get vendor details
        const vendor = await query("SELECT id, full_name, email FROM vendors WHERE id = ?", [vendorId]);
        if (vendor.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor not found"
            });
            return;
        }
        const vendorData = vendor[0];
        const bookingId = generateBookingId();
        // Create consultation
        const insertQuery = `
      INSERT INTO vendor_consultations (
        booking_id, vendor_id, vendor_name, vendor_email, client_name, client_email, 
        client_phone, service_name, service_id, duration, consultation_date, 
        consultation_time, amount_total, amount_paid, payment_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
        const result = await query(insertQuery, [
            bookingId, vendorId, vendorData.full_name, vendorData.email,
            client_name, client_email, client_phone, service_name, service_id,
            duration, consultation_date, consultation_time, amount_total,
            amount_paid, payment_status, notes
        ]);
        const consultationId = result.insertId;
        // Create earning record if payment is made (only for non-cancelled bookings)
        if (amount_paid > 0 && req.body.booking_status !== 'cancelled') {
            const transactionId = generateTransactionId();
            const commissionRate = 10; // 10% platform commission
            const commissionAmount = (amount_paid * commissionRate) / 100;
            const netAmount = amount_paid - commissionAmount;
            await query(`
        INSERT INTO vendor_earnings (
          vendor_id, vendor_name, consultation_id, transaction_id, transaction_date,
          amount, commission_rate, commission_amount, net_amount, status
        ) VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?)
      `, [
                vendorId, vendorData.full_name, consultationId, transactionId,
                amount_paid, commissionRate, commissionAmount, netAmount,
                payment_status === 'paid' ? 'paid' : 'pending'
            ]);
            // Log payment
            await query(`
        INSERT INTO consultation_payment_logs (
          consultation_id, transaction_id, payment_method, amount, payment_status, notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [consultationId, transactionId, 'manual', amount_paid, 'success', 'Initial payment']);
        }
        // Send review email to client after consultation is completed or if payment is made
        if (req.body.booking_status === 'completed' || payment_status === 'paid') {
            console.log('Sending review email to:', client_email);
            await sendReviewEmail(consultationId, client_email);
        }
        res.status(201).json({
            success: true,
            message: "Consultation created successfully",
            data: {
                id: consultationId,
                booking_id: bookingId,
                vendor_name: vendorData.full_name,
                client_name,
                service_name,
                consultation_date,
                consultation_time,
                amount_total,
                amount_paid,
                payment_status
            }
        });
    }
    catch (error) {
        console.error("Error creating consultation:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.createConsultation = createConsultation;
// Get vendor's consultations
const getMyConsultations = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { page = 1, limit = 10, status, payment_status, search } = req.query;
        let whereClause = "WHERE vendor_id = ?";
        let queryParams = [vendorId];
        if (status) {
            whereClause += " AND booking_status = ?";
            queryParams.push(status);
        }
        if (payment_status) {
            whereClause += " AND payment_status = ?";
            queryParams.push(payment_status);
        }
        if (search) {
            whereClause += " AND (client_name LIKE ? OR client_email LIKE ? OR service_name LIKE ?)";
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }
        const offset = (Number(page) - 1) * Number(limit);
        // Get consultations with pagination
        const consultations = await query(`
      SELECT * FROM vendor_consultations 
      ${whereClause}
      ORDER BY consultation_date DESC, consultation_time DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, Number(limit), offset]);
        // Get total count
        const totalResult = await query(`
      SELECT COUNT(*) as total FROM vendor_consultations ${whereClause}
    `, queryParams);
        const total = totalResult[0].total;
        // Get statistics (exclude cancelled bookings)
        const stats = await query(`
      SELECT 
        COUNT(*) as total_consultations,
        SUM(amount_total) as total_revenue,
        COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_consultations,
        COUNT(CASE WHEN booking_status = 'upcoming' THEN 1 END) as upcoming_consultations,
        COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_payments
      FROM vendor_consultations 
      WHERE vendor_id = ? AND booking_status != 'cancelled'
    `, [vendorId]);
        res.json({
            success: true,
            data: {
                consultations,
                pagination: {
                    current_page: Number(page),
                    per_page: Number(limit),
                    total,
                    total_pages: Math.ceil(total / Number(limit))
                },
                statistics: stats[0]
            }
        });
    }
    catch (error) {
        console.error("Error fetching consultations:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getMyConsultations = getMyConsultations;
// Update consultation
const updateConsultation = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { id } = req.params;
        const { client_name, client_email, client_phone, service_name, duration, consultation_date, consultation_time, amount_total, amount_paid, payment_status, booking_status, notes } = req.body;
        // Check if consultation belongs to vendor
        const consultation = await query("SELECT * FROM vendor_consultations WHERE id = ? AND vendor_id = ?", [id, vendorId]);
        if (consultation.length === 0) {
            res.status(404).json({
                success: false,
                message: "Consultation not found"
            });
            return;
        }
        const oldConsultation = consultation[0];
        // Update consultation
        const updateQuery = `
      UPDATE vendor_consultations SET
        client_name = COALESCE(?, client_name),
        client_email = COALESCE(?, client_email),
        client_phone = COALESCE(?, client_phone),
        service_name = COALESCE(?, service_name),
        duration = COALESCE(?, duration),
        consultation_date = COALESCE(?, consultation_date),
        consultation_time = COALESCE(?, consultation_time),
        amount_total = COALESCE(?, amount_total),
        amount_paid = COALESCE(?, amount_paid),
        payment_status = COALESCE(?, payment_status),
        booking_status = COALESCE(?, booking_status),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND vendor_id = ?
    `;
        await query(updateQuery, [
            client_name, client_email, client_phone, service_name, duration,
            consultation_date, consultation_time, amount_total, amount_paid,
            payment_status, booking_status, notes, id, vendorId
        ]);
        // If booking is being cancelled, void related earnings
        if (booking_status === 'cancelled') {
            await query(`
        UPDATE vendor_earnings SET status = 'cancelled' WHERE consultation_id = ?
      `, [id]);
        }
        // If payment amount changed, update earnings (only for non-cancelled bookings)
        if (amount_paid !== undefined && amount_paid !== oldConsultation.amount_paid && booking_status !== 'cancelled') {
            const paymentDiff = amount_paid - oldConsultation.amount_paid;
            if (paymentDiff > 0) {
                // Additional payment made
                const transactionId = generateTransactionId();
                const commissionRate = 10;
                const commissionAmount = (paymentDiff * commissionRate) / 100;
                const netAmount = paymentDiff - commissionAmount;
                await query(`
          INSERT INTO vendor_earnings (
            vendor_id, vendor_name, consultation_id, transaction_id, transaction_date,
            amount, commission_rate, commission_amount, net_amount, status
          ) VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?)
        `, [
                    vendorId, oldConsultation.vendor_name, id, transactionId,
                    paymentDiff, commissionRate, commissionAmount, netAmount,
                    payment_status === 'paid' ? 'paid' : 'pending'
                ]);
                // Log payment
                await query(`
          INSERT INTO consultation_payment_logs (
            consultation_id, transaction_id, payment_method, amount, payment_status, notes
          ) VALUES (?, ?, ?, ?, ?, ?)
        `, [id, transactionId, 'manual', paymentDiff, 'success', 'Additional payment']);
            }
        }
        // Send review email if status changed to completed
        if (booking_status === 'completed' && oldConsultation.booking_status !== 'completed') {
            await sendReviewEmail(parseInt(id), client_email || oldConsultation.client_email);
        }
        res.json({
            success: true,
            message: "Consultation updated successfully"
        });
    }
    catch (error) {
        console.error("Error updating consultation:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.updateConsultation = updateConsultation;
// ============ VENDOR EARNINGS MANAGEMENT ============
// Get vendor's earnings
const getMyEarnings = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { page = 1, limit = 10, status, month, year } = req.query;
        let whereClause = "WHERE vendor_id = ?";
        let queryParams = [vendorId];
        if (status) {
            whereClause += " AND status = ?";
            queryParams.push(status);
        }
        if (month && year) {
            whereClause += " AND MONTH(transaction_date) = ? AND YEAR(transaction_date) = ?";
            queryParams.push(month, year);
        }
        else if (year) {
            whereClause += " AND YEAR(transaction_date) = ?";
            queryParams.push(year);
        }
        const offset = (Number(page) - 1) * Number(limit);
        // Get earnings with pagination
        const earnings = await query(`
      SELECT * FROM vendor_earnings 
      ${whereClause}
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, Number(limit), offset]);
        // Get total count
        const totalResult = await query(`
      SELECT COUNT(*) as total FROM vendor_earnings ${whereClause}
    `, queryParams);
        const total = totalResult[0].total;
        // Get earnings statistics
        const stats = await query(`
      SELECT 
        SUM(amount) as total_earnings,
        SUM(commission_amount) as total_commission,
        SUM(net_amount) as total_net_earnings,
        SUM(CASE WHEN status = 'paid' THEN net_amount ELSE 0 END) as paid_earnings,
        SUM(CASE WHEN status = 'pending' THEN net_amount ELSE 0 END) as pending_earnings,
        SUM(CASE WHEN MONTH(transaction_date) = MONTH(CURDATE()) AND YEAR(transaction_date) = YEAR(CURDATE()) THEN net_amount ELSE 0 END) as this_month_earnings
      FROM vendor_earnings 
      WHERE vendor_id = ?
    `, [vendorId]);
        res.json({
            success: true,
            data: {
                earnings,
                pagination: {
                    current_page: Number(page),
                    per_page: Number(limit),
                    total,
                    total_pages: Math.ceil(total / Number(limit))
                },
                statistics: stats[0]
            }
        });
    }
    catch (error) {
        console.error("Error fetching earnings:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getMyEarnings = getMyEarnings;
// ============ VENDOR REVIEWS MANAGEMENT ============
// Get vendor's reviews
const getMyReviews = async (req, res) => {
    try {
        const vendorId = req.user.id;
        const { page = 1, limit = 10, status, rating } = req.query;
        let whereClause = "WHERE vendor_id = ?";
        let queryParams = [vendorId];
        if (status) {
            whereClause += " AND status = ?";
            queryParams.push(status);
        }
        if (rating) {
            whereClause += " AND rating = ?";
            queryParams.push(rating);
        }
        const offset = (Number(page) - 1) * Number(limit);
        // Get reviews with pagination
        const reviews = await query(`
      SELECT * FROM vendor_reviews 
      ${whereClause}
      ORDER BY review_date DESC, created_at DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, Number(limit), offset]);
        // Get total count
        const totalResult = await query(`
      SELECT COUNT(*) as total FROM vendor_reviews ${whereClause}
    `, queryParams);
        const total = totalResult[0].total;
        // Get review statistics
        const stats = await query(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star_reviews,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star_reviews,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star_reviews,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star_reviews,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star_reviews,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_reviews
      FROM vendor_reviews 
      WHERE vendor_id = ?
    `, [vendorId]);
        res.json({
            success: true,
            data: {
                reviews,
                pagination: {
                    current_page: Number(page),
                    per_page: Number(limit),
                    total,
                    total_pages: Math.ceil(total / Number(limit))
                },
                statistics: stats[0]
            }
        });
    }
    catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getMyReviews = getMyReviews;
// ============ REVIEW EMAIL SYSTEM ============
// Send review email to client
const sendReviewEmail = async (consultationId, clientEmail) => {
    try {
        console.log(`Starting to send review email for consultation ${consultationId} to ${clientEmail}`);
        // Generate review token
        const token = generateReviewToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // Token expires in 30 days
        console.log('Generated review token:', token);
        // Save token to database
        await query(`
      INSERT INTO review_tokens (consultation_id, token, reviewer_email, expires_at)
      VALUES (?, ?, ?, ?)
    `, [consultationId, token, clientEmail, expiresAt]);
        console.log('Token saved to database successfully');
        // Create review link
        const reviewLink = `https://vivaaha.net/admin/vendors/reviews/${token}`;
        console.log('Review link created:', reviewLink);
        // Get consultation details for email variables
        const consultationDetails = await query(`
      SELECT vendor_name, client_name, service_name, consultation_date, consultation_time
      FROM vendor_consultations WHERE id = ?
    `, [consultationId]);
        const consultation = consultationDetails[0];
        // Prepare email variables
        const emailVariables = {
            client_name: consultation.client_name,
            vendor_name: consultation.vendor_name,
            service_name: consultation.service_name,
            consultation_date: consultation.consultation_date,
            consultation_time: consultation.consultation_time,
            review_link: reviewLink,
            token: token
        };
        console.log('Attempting to send review email using EmailService');
        // Send email using EmailService with template or fallback
        const emailResult = await EmailService_1.EmailService.sendTemplateEmail('vendor_consultation_review', clientEmail, emailVariables, {
            fallbackSubject: 'Please Review Your Consultation Experience - {{vendor_name}}',
            fallbackHtml: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 30px;">
                <img src="{{site_logo}}" alt="{{sitename}}" style="max-height: 60px;">
              </div>
              
              <h2 style="color: {{color_code}}; text-align: center; margin-bottom: 30px;">Thank You for Your Consultation!</h2>
              
              <p style="font-size: 16px; line-height: 1.6; color: #333;">Dear {{client_name}},</p>
              
              <p style="font-size: 16px; line-height: 1.6; color: #333;">
                We hope you had a great experience with your recent consultation with <strong>{{vendor_name}}</strong> 
                for <strong>{{service_name}}</strong> on {{consultation_date}} at {{consultation_time}}.
              </p>
              
              <p style="font-size: 16px; line-height: 1.6; color: #333;">
                Your feedback is valuable to us and helps other clients make informed decisions. 
                Please take a moment to share your experience by clicking the button below:
              </p>
              
              <div style="text-align: center; margin: 40px 0;">
                <a href="{{review_link}}" 
                   style="background-color: {{color_code}}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                  Leave Your Review
                </a>
              </div>
              
              <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p style="margin: 0; color: #856404; font-size: 14px;">
                  <strong>Note:</strong> This review link will expire in 30 days for security purposes.
                </p>
              </div>
              
              <p style="font-size: 16px; line-height: 1.6; color: #333;">
                If you have any questions or concerns, please don't hesitate to contact our support team.
              </p>
              
              <div style="border-top: 1px solid #eee; margin-top: 30px; padding-top: 20px; text-align: center;">
                <p style="color: #666; font-size: 14px; margin: 0;">
                  Best regards,<br>
                  The {{sitename}} Team
                </p>
                <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
                  © {{current_year}} {{sitename}}. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        `,
            fallbackText: `
          Dear {{client_name}},
          
          Thank you for your consultation with {{vendor_name}} for {{service_name}} on {{consultation_date}} at {{consultation_time}}.
          
          Please share your experience by visiting: {{review_link}}
          
          Note: This link will expire in 30 days.
          
          Best regards,
          The {{sitename}} Team
        `
        });
        if (emailResult.success) {
            console.log('Review email sent successfully:', emailResult.messageId);
            // Update consultation to mark review email as sent
            await query(`
        UPDATE vendor_consultations 
        SET review_email_sent = 1, review_email_sent_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [consultationId]);
            console.log('Consultation updated with email sent status');
        }
        else {
            console.log('Review email was skipped:', emailResult.reason);
        }
    }
    catch (error) {
        console.error('Error sending review email:', error);
    }
};
// Submit review using token (Public endpoint)
const submitReview = async (req, res) => {
    try {
        const { token } = req.params;
        const { reviewer_name, rating, review_text } = req.body;
        // Validate required fields
        if (!reviewer_name || !rating || !review_text) {
            res.status(400).json({
                success: false,
                message: "Reviewer name, rating, and review text are required"
            });
            return;
        }
        if (rating < 1 || rating > 5) {
            res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5"
            });
            return;
        }
        // Verify token
        const tokenData = await query(`
      SELECT rt.*, vc.vendor_id, vc.vendor_name, vc.client_email
      FROM review_tokens rt
      JOIN vendor_consultations vc ON rt.consultation_id = vc.id
      WHERE rt.token = ? AND rt.is_used = 0 AND rt.expires_at > NOW()
    `, [token]);
        if (tokenData.length === 0) {
            res.status(400).json({
                success: false,
                message: "Invalid or expired review token"
            });
            return;
        }
        const tokenInfo = tokenData[0];
        // Check if review already exists for this consultation
        const existingReview = await query("SELECT id FROM vendor_reviews WHERE consultation_id = ?", [tokenInfo.consultation_id]);
        if (existingReview.length > 0) {
            res.status(400).json({
                success: false,
                message: "Review has already been submitted for this consultation"
            });
            return;
        }
        // Create review
        await query(`
      INSERT INTO vendor_reviews (
        vendor_id, vendor_name, consultation_id, reviewer_name, reviewer_email,
        rating, review_text, review_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 'pending')
    `, [
            tokenInfo.vendor_id, tokenInfo.vendor_name, tokenInfo.consultation_id,
            reviewer_name, tokenInfo.client_email, rating, review_text
        ]);
        // Mark token as used
        await query(`
      UPDATE review_tokens 
      SET is_used = 1, used_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [tokenInfo.id]);
        res.json({
            success: true,
            message: "Review submitted successfully. It will be published after admin approval."
        });
    }
    catch (error) {
        console.error("Error submitting review:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.submitReview = submitReview;
// Get review form data using token (Public endpoint)
const getReviewForm = async (req, res) => {
    try {
        const { token } = req.params;
        // Verify token and get consultation details
        const tokenData = await query(`
      SELECT rt.*, vc.vendor_name, vc.client_name, vc.service_name, 
             vc.consultation_date, vc.consultation_time
      FROM review_tokens rt
      JOIN vendor_consultations vc ON rt.consultation_id = vc.id
      WHERE rt.token = ? AND rt.is_used = 0 AND rt.expires_at > NOW()
    `, [token]);
        if (tokenData.length === 0) {
            res.status(400).json({
                success: false,
                message: "Invalid or expired review token"
            });
            return;
        }
        const tokenInfo = tokenData[0];
        // Check if review already exists
        const existingReview = await query("SELECT id FROM vendor_reviews WHERE consultation_id = ?", [tokenInfo.consultation_id]);
        if (existingReview.length > 0) {
            res.status(400).json({
                success: false,
                message: "Review has already been submitted for this consultation"
            });
            return;
        }
        res.json({
            success: true,
            data: {
                vendor_name: tokenInfo.vendor_name,
                client_name: tokenInfo.client_name,
                service_name: tokenInfo.service_name,
                consultation_date: tokenInfo.consultation_date,
                consultation_time: tokenInfo.consultation_time,
                token: token
            }
        });
    }
    catch (error) {
        console.error("Error getting review form:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getReviewForm = getReviewForm;
// Test email functionality (for debugging)
const testEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({
                success: false,
                message: "Email address is required"
            });
            return;
        }
        console.log('Testing email to:', email);
        // Use EmailService for testing
        const result = await EmailService_1.EmailService.sendTestEmail(email, 'Test Email from Vivaaha Consultation System');
        console.log('Test email result:', result);
        res.json({
            success: true,
            message: "Test email sent successfully using EmailService",
            messageId: result.messageId
        });
    }
    catch (error) {
        console.error("Error sending test email:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send test email",
            error: error.message
        });
    }
};
exports.testEmail = testEmail;
exports.default = {
    createConsultation: exports.createConsultation,
    getMyConsultations: exports.getMyConsultations,
    updateConsultation: exports.updateConsultation,
    getMyEarnings: exports.getMyEarnings,
    getMyReviews: exports.getMyReviews,
    submitReview: exports.submitReview,
    getReviewForm: exports.getReviewForm,
    testEmail: exports.testEmail
};
//# sourceMappingURL=VendorConsultationController.js.map