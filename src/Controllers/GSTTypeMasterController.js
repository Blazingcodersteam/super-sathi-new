"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gstTypeMaster = void 0;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// GST Type Master CRUD operations
exports.gstTypeMaster = {
    // Get all GST types
    async getAll(req, res) {
        try {
            const { page = 1, limit = 10, search = "" } = req.query;
            const offset = (page - 1) * limit;
            // Ensure tax_percentage column exists
            try {
                await query(`ALTER TABLE gst_type_master ADD COLUMN tax_percentage DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Tax percentage for this GST type'`);
            }
            catch (alterError) {
                // Column might already exist, ignore error
            }
            let whereClause = "WHERE is_active = 1";
            let params = [];
            if (search) {
                whereClause += " AND (gst_type_name LIKE ? OR gst_type_code LIKE ?)";
                params = [`%${search}%`, `%${search}%`];
            }
            const records = await query(`SELECT id, gst_type_name, gst_type_code, description, 
         COALESCE(tax_percentage, 0.00) as tax_percentage, is_active, created_at, updated_at 
         FROM gst_type_master ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
            const [{ total }] = await query(`SELECT COUNT(*) as total FROM gst_type_master ${whereClause}`, params);
            res.json({
                success: true,
                data: records,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        }
        catch (error) {
            console.error("Get GST Type Master Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // Get GST type by ID
    async getById(req, res) {
        try {
            const { id } = req.params;
            // Ensure tax_percentage column exists
            try {
                await query(`ALTER TABLE gst_type_master ADD COLUMN tax_percentage DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Tax percentage for this GST type'`);
            }
            catch (alterError) {
                // Column might already exist, ignore error
            }
            const [record] = await query(`SELECT id, gst_type_name, gst_type_code, description, 
         COALESCE(tax_percentage, 0.00) as tax_percentage, is_active, created_at, updated_at 
         FROM gst_type_master WHERE id = ? AND is_active = 1`, [id]);
            if (!record) {
                return res.status(404).json({
                    success: false,
                    message: "GST type not found",
                });
            }
            res.json({
                success: true,
                data: record,
            });
        }
        catch (error) {
            console.error("Get GST Type by ID Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // Create new GST type
    async create(req, res) {
        try {
            const { gst_type_name, gst_type_code, description, tax_percentage = 0, is_active = 1 } = req.body;
            if (!gst_type_name || !gst_type_code) {
                return res.status(400).json({
                    success: false,
                    message: "GST type name and code are required",
                });
            }
            // Validate tax percentage
            if (tax_percentage < 0 || tax_percentage > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Tax percentage must be between 0 and 100",
                });
            }
            // Check if GST type code already exists
            const [existing] = await query(`SELECT id FROM gst_type_master WHERE gst_type_code = ?`, [gst_type_code]);
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: "GST type code already exists",
                });
            }
            // First, add the tax_percentage column if it doesn't exist
            try {
                await query(`ALTER TABLE gst_type_master ADD COLUMN tax_percentage DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Tax percentage for this GST type'`);
            }
            catch (alterError) {
                // Column might already exist, ignore error
            }
            const result = await query(`INSERT INTO gst_type_master (gst_type_name, gst_type_code, description, tax_percentage, is_active) VALUES (?, ?, ?, ?, ?)`, [gst_type_name, gst_type_code, description, tax_percentage, is_active]);
            res.status(201).json({
                success: true,
                message: "GST type created successfully",
                id: result.insertId,
            });
        }
        catch (error) {
            console.error("Create GST Type Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // Update GST type
    async update(req, res) {
        try {
            const { id } = req.params;
            const { gst_type_name, gst_type_code, description, tax_percentage, is_active } = req.body;
            const [existing] = await query(`SELECT id FROM gst_type_master WHERE id = ?`, [id]);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: "GST type not found",
                });
            }
            // Validate tax percentage if provided
            if (tax_percentage !== undefined && (tax_percentage < 0 || tax_percentage > 100)) {
                return res.status(400).json({
                    success: false,
                    message: "Tax percentage must be between 0 and 100",
                });
            }
            // Check if GST type code already exists for other records
            if (gst_type_code) {
                const [duplicate] = await query(`SELECT id FROM gst_type_master WHERE gst_type_code = ? AND id != ?`, [gst_type_code, id]);
                if (duplicate) {
                    return res.status(400).json({
                        success: false,
                        message: "GST type code already exists",
                    });
                }
            }
            // Ensure tax_percentage column exists
            try {
                await query(`ALTER TABLE gst_type_master ADD COLUMN tax_percentage DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Tax percentage for this GST type'`);
            }
            catch (alterError) {
                // Column might already exist, ignore error
            }
            const updateFields = [];
            const updateValues = [];
            if (gst_type_name !== undefined) {
                updateFields.push("gst_type_name = ?");
                updateValues.push(gst_type_name);
            }
            if (gst_type_code !== undefined) {
                updateFields.push("gst_type_code = ?");
                updateValues.push(gst_type_code);
            }
            if (description !== undefined) {
                updateFields.push("description = ?");
                updateValues.push(description);
            }
            if (tax_percentage !== undefined) {
                updateFields.push("tax_percentage = ?");
                updateValues.push(tax_percentage);
            }
            if (is_active !== undefined) {
                updateFields.push("is_active = ?");
                updateValues.push(is_active);
            }
            if (updateFields.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "No fields to update",
                });
            }
            await query(`UPDATE gst_type_master SET ${updateFields.join(", ")} WHERE id = ?`, [...updateValues, id]);
            res.json({
                success: true,
                message: "GST type updated successfully",
            });
        }
        catch (error) {
            console.error("Update GST Type Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
    // Delete GST type (soft delete)
    async delete(req, res) {
        try {
            const { id } = req.params;
            const [existing] = await query(`SELECT id FROM gst_type_master WHERE id = ?`, [id]);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: "GST type not found",
                });
            }
            // Soft delete by setting is_active to 0
            await query(`UPDATE gst_type_master SET is_active = 0 WHERE id = ?`, [id]);
            res.json({
                success: true,
                message: "GST type deleted successfully",
            });
        }
        catch (error) {
            console.error("Delete GST Type Error:", error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    },
};
//# sourceMappingURL=GSTTypeMasterController.js.map