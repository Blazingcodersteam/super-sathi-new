import * as utils from "util";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as path from "path";
import { sendMail } from "./SendMailController";
import { EmailService } from "./EmailService";

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

// Submit Success Story
export async function submitSuccessStory(req, res) {
  try {
    const { 
      user_name, 
      partner_name, 
      user_email, 
      partner_email, 
      first_met_date, 
      wedding_date,
      do_not_disclose,
      not_yet_fixed,
      story_content,
      agree_to_terms,
      feature_in_stories
    } = req.body;
    const photo = req.file;

    if (!user_name || !partner_name || !user_email || !story_content || !agree_to_terms) {
      return res.status(400).json({
        success: false,
        message: "User name, partner name, email, story content, and terms agreement are required"
      });
    }

    let photoUrl = null;
    
    // Handle photo upload if present
    if (photo) {
      const fileExtension = path.extname(photo.originalname);
      const fileName = `success-stories/${Date.now()}${fileExtension}`;
      
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: photo.buffer,
        ContentType: photo.mimetype,
      };

      await s3Client.send(new PutObjectCommand(uploadParams));
      photoUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    }

    // Insert success story
    const result = await query(`
      INSERT INTO success_stories (
        user_name, partner_name, user_email, partner_email, 
        first_met_date, wedding_date, do_not_disclose, not_yet_fixed,
        story_content, photo_url, agree_to_terms, feature_in_stories
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      user_name, partner_name, user_email, partner_email || null,
      first_met_date || null, wedding_date || null, 
      do_not_disclose ? 1 : 0, not_yet_fixed ? 1 : 0,
      story_content, photoUrl, agree_to_terms ? 1 : 0, feature_in_stories ? 1 : 0
    ]);

    // Send confirmation email
    try {
      await EmailService.sendTemplateEmail(
        'success_story',
        user_email,
        { user_name, partner_name },
        {
          fallbackSubject: 'Thank You for Sharing Your Success Story - Vivaaha Matrimony',
          fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h1 style="color:#d4af37">🎉 Thank You!</h1><p>Dear ${user_name},</p><p>We are delighted to receive your beautiful success story with ${partner_name}!</p><p>Our team will review your story within 2-3 business days. Once approved, it will be featured on our Success Stories page.</p><p>With warm regards,<br><strong>The Vivaaha Matrimony Team</strong></p></div>`,
        }
      );
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
    }

    res.json({
      success: true,
      message: "Success story submitted successfully! It will be reviewed before publishing.",
      story_id: result.insertId
    });
  } catch (error) {
    console.error("Submit Success Story Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to submit story. Please try again later." 
    });
  }
}

// Get Published Success Stories
export async function getSuccessStories(req, res) {
  try {
    const { page = 1, limit = 6 } = req.query;
    const offset = (page - 1) * limit;

    const stories = await query(`
      SELECT 
        id,
        user_name,
        partner_name,
        wedding_date,
        story_content,
        photo_url,
        created_at
      FROM success_stories 
      WHERE is_published = TRUE AND status = 'approved'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [parseInt(limit), offset]);

    const totalCount = await query(`
      SELECT COUNT(*) as count FROM success_stories 
      WHERE is_published = TRUE AND status = 'approved'
    `);

    res.json({
      success: true,
      stories,
      total: totalCount[0].count,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error("Get Success Stories Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Success Story Submissions (Admin)
export async function getSuccessStorySubmissions(req, res) {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (status) {
      whereClause = 'WHERE status = ?';
      params.push(status);
    }

    const submissions = await query(`
      SELECT * FROM success_stories 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const totalCount = await query(`
      SELECT COUNT(*) as count FROM success_stories ${whereClause}
    `, params);

    res.json({
      success: true,
      submissions,
      total: totalCount[0].count,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error("Get Success Story Submissions Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Success Story Status (Admin)
export async function updateSuccessStoryStatus(req, res) {
  try {
    const { story_id } = req.params;
    const { status, is_published } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be: pending, approved, or rejected"
      });
    }

    await query(`
      UPDATE success_stories 
      SET status = ?, is_published = ?, updated_at = NOW()
      WHERE id = ?
    `, [status, is_published ? 1 : 0, story_id]);

    res.json({
      success: true,
      message: "Success story status updated successfully"
    });
  } catch (error) {
    console.error("Update Success Story Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}