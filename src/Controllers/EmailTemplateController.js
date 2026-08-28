"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailTemplateController = void 0;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
class EmailTemplateController {
    // Get all email templates (with soft delete support)
    static async getAllTemplates(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const search = req.query.search || '';
            const status = req.query.status || '';
            const include_deleted = req.query.include_deleted || 'true'; // Include deleted by default
            const offset = (page - 1) * limit;
            let whereClause = "WHERE et.status = 'active' AND et.deleted_at IS NULL";
            const queryParams = [];
            if (search) {
                whereClause += " AND (et.template_name LIKE ? OR et.template_key LIKE ? OR et.subject LIKE ?)";
                queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }
            if (status) {
                whereClause += " AND et.status = ?";
                queryParams.push(status);
            }
            // Get total count
            const countQuery = `
        SELECT COUNT(*) as total 
        FROM email_templates et
        ${whereClause}
      `;
            const countResult = await query(countQuery, queryParams);
            const total = countResult[0].total;
            // Get templates with pagination
            const templatesQuery = `
        SELECT 
          et.*,
          up.first_name as created_by_name,
          CASE WHEN et.deleted_at IS NOT NULL THEN 'deleted' ELSE et.status END as display_status
        FROM email_templates et
        LEFT JOIN users u ON et.created_by = u.id
        LEFT JOIN user_profiles up ON u.id = up.user_id
        ${whereClause}
        ORDER BY et.deleted_at ASC, et.created_at DESC
        LIMIT ? OFFSET ?
      `;
            const templates = await query(templatesQuery, [...queryParams, limit, offset]);
            res.json({
                success: true,
                data: {
                    templates,
                    pagination: {
                        current_page: page,
                        per_page: limit,
                        total,
                        total_pages: Math.ceil(total / limit)
                    }
                }
            });
        }
        catch (error) {
            console.error("Error fetching email templates:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch email templates",
                error: error.message
            });
        }
    }
    // Get email template by ID - ACTIVE ONLY FOR PUBLIC
    static async getTemplateById(req, res) {
        try {
            const { id } = req.params;
            const templateQuery = `
        SELECT 
          et.*,
          up.first_name as created_by_name,
          CASE WHEN et.deleted_at IS NOT NULL THEN 'deleted' ELSE et.status END as display_status
        FROM email_templates et
        LEFT JOIN users u ON et.created_by = u.id
        LEFT JOIN user_profiles up ON u.id = up.user_id
        WHERE et.id = ? AND et.status = 'active' AND et.deleted_at IS NULL
      `;
            const templates = await query(templateQuery, [id]);
            if (templates.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Email template not found"
                });
            }
            res.json({
                success: true,
                data: templates[0]
            });
        }
        catch (error) {
            console.error("Error fetching email template:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch email template",
                error: error.message
            });
        }
    }
    // Get email template by key - ACTIVE ONLY
    static async getTemplateByKey(req, res) {
        try {
            const { key } = req.params;
            const templateQuery = `
        SELECT * FROM email_templates 
        WHERE template_key = ? AND status = 'active' AND deleted_at IS NULL
      `;
            const templates = await query(templateQuery, [key]);
            if (templates.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Email template not found"
                });
            }
            res.json({
                success: true,
                data: templates[0]
            });
        }
        catch (error) {
            console.error("Error fetching email template by key:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch email template",
                error: error.message
            });
        }
    }
    // Create new email template
    static async createTemplate(req, res) {
        try {
            const { template_name, template_key, subject, email_body, email_body_html, status = 'active' } = req.body;
            const admin = req.admin;
            // Validation
            if (!template_name || !template_key || !subject || !email_body || !email_body_html) {
                return res.status(400).json({
                    success: false,
                    message: "All fields are required"
                });
            }
            // Check if template key already exists
            const existingTemplate = await query("SELECT id FROM email_templates WHERE template_key = ? AND deleted_at IS NULL", [template_key]);
            if (existingTemplate.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Template key already exists"
                });
            }
            const insertQuery = `
        INSERT INTO email_templates 
        (template_name, template_key, subject, email_body, email_body_html, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
            const result = await query(insertQuery, [
                template_name,
                template_key,
                subject,
                email_body,
                email_body_html,
                status,
                admin.user_id
            ]);
            // Get the created template
            const createdTemplate = await query("SELECT * FROM email_templates WHERE id = ?", [result.insertId]);
            res.status(201).json({
                success: true,
                message: "Email template created successfully",
                data: createdTemplate[0]
            });
        }
        catch (error) {
            console.error("Error creating email template:", error);
            res.status(500).json({
                success: false,
                message: "Failed to create email template",
                error: error.message
            });
        }
    }
    // Update email template
    static async updateTemplate(req, res) {
        try {
            const { id } = req.params;
            const { template_name, template_key, subject, email_body, email_body_html, status } = req.body;
            // Check if template exists
            const existingTemplate = await query("SELECT * FROM email_templates WHERE id = ? AND deleted_at IS NULL", [id]);
            if (existingTemplate.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Email template not found"
                });
            }
            // Check if template key already exists (excluding current template)
            if (template_key && template_key !== existingTemplate[0].template_key) {
                const duplicateKey = await query("SELECT id FROM email_templates WHERE template_key = ? AND id != ? AND deleted_at IS NULL", [template_key, id]);
                if (duplicateKey.length > 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Template key already exists"
                    });
                }
            }
            const updateQuery = `
        UPDATE email_templates 
        SET 
          template_name = COALESCE(?, template_name),
          template_key = COALESCE(?, template_key),
          subject = COALESCE(?, subject),
          email_body = COALESCE(?, email_body),
          email_body_html = COALESCE(?, email_body_html),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
            await query(updateQuery, [
                template_name,
                template_key,
                subject,
                email_body,
                email_body_html,
                status,
                id
            ]);
            // Get updated template
            const updatedTemplate = await query("SELECT * FROM email_templates WHERE id = ?", [id]);
            res.json({
                success: true,
                message: "Email template updated successfully",
                data: updatedTemplate[0]
            });
        }
        catch (error) {
            console.error("Error updating email template:", error);
            res.status(500).json({
                success: false,
                message: "Failed to update email template",
                error: error.message
            });
        }
    }
    // Soft delete email template
    static async deleteTemplate(req, res) {
        try {
            const { id } = req.params;
            // Check if template exists
            const existingTemplate = await query("SELECT * FROM email_templates WHERE id = ? AND deleted_at IS NULL", [id]);
            if (existingTemplate.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Email template not found"
                });
            }
            // Soft delete and set status to inactive
            await query("UPDATE email_templates SET deleted_at = CURRENT_TIMESTAMP, status = 'inactive' WHERE id = ?", [id]);
            res.json({
                success: true,
                message: "Email template deleted successfully"
            });
        }
        catch (error) {
            console.error("Error deleting email template:", error);
            res.status(500).json({
                success: false,
                message: "Failed to delete email template",
                error: error.message
            });
        }
    }
    // Restore deleted template
    static async restoreTemplate(req, res) {
        try {
            const { id } = req.params;
            const { status = 'active' } = req.body; // Default to active when restoring
            // Check if template exists and is deleted
            const existingTemplate = await query("SELECT * FROM email_templates WHERE id = ? AND deleted_at IS NOT NULL", [id]);
            if (existingTemplate.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Deleted email template not found"
                });
            }
            // Validate status
            if (!['active', 'inactive'].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Status must be either 'active' or 'inactive'"
                });
            }
            // Restore template and set status to active by default
            await query("UPDATE email_templates SET deleted_at = NULL, status = ? WHERE id = ?", [status, id]);
            // Get restored template
            const restoredTemplate = await query("SELECT * FROM email_templates WHERE id = ?", [id]);
            res.json({
                success: true,
                message: "Email template restored successfully",
                data: restoredTemplate[0]
            });
        }
        catch (error) {
            console.error("Error restoring email template:", error);
            res.status(500).json({
                success: false,
                message: "Failed to restore email template",
                error: error.message
            });
        }
    }
    // Get template variables/placeholders
    static async getTemplateVariables(req, res) {
        try {
            const templateVariables = {
                common: [
                    '{{site_logo}}',
                    '{{site_name}}',
                    '{{site_url}}',
                    '{{current_date}}',
                    '{{current_year}}'
                ],
                user: [
                    '{{user_name}}',
                    '{{email}}',
                    '{{phone}}',
                    '{{profile_id}}',
                    '{{login_url}}'
                ],
                login_otp: [
                    '{{otp}}'
                ],
                password_reset: [
                    '{{otp}}',
                    '{{reset_url}}'
                ],
                email_verification: [
                    '{{otp}}'
                ],
                name_update_otp: [
                    '{{otp}}'
                ],
                phone_update_otp: [
                    '{{otp}}',
                    '{{new_phone}}'
                ],
                email_update_otp: [
                    '{{otp}}',
                    '{{new_email}}'
                ],
                user_registration: [
                    '{{temp_password}}',
                    '{{profile_id}}'
                ],
                admin_account_creation: [
                    '{{temp_password}}',
                    '{{profile_id}}'
                ],
                welcome_matches: [
                    '{{match_count}}'
                ],
                success_story: [
                    '{{partner_name}}'
                ],
                incoming_call: [
                    '{{caller_name}}',
                    '{{call_type}}',
                    '{{call_id}}'
                ],
                contact_form_admin: [
                    '{{full_name}}',
                    '{{email}}',
                    '{{phone}}',
                    '{{subject}}',
                    '{{message}}',
                    '{{submitted_at}}'
                ],
                contact_form_user: [
                    '{{subject}}',
                    '{{message}}',
                    '{{submitted_at}}'
                ],
                contact_reply: [
                    '{{subject}}',
                    '{{reply_message}}'
                ],
                package_purchase: [
                    '{{plan_name}}',
                    '{{plan_duration}}',
                    '{{amount}}',
                    '{{payment_id}}',
                    '{{valid_until}}'
                ],
                staff_account_creation: [
                    '{{staff_name}}',
                    '{{role_name}}',
                    '{{access_level}}',
                    '{{admin_url}}',
                    '{{temp_password}}'
                ]
            };
            res.json({
                success: true,
                data: templateVariables
            });
        }
        catch (error) {
            console.error("Error fetching template variables:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch template variables",
                error: error.message
            });
        }
    }
    // Preview template with sample data
    static async previewTemplate(req, res) {
        try {
            const { id } = req.params;
            const { variables = {} } = req.body;
            const template = await query("SELECT * FROM email_templates WHERE id = ? AND deleted_at IS NULL", [id]);
            if (template.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Email template not found"
                });
            }
            const templateData = template[0];
            // Default sample data
            const sampleData = Object.assign({ site_logo: 'https://example.com/logo.png', site_name: 'Vivaaha', site_url: 'https://vivaaha.com', current_date: new Date().toLocaleDateString(), current_year: new Date().getFullYear(), user_name: 'John Doe', email: 'john.doe@example.com', phone: '+91-9876543210', profile_id: 'VH123456', login_url: 'https://vivaaha.com/login', otp: '123456', plan_name: 'Gold Plus', plan_duration: '6 months', amount: '₹4,999', payment_id: 'PAY123456789', valid_until: '2024-12-31', temp_password: 'TempPass123', registration_date: new Date().toLocaleDateString(), admin_url: 'https://admin.vivaaha.com', staff_name: 'Jane Smith', role_name: 'Content Manager', access_level: 'Level 2' }, variables);
            // Replace variables in subject and body
            let previewSubject = templateData.subject;
            let previewBodyHtml = templateData.email_body_html;
            let previewBodyText = templateData.email_body;
            Object.keys(sampleData).forEach(key => {
                const placeholder = `{{${key}}}`;
                const value = sampleData[key];
                previewSubject = previewSubject.replace(new RegExp(placeholder, 'g'), value);
                previewBodyHtml = previewBodyHtml.replace(new RegExp(placeholder, 'g'), value);
                previewBodyText = previewBodyText.replace(new RegExp(placeholder, 'g'), value);
            });
            res.json({
                success: true,
                data: {
                    template_name: templateData.template_name,
                    template_key: templateData.template_key,
                    subject: previewSubject,
                    email_body: previewBodyText,
                    email_body_html: previewBodyHtml,
                    sample_data: sampleData
                }
            });
        }
        catch (error) {
            console.error("Error previewing template:", error);
            res.status(500).json({
                success: false,
                message: "Failed to preview template",
                error: error.message
            });
        }
    }
    // Duplicate template
    static async duplicateTemplate(req, res) {
        try {
            const { id } = req.params;
            const { template_name, template_key } = req.body;
            const admin = req.admin;
            const originalTemplate = await query("SELECT * FROM email_templates WHERE id = ? AND deleted_at IS NULL", [id]);
            if (originalTemplate.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Email template not found"
                });
            }
            const template = originalTemplate[0];
            // Check if new template key already exists
            const existingKey = await query("SELECT id FROM email_templates WHERE template_key = ? AND deleted_at IS NULL", [template_key]);
            if (existingKey.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Template key already exists"
                });
            }
            const insertQuery = `
        INSERT INTO email_templates 
        (template_name, template_key, subject, email_body, email_body_html, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
            const result = await query(insertQuery, [
                template_name || `${template.template_name} (Copy)`,
                template_key,
                template.subject,
                template.email_body,
                template.email_body_html,
                'inactive', // Set as inactive by default
                admin.user_id
            ]);
            const duplicatedTemplate = await query("SELECT * FROM email_templates WHERE id = ?", [result.insertId]);
            res.status(201).json({
                success: true,
                message: "Email template duplicated successfully",
                data: duplicatedTemplate[0]
            });
        }
        catch (error) {
            console.error("Error duplicating template:", error);
            res.status(500).json({
                success: false,
                message: "Failed to duplicate template",
                error: error.message
            });
        }
    }
    // Get template statistics
    static async getTemplateStats(req, res) {
        try {
            const statsQuery = `
        SELECT 
          COUNT(*) as total_templates,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_templates,
          SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_templates,
          SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deleted_templates
        FROM email_templates
      `;
            const stats = await query(statsQuery);
            res.json({
                success: true,
                data: stats[0]
            });
        }
        catch (error) {
            console.error("Error fetching template stats:", error);
            res.status(500).json({
                success: false,
                message: "Failed to fetch template statistics",
                error: error.message
            });
        }
    }
}
exports.EmailTemplateController = EmailTemplateController;
//# sourceMappingURL=EmailTemplateController.js.map