import * as utils from "util";
import { EmailService } from "./EmailService";
import { enqueueEmailOutboxJob } from "../services/emailOutboxService";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// Submit Contact Form
export async function submitContactForm(req, res) {
  try {
    const { full_name, email, phone, subject, message } = req.body;

    if (!full_name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, subject, and message are required"
      });
    }

    // Store in database
    const result = await query(`
      INSERT INTO contact_us (full_name, email, phone, subject, message) 
      VALUES (?, ?, ?, ?, ?)
    `, [full_name, email, phone || null, subject, message]);

    // Get admin email from general_settings
    const [settings] = await query('SELECT email_1, email_2 FROM general_settings LIMIT 1');
    const adminEmail = settings?.email_1 || settings?.email_2;

    const variables = {
      user_name: full_name,
      email,
      phone: phone || 'Not provided',
      subject,
      message,
      submitted_at: new Date().toLocaleString()
    };

    // Queue notification email to admin
    if (adminEmail) {
      try {
        await enqueueEmailOutboxJob({
          jobType: "alert-email",
          eventKey: "contact_form_admin",
          deduplicationKey: `contact-form-admin-email:${result.insertId}`,
          payload: {
            kind: "alert-email",
            toEmail: adminEmail,
            recipientName: "Admin",
            templateKey: "contact_form_admin",
            variables,
            fallbackSubject: `New Contact Form Submission: ${subject}`,
            fallbackBody: `New contact form submission from ${full_name}. Subject: ${subject}. Message: ${message}`,
            fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h3>New Contact Form Submission</h3><p><strong>Name:</strong> ${full_name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone || 'Not provided'}</p><p><strong>Subject:</strong> ${subject}</p><p><strong>Message:</strong></p><p>${message}</p><hr><p><small>Submitted at: ${new Date().toLocaleString()}</small></p></div>`,
            meta: { event: "contact_form_admin", connectionId: result.insertId },
          },
        });
      } catch (emailError: any) {
        console.error('Failed to queue contact admin notification:', { contactId: result.insertId, message: emailError?.message });
      }
    }

    // Queue confirmation email to user
    try {
      await enqueueEmailOutboxJob({
        jobType: "alert-email",
        eventKey: "contact_form_user",
        deduplicationKey: `contact-form-user-email:${result.insertId}`,
        payload: {
          kind: "alert-email",
          toEmail: email,
          recipientName: full_name,
          templateKey: "contact_form_user",
          variables,
          fallbackSubject: 'Thank you for contacting Vivaaha',
          fallbackBody: `Dear ${full_name}, we have received your message and will get back to you within 24-48 hours.`,
          fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h3>Thank you for contacting us!</h3><p>Dear ${full_name},</p><p>We have received your message and will get back to you within 24-48 hours.</p><p><strong>Your message:</strong></p><p>${message}</p><hr><p>Best regards,<br>Vivaaha Team</p></div>`,
          meta: { event: "contact_form_user", connectionId: result.insertId },
        },
      });
    } catch (emailError: any) {
      console.error('Failed to queue contact confirmation to user:', { contactId: result.insertId, message: emailError?.message });
    }

    res.json({
      success: true,
      message: "Your message has been sent successfully. We'll get back to you soon!",
      contact_id: result.insertId
    });
  } catch (error) {
    console.error("Contact Form Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to send message. Please try again later." 
    });
  }
}

// Get Contact Submissions (Admin only)
export async function getContactSubmissions(req, res) {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    const conditions = [];
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(full_name LIKE ? OR email LIKE ? OR subject LIKE ? OR message LIKE ?)');
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    const contacts = await query(`
      SELECT id, full_name, email, phone, subject, message, status, 
             admin_reply, replied_at, replied_by,
             CASE 
               WHEN status = 'resolved' THEN 'Replied'
               ELSE 'Not Replied'
             END as reply_status,
             created_at, updated_at
      FROM contact_us 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const totalCount = await query(`
      SELECT COUNT(*) as count FROM contact_us ${whereClause}
    `, params);

    res.json({
      success: true,
      contacts,
      total: totalCount[0].count,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error("Get Contact Submissions Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Contact Status (Admin only)
export async function updateContactStatus(req, res) {
  try {
    const { contact_id } = req.params;
    const { status } = req.body;

    if (!['new', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be: new, in_progress, or resolved"
      });
    }

    await query(`
      UPDATE contact_us SET status = ? WHERE id = ?
    `, [status, contact_id]);

    res.json({
      success: true,
      message: "Contact status updated successfully"
    });
  } catch (error) {
    console.error("Update Contact Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Single Contact Details (Admin only)
export async function getContactDetails(req, res) {
  try {
    const { contact_id } = req.params;

    const [contact] = await query(`
      SELECT id, full_name, email, phone, subject, message, status,
             admin_reply, replied_at, replied_by,
             CASE 
               WHEN status = 'resolved' THEN 'Replied'
               ELSE 'Not Replied'
             END as reply_status,
             created_at, updated_at
      FROM contact_us 
      WHERE id = ?
    `, [contact_id]);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found"
      });
    }

    res.json({
      success: true,
      contact
    });
  } catch (error) {
    console.error("Get Contact Details Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Send Admin Reply (Admin only)
export async function sendAdminReply(req, res) {
  try {
    const { contact_id } = req.params;
    const { reply_message } = req.body;

    if (!reply_message) {
      return res.status(400).json({
        success: false,
        message: "Reply message is required"
      });
    }

    // Get contact details
    const [contact] = await query(`
      SELECT full_name, email, subject FROM contact_us WHERE id = ?
    `, [contact_id]);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found"
      });
    }

    // Send reply email
    await EmailService.sendTemplateEmail(
      'contact_reply',
      contact.email,
      { user_name: contact.full_name, subject: contact.subject, reply_message: reply_message.replace(/\n/g, '<br>') },
      {
        fallbackSubject: `Re: ${contact.subject}`,
        fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h3>Reply from Vivaaha Team</h3><p>Dear ${contact.full_name},</p><p>Thank you for contacting us. Here is our response:</p><div style="background:#f8f9fa;padding:15px;border-left:4px solid #d63384;margin:20px 0">${reply_message.replace(/\n/g, '<br>')}</div><p>If you have further questions, please contact us.</p><p>Best regards,<br>Vivaaha Team</p></div>`,
      }
    );

    // Get admin info from token
    const adminId = req.admin?.user_id || null;
    
    // Update status to resolved and save admin reply
    await query(`
      UPDATE contact_us 
      SET status = 'resolved', 
          admin_reply = ?, 
          replied_at = NOW(), 
          replied_by = ?
      WHERE id = ?
    `, [reply_message, adminId, contact_id]);

    res.json({
      success: true,
      message: "Reply sent successfully"
    });
  } catch (error) {
    console.error("Send Admin Reply Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to send reply. Please try again later." 
    });
  }
}

// Delete Contact Message (Admin only)
export async function deleteContactMessage(req, res) {
  try {
    const { contact_id } = req.params;

    const result = await query(`
      DELETE FROM contact_us WHERE id = ?
    `, [contact_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Contact not found"
      });
    }

    res.json({
      success: true,
      message: "Contact message deleted successfully"
    });
  } catch (error) {
    console.error("Delete Contact Message Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

