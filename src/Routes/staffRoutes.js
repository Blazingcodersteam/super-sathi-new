"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const StaffController_1 = require("../Controllers/StaffController");
const router = (0, express_1.Router)();
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET_KEY;
// Admin authentication middleware
const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
        return res.status(403).json({ message: "No token provided" });
    }
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Invalid token", error: err.message });
        }
        if (decoded.user_type !== "admin") {
            return res.status(403).json({ message: "Admin access required" });
        }
        req.admin = decoded;
        next();
    });
};
// Staff authentication middleware
const verifyStaff = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
        return res.status(403).json({ message: "No token provided" });
    }
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Invalid token", error: err.message });
        }
        if (decoded.user_type !== "staff") {
            return res.status(403).json({ message: "Staff access required" });
        }
        req.staff = decoded;
        next();
    });
};
// ============ PUBLIC STAFF ROUTES ============
// Staff Authentication Routes (Public)
router.post('/register', StaffController_1.uploadStaffImage.single('profile_image'), StaffController_1.staffAuth.register); // Staff registration with image
router.post('/login', StaffController_1.staffAuth.login); // Staff login
router.get('/roles', StaffController_1.staffAuth.getAvailableRoles); // Get available roles for registration
// Staff Profile Routes (Protected)
router.get('/profile', verifyStaff, StaffController_1.staffAuth.getProfile); // Get current staff profile
router.get('/menus', verifyStaff, StaffController_1.staffAuth.getMenuPermissions); // Get menu permissions for current staff
router.put('/profile', verifyStaff, StaffController_1.uploadStaffImage.single('profile_image'), StaffController_1.staffAuth.updateProfile); // Update staff profile with image
router.put('/change-password', verifyStaff, StaffController_1.staffAuth.changePassword); // Change staff password
// ============ ADMIN STAFF MANAGEMENT ROUTES ============
router.get('/staff', verifyAdmin, StaffController_1.staffManagement.getAll); // Get all staff with pagination and filters
router.get('/staff/roles', verifyAdmin, StaffController_1.staffManagement.getAvailableRoles); // Get available staff roles
router.get('/staff/:id', verifyAdmin, StaffController_1.staffManagement.getById); // Get staff by ID
router.get('/staff/role/:roleId', verifyAdmin, StaffController_1.staffManagement.getByRoleId); // Get staff by role ID
router.post('/staff', verifyAdmin, StaffController_1.uploadStaffImage.single('profile_image'), StaffController_1.staffManagement.create); // Create new staff member with image
router.put('/staff/:id', verifyAdmin, StaffController_1.uploadStaffImage.single('profile_image'), StaffController_1.staffManagement.update); // Update staff member with image
router.put('/staff/:id/status', verifyAdmin, StaffController_1.staffManagement.changeStatus); // Change staff status
router.put('/staff/:userId/role', verifyAdmin, StaffController_1.staffManagement.assignRole); // Assign role (backward compatibility)
router.delete('/staff/:id', verifyAdmin, StaffController_1.staffManagement.delete); // Soft delete staff member
exports.default = router;
//# sourceMappingURL=staffRoutes.js.map