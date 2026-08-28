"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkEmailConfig = exports.testVendorEmail = void 0;
const EmailService_1 = require("./EmailService");
// Test email sending for vendor registration
const testVendorEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({
                success: false,
                message: "Email is required"
            });
            return;
        }
        console.log(`🧪 Testing vendor registration email to: ${email}`);
        // Test email with template
        const result = await EmailService_1.EmailService.sendTemplateEmail('vendor_registration_free', email, {
            vendor_name: 'Test Vendor',
            email: email,
            password: 'Test123',
            plan_name: 'Free',
            login_url: 'http://localhost:3000/vendor/login'
        }, {
            fallbackSubject: 'Test - Welcome to {{sitename}}',
            fallbackHtml: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Test Email</h2>
            <p>This is a test email for vendor registration.</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Password:</strong> Test123</p>
            <p>If you received this, email is working!</p>
          </div>
        `
        });
        console.log('✅ Email test result:', result);
        res.json({
            success: true,
            message: "Test email sent successfully",
            result: result
        });
    }
    catch (error) {
        console.error('❌ Email test failed:', error);
        res.status(500).json({
            success: false,
            message: "Failed to send test email",
            error: error.message,
            details: error.stack
        });
    }
};
exports.testVendorEmail = testVendorEmail;
// Check email configuration
const checkEmailConfig = async (req, res) => {
    try {
        const utils = require("util");
        const db = require("../database");
        const query = utils.promisify(db.query).bind(db);
        // Check general_settings
        const settings = await query("SELECT smtp_host, smtp_port, smtp_username, smtp_from_email, smtp_from_name, smtp_encryption FROM general_settings WHERE id = 1");
        // Check email template
        const template = await query("SELECT template_key, template_name, status FROM email_templates WHERE template_key = 'vendor_registration_free'");
        // Check .env
        const envConfig = {
            EMAIL_HOST: process.env.EMAIL_HOST || 'Not set',
            EMAIL_PORT: process.env.EMAIL_PORT || 'Not set',
            EMAIL_USER: process.env.EMAIL_USER || 'Not set',
            EMAIL_FROM: process.env.EMAIL_FROM || 'Not set',
            EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || 'Not set',
            VENDOR_LOGIN_URL: process.env.VENDOR_LOGIN_URL || 'Not set'
        };
        res.json({
            success: true,
            data: {
                database_smtp: settings.length > 0 ? settings[0] : null,
                email_template: template.length > 0 ? template[0] : null,
                env_config: envConfig,
                recommendation: settings.length > 0 && settings[0].smtp_host
                    ? "Using database SMTP settings"
                    : "Using .env SMTP settings (fallback)"
            }
        });
    }
    catch (error) {
        console.error('❌ Failed to check email config:', error);
        res.status(500).json({
            success: false,
            message: "Failed to check email configuration",
            error: error.message
        });
    }
};
exports.checkEmailConfig = checkEmailConfig;
//# sourceMappingURL=TestEmailController.js.map