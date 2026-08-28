"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVendorDashboardStats = exports.deleteReview = exports.updateReview = exports.getReviewById = exports.getAllReviews = exports.updateEarningStatus = exports.getAllEarnings = exports.updateConsultationAdmin = exports.getConsultationById = exports.getAllConsultations = void 0;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// ============ ADMIN CONSULTATIONS MANAGEMENT ============
// Get all consultations (Admin)
const getAllConsultations = async (req, res) => {
    try {
        const { page = 1, limit = 10, vendor_id, payment_status, booking_status, search, date_from, date_to } = req.query;
        let whereClause = "WHERE 1=1";
        let queryParams = [];
        if (vendor_id) {
            whereClause += " AND vendor_id = ?";
            queryParams.push(vendor_id);
        }
        if (payment_status) {
            whereClause += " AND payment_status = ?";
            queryParams.push(payment_status);
        }
        if (booking_status) {
            whereClause += " AND booking_status = ?";
            queryParams.push(booking_status);
        }
        if (search) {
            whereClause += " AND (vendor_name LIKE ? OR client_name LIKE ? OR client_email LIKE ? OR service_name LIKE ? OR booking_id LIKE ?)";
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }
        if (date_from) {
            whereClause += " AND consultation_date >= ?";
            queryParams.push(date_from);
        }
        if (date_to) {
            whereClause += " AND consultation_date <= ?";
            queryParams.push(date_to);
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
        // Get overall statistics (exclude cancelled bookings)
        const stats = await query(`
      SELECT 
        COUNT(*) as total_consultations,
        SUM(amount_total) as total_revenue,
        COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_consultations,
        COUNT(CASE WHEN booking_status = 'upcoming' THEN 1 END) as upcoming_consultations,
        COUNT(CASE WHEN booking_status = 'cancelled' THEN 1 END) as cancelled_consultations,
        COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_payments,
        COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_consultations,
        COUNT(CASE WHEN payment_status = 'refunded' THEN 1 END) as refunded_consultations
      FROM vendor_consultations
      WHERE booking_status != 'cancelled'
    `);
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
        console.error("Error fetching all consultations:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getAllConsultations = getAllConsultations;
// Get consultation by ID (Admin)
const getConsultationById = async (req, res) => {
    try {
        const { id } = req.params;
        const consultation = await query(`
      SELECT vc.*, 
             GROUP_CONCAT(DISTINCT cpl.transaction_id) as payment_transactions,
             GROUP_CONCAT(DISTINCT cpl.amount) as payment_amounts,
             GROUP_CONCAT(DISTINCT cpl.payment_date) as payment_dates
      FROM vendor_consultations vc
      LEFT JOIN consultation_payment_logs cpl ON vc.id = cpl.consultation_id
      WHERE vc.id = ?
      GROUP BY vc.id
    `, [id]);
        if (consultation.length === 0) {
            res.status(404).json({
                success: false,
                message: "Consultation not found"
            });
            return;
        }
        // Get payment logs
        const paymentLogs = await query(`
      SELECT * FROM consultation_payment_logs 
      WHERE consultation_id = ? 
      ORDER BY payment_date DESC
    `, [id]);
        // Get related earnings
        const earnings = await query(`
      SELECT * FROM vendor_earnings 
      WHERE consultation_id = ?
      ORDER BY transaction_date DESC
    `, [id]);
        // Get related review
        const review = await query(`
      SELECT * FROM vendor_reviews 
      WHERE consultation_id = ?
    `, [id]);
        res.json({
            success: true,
            data: {
                consultation: consultation[0],
                payment_logs: paymentLogs,
                earnings: earnings,
                review: review.length > 0 ? review[0] : null
            }
        });
    }
    catch (error) {
        console.error("Error fetching consultation:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getConsultationById = getConsultationById;
// Update consultation (Admin)
const updateConsultationAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_status, booking_status, notes, admin_notes } = req.body;
        // Check if consultation exists
        const consultation = await query("SELECT * FROM vendor_consultations WHERE id = ?", [id]);
        if (consultation.length === 0) {
            res.status(404).json({
                success: false,
                message: "Consultation not found"
            });
            return;
        }
        // Update consultation
        const updateQuery = `
      UPDATE vendor_consultations SET
        payment_status = COALESCE(?, payment_status),
        booking_status = COALESCE(?, booking_status),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
        await query(updateQuery, [payment_status, booking_status, notes, id]);
        // Update related earnings status if booking cancelled or payment status changed
        if (booking_status === 'cancelled') {
            await query(`
        UPDATE vendor_earnings SET status = 'cancelled' WHERE consultation_id = ?
      `, [id]);
        }
        else if (payment_status) {
            await query(`
        UPDATE vendor_earnings 
        SET status = ? 
        WHERE consultation_id = ?
      `, [payment_status === 'paid' ? 'paid' : 'pending', id]);
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
exports.updateConsultationAdmin = updateConsultationAdmin;
// ============ ADMIN EARNINGS MANAGEMENT ============
// Get all earnings (Admin)
const getAllEarnings = async (req, res) => {
    try {
        const { page = 1, limit = 10, vendor_id, status, search, date_from, date_to } = req.query;
        let whereClause = "WHERE 1=1";
        let queryParams = [];
        if (vendor_id) {
            whereClause += " AND vendor_id = ?";
            queryParams.push(vendor_id);
        }
        if (status) {
            whereClause += " AND status = ?";
            queryParams.push(status);
        }
        if (search) {
            whereClause += " AND (vendor_name LIKE ? OR transaction_id LIKE ?)";
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm);
        }
        if (date_from) {
            whereClause += " AND transaction_date >= ?";
            queryParams.push(date_from);
        }
        if (date_to) {
            whereClause += " AND transaction_date <= ?";
            queryParams.push(date_to);
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
        // Get overall statistics (exclude cancelled earnings)
        const stats = await query(`
      SELECT 
        SUM(amount) as total_earnings,
        SUM(commission_amount) as total_commission,
        SUM(net_amount) as total_net_earnings,
        SUM(CASE WHEN status = 'paid' THEN net_amount ELSE 0 END) as paid_earnings,
        SUM(CASE WHEN status = 'pending' THEN net_amount ELSE 0 END) as pending_earnings,
        SUM(CASE WHEN status = 'processing' THEN net_amount ELSE 0 END) as processing_earnings,
        COUNT(DISTINCT vendor_id) as total_vendors
      FROM vendor_earnings
      WHERE status != 'cancelled'
    `);
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
        console.error("Error fetching all earnings:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getAllEarnings = getAllEarnings;
// Update earning status (Admin)
const updateEarningStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, payout_date, notes } = req.body;
        // Validate status
        const validStatuses = ['pending', 'processing', 'paid', 'cancelled', 'refunded'];
        if (status && !validStatuses.includes(status)) {
            res.status(400).json({
                success: false,
                message: "Invalid status. Must be one of: " + validStatuses.join(', ')
            });
            return;
        }
        // Check if earning exists
        const earning = await query("SELECT * FROM vendor_earnings WHERE id = ?", [id]);
        if (earning.length === 0) {
            res.status(404).json({
                success: false,
                message: "Earning record not found"
            });
            return;
        }
        // Update earning
        const updateQuery = `
      UPDATE vendor_earnings SET
        status = COALESCE(?, status),
        payout_date = COALESCE(?, payout_date),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
        await query(updateQuery, [status, payout_date, notes, id]);
        res.json({
            success: true,
            message: "Earning status updated successfully"
        });
    }
    catch (error) {
        console.error("Error updating earning status:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.updateEarningStatus = updateEarningStatus;
// ============ ADMIN REVIEWS MANAGEMENT ============
// Get all reviews (Admin)
const getAllReviews = async (req, res) => {
    try {
        const { page = 1, limit = 10, vendor_id, status, rating, search } = req.query;
        let whereClause = "WHERE 1=1";
        let queryParams = [];
        if (vendor_id) {
            whereClause += " AND vendor_id = ?";
            queryParams.push(vendor_id);
        }
        if (status) {
            whereClause += " AND status = ?";
            queryParams.push(status);
        }
        if (rating) {
            whereClause += " AND rating = ?";
            queryParams.push(rating);
        }
        if (search) {
            whereClause += " AND (vendor_name LIKE ? OR reviewer_name LIKE ? OR review_text LIKE ?)";
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
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
        // Get overall statistics
        const stats = await query(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star_reviews,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star_reviews,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star_reviews,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star_reviews,
        COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star_reviews,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_reviews,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_reviews,
        COUNT(CASE WHEN status = 'reported' THEN 1 END) as reported_reviews
      FROM vendor_reviews
    `);
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
        console.error("Error fetching all reviews:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getAllReviews = getAllReviews;
// Get review by ID (Admin)
const getReviewById = async (req, res) => {
    try {
        const { id } = req.params;
        const review = await query(`
      SELECT vr.*, vc.booking_id, vc.service_name, vc.consultation_date
      FROM vendor_reviews vr
      LEFT JOIN vendor_consultations vc ON vr.consultation_id = vc.id
      WHERE vr.id = ?
    `, [id]);
        if (review.length === 0) {
            res.status(404).json({
                success: false,
                message: "Review not found"
            });
            return;
        }
        res.json({
            success: true,
            data: review[0]
        });
    }
    catch (error) {
        console.error("Error fetching review:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getReviewById = getReviewById;
// Update review (Admin)
const updateReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewer_name, rating, review_text, status, admin_notes, is_verified } = req.body;
        // Validate rating if provided
        if (rating && (rating < 1 || rating > 5)) {
            res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5"
            });
            return;
        }
        // Check if review exists
        const review = await query("SELECT * FROM vendor_reviews WHERE id = ?", [id]);
        if (review.length === 0) {
            res.status(404).json({
                success: false,
                message: "Review not found"
            });
            return;
        }
        // Update review
        const updateQuery = `
      UPDATE vendor_reviews SET
        reviewer_name = COALESCE(?, reviewer_name),
        rating = COALESCE(?, rating),
        review_text = COALESCE(?, review_text),
        status = COALESCE(?, status),
        admin_notes = COALESCE(?, admin_notes),
        is_verified = COALESCE(?, is_verified),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
        await query(updateQuery, [
            reviewer_name, rating, review_text, status, admin_notes, is_verified, id
        ]);
        res.json({
            success: true,
            message: "Review updated successfully"
        });
    }
    catch (error) {
        console.error("Error updating review:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.updateReview = updateReview;
// Delete review (Admin)
const deleteReview = async (req, res) => {
    try {
        const { id } = req.params;
        // Check if review exists
        const review = await query("SELECT * FROM vendor_reviews WHERE id = ?", [id]);
        if (review.length === 0) {
            res.status(404).json({
                success: false,
                message: "Review not found"
            });
            return;
        }
        // Delete review
        await query("DELETE FROM vendor_reviews WHERE id = ?", [id]);
        res.json({
            success: true,
            message: "Review deleted successfully"
        });
    }
    catch (error) {
        console.error("Error deleting review:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.deleteReview = deleteReview;
// ============ VENDOR DASHBOARD STATISTICS ============
// Get vendor dashboard statistics (Admin)
const getVendorDashboardStats = async (req, res) => {
    try {
        const { vendor_id } = req.query;
        let whereClause = vendor_id ? "WHERE vendor_id = ?" : "";
        let queryParams = vendor_id ? [vendor_id] : [];
        // Get consultation statistics (exclude cancelled)
        const consultationStats = await query(`
      SELECT 
        COUNT(*) as total_consultations,
        SUM(amount_total) as total_revenue,
        COUNT(CASE WHEN booking_status = 'completed' THEN 1 END) as completed_consultations,
        COUNT(CASE WHEN booking_status = 'upcoming' THEN 1 END) as upcoming_consultations,
        COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_refunds
      FROM vendor_consultations 
      ${whereClause ? whereClause + ' AND booking_status != \'cancelled\'' : 'WHERE booking_status != \'cancelled\''}
    `, queryParams);
        // Get earnings statistics (exclude cancelled)
        const earningsStats = await query(`
      SELECT 
        SUM(net_amount) as total_earnings,
        SUM(CASE WHEN MONTH(transaction_date) = MONTH(CURDATE()) THEN net_amount ELSE 0 END) as this_month_earnings,
        SUM(CASE WHEN status = 'pending' THEN net_amount ELSE 0 END) as pending_earnings
      FROM vendor_earnings 
      ${whereClause ? whereClause + ' AND status != \'cancelled\'' : 'WHERE status != \'cancelled\''}
    `, queryParams);
        // Get review statistics
        const reviewStats = await query(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as average_rating,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_reviews
      FROM vendor_reviews 
      ${whereClause}
    `, queryParams);
        res.json({
            success: true,
            data: {
                consultations: consultationStats[0],
                earnings: earningsStats[0],
                reviews: reviewStats[0]
            }
        });
    }
    catch (error) {
        console.error("Error fetching vendor dashboard stats:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorDashboardStats = getVendorDashboardStats;
exports.default = {
    getAllConsultations: exports.getAllConsultations,
    getConsultationById: exports.getConsultationById,
    updateConsultationAdmin: exports.updateConsultationAdmin,
    getAllEarnings: exports.getAllEarnings,
    updateEarningStatus: exports.updateEarningStatus,
    getAllReviews: exports.getAllReviews,
    getReviewById: exports.getReviewById,
    updateReview: exports.updateReview,
    deleteReview: exports.deleteReview,
    getVendorDashboardStats: exports.getVendorDashboardStats
};
//# sourceMappingURL=AdminVendorConsultationController.js.map