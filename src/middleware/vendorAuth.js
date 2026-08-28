"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalVendorToken = exports.verifyVendorToken = void 0;
const jwt = require("jsonwebtoken");
const utils = require("util");
const db = require('../database');
const query = utils.promisify(db.query).bind(db);
// Verify Vendor Token Middleware
const verifyVendorToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
            return;
        }
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        try {
            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || 'your-secret-key');
            // Check if user type is vendor
            if (decoded.user_type !== 'vendor') {
                res.status(403).json({
                    success: false,
                    message: 'Access denied. Vendor access required.'
                });
                return;
            }
            // Verify vendor exists (removed status check to allow all statuses)
            const vendor = await query('SELECT id, email, status FROM vendors WHERE id = ?', [decoded.id]);
            if (vendor.length === 0) {
                res.status(401).json({
                    success: false,
                    message: 'Invalid token or vendor account not found'
                });
                return;
            }
            // Add user info to request object
            req.user = decoded;
            next();
        }
        catch (jwtError) {
            res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
            return;
        }
    }
    catch (error) {
        console.error('Error in vendor token verification:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
};
exports.verifyVendorToken = verifyVendorToken;
// Optional Vendor Token Middleware (for routes that work with or without authentication)
const optionalVendorToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without authentication
            next();
            return;
        }
        const token = authHeader.substring(7);
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || 'your-secret-key');
            if (decoded.user_type === 'vendor') {
                // Verify vendor exists (removed status check to allow all statuses)
                const vendor = await query('SELECT id, email, status FROM vendors WHERE id = ?', [decoded.id]);
                if (vendor.length > 0) {
                    req.user = decoded;
                }
            }
        }
        catch (jwtError) {
            // Invalid token, but continue without authentication
            console.log('Invalid token in optional middleware:', jwtError);
        }
        next();
    }
    catch (error) {
        console.error('Error in optional vendor token verification:', error);
        next(); // Continue even if there's an error
    }
};
exports.optionalVendorToken = optionalVendorToken;
//# sourceMappingURL=vendorAuth.js.map