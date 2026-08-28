import { Request, Response } from 'express';
import * as utils from "util";
import * as bcrypt from "bcrypt";
import * as multer from "multer";
import * as path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "images-2025-new";

// Configure multer for staff profile image uploads
const staffImageStorage = multer.memoryStorage();

export const uploadStaffImage = multer({
  storage: staffImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

// ============ STAFF PUBLIC AUTHENTICATION & PROFILE ============

export const staffAuth = {

  // POST /staff/register — staff registration
  async register(req: Request, res: Response): Promise<void> {
    try {
      const {
        first_name,
        last_name,
        middle_name,
        mobile_number,
        email,
        password,
        role_id
      } = req.body;

      // Basic validation
      if (!first_name || !last_name || !mobile_number || !email || !password || !role_id) {
        res.status(400).json({
          success: false,
          message: 'Required fields: first_name, last_name, mobile_number, email, password, role_id'
        });
        return;
      }

      // Check if email already exists
      const [existingEmail] = await query(
        'SELECT id FROM staff WHERE email = ?',
        [email]
      );

      if (existingEmail) {
        res.status(409).json({
          success: false,
          message: 'Email already exists'
        });
        return;
      }

      // Check if mobile number already exists
      const [existingMobile] = await query(
        'SELECT id FROM staff WHERE mobile_number = ?',
        [mobile_number]
      );

      if (existingMobile) {
        res.status(409).json({
          success: false,
          message: 'Mobile number already exists'
        });
        return;
      }

      // Validate role (exclude admin=2, user=1, vendor=7)
      const [role] = await query(
        'SELECT id FROM user_type_master WHERE id = ? AND id NOT IN (1,7) AND is_active = 1',
        [parseInt(role_id)]
      );

      if (!role) {
        res.status(400).json({
          success: false,
          message: 'Invalid role ID or role not available for staff'
        });
        return;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Handle profile image upload if provided
      let profile_image_url = null;
      if (req.file) {
        try {
          const fileExtension = path.extname(req.file.originalname);
          const fileName = `staff/profiles/${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;

          const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
          };

          await s3Client.send(new PutObjectCommand(uploadParams));
          profile_image_url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
        } catch (uploadError) {
          console.error('Profile image upload error:', uploadError);
          res.status(500).json({
            success: false,
            message: 'Failed to upload profile image'
          });
          return;
        }
      }

      // Insert staff member
      const result: any = await query(
        `INSERT INTO staff (
          first_name, last_name, middle_name, mobile_number, email, password,
          role_id, profile_image_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          first_name,
          last_name,
          middle_name || null,
          mobile_number,
          email,
          hashedPassword,
          parseInt(role_id),
          profile_image_url
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Staff registration successful',
        data: {
          id: result.insertId,
          first_name,
          last_name,
          middle_name,
          email,
          mobile_number,
          role_id: parseInt(role_id),
          profile_image_url
        }
      });
    } catch (error: any) {
      console.error("Staff Registration Error:", error);

      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({
          success: false,
          message: 'Email or mobile number already exists'
        });
        return;
      }

      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // POST /staff/login — staff login
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
        return;
      }

      // Get staff member with role info
      const [staff] = await query(
        `SELECT s.*, utm.type_name as role_name, utm.description as role_description,
                utm.permissions_version
         FROM staff s
         LEFT JOIN user_type_master utm ON s.role_id = utm.id
         WHERE s.email = ? AND s.status = 'active'`,
        [email]
      );

      if (!staff) {
        res.status(401).json({
          success: false,
          message: 'Invalid credentials or account inactive'
        });
        return;
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, staff.password);
      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
        return;
      }

      // Get menu permissions for the role
      const menuPermissions = await query(
        `SELECT
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
         ORDER BY mm.parent_id ASC, mm.sort_order ASC`,
        [staff.role_id]
      );

      // Organize menus in hierarchical structure
      const organizeMenus = (menus: any[]) => {
        const menuMap = new Map();
        const rootMenus: any[] = [];

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
          } else {
            const parent = menuMap.get(menu.parent_id);
            if (parent) {
              parent.children.push(menu);
            }
          }
        });

        return rootMenus;
      };

      const organizedMenus = organizeMenus(menuPermissions);

      // Generate JWT token
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        {
          staff_id: staff.id,
          email: staff.email,
          user_type: 'staff',
          role_id: staff.role_id,
          role_name: staff.role_name,
          permissions_version: staff.permissions_version ?? 0
        },
        process.env.JWT_SECRET_KEY,
        { expiresIn: '24h' }
      );

      // Remove password from response
      const { password: _, ...staffData } = staff;

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          staff: staffData,
          token,
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
    } catch (error) {
      console.error("Staff Login Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // GET /staff/profile — get current staff profile
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const staffId = (req as any).staff?.staff_id;

      const [staff] = await query(
        `SELECT s.*, utm.type_name as role_name, utm.description as role_description
         FROM staff s
         LEFT JOIN user_type_master utm ON s.role_id = utm.id
         WHERE s.id = ?`,
        [staffId]
      );

      if (!staff) {
        res.status(404).json({
          success: false,
          message: 'Staff profile not found'
        });
        return;
      }

      // Remove password from response
      const { password, ...staffData } = staff;

      res.status(200).json({
        success: true,
        message: 'Profile retrieved successfully',
        data: staffData
      });
    } catch (error) {
      console.error("Get Staff Profile Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // PUT /staff/profile — update staff profile
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const staffId = (req as any).staff?.staff_id;
      const {
        first_name,
        last_name,
        middle_name,
        mobile_number,
        email
      } = req.body;

      // Get current staff data
      const [existingStaff] = await query(
        'SELECT * FROM staff WHERE id = ?',
        [staffId]
      );

      if (!existingStaff) {
        res.status(404).json({
          success: false,
          message: 'Staff profile not found'
        });
        return;
      }

      // Check if email is being updated and already exists
      if (email && email !== existingStaff.email) {
        const [emailExists] = await query(
          'SELECT id FROM staff WHERE email = ? AND id != ?',
          [email, staffId]
        );
        if (emailExists) {
          res.status(409).json({
            success: false,
            message: 'Email already exists'
          });
          return;
        }
      }

      // Check if mobile number is being updated and already exists
      if (mobile_number && mobile_number !== existingStaff.mobile_number) {
        const [mobileExists] = await query(
          'SELECT id FROM staff WHERE mobile_number = ? AND id != ?',
          [mobile_number, staffId]
        );
        if (mobileExists) {
          res.status(409).json({
            success: false,
            message: 'Mobile number already exists'
          });
          return;
        }
      }

      // Handle profile image upload if provided
      let profile_image_url = existingStaff.profile_image_url;
      if (req.file) {
        try {
          const fileExtension = path.extname(req.file.originalname);
          const fileName = `staff/profiles/${staffId}_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;

          const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
          };

          await s3Client.send(new PutObjectCommand(uploadParams));
          profile_image_url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

          // Delete old image from S3 if it exists
          if (existingStaff.profile_image_url) {
            try {
              const oldKey = existingStaff.profile_image_url.split('.amazonaws.com/')[1];
              if (oldKey) {
                await s3Client.send(new DeleteObjectCommand({
                  Bucket: BUCKET_NAME,
                  Key: oldKey
                }));
              }
            } catch (deleteError) {
              console.error('Old image delete error:', deleteError);
            }
          }
        } catch (uploadError) {
          console.error('Profile image upload error:', uploadError);
          res.status(500).json({
            success: false,
            message: 'Failed to upload profile image'
          });
          return;
        }
      }

      // Build update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (first_name !== undefined) {
        updateFields.push('first_name = ?');
        updateValues.push(first_name);
      }
      if (last_name !== undefined) {
        updateFields.push('last_name = ?');
        updateValues.push(last_name);
      }
      if (middle_name !== undefined) {
        updateFields.push('middle_name = ?');
        updateValues.push(middle_name);
      }
      if (mobile_number !== undefined) {
        updateFields.push('mobile_number = ?');
        updateValues.push(mobile_number);
      }
      if (email !== undefined) {
        updateFields.push('email = ?');
        updateValues.push(email);
      }

      // Always update profile image and timestamp
      updateFields.push('profile_image_url = ?', 'updated_at = CURRENT_TIMESTAMP');
      updateValues.push(profile_image_url);
      updateValues.push(staffId);

      if (updateFields.length === 2) { // Only image and timestamp
        res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
        return;
      }

      const updateQuery = `UPDATE staff SET ${updateFields.join(', ')} WHERE id = ?`;
      await query(updateQuery, updateValues);

      // Get updated staff profile with role information
      const [updatedStaff] = await query(
        `SELECT s.*, utm.type_name as role_name, utm.description as role_description
         FROM staff s
         LEFT JOIN user_type_master utm ON s.role_id = utm.id
         WHERE s.id = ?`,
        [staffId]
      );

      // Remove password from response
      const { password, ...staffData } = updatedStaff;

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          ...staffData,
          image_updated: !!req.file
        }
      });
    } catch (error: any) {
      console.error("Update Staff Profile Error:", error);

      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({
          success: false,
          message: 'Email or mobile number already exists'
        });
        return;
      }

      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // PUT /staff/change-password — change staff password
  async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const staffId = (req as any).staff?.staff_id;
      const { current_password, new_password, confirm_password } = req.body;

      if (!current_password || !new_password || !confirm_password) {
        res.status(400).json({
          success: false,
          message: 'Current password, new password, and confirm password are required'
        });
        return;
      }

      if (new_password !== confirm_password) {
        res.status(400).json({
          success: false,
          message: 'New password and confirm password do not match'
        });
        return;
      }

      if (new_password.length < 6) {
        res.status(400).json({
          success: false,
          message: 'New password must be at least 6 characters long'
        });
        return;
      }

      // Get current staff data
      const [staff] = await query(
        'SELECT id, password FROM staff WHERE id = ?',
        [staffId]
      );

      if (!staff) {
        res.status(404).json({
          success: false,
          message: 'Staff not found'
        });
        return;
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(current_password, staff.password);
      if (!isCurrentPasswordValid) {
        res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
        return;
      }

      // Hash new password
      const hashedNewPassword = await bcrypt.hash(new_password, 10);

      // Update password
      await query(
        'UPDATE staff SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedNewPassword, staffId]
      );

      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error("Change Staff Password Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // GET /staff/roles — get available roles for registration
  async getAvailableRoles(req: Request, res: Response): Promise<void> {
    try {
      const roles = await query(
        `SELECT id, type_name as role_name, description
         FROM user_type_master
         WHERE id NOT IN (1, 2, 7) AND is_active = 1
         ORDER BY type_name ASC`
      );

      res.status(200).json({
        success: true,
        message: 'Available roles retrieved successfully',
        data: roles
      });
    } catch (error) {
      console.error("Get Available Roles Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // GET /staff/menus — get menu permissions for current staff
  async getMenuPermissions(req: Request, res: Response): Promise<void> {
    try {
      const staffId = (req as any).staff?.staff_id;
      const roleId = (req as any).staff?.role_id;

      if (!roleId) {
        res.status(400).json({
          success: false,
          message: 'Role information not found in token'
        });
        return;
      }

      // Get menu permissions for the role
      const menuPermissions = await query(
        `SELECT
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
         ORDER BY mm.parent_id ASC, mm.sort_order ASC`,
        [roleId]
      );

      // Organize menus in hierarchical structure
      const organizeMenus = (menus: any[]) => {
        const menuMap = new Map();
        const rootMenus: any[] = [];

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
          } else {
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
    } catch (error) {
      console.error("Get Menu Permissions Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

};

// ============ STAFF MANAGEMENT ============

export const staffManagement = {

  // GET /admin/staff — list all staff with pagination and filters
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        search = "",
        role_id,
        status
      } = req.query;

      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 10;
      const offset = (pageNum - 1) * limitNum;

      let whereConditions: string[] = [];
      let queryParams: any[] = [];

      // Build where conditions
      if (status) {
        whereConditions.push('s.status = ?');
        queryParams.push(status);
      }

      if (role_id) {
        whereConditions.push('s.role_id = ?');
        queryParams.push(parseInt(role_id as string));
      }

      if (search) {
        whereConditions.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR s.email LIKE ? OR s.mobile_number LIKE ?)');
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count
      const [{ total }] = await query(
        `SELECT COUNT(*) as total FROM staff s ${whereClause}`,
        queryParams
      );

      // Get staff with pagination
      const staff = await query(
        `SELECT s.*, utm.type_name as role_name, utm.description as role_description
         FROM staff s
         LEFT JOIN user_type_master utm ON s.role_id = utm.id
         ${whereClause}
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`,
        [...queryParams, limitNum, offset]
      );

      // Remove passwords from response
      const staffWithoutPasswords = staff.map(({ password, ...staffMember }: any) => staffMember);

      res.status(200).json({
        success: true,
        message: 'Staff members retrieved successfully',
        data: staffWithoutPasswords,
        pagination: {
          total: total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      console.error("Get Staff Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // GET /admin/staff/:id — get staff by ID
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const staffId = parseInt(id as string);

      if (isNaN(staffId)) {
        res.status(400).json({
          success: false,
          message: 'Please provide a valid staff ID'
        });
        return;
      }

      const [staff] = await query(
        `SELECT s.*, utm.type_name as role_name, utm.description as role_description
         FROM staff s
         LEFT JOIN user_type_master utm ON s.role_id = utm.id
         WHERE s.id = ?`,
        [staffId]
      );

      if (!staff) {
        res.status(404).json({
          success: false,
          message: 'Staff member not found'
        });
        return;
      }

      // Remove password from response
      const { password, ...staffWithoutPassword } = staff;

      res.status(200).json({
        success: true,
        message: 'Staff member retrieved successfully',
        data: staffWithoutPassword
      });
    } catch (error) {
      console.error("Get Staff by ID Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // GET /admin/staff/role/:roleId — get staff by role ID
  async getByRoleId(req: Request, res: Response): Promise<void> {
    try {
      const { roleId } = req.params;
      const roleIdNum = parseInt(roleId as string);

      if (isNaN(roleIdNum)) {
        res.status(400).json({
          success: false,
          message: 'Please provide a valid role ID'
        });
        return;
      }

      const staff = await query(
        `SELECT s.*, utm.type_name as role_name, utm.description as role_description
         FROM staff s
         LEFT JOIN user_type_master utm ON s.role_id = utm.id
         WHERE s.role_id = ?
         ORDER BY s.created_at DESC`,
        [roleIdNum]
      );

      // Remove passwords from response
      const staffWithoutPasswords = staff.map(({ password, ...staffMember }: any) => staffMember);

      res.status(200).json({
        success: true,
        message: 'Staff members retrieved successfully',
        data: staffWithoutPasswords
      });
    } catch (error) {
      console.error("Get Staff by Role ID Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // POST /admin/staff — create new staff member with profile image upload
  async create(req: Request, res: Response): Promise<void> {
    try {
      // Handle both JSON and form-data
      const data = req.body;
      const {
        first_name,
        last_name,
        middle_name,
        mobile_number,
        email,
        password,
        role_id,
        status = 'active'
      } = data;

      // Basic validation
      if (!first_name || !last_name || !mobile_number || !email || !password || !role_id) {
        res.status(400).json({
          success: false,
          message: 'Required fields: first_name, last_name, mobile_number, email, password, role_id'
        });
        return;
      }

      const adminId = (req as any).admin?.user_id || (req as any).user?.id;

      // Check if email already exists
      const [existingEmail] = await query(
        'SELECT id FROM staff WHERE email = ?',
        [email]
      );

      if (existingEmail) {
        res.status(409).json({
          success: false,
          message: 'Email already exists'
        });
        return;
      }

      // Check if mobile number already exists
      const [existingMobile] = await query(
        'SELECT id FROM staff WHERE mobile_number = ?',
        [mobile_number]
      );

      if (existingMobile) {
        res.status(409).json({
          success: false,
          message: 'Mobile number already exists'
        });
        return;
      }

      // Validate role (exclude admin=2, user=1, vendor=7)
      const [role] = await query(
        'SELECT id FROM user_type_master WHERE id = ? AND id NOT IN (1, 2, 7) AND is_active = 1',
        [parseInt(role_id)]
      );

      if (!role) {
        res.status(400).json({
          success: false,
          message: 'Invalid role ID or role not available for staff'
        });
        return;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Handle profile image upload if provided
      let profile_image_url = null;
      if (req.file) {
        try {
          const fileExtension = path.extname(req.file.originalname);
          const fileName = `staff/profiles/${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;

          // Upload to S3
          const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
          };

          await s3Client.send(new PutObjectCommand(uploadParams));
          profile_image_url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
        } catch (uploadError) {
          console.error('Profile image upload error:', uploadError);
          res.status(500).json({
            success: false,
            message: 'Failed to upload profile image'
          });
          return;
        }
      }

      // Insert staff member
      const result: any = await query(
        `INSERT INTO staff (
          first_name, last_name, middle_name, mobile_number, email, password,
          role_id, profile_image_url, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          first_name,
          last_name,
          middle_name || null,
          mobile_number,
          email,
          hashedPassword,
          parseInt(role_id),
          profile_image_url,
          status,
          adminId || null
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Staff member created successfully',
        data: {
          id: result.insertId,
          first_name,
          last_name,
          middle_name,
          email,
          mobile_number,
          role_id: parseInt(role_id),
          status,
          profile_image_url: profile_image_url
        }
      });
    } catch (error: any) {
      console.error("Create Staff Error:", error);

      // Handle duplicate entry errors
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({
          success: false,
          message: 'Email or mobile number already exists'
        });
        return;
      }

      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // PUT /admin/staff/:id — update staff member with profile image upload
  async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const staffId = parseInt(id as string);
      const {
        first_name,
        last_name,
        middle_name,
        mobile_number,
        email,
        password,
        role_id,
        status
      } = req.body;
      const adminId = (req as any).user?.id;

      if (isNaN(staffId)) {
        res.status(400).json({
          success: false,
          message: 'Please provide a valid staff ID'
        });
        return;
      }

      // Check if staff exists
      const [existingStaff] = await query(
        'SELECT * FROM staff WHERE id = ?',
        [staffId]
      );

      if (!existingStaff) {
        res.status(404).json({
          success: false,
          message: 'Staff member not found'
        });
        return;
      }

      // Check if email is being updated and already exists
      if (email && email !== existingStaff.email) {
        const [emailExists] = await query(
          'SELECT id FROM staff WHERE email = ? AND id != ?',
          [email, staffId]
        );
        if (emailExists) {
          res.status(409).json({
            success: false,
            message: 'Email already exists'
          });
          return;
        }
      }

      // Check if mobile number is being updated and already exists
      if (mobile_number && mobile_number !== existingStaff.mobile_number) {
        const [mobileExists] = await query(
          'SELECT id FROM staff WHERE mobile_number = ? AND id != ?',
          [mobile_number, staffId]
        );
        if (mobileExists) {
          res.status(409).json({
            success: false,
            message: 'Mobile number already exists'
          });
          return;
        }
      }

      // Validate role if provided (exclude admin=2, user=1, vendor=7)
      if (role_id) {
        const [role] = await query(
          'SELECT id FROM user_type_master WHERE id = ? AND id NOT IN (1, 2, 7) AND is_active = 1',
          [role_id]
        );
        if (!role) {
          res.status(400).json({
            success: false,
            message: 'Invalid role ID or role not available for staff'
          });
          return;
        }
      }

      // Handle profile image upload if provided
      let profile_image_url = existingStaff.profile_image_url; // Keep existing image by default
      if (req.file) {
        try {
          const fileExtension = path.extname(req.file.originalname);
          const fileName = `staff/profiles/${staffId}_${Date.now()}_${Math.random().toString(36).substring(7)}${fileExtension}`;

          // Upload new image to S3
          const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
          };

          await s3Client.send(new PutObjectCommand(uploadParams));
          profile_image_url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

          // Delete old image from S3 if it exists
          if (existingStaff.profile_image_url) {
            try {
              const oldKey = existingStaff.profile_image_url.split('.amazonaws.com/')[1];
              if (oldKey) {
                await s3Client.send(new DeleteObjectCommand({
                  Bucket: BUCKET_NAME,
                  Key: oldKey
                }));
              }
            } catch (deleteError) {
              console.error('Old image delete error:', deleteError);
              // Continue even if old image deletion fails
            }
          }
        } catch (uploadError) {
          console.error('Profile image upload error:', uploadError);
          res.status(500).json({
            success: false,
            message: 'Failed to upload profile image'
          });
          return;
        }
      }

      // Build update query dynamically
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (first_name !== undefined) {
        updateFields.push('first_name = ?');
        updateValues.push(first_name);
      }
      if (last_name !== undefined) {
        updateFields.push('last_name = ?');
        updateValues.push(last_name);
      }
      if (middle_name !== undefined) {
        updateFields.push('middle_name = ?');
        updateValues.push(middle_name);
      }
      if (mobile_number !== undefined) {
        updateFields.push('mobile_number = ?');
        updateValues.push(mobile_number);
      }
      if (email !== undefined) {
        updateFields.push('email = ?');
        updateValues.push(email);
      }
      if (password !== undefined) {
        const hashedPassword = await bcrypt.hash(password, 10);
        updateFields.push('password = ?');
        updateValues.push(hashedPassword);
      }
      if (role_id !== undefined) {
        updateFields.push('role_id = ?');
        updateValues.push(role_id);
      }
      if (status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(status);
      }

      // Always update profile_image_url (either new or existing)
      updateFields.push('profile_image_url = ?');
      updateValues.push(profile_image_url);

      if (updateFields.length === 1) { // Only profile_image_url was added
        res.status(400).json({
          success: false,
          message: 'No fields to update'
        });
        return;
      }

      // Add updated_by and updated_at
      updateFields.push('updated_by = ?', 'updated_at = CURRENT_TIMESTAMP');
      updateValues.push(adminId);
      updateValues.push(staffId);

      const updateQuery = `
        UPDATE staff SET ${updateFields.join(', ')}
        WHERE id = ?
      `;

      const result: any = await query(updateQuery, updateValues);

      if (result.affectedRows === 0) {
        res.status(400).json({
          success: false,
          message: 'No changes made or staff member not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Staff member updated successfully',
        data: {
          profile_image_url: profile_image_url,
          image_updated: !!req.file
        }
      });
    } catch (error: any) {
      console.error("Update Staff Error:", error);

      // Handle duplicate entry errors
      if (error.code === 'ER_DUP_ENTRY') {
        res.status(409).json({
          success: false,
          message: 'Email or mobile number already exists'
        });
        return;
      }

      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // DELETE /admin/staff/:id — soft delete (change status to inactive)
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const staffId = parseInt(id as string);
      const adminId = (req as any).user?.id;

      if (isNaN(staffId)) {
        res.status(400).json({
          success: false,
          message: 'Please provide a valid staff ID'
        });
        return;
      }

      // Check if staff exists
      const [existingStaff] = await query(
        'SELECT id, first_name, last_name, status FROM staff WHERE id = ?',
        [staffId]
      );

      if (!existingStaff) {
        res.status(404).json({
          success: false,
          message: 'Staff member not found'
        });
        return;
      }

      // Soft delete - set status to inactive
      const result: any = await query(
        `UPDATE staff SET
          status = 'inactive',
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [adminId, staffId]
      );

      if (result.affectedRows === 0) {
        res.status(400).json({
          success: false,
          message: 'Failed to delete staff member'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Staff member deleted successfully'
      });
    } catch (error) {
      console.error("Delete Staff Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // PUT /admin/staff/:id/status — change staff status
  async changeStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const staffId = parseInt(id as string);
      const adminId = (req as any).user?.id;

      if (isNaN(staffId)) {
        res.status(400).json({
          success: false,
          message: 'Please provide a valid staff ID'
        });
        return;
      }

      if (!['active', 'inactive'].includes(status)) {
        res.status(400).json({
          success: false,
          message: 'Status must be either active or inactive'
        });
        return;
      }

      // Check if staff exists
      const [existingStaff] = await query(
        'SELECT id, first_name, last_name, status FROM staff WHERE id = ?',
        [staffId]
      );

      if (!existingStaff) {
        res.status(404).json({
          success: false,
          message: 'Staff member not found'
        });
        return;
      }

      // Update status
      const result: any = await query(
        `UPDATE staff SET
          status = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
        [status, adminId, staffId]
      );

      if (result.affectedRows === 0) {
        res.status(400).json({
          success: false,
          message: 'Failed to update staff status'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `Staff member ${status === 'active' ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      console.error("Change Staff Status Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // GET /admin/staff/roles — get available staff roles (excluding admin, user, vendor)
  async getAvailableRoles(req: Request, res: Response): Promise<void> {
    try {
      const roles = await query(
        `SELECT id, type_name as role_name, description, is_active as status
         FROM user_type_master
         WHERE id NOT IN (1, 2, 7) AND is_active = 1
         ORDER BY type_name ASC`
      );

      res.status(200).json({
        success: true,
        message: 'Available staff roles retrieved successfully',
        data: roles
      });
    } catch (error) {
      console.error("Get Available Staff Roles Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // PUT /admin/staff/:userId/role — assign a role to a staff member (kept for backward compatibility)
  async assignRole(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { role_id } = req.body;
      const adminId = (req as any).user?.id;

      if (!role_id) {
        res.status(400).json({ success: false, message: "role_id is required" });
        return;
      }

      const [staff] = await query("SELECT id, role_id FROM staff WHERE id = ?", [userId]);
      if (!staff) {
        res.status(404).json({ success: false, message: "Staff member not found" });
        return;
      }

      // Validate role (exclude admin=2, user=1, vendor=7)
      const [role] = await query(
        "SELECT id FROM user_type_master WHERE id = ? AND id NOT IN (1, 2, 7) AND is_active = 1",
        [role_id]
      );
      if (!role) {
        res.status(404).json({ success: false, message: "Role not found or not available for staff" });
        return;
      }

      await query(
        "UPDATE staff SET role_id = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [role_id, adminId, userId]
      );

      res.status(200).json({ success: true, message: "Role assigned successfully" });
    } catch (error) {
      console.error("Assign Role Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },
};