import * as utils from "util";
import * as nodemailer from "nodemailer";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

export class EmailService {
  private static transporter: nodemailer.Transporter;
  private static transporterConfig: string = '';

  // Initialize email transporter
  static async initializeTransporter() {
    try {
      // Try DB general_settings first
      let config: any = null;

      try {
        const settings = await query(
          "SELECT smtp_host, smtp_port, smtp_username, smtp_password, smtp_encryption, smtp_from_email, smtp_from_name FROM general_settings WHERE id = 1"
        );
        if (settings.length > 0 && settings[0].smtp_host && settings[0].smtp_username) {
          config = settings[0];
          console.log('📧 SMTP config loaded from general_settings DB');
        }
      } catch (dbError) {
        console.warn('⚠️  Could not read general_settings from DB:', dbError.message);
      }

      // Fallback to .env if DB config is missing or incomplete
      if (!config) {
        config = {
          smtp_host:       process.env.EMAIL_HOST       || 'smtp.gmail.com',
          smtp_port:       process.env.EMAIL_PORT       || '587',
          smtp_username:   process.env.EMAIL_USER       || '',
          smtp_password:   process.env.EMAIL_PASSWORD   || '',
          smtp_encryption: process.env.EMAIL_ENCRYPTION || 'tls',
          smtp_from_email: process.env.EMAIL_FROM       || process.env.EMAIL_USER || '',
          smtp_from_name:  process.env.EMAIL_FROM_NAME  || 'Vivaaha Matrimony',
        };
        console.log('📧 SMTP config loaded from .env fallback');
      }

      // Build a config signature to detect changes
      const configSignature = `${config.smtp_host}:${config.smtp_port}:${config.smtp_username}:${config.smtp_encryption}`;

      // Re-initialize only if config changed or transporter not set
      if (this.transporter && this.transporterConfig === configSignature) {
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: parseInt(config.smtp_port),
        secure: config.smtp_encryption === 'ssl',
        auth: {
          user: config.smtp_username,
          pass: config.smtp_password
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verify connection
      await this.transporter.verify();
      this.transporterConfig = configSignature;
      console.log('✅ Email transporter initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error);
      throw error;
    }
  }

  // Force reset transporter (call after admin updates SMTP settings)
  static resetTransporter() {
    this.transporter = null;
    this.transporterConfig = '';
    console.log('Email transporter reset — will reinitialize on next send');
  }

  // Get email template by key
  // Returns: { found: true, active: true, template } | { found: true, active: false } | { found: false }
  static async getTemplate(templateKey: string) {
    try {
      // Check if template exists at all (any status)
      const all = await query(
        "SELECT * FROM email_templates WHERE template_key = ? AND deleted_at IS NULL LIMIT 1",
        [templateKey]
      );
      if (all.length === 0) return { found: false };
      const tpl = all[0];
      if (tpl.status !== 'active') return { found: true, active: false };
      return { found: true, active: true, template: tpl };
    } catch (error) {
      console.error("Error fetching email template:", error);
      return { found: false };
    }
  }

  // Replace template variables
  static async replaceVariables(content: string, variables: Record<string, any>): Promise<string> {
    let result = content;

    // Get site settings from database
    let siteSettings: any = {};
    try {
      const settings = await query(
        "SELECT site_name, site_logo, primary_color FROM general_settings WHERE id = 1"
      );
      if (settings.length > 0) {
        siteSettings = settings[0];
      }
    } catch (dbError) {
      console.warn('⚠️  Could not read site settings from DB:', dbError.message);
    }

    const defaultVariables = {
      sitename:    siteSettings.site_name    || process.env.SITE_NAME     || 'Vivaaha',
      site_url:     process.env.FRONTEND_URL  || 'https://vivaaha.com',
      site_logo:    siteSettings.site_logo    || process.env.SITE_LOGO_URL || 'https://vivaaha.net/admin/assets/logo-BrbBDGT7.png',
      color_code: siteSettings.primary_color || '#d63384',
      current_date: new Date().toLocaleDateString(),
      current_year: new Date().getFullYear(),
      login_url:   process.env.FRONTEND_URL  || 'https://vivaaha.com/login',
      vendor_login_url: process.env.VENDOR_LOGIN_URL || 'https://vivaaha.net/admin/vendor/login',
      admin_url:   `${process.env.ADMIN_URL || 'https://vivaaha.net/admin/login'}`,
    };

    const allVariables = { ...defaultVariables, ...variables };

    // Handle {{#if key}}...{{/if}} conditionals
    result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => {
      return allVariables[key] ? inner : '';
    });

    Object.keys(allVariables).forEach(key => {
      const placeholder = `{{${key}}}`;
      const value = allVariables[key] || '';
      result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    });

    return result;
  }

  // Send email using template from DB, with optional hardcoded fallback
  // Rules:
  //   DB template active   → use DB template
  //   DB template inactive → SKIP (do not send, do not use fallback)
  //   Not in DB            → use hardcoded fallback if provided
  static async sendTemplateEmail(
    templateKey: string,
    to: string | string[],
    variables: Record<string, any> = {},
    options: {
      cc?: string | string[];
      bcc?: string | string[];
      attachments?: any[];
      fallbackSubject?: string;
      fallbackHtml?: string;
      fallbackText?: string;
    } = {}
  ) {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const result = await this.getTemplate(templateKey);

      // Template exists but is INACTIVE → skip silently
      if (result.found && !result.active) {
        console.log(`⏭️  Template [${templateKey}] is inactive — email skipped`);
        return { success: false, skipped: true, reason: `Template inactive: ${templateKey}` };
      }

      let fromEmail: string;
      let fromName: string;
      try {
        const settings = await query(
          "SELECT smtp_from_email, smtp_from_name FROM general_settings WHERE id = 1"
        );
        const dbConfig = settings[0];
        fromEmail = dbConfig?.smtp_from_email || process.env.EMAIL_FROM || process.env.EMAIL_USER || '';
        fromName  = dbConfig?.smtp_from_name  || process.env.EMAIL_FROM_NAME || 'Vivaaha Matrimony';
      } catch (_) {
        fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || '';
        fromName  = process.env.EMAIL_FROM_NAME || 'Vivaaha Matrimony';
      }

      let subject: string;
      let htmlBody: string;
      let textBody: string;

      if (result.found && result.active) {
        // ── Admin has active template → use it
        subject  = await this.replaceVariables(result.template.subject, variables);
        htmlBody = await this.replaceVariables(result.template.email_body_html, variables);
        textBody = await this.replaceVariables(result.template.email_body, variables);
        console.log(`📧 Using DB template [${templateKey}] for ${to}`);
      } else if (options.fallbackSubject && options.fallbackHtml) {
        // ── Not in DB → use hardcoded fallback
        subject  = await this.replaceVariables(options.fallbackSubject, variables);
        htmlBody = await this.replaceVariables(options.fallbackHtml, variables);
        textBody = options.fallbackText ? await this.replaceVariables(options.fallbackText, variables) : '';
        console.log(`📧 No DB template for [${templateKey}], using hardcoded fallback for ${to}`);
      } else {
        // ── Not in DB and no fallback → skip
        console.warn(`⚠️  No template and no fallback for [${templateKey}] — email skipped`);
        return { success: false, skipped: true, reason: `No template for key: ${templateKey}` };
      }

      const { fallbackSubject, fallbackHtml, fallbackText, ...mailExtras } = options;

      const mailOptions = {
        from: `${fromName} <${fromEmail}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        text: textBody,
        html: htmlBody,
        ...mailExtras
      };

      const sent = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent [${templateKey}]:`, sent.messageId);
      return { success: true, messageId: sent.messageId, template: templateKey, to: mailOptions.to };
    } catch (error) {
      console.error(`❌ Error sending email [${templateKey}]:`, error);
      throw error;
    }
  }

  // Send password reset email
  static async sendPasswordResetEmail(to: string, variables: {
    user_name: string;
    otp: string;
  }) {
    return this.sendTemplateEmail('password_reset', to, variables);
  }

  // Send package purchase email
  static async sendPackagePurchaseEmail(to: string, variables: {
    user_name: string;
    plan_name: string;
    plan_duration: string;
    amount: string;
    payment_id: string;
    valid_until: string;
  }) {
    return this.sendTemplateEmail('package_purchase', to, variables);
  }

  // Send admin account creation email
  static async sendAdminAccountCreationEmail(to: string, variables: {
    user_name: string;
    email: string;
    temp_password: string;
    profile_id: string;
  }) {
    return this.sendTemplateEmail('admin_account_creation', to, variables);
  }

  // Send user registration pending email
  static async sendUserRegistrationPendingEmail(to: string, variables: {
    user_name: string;
    email: string;
    profile_id: string;
  }) {
    return this.sendTemplateEmail('user_registration_pending', to, variables);
  }

  // Send admin new registration notification
  static async sendAdminNewRegistrationEmail(adminEmails: string[], variables: {
    user_name: string;
    email: string;
    phone: string;
    profile_id: string;
    registration_date: string;
  }) {
    return this.sendTemplateEmail('admin_new_registration', adminEmails, variables);
  }

  // Send staff account creation email
  static async sendStaffAccountCreationEmail(to: string, variables: {
    staff_name: string;
    email: string;
    temp_password: string;
    role_name: string;
    access_level: string;
  }) {
    return this.sendTemplateEmail('staff_account_creation', to, variables);
  }

  // Send member approval email
  static async sendMemberApprovalEmail(to: string, variables: {
    user_name: string;
    profile_id: string;
  }) {
    return this.sendTemplateEmail('member_approval', to, variables);
  }

  // Send email verification
  static async sendEmailVerificationEmail(to: string, variables: {
    user_name: string;
    otp: string;
  }) {
    return this.sendTemplateEmail('email_verification', to, variables);
  }

  // ============ VENDOR EMAIL FUNCTIONS ============

  // Send vendor registration success email
  static async sendVendorRegistrationSuccessEmail(to: string, variables: {
    vendor_name: string;
    vendor_id: string;
    plan_name: string;
    subscription_end_date: string;
    login_url: string;
    invoice_url?: string;
  }) {
    return this.sendTemplateEmail('vendor_registration_success', to, variables, {
      fallbackSubject: 'Welcome to {{sitename}} - Vendor Registration Successful!',
      fallbackHtml: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="{{site_logo}}" alt="{{sitename}}" style="max-height: 60px;">
              <h1 style="color: {{color_code}}; margin: 20px 0;">🎉 Welcome to {{sitename}}!</h1>
            </div>
            
            <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <h2 style="color: #28a745; margin: 0 0 10px 0;">Registration Successful!</h2>
              <p style="margin: 0; color: #155724;">Your vendor account has been created successfully and your subscription is now active.</p>
            </div>
            
            <div style="margin-bottom: 25px;">
              <h3 style="color: #333; border-bottom: 2px solid {{color_code}}; padding-bottom: 10px;">Account Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; font-weight: bold;">Vendor Name:</td><td style="padding: 8px 0;">{{vendor_name}}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold;">Vendor ID:</td><td style="padding: 8px 0;">{{vendor_id}}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold;">Plan:</td><td style="padding: 8px 0;">{{plan_name}}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold;">Valid Until:</td><td style="padding: 8px 0;">{{subscription_end_date}}</td></tr>
              </table>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="{{login_url}}" style="background-color: {{color_code}}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; margin-right: 10px;">Login to Dashboard</a>
              {{#if invoice_url}}<a href="{{invoice_url}}" style="background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Download Invoice</a>{{/if}}
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-top: 25px;">
              <h4 style="color: #333; margin: 0 0 15px 0;">Next Steps:</h4>
              <ul style="margin: 0; padding-left: 20px; color: #666;">
                <li>Complete your profile setup with detailed information</li>
                <li>Add your services and set competitive pricing</li>
                <li>Upload high-quality photos of your work</li>
                <li>Start receiving consultation requests from customers</li>
                <li>Build your reputation with excellent service</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
              <p>Need help? Contact us at <a href="mailto:vendor-support@vivaaha.net" style="color: {{color_code}};">vendor-support@vivaaha.net</a></p>
              <p>© {{current_year}} {{sitename}}. All rights reserved.</p>
            </div>
          </div>
        </div>
      `,
      fallbackText: `Welcome to {{sitename}}! Your vendor registration is successful. Vendor ID: {{vendor_id}}, Plan: {{plan_name}}, Valid until: {{subscription_end_date}}. Login at {{login_url}}`
    });
  }

  // Send vendor payment receipt email
  static async sendVendorPaymentReceiptEmail(to: string, variables: {
    vendor_name: string;
    plan_name: string;
    amount_paid: string;
    transaction_id: string;
    payment_date: string;
    invoice_url?: string;
  }) {
    return this.sendTemplateEmail('vendor_payment_receipt', to, variables, {
      fallbackSubject: 'Payment Receipt - {{sitename}} Vendor Subscription',
      fallbackHtml: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: white; padding: 30px; border: 1px solid #ddd; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="{{site_logo}}" alt="{{sitename}}" style="max-height: 50px;">
              <h1 style="color: {{color_code}}; margin: 20px 0;">Payment Receipt</h1>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
              <h2 style="color: #333; margin: 0 0 15px 0;">Payment Successful</h2>
              <p style="margin: 0; color: #666;">Thank you for your payment. Your subscription has been activated.</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
              <tr><td style="padding: 10px 0; font-weight: bold; border-bottom: 1px solid #eee;">Vendor Name:</td><td style="padding: 10px 0; border-bottom: 1px solid #eee;">{{vendor_name}}</td></tr>
              <tr><td style="padding: 10px 0; font-weight: bold; border-bottom: 1px solid #eee;">Plan:</td><td style="padding: 10px 0; border-bottom: 1px solid #eee;">{{plan_name}}</td></tr>
              <tr><td style="padding: 10px 0; font-weight: bold; border-bottom: 1px solid #eee;">Amount:</td><td style="padding: 10px 0; border-bottom: 1px solid #eee;">₹{{amount_paid}}</td></tr>
              <tr><td style="padding: 10px 0; font-weight: bold; border-bottom: 1px solid #eee;">Transaction ID:</td><td style="padding: 10px 0; border-bottom: 1px solid #eee;">{{transaction_id}}</td></tr>
              <tr><td style="padding: 10px 0; font-weight: bold;">Payment Date:</td><td style="padding: 10px 0;">{{payment_date}}</td></tr>
            </table>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #666;">Keep this receipt for your records.</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
              <p>© {{current_year}} {{sitename}}. All rights reserved.</p>
            </div>
          </div>
        </div>
      `,
      fallbackText: `Payment Receipt - {{sitename}}. Vendor: {{vendor_name}}, Plan: {{plan_name}}, Amount: ₹{{amount_paid}}, Transaction: {{transaction_id}}, Date: {{payment_date}}`
    });
  }

  // Send vendor payment failed email
  static async sendVendorPaymentFailedEmail(to: string, variables: {
    vendor_name: string;
    plan_name: string;
    amount: string;
    failure_reason?: string;
    retry_url: string;
  }) {
    return this.sendTemplateEmail('vendor_payment_failed', to, variables, {
      fallbackSubject: 'Payment Failed - {{sitename}} Vendor Registration',
      fallbackHtml: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: white; padding: 30px; border: 1px solid #ddd; border-radius: 8px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <img src="{{site_logo}}" alt="{{sitename}}" style="max-height: 50px;">
              <h1 style="color: #dc3545; margin: 20px 0;">Payment Failed</h1>
            </div>
            
            <div style="background-color: #f8d7da; padding: 20px; border-radius: 8px; margin-bottom: 25px; border: 1px solid #f5c6cb;">
              <h2 style="color: #721c24; margin: 0 0 10px 0;">Payment Unsuccessful</h2>
              <p style="margin: 0; color: #721c24;">We were unable to process your payment for the vendor registration.</p>
            </div>
            
            <div style="margin-bottom: 25px;">
              <h3 style="color: #333;">Payment Details:</h3>
              <p><strong>Vendor Name:</strong> {{vendor_name}}</p>
              <p><strong>Plan:</strong> {{plan_name}}</p>
              <p><strong>Amount:</strong> ₹{{amount}}</p>
              <p><strong>Reason:</strong> {{failure_reason}}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="{{retry_url}}" style="background-color: {{color_code}}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Retry Payment</a>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <p style="margin: 0; color: #666;">If you continue to face issues, please contact our support team for assistance.</p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
              <p>Need help? Contact us at <a href="mailto:support@vivaaha.net" style="color: {{color_code}};">support@vivaaha.net</a></p>
              <p>© {{current_year}} {{sitename}}. All rights reserved.</p>
            </div>
          </div>
        </div>
      `,
      fallbackText: `Payment Failed - {{sitename}}. Vendor: {{vendor_name}}, Plan: {{plan_name}}, Amount: ₹{{amount}}. Retry at {{retry_url}}`
    });
  }

  // Test email configuration
  static async testEmailConfiguration() {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      const testResult = await this.transporter.verify();
      return {
        success: true,
        message: "Email configuration is valid",
        result: testResult
      };
    } catch (error) {
      return {
        success: false,
        message: "Email configuration test failed",
        error: error.message
      };
    }
  }

  // Send test email
  static async sendTestEmail(to: string, subject: string = "Test Email from Vivaaha") {
    try {
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      let fromEmail: string;
      let fromName: string;
      try {
        const settings = await query(
          "SELECT smtp_from_email, smtp_from_name FROM general_settings WHERE id = 1"
        );
        const dbConfig = settings[0];
        fromEmail = dbConfig?.smtp_from_email || process.env.EMAIL_FROM || process.env.EMAIL_USER || '';
        fromName  = dbConfig?.smtp_from_name  || process.env.EMAIL_FROM_NAME || 'Vivaaha Matrimony';
      } catch (_) {
        fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER || '';
        fromName  = process.env.EMAIL_FROM_NAME || 'Vivaaha Matrimony';
      }

      const mailOptions = {
        from: `${fromName} <${fromEmail}>`,
        to,
        subject,
        text: "This is a test email from Vivaaha matrimony platform.",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #667eea;">Test Email</h2>
            <p>This is a test email from Vivaaha matrimony platform.</p>
            <p>If you received this email, your email configuration is working correctly.</p>
            <p>Sent at: ${new Date().toLocaleString()}</p>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      return {
        success: true,
        messageId: result.messageId,
        message: "Test email sent successfully"
      };
    } catch (error) {
      console.error("Error sending test email:", error);
      throw error;
    }
  }
}