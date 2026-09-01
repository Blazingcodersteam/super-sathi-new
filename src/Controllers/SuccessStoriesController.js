"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitSuccessStory = submitSuccessStory;
exports.getSuccessStories = getSuccessStories;
exports.getSuccessStorySubmissions = getSuccessStorySubmissions;
exports.updateSuccessStoryStatus = updateSuccessStoryStatus;
const utils = require("util");
const client_s3_1 = require("@aws-sdk/client-s3");
const path = require("path");
const emailOutboxService_1 = require("../services/emailOutboxService");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// AWS S3 Configuration
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "images-2025-new";
// Submit Success Story
async function submitSuccessStory(req, res) {
    try {
        const { user_name, partner_name, user_email, partner_email, first_met_date, wedding_date, do_not_disclose, not_yet_fixed, story_content, agree_to_terms, feature_in_stories } = req.body;
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
            await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
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
        // Queue confirmation email
        try {
            await (0, emailOutboxService_1.enqueueEmailOutboxJob)({
                jobType: "alert-email",
                eventKey: "success_story",
                deduplicationKey: `success-story-email:${result.insertId}`,
                payload: {
                    kind: "alert-email",
                    toEmail: user_email,
                    recipientName: user_name,
                    templateKey: "success_story",
                    variables: { user_name, partner_name },
                    fallbackSubject: 'Thank You for Sharing Your Success Story - Vivaaha Matrimony',
                    fallbackBody: `Dear ${user_name}, we are delighted to receive your success story with ${partner_name}. Our team will review your story within 2-3 business days.`,
                    fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h1 style="color:#d4af37">Thank You!</h1><p>Dear ${user_name},</p><p>We are delighted to receive your beautiful success story with ${partner_name}!</p><p>Our team will review your story within 2-3 business days. Once approved, it will be featured on our Success Stories page.</p><p>With warm regards,<br><strong>The Vivaaha Matrimony Team</strong></p></div>`,
                    meta: { event: "success_story", connectionId: result.insertId },
                },
            });
        }
        catch (emailError) {
            console.error("Email outbox queueing failed:", { storyId: result.insertId, message: emailError === null || emailError === void 0 ? void 0 : emailError.message });
        }
        res.json({
            success: true,
            message: "Success story submitted successfully! It will be reviewed before publishing.",
            story_id: result.insertId
        });
    }
    catch (error) {
        console.error("Submit Success Story Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to submit story. Please try again later."
        });
    }
}
// Get Published Success Stories
async function getSuccessStories(req, res) {
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
    }
    catch (error) {
        console.error("Get Success Stories Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Success Story Submissions (Admin)
async function getSuccessStorySubmissions(req, res) {
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
    }
    catch (error) {
        console.error("Get Success Story Submissions Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Success Story Status (Admin)
async function updateSuccessStoryStatus(req, res) {
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
    }
    catch (error) {
        console.error("Update Success Story Status Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=SuccessStoriesController.js.map