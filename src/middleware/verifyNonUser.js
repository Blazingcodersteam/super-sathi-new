"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyNonUser = void 0;
const jwt = require('jsonwebtoken');
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const db = require('../database');
const utils = require('util');
const query = utils.promisify(db.query).bind(db);
const verifyNonUser = async (req, res, next) => {
    try {
        const authHeader = req.headers["authorization"];
        if (!authHeader) {
            return res.status(403).json({ message: "No token provided" });
        }
        const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET_KEY);
        }
        catch (err) {
            console.log('JWT verification error:', err.message);
            return res.status(401).json({ message: "Invalid token", error: err.message });
        }
        console.log('Decoded token:', decoded);
        // Block access for regular users
        if (decoded.user_type === "user" || decoded.role_id === 1) {
            return res.status(403).json({ message: 'Access denied. Users not allowed.' });
        }
        // For staff tokens — verify permissions_version hasn't changed
        if (decoded.user_type === 'staff' && decoded.role_id && decoded.permissions_version !== undefined) {
            try {
                const [role] = await query('SELECT permissions_version FROM user_type_master WHERE id = ? AND is_active = 1', [decoded.role_id]);
                if (role && role.permissions_version !== decoded.permissions_version) {
                    return res.status(401).json({
                        message: 'Session expired. Permissions have been updated. Please login again.',
                        permissions_changed: true
                    });
                }
            }
            catch (_) {
                // DB error — allow through to avoid blocking valid staff
            }
        }
        req.admin = decoded;
        next();
    }
    catch (error) {
        console.log('Middleware error:', error);
        res.status(400).json({ message: 'Invalid token.' });
    }
};
exports.verifyNonUser = verifyNonUser;
//# sourceMappingURL=verifyNonUser.js.map