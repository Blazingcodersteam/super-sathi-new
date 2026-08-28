import { Router } from 'express';
import { staffManagement, uploadStaffImage, staffAuth } from '../Controllers/StaffController';

const router = Router();
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
router.post('/register', uploadStaffImage.single('profile_image'), staffAuth.register);                     // Staff registration with image
router.post('/login', staffAuth.login);                                                                      // Staff login
router.get('/roles', staffAuth.getAvailableRoles);                                                          // Get available roles for registration

// Staff Profile Routes (Protected)
router.get('/profile', verifyStaff, staffAuth.getProfile);                                                  // Get current staff profile
router.get('/menus', verifyStaff, staffAuth.getMenuPermissions);                                           // Get menu permissions for current staff
router.put('/profile', verifyStaff, uploadStaffImage.single('profile_image'), staffAuth.updateProfile);   // Update staff profile with image
router.put('/change-password', verifyStaff, staffAuth.changePassword);                                     // Change staff password

// ============ ADMIN STAFF MANAGEMENT ROUTES ============
router.get('/staff', verifyAdmin, staffManagement.getAll);                                                    // Get all staff with pagination and filters
router.get('/staff/roles', verifyAdmin, staffManagement.getAvailableRoles);                                  // Get available staff roles
router.get('/staff/:id', verifyAdmin, staffManagement.getById);                                              // Get staff by ID
router.get('/staff/role/:roleId', verifyAdmin, staffManagement.getByRoleId);                                 // Get staff by role ID
router.post('/staff', verifyAdmin, uploadStaffImage.single('profile_image'), staffManagement.create);       // Create new staff member with image
router.put('/staff/:id', verifyAdmin, uploadStaffImage.single('profile_image'), staffManagement.update);    // Update staff member with image
router.put('/staff/:id/status', verifyAdmin, staffManagement.changeStatus);                                  // Change staff status
router.put('/staff/:userId/role', verifyAdmin, staffManagement.assignRole);                                  // Assign role (backward compatibility)
router.delete('/staff/:id', verifyAdmin, staffManagement.delete);                                            // Soft delete staff member

export default router;