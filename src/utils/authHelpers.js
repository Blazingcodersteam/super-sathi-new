"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isVendorUserType = exports.getUserTypeInfo = exports.getAuthenticatedUser = void 0;
const jwt = require("jsonwebtoken");
const utils = require("util");
const db = require('../database');
const query = utils.promisify(db.query).bind(db);
// Universal authentication helper
const getAuthenticatedUser = async (token) => {
    try {
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || 'your-secret-key');
        let userData = null;
        if (decoded.user_type === 'vendor') {
            // Get vendor data
            const vendor = await query(`
        SELECT
          v.*,
          vc.title as category_name,
          vc.description as category_description
        FROM vendors v
        LEFT JOIN vendor_categories vc ON v.category_id = vc.id
        WHERE v.id = ? AND v.status = 'active'
      `, [decoded.id]);
            if (vendor.length > 0) {
                userData = Object.assign(Object.assign({}, vendor[0]), { user_type: 'vendor', table_source: 'vendors' });
                // Remove password from response
                delete userData.password;
            }
        }
        else if (decoded.user_type === 'user') {
            // Get user data from users table
            const user = await query(`
        SELECT u.*, ut.type_name as user_type_name
        FROM users u
        LEFT JOIN user_type_master ut ON u.user_type_id = ut.id
        WHERE u.id = ? AND u.status = 'active'
      `, [decoded.id]);
            if (user.length > 0) {
                userData = Object.assign(Object.assign({}, user[0]), { user_type: 'user', table_source: 'users' });
                // Remove password from response
                delete userData.password;
            }
        }
        return userData;
    }
    catch (error) {
        throw new Error('Invalid or expired token');
    }
};
exports.getAuthenticatedUser = getAuthenticatedUser;
// Get user type from user_type_master
const getUserTypeInfo = async (userTypeId) => {
    try {
        const userType = await query('SELECT * FROM user_type_master WHERE id = ? AND status = 1', [userTypeId]);
        return userType.length > 0 ? userType[0] : null;
    }
    catch (error) {
        throw new Error('Error fetching user type information');
    }
};
exports.getUserTypeInfo = getUserTypeInfo;
// Check if user type is vendor
const isVendorUserType = async (userTypeId) => {
    try {
        const userType = await query("SELECT id FROM user_type_master WHERE id = ? AND type_name = 'vendor' AND status = 1", [userTypeId]);
        return userType.length > 0;
    }
    catch (error) {
        return false;
    }
};
exports.isVendorUserType = isVendorUserType;
//# sourceMappingURL=authHelpers.js.map