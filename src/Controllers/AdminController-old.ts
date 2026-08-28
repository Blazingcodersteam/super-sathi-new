import * as utils from "util";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";
import * as multer from "multer";
import * as path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { sendMail } from "./SendMailController";
import { EmailService } from "./EmailService";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const JWT_SECRET = process.env.JWT_SECRET_KEY;

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "images-2025-new";

// Generate Random 8-Digit Password
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Send Welcome Email with Password
async function sendWelcomeEmail(email: string, firstName: string, password: string, vivaaha_user_id: string): Promise<void> {
  const subject = "Welcome to Super Sathi Matrimony - Your Account Details";
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Welcome to Super Sathi Matrimony</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .credentials { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
            .password-box { background: #e8f4fd; padding: 15px; border-radius: 5px; text-align: center; margin: 15px 0; }
            .password { font-size: 24px; font-weight: bold; color: #2c5aa0; letter-spacing: 2px; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .btn { display: inline-block; background: #667eea; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Welcome to Super Sathi Matrimony!</h1>
                <p>Your profile has been successfully created</p>
            </div>
            <div class="content">
                <p>Dear ${firstName},</p>

                <p>Congratulations! Your Super Sathi Matrimony profile has been created successfully by our admin team. Below are your login credentials:</p>

                <div class="credentials">
                    <h3>📧 Your Login Details:</h3>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Super Sathi ID:</strong> ${vivaaha_user_id}</p>

                    <div class="password-box">
                        <p><strong>Your Password:</strong></p>
                        <div class="password">${password}</div>
                    </div>
                </div>

                <div class="warning">
                    <h4>🔒 Important Security Notice:</h4>
                    <ul>
                        <li>Please change your password after your first login</li>
                        <li>Keep your login credentials secure and confidential</li>
                        <li>Never share your password with anyone</li>
                        <li>Use a strong, unique password for better security</li>
                    </ul>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                    <a href="https://vivaaha.net/login" class="btn">Login to Your Account</a>
                </div>

                <h3>🌟 What's Next?</h3>
                <ul>
                    <li>Complete your profile with photos and additional details</li>
                    <li>Set your partner preferences</li>
                    <li>Start browsing and connecting with potential matches</li>
                    <li>Explore our premium subscription plans for enhanced features</li>
                </ul>

                <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>

                <p>Welcome to the Super Sathi family! We wish you the best in finding your perfect life partner.</p>

                <p>Best regards,<br>
                <strong>The Super Sathi Matrimony Team</strong></p>
            </div>
            <div class="footer">
                <p>This is an automated message from Super Sathi Matrimony</p>
            </div>
        </div>
    </body>
    </html>
  `;

  await EmailService.sendTemplateEmail(
    'admin_account_creation',
    email,
    { user_name: firstName, email, temp_password: password, profile_id: vivaaha_user_id },
    {
      fallbackSubject: 'Welcome to Super Sathi Matrimony - Your Account Details',
      fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2>Welcome to Super Sathi Matrimony!</h2><p>Dear ${firstName},</p><p>Your account has been created. Login credentials:</p><div style="background:#f8f9fa;padding:20px;border-radius:5px;margin:20px 0"><p><strong>Email:</strong> ${email}</p><p><strong>Super Sathi ID:</strong> ${vivaaha_user_id}</p><p><strong>Password:</strong> <span style="font-family:monospace;background:#e9ecef;padding:2px 4px">${password}</span></p></div><p style="color:#dc3545"><strong>Important:</strong> Please change your password after first login.</p><p>Best regards,<br>Super Sathi Matrimony Team</p></div>`,
    }
  );
}

// Admin Login
export async function adminLogin(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const [admin] = await query(
      "SELECT * FROM users WHERE email = ? AND user_type_id = 2",
      [email]
    );

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Check password - use bcrypt if passwords are hashed, plain text if not
    let isValidPassword;
    if (admin.password.startsWith('$2b$') || admin.password.startsWith('$2a$')) {
      // Password is hashed with bcrypt
      isValidPassword = await bcrypt.compare(password, admin.password);
    } else {
      // Password is stored as plain text
      isValidPassword = password === admin.password;
    }

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      { user_id: admin.id, email: admin.email, user_type: "admin" },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        user_type_id: admin.user_type_id,
        phone: admin.phone || null,
      },
    });
  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get All Users
export async function getAllUsers(req, res) {
  try {
    const {
      page = 1,
      limit,
      search = "",
      vivahaid = "",
      gender,
      subscription_plan,
      fromdate,
      todate,
      status
    } = req.query;
    const offset = (page - 1) * (limit || 0);

    let whereClause = "WHERE u.user_type_id = 1"; // Only get regular users
    let params = [];

    // Status filter — DB stores numeric status (1=active, 2=inactive, 0=pending)
    if (status !== undefined && status !== '') {
      whereClause += " AND u.status = ?";
      params.push(parseInt(String(status)));
    } else {
      whereClause += " AND u.status = 1"; // default active
    }

    // Search filter (existing)
    if (search) {
      whereClause += " AND (u.email LIKE ? OR up.first_name LIKE ? OR up.middle_name LIKE ? OR up.last_name LIKE ? OR u.vivaaha_user_id LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Super Sathi ID filter (new)
    if (vivahaid) {
      whereClause += " AND u.vivaaha_user_id LIKE ?";
      params.push(`%${vivahaid}%`);
    }

    // Gender filter (new)
    if (gender) {
      whereClause += " AND up.gender_id = ?";
      params.push(gender);
    }

    // Subscription plan filter (new) - Fixed version
    if (subscription_plan) {
      // Decode URL-encoded subscription plan name
      const decodedPlanName = decodeURIComponent(subscription_plan.toString());
      whereClause += ` AND EXISTS (
        SELECT 1 FROM user_subscriptions us
        JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = u.id
        AND us.subscription_status_id = 1
        AND us.end_date > CURRENT_DATE
        AND sp.plan_name = ?
      )`;
      params.push(decodedPlanName);
    }

    // Date range filters (new)
    if (fromdate) {
      whereClause += " AND DATE(u.created_at) >= ?";
      params.push(fromdate);
    }

    if (todate) {
      whereClause += " AND DATE(u.created_at) <= ?";
      params.push(todate);
    }

    // Build query with or without LIMIT - using subqueries to avoid duplicates
    let queryStr = `SELECT DISTINCT u.id, u.email, u.phone, u.user_type_id, u.status, u.email_verified, u.phone_verified, u.created_at,
              u.vivaaha_user_id,
              up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age,
              up.profile_managed_by_id, up.profile_created_by,
              ccm.dial_code, ccm.country_name,
              gm.gender_name,
              pmb.managed_by_name as profile_managed_by_name,
              (
                SELECT CASE WHEN dv.verification_status = 'verified' THEN 1 ELSE 0 END
                FROM document_verification dv
                WHERE dv.user_id = u.id AND dv.document_type = 'aadhaar'
                ORDER BY dv.updated_at DESC
                LIMIT 1
              ) as aadhaar_verified,
              (
                SELECT CASE WHEN dv.verification_status = 'verified' THEN 1 ELSE 0 END
                FROM document_verification dv
                WHERE dv.user_id = u.id AND dv.document_type = 'pan'
                ORDER BY dv.updated_at DESC
                LIMIT 1
              ) as pan_verified,
              (
                SELECT CASE WHEN dv.verification_status = 'verified' THEN 1 ELSE 0 END
                FROM document_verification dv
                WHERE dv.user_id = u.id AND dv.document_type = 'driving_license'
                ORDER BY dv.updated_at DESC
                LIMIT 1
              ) as dl_verified,
              (
                SELECT photo_url FROM user_photos
                WHERE user_id = u.id AND is_primary = 1
                ORDER BY upload_date DESC LIMIT 1
              ) as user_image,
              (
                SELECT JSON_OBJECT(
                  'id', sp.id,
                  'plan_name', sp.plan_name,
                  'duration_months', sp.duration_months,
                  'price', sp.price,
                  'original_price', sp.original_price,
                  'discount_percentage', sp.discount_percentage,
                  'is_top_seller', sp.is_top_seller,
                  'is_best_value', sp.is_best_value,
                  'currency', JSON_OBJECT(
                    'id', cm.id,
                    'currency_code', cm.currency_code,
                    'currency_name', cm.currency_name,
                    'symbol', cm.symbol
                  ),
                  'per_month_price', ROUND(sp.price / sp.duration_months)
                )
                FROM user_subscriptions us
                LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
                LEFT JOIN currency_master cm ON sp.currency_id = cm.id
                WHERE us.user_id = u.id AND us.subscription_status_id = 1
                AND us.end_date > CURRENT_DATE
                ORDER BY us.end_date DESC LIMIT 1
              ) as subscription_plan,
              (
                SELECT us.end_date FROM user_subscriptions us
                WHERE us.user_id = u.id AND us.subscription_status_id = 1
                AND us.end_date > CURRENT_DATE
                ORDER BY us.end_date DESC LIMIT 1
              ) as subscription_end_date
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       LEFT JOIN country_code_master ccm ON u.country_code_id = ccm.id
       LEFT JOIN gender_master gm ON up.gender_id = gm.id
       LEFT JOIN profile_managed_by_master pmb ON up.profile_managed_by_id = pmb.id
       ${whereClause}
       ORDER BY u.created_at DESC`;

    let queryParams = [...params];

    if (limit) {
      queryStr += " LIMIT ? OFFSET ?";
      queryParams.push(parseInt(limit), offset);
    }

    const users = await query(queryStr, queryParams);

    // Parse subscription_plan JSON strings to objects
    const processedUsers = users.map(user => ({
      ...user,
      subscription_plan: user.subscription_plan ?
        (typeof user.subscription_plan === 'string' ?
          JSON.parse(user.subscription_plan) :
          user.subscription_plan) :
        null
    }));

    // Separate users into verified and unverified arrays based on aadhaar verification
    const aadhaar_verified = processedUsers.filter(user => user.aadhaar_verified === 1);
    const aadhaar_unverified = processedUsers.filter(user => user.aadhaar_verified === 0 || user.aadhaar_verified === null);

    const [{ total }] = await query(
      `SELECT COUNT(DISTINCT u.id) as total FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       LEFT JOIN gender_master gm ON up.gender_id = gm.id
       ${whereClause}`,
      params
    );

    const response: any = {
      success: true,
      users: processedUsers,
      aadhaar_verified: aadhaar_verified,
      aadhaar_unverified: aadhaar_unverified,
    };

    // Only add pagination if limit is specified
    if (limit) {
      response.pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      };
    } else {
      response.total = total;
    }

    res.json(response);
  } catch (error) {
    console.error("Get Users Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get All Users Full Details Report (Admin)
export async function getAllUsersFullReport(req, res) {
  try {
    const { search = "" } = req.query;

    let whereClause = "WHERE u.status = 'active'";
    let params = [];

    if (search) {
      whereClause += " AND (u.email LIKE ? OR up.first_name LIKE ? OR up.middle_name LIKE ? OR up.last_name LIKE ? OR u.vivaaha_user_id LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Get basic user profiles - only active users
    const users = await query(`
      SELECT u.*, up.*, bg.blood_group, dis.disability_name, hi.health_condition,
              up.diet_id, r.religion_name, c.caste_name, cm.community_name, mt.language_name as mother_tongue,
              g.gender_name, ms.status_name as marital_status, dr.drinking_type, sm.smoking_type,
              ccm.dial_code, ccm.country_name,
              CASE WHEN dv_aadhaar.verification_status = 'verified' THEN 1 ELSE 0 END as aadhaar_verified,
              CASE WHEN dv_pan.verification_status = 'verified' THEN 1 ELSE 0 END as pan_verified,
              CASE WHEN dv_dl.verification_status = 'verified' THEN 1 ELSE 0 END as dl_verified,
              CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
       LEFT JOIN disability_master dis ON up.disability_id = dis.id
       LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
       LEFT JOIN religion_master r ON up.religion_id = r.id
       LEFT JOIN caste_master c ON up.caste_id = c.id
       LEFT JOIN community_master cm ON up.community_id = cm.id
       LEFT JOIN mother_tongue_master mt ON up.mother_tongue_id = mt.id
       LEFT JOIN gender_master g ON up.gender_id = g.id
       LEFT JOIN marital_status_master ms ON up.marital_status_id = ms.id
       LEFT JOIN drinking_master dr ON up.drinking_id = dr.id
       LEFT JOIN smoking_master sm ON up.smoking_id = sm.id
       LEFT JOIN country_code_master ccm ON u.country_code_id = ccm.id
       LEFT JOIN document_verification dv_aadhaar ON u.id = dv_aadhaar.user_id AND dv_aadhaar.document_type = 'aadhaar'
       LEFT JOIN document_verification dv_pan ON u.id = dv_pan.user_id AND dv_pan.document_type = 'pan'
       LEFT JOIN document_verification dv_dl ON u.id = dv_dl.user_id AND dv_dl.document_type = 'driving_license'
       ${whereClause}
       ORDER BY u.created_at DESC
    `, params);

    const processedUsers = [];

    for (const user of users) {
      // Get diet names for diet_id (plain integer or JSON array)
      let diet_names = [];
      if (user && user.diet_id) {
        let dietIds = [];
        try {
          const parsed = JSON.parse(user.diet_id);
          dietIds = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          const numVal = Number(user.diet_id);
          if (!isNaN(numVal) && numVal > 0) dietIds = [numVal];
        }
        if (dietIds.length > 0) {
          const dietResults = await query(
            `SELECT diet_name FROM diet_master WHERE id IN (${dietIds.map(() => '?').join(',')})`,
            dietIds
          );
          diet_names = dietResults.map(d => d.diet_name);
        }
      }
      user.diet_names = diet_names;

      // Get astro details
      const [astro] = await query(
        `SELECT ad.*, g.gothra_name, c.country_name
         FROM astro_details ad
         LEFT JOIN gothra_master g ON ad.gothra_id = g.id
         LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
         WHERE ad.user_id = ?`,
        [user.id]
      );

      // Get family details
      const [family] = await query(
        `SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
                ffs.status_name as financial_status, c.country_name as family_country
         FROM family_details fd
         LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
         LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
         LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
         LEFT JOIN country_code_master c ON fd.family_country_id = c.id
         WHERE fd.user_id = ?`,
        [user.id]
      );

      // Get career details
      const [career] = await query(
        `SELECT cd.*, ww.working_type, c.country_name as country_living
         FROM career_details cd
         LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
         LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
         WHERE cd.user_id = ?`,
        [user.id]
      );

      // Get location details
      const [location] = await query(
        `SELECT ld.*, c.city_name, s.state_name, co.country_name, cd.grew_up_in_ids, cd.ethnic_origin_id, eo.origin_name as ethnic_origin_name
         FROM location_details ld
         LEFT JOIN cities_master c ON ld.city_id = c.id
         LEFT JOIN states_master s ON ld.state_id = s.id
         LEFT JOIN country_code_master co ON ld.country_id = co.id
         LEFT JOIN career_details cd ON ld.user_id = cd.user_id
         LEFT JOIN ethnic_origin_master eo ON cd.ethnic_origin_id = eo.id
         WHERE ld.user_id = ?`,
        [user.id]
      );

      // Parse grew_up_in_ids JSON string to array
      if (location && location.grew_up_in_ids) {
        try {
          location.grew_up_in_ids = JSON.parse(location.grew_up_in_ids);
        } catch (e) {
          location.grew_up_in_ids = [];
        }
      }

      // Get hobbies
      const hobbies = await query(
        `SELECT hm.* FROM user_hobbies uh
         JOIN hobbies_master hm ON uh.hobby_id = hm.id
         WHERE uh.user_id = ?`,
        [user.id]
      );

      // Get education details
      const [education] = await query(
        `SELECT ed.*, el.level_name, ea.area_name
         FROM education_details ed
         LEFT JOIN education_level_master el ON ed.education_level_id = el.id
         LEFT JOIN education_area_master ea ON ed.education_area_id = ea.id
         WHERE ed.user_id = ?`,
        [user.id]
      );

      // Get photos
      const photos = await query(
        `SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC, upload_date DESC`,
        [user.id]
      );

      // Get government ID details
      const [governmentId] = await query(
        `SELECT ugiv.*, gitm.id_type_name
         FROM user_government_id_verification ugiv
         LEFT JOIN government_id_type_master gitm ON ugiv.id_type_id = gitm.id
         WHERE ugiv.user_id = ?`,
        [user.id]
      );

      // Get subscription details
      const [subscription] = await query(
        `SELECT us.*, sp.plan_name, sp.price, sp.duration_months, sp.original_price, sp.discount_percentage,
                sp.is_top_seller, sp.is_best_value, sp.currency_id,
                ssm.status_name as subscription_status, cm.currency_code, cm.symbol, cm.currency_name,
                CASE WHEN us.end_date > CURRENT_DATE THEN 1 ELSE 0 END as is_active
         FROM user_subscriptions us
         LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
         LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
         LEFT JOIN currency_master cm ON sp.currency_id = cm.id
         WHERE us.user_id = ?
         ORDER BY us.created_at DESC LIMIT 1`,
        [user.id]
      );

      processedUsers.push({
        basic: user,
        astro: astro || {},
        family: family || {},
        career: career || {},
        location: location || {},
        education: education || {},
        hobbies: hobbies || [],
        photos: photos || [],
        government_id: governmentId || {},
        subscription: subscription ? {
          ...subscription,
          subscription_plan: {
            id: subscription.plan_id,
            plan_name: subscription.plan_name,
            duration_months: subscription.duration_months,
            price: subscription.price,
            original_price: subscription.original_price,
            discount_percentage: subscription.discount_percentage,
            is_top_seller: subscription.is_top_seller,
            is_best_value: subscription.is_best_value,
            currency: {
              id: subscription.currency_id,
              currency_code: subscription.currency_code,
              currency_name: subscription.currency_name,
              symbol: subscription.symbol
            },
            per_month_price: Math.round(subscription.price / subscription.duration_months)
          }
        } : null
      });
    }

    res.json({
      success: true,
      users: processedUsers,
      total: processedUsers.length
    });
  } catch (error) {
    console.error("Get Users Full Report Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get User by ID with Complete Details
export async function getUserById(req, res) {
  try {
    const { id } = req.params;

    // Get basic profile with all details
    const [profile] = await query(
      `SELECT u.*, up.*, bg.blood_group, dis.disability_name, hi.health_condition,
              up.diet_id, r.religion_name, c.caste_name, cm.community_name, mt.language_name as mother_tongue,
              g.gender_name, ms.status_name as marital_status, dr.drinking_type, sm.smoking_type,
              ccm.dial_code, ccm.country_name,
              CASE WHEN dv_aadhaar.verification_status = 'verified' THEN 1 ELSE 0 END as aadhaar_verified,
              CASE WHEN dv_pan.verification_status = 'verified' THEN 1 ELSE 0 END as pan_verified,
              CASE WHEN dv_dl.verification_status = 'verified' THEN 1 ELSE 0 END as dl_verified,
              CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
       LEFT JOIN disability_master dis ON up.disability_id = dis.id
       LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
       LEFT JOIN religion_master r ON up.religion_id = r.id
       LEFT JOIN caste_master c ON up.caste_id = c.id
       LEFT JOIN community_master cm ON up.community_id = cm.id
       LEFT JOIN mother_tongue_master mt ON up.mother_tongue_id = mt.id
       LEFT JOIN gender_master g ON up.gender_id = g.id
       LEFT JOIN marital_status_master ms ON up.marital_status_id = ms.id
       LEFT JOIN drinking_master dr ON up.drinking_id = dr.id
       LEFT JOIN smoking_master sm ON up.smoking_id = sm.id
       LEFT JOIN country_code_master ccm ON u.country_code_id = ccm.id
       LEFT JOIN document_verification dv_aadhaar ON u.id = dv_aadhaar.user_id AND dv_aadhaar.document_type = 'aadhaar'
       LEFT JOIN document_verification dv_pan ON u.id = dv_pan.user_id AND dv_pan.document_type = 'pan'
       LEFT JOIN document_verification dv_dl ON u.id = dv_dl.user_id AND dv_dl.document_type = 'driving_license'
       WHERE u.id = ?`,
      [id]
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get diet names for diet_id (plain integer or JSON array)
    let diet_names = [];
    if (profile && profile.diet_id) {
      let dietIds = [];
      try {
        const parsed = JSON.parse(profile.diet_id);
        dietIds = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        const numVal = Number(profile.diet_id);
        if (!isNaN(numVal) && numVal > 0) dietIds = [numVal];
      }
      if (dietIds.length > 0) {
        const dietResults = await query(
          `SELECT diet_name FROM diet_master WHERE id IN (${dietIds.map(() => '?').join(',')})`,
          dietIds
        );
        diet_names = dietResults.map(d => d.diet_name);
      }
    }
    profile.diet_names = diet_names;

    // Get astro details
    const [astro] = await query(
      `SELECT ad.*, g.gothra_name, c.country_name
       FROM astro_details ad
       LEFT JOIN gothra_master g ON ad.gothra_id = g.id
       LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
       WHERE ad.user_id = ?`,
      [id]
    );

    // Get family details
    const [family] = await query(
      `SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
              ffs.status_name as financial_status, c.country_name as family_country
       FROM family_details fd
       LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
       LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
       LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
       LEFT JOIN country_code_master c ON fd.family_country_id = c.id
       WHERE fd.user_id = ?`,
      [id]
    );

    // Get career details
    const [career] = await query(
      `SELECT cd.*, ww.working_type, c.country_name as country_living
       FROM career_details cd
       LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
       LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
       WHERE cd.user_id = ?`,
      [id]
    );

    // Get location details
    const [location] = await query(
      `SELECT ld.*, c.city_name, s.state_name, co.country_name, cd.grew_up_in_ids, cd.ethnic_origin_id, eo.origin_name as ethnic_origin_name
       FROM location_details ld
       LEFT JOIN cities_master c ON ld.city_id = c.id
       LEFT JOIN states_master s ON ld.state_id = s.id
       LEFT JOIN country_code_master co ON ld.country_id = co.id
       LEFT JOIN career_details cd ON ld.user_id = cd.user_id
       LEFT JOIN ethnic_origin_master eo ON cd.ethnic_origin_id = eo.id
       WHERE ld.user_id = ?`,
      [id]
    );

    // Parse grew_up_in_ids JSON string to array
    if (location && location.grew_up_in_ids) {
      try {
        location.grew_up_in_ids = JSON.parse(location.grew_up_in_ids);
      } catch (e) {
        location.grew_up_in_ids = [];
      }
    }

    // Get hobbies
    const hobbies = await query(
      `SELECT hm.* FROM user_hobbies uh
       JOIN hobbies_master hm ON uh.hobby_id = hm.id
       WHERE uh.user_id = ?`,
      [id]
    );

    // Get education details
    const [education] = await query(
      `SELECT ed.*, el.level_name, ea.area_name
       FROM education_details ed
       LEFT JOIN education_level_master el ON ed.education_level_id = el.id
       LEFT JOIN education_area_master ea ON ed.education_area_id = ea.id
       WHERE ed.user_id = ?`,
      [id]
    );

    // Get photos
    const photos = await query(
      `SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC, upload_date DESC`,
      [id]
    );

    // Get government ID details
    const [governmentId] = await query(
      `SELECT ugiv.*, gitm.id_type_name
       FROM user_government_id_verification ugiv
       LEFT JOIN government_id_type_master gitm ON ugiv.id_type_id = gitm.id
       WHERE ugiv.user_id = ?`,
      [id]
    );

    // Get subscription details
    const [subscription] = await query(
      `SELECT us.*, sp.plan_name, sp.price, sp.duration_months, sp.original_price, sp.discount_percentage,
              sp.is_top_seller, sp.is_best_value, sp.currency_id,
              ssm.status_name as subscription_status, cm.currency_code, cm.symbol, cm.currency_name,
              CASE WHEN us.end_date > CURRENT_DATE THEN 1 ELSE 0 END as is_active
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
       LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
       LEFT JOIN currency_master cm ON sp.currency_id = cm.id
       WHERE us.user_id = ?
       ORDER BY us.created_at DESC LIMIT 1`,
      [id]
    );

    res.json({
      success: true,
      user: {
        basic: profile,
        astro: astro || {},
        family: family || {},
        career: career || {},
        location: location || {},
        education: education || {},
        hobbies: hobbies || [],
        photos: photos || [],
        government_id: governmentId || {},
        subscription: subscription ? {
          ...subscription,
          subscription_plan: {
            id: subscription.plan_id,
            plan_name: subscription.plan_name,
            duration_months: subscription.duration_months,
            price: subscription.price,
            original_price: subscription.original_price,
            discount_percentage: subscription.discount_percentage,
            is_top_seller: subscription.is_top_seller,
            is_best_value: subscription.is_best_value,
            currency: {
              id: subscription.currency_id,
              currency_code: subscription.currency_code,
              currency_name: subscription.currency_name,
              symbol: subscription.symbol
            },
            per_month_price: Math.round(subscription.price / subscription.duration_months)
          }
        } : null
      }
    });
  } catch (error) {
    console.error("Get User Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Create User
export async function createUser(req, res) {
  try {
    const {
      email,
      password,
      phone,
      country_code_id = 1,
      first_name,
      middle_name,
      last_name,
      gender_id = 1,
      date_of_birth,
    } = req.body;

    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing",
      });
    }

    // Check if email exists (exclude soft-deleted users)
    const [existing] = await query(
      "SELECT id FROM users WHERE email = ? AND status != 4",
      [email]
    );
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    // Create user
    const userResult = await query(
      "INSERT INTO users (email, password, phone, country_code_id, user_type_id, status) VALUES (?, ?, ?, ?, 1, 1)",
      [email, password, phone, country_code_id]
    );

    // Create profile
    await query(
      "INSERT INTO user_profiles (user_id, first_name, middle_name, last_name, gender_id, date_of_birth) VALUES (?, ?, ?, ?, ?, ?)",
      [userResult.insertId, first_name, middle_name || null, last_name, gender_id, date_of_birth]
    );

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user_id: userResult.insertId,
    });
  } catch (error) {
    console.error("Create User Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User
export async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const {
      email,
      phone,
      country_code_id,
      status,
      first_name,
      middle_name,
      last_name,
      gender_id,
      date_of_birth,
    } = req.body;

    // Check if user exists
    const [existing] = await query(
      "SELECT id FROM users WHERE id = ?",
      [id]
    );
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Build dynamic update query for users table
    const userUpdates = [];
    const userValues = [];

    if (email !== undefined) {
      // Check if email is already taken by another user (exclude current user)
      const [emailExists] = await query("SELECT id FROM users WHERE email = ? AND id != ?", [email, id]);
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists for another user",
        });
      }
      userUpdates.push('email = ?');
      userValues.push(email);
    }
    if (phone !== undefined) {
      // Check if phone is already taken by another user (exclude current user)
      const [phoneExists] = await query("SELECT id FROM users WHERE phone = ? AND id != ?", [phone, id]);
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists for another user",
        });
      }
      userUpdates.push('phone = ?');
      userValues.push(phone);
    }
    if (country_code_id !== undefined) {
      userUpdates.push('country_code_id = ?');
      userValues.push(country_code_id);
    }
    if (status !== undefined) {
      userUpdates.push('status = ?');
      userValues.push(status);
    }

    // Update users table if there are changes
    if (userUpdates.length > 0) {
      userValues.push(id);
      await query(
        `UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`,
        userValues
      );
    }

    // Build dynamic update query for user_profiles table
    const profileUpdates = [];
    const profileValues = [];

    if (first_name !== undefined) {
      profileUpdates.push('first_name = ?');
      profileValues.push(first_name);
    }
    if (middle_name !== undefined) {
      profileUpdates.push('middle_name = ?');
      profileValues.push(middle_name || null);
    }
    if (last_name !== undefined) {
      profileUpdates.push('last_name = ?');
      profileValues.push(last_name);
    }
    if (gender_id !== undefined) {
      profileUpdates.push('gender_id = ?');
      profileValues.push(gender_id);
    }
    if (date_of_birth !== undefined) {
      profileUpdates.push('date_of_birth = ?');
      profileValues.push(date_of_birth);
      if (date_of_birth) {
        const age = new Date().getFullYear() - new Date(date_of_birth).getFullYear();
        profileUpdates.push('age = ?');
        profileValues.push(age);
      }
    }

    // Update user_profiles table if there are changes
    if (profileUpdates.length > 0) {
      profileValues.push(id);
      await query(
        `UPDATE user_profiles SET ${profileUpdates.join(', ')} WHERE user_id = ?`,
        profileValues
      );
    }

    res.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (error) {
    console.error("Update User Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Soft Delete User
export async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    const [existing] = await query(
      "SELECT id, email FROM users WHERE id = ?",
      [id]
    );
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Nullify email so the same email can be re-registered after deletion
    const deletedEmail = `deleted_${id}_${Date.now()}@deleted.vivaaha`;
    await query(
      "UPDATE users SET status = 4, email = ?, phone = NULL WHERE id = ?",
      [deletedEmail, id]
    );

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Website Content
export async function getWebsiteContent(req, res) {
  try {
    const [content] = await query('SELECT * FROM website_content LIMIT 1');
    res.json({
      success: true,
      data: content || null,
    });
  } catch (error) {
    console.error("Get Website Content Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Website Content
export async function updateWebsiteContent(req, res) {
  try {
    const {
      privacy_policy,
      terms_conditions,
      refund_policy,
      safe_policy,
      be_safe_online,
      homepage_banner,
      title,
      subtitle,
      description
    } = req.body;

    // Check if content exists
    const [existing] = await query('SELECT id FROM website_content LIMIT 1');

    if (existing) {
      // Update existing content
      await query(
        `UPDATE website_content SET
         privacy_policy = COALESCE(?, privacy_policy),
         terms_conditions = COALESCE(?, terms_conditions),
         refund_policy = COALESCE(?, refund_policy),
         safe_policy = COALESCE(?, safe_policy),
         be_safe_online = COALESCE(?, be_safe_online),
         homepage_banner = COALESCE(?, homepage_banner),
         title = COALESCE(?, title),
         subtitle = COALESCE(?, subtitle),
         description = COALESCE(?, description),
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [privacy_policy, terms_conditions, refund_policy, safe_policy, be_safe_online,
         homepage_banner ? JSON.stringify(homepage_banner) : null, title, subtitle, description, existing.id]
      );
    } else {
      // Insert new content
      await query(
        `INSERT INTO website_content
         (privacy_policy, terms_conditions, refund_policy, safe_policy, be_safe_online, homepage_banner, title, subtitle, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [privacy_policy, terms_conditions, refund_policy, safe_policy, be_safe_online,
         homepage_banner ? JSON.stringify(homepage_banner) : null, title, subtitle, description]
      );
    }

    res.json({
      success: true,
      message: "Website content updated successfully",
    });
  } catch (error) {
    console.error("Update Website Content Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Specific Content Field
export async function updateContentField(req, res) {
  try {
    const { field_name } = req.params;
    const { content } = req.body;

    const websiteFields = ['privacy_policy', 'terms_conditions', 'refund_policy', 'safe_policy', 'be_safe_online', 'title', 'subtitle', 'description', 'community_guidelines', 'pricing_subscription_terms', 'prohibited_content_policy', 'grievance_redressal_policy', 'ai_algorithm_disclosure', 'intermediary_ugc_disclaimers', 'be_safe_online'];
    const ceoFields = ['ceo_image', 'ceo_content'];

    if (websiteFields.includes(field_name)) {
      // Handle website content fields
      const [existing] = await query('SELECT id FROM website_content LIMIT 1');

      if (existing) {
        await query(
          `UPDATE website_content SET ${field_name} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [content, existing.id]
        );
      } else {
        await query(
          `INSERT INTO website_content (${field_name}) VALUES (?)`,
          [content]
        );
      }
    } else if (ceoFields.includes(field_name)) {
      // Handle CEO content fields
      const [existing] = await query('SELECT id FROM ceo_content LIMIT 1');

      const dbField = field_name === 'ceo_content' ? 'ceo_message' : field_name;

      if (existing) {
        await query(
          `UPDATE ceo_content SET ${dbField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [content, existing.id]
        );
      } else {
        await query(
          `INSERT INTO ceo_content (${dbField}) VALUES (?)`,
          [content]
        );
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid field name",
      });
    }

    res.json({
      success: true,
      message: `${field_name} updated successfully`,
    });
  } catch (error) {
    console.error("Update Content Field Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Homepage Banner Images
export async function updateHomepageBanner(req, res) {
  try {
    const { images } = req.body;

    if (!Array.isArray(images)) {
      return res.status(400).json({
        success: false,
        message: "Images must be an array",
      });
    }

    // Check if content exists
    const [existing] = await query('SELECT id FROM website_content LIMIT 1');

    if (existing) {
      await query(
        'UPDATE website_content SET homepage_banner = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(images), existing.id]
      );
    } else {
      await query(
        'INSERT INTO website_content (homepage_banner) VALUES (?)',
        [JSON.stringify(images)]
      );
    }

    res.json({
      success: true,
      message: "Homepage banner updated successfully",
    });
  } catch (error) {
    console.error("Update Homepage Banner Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Upload CEO Image File to S3
export async function uploadCEOImageFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const fileExtension = path.extname(req.file.originalname);
    const fileName = `ceo/ceo-image-${Date.now()}${fileExtension}`;

    // Upload to S3
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    const imageUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    // Check if CEO content exists
    const [existing] = await query('SELECT id FROM ceo_content LIMIT 1');

    if (existing) {
      await query(
        'UPDATE ceo_content SET ceo_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [imageUrl, existing.id]
      );
    } else {
      await query(
        'INSERT INTO ceo_content (ceo_image) VALUES (?)',
        [imageUrl]
      );
    }

    res.json({
      success: true,
      message: "CEO image uploaded successfully",
      image_url: imageUrl,
    });
  } catch (error) {
    console.error("Upload CEO Image Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Specific Content Field
export async function getContentField(req, res) {
  try {
    const { field_name } = req.params;

    const websiteFields = ['privacy_policy', 'terms_conditions', 'refund_policy', 'safe_policy', 'title', 'subtitle', 'description', 'homepage_banner', 'community_guidelines', 'pricing_subscription_terms', 'prohibited_content_policy', 'grievance_redressal_policy', 'ai_algorithm_disclosure', 'intermediary_ugc_disclaimers', 'be_safe_online'];
    const ceoFields = ['ceo_image', 'ceo_content'];

    let content;

    if (websiteFields.includes(field_name)) {
      const [result] = await query(`SELECT ${field_name} FROM website_content LIMIT 1`);
      content = result ? result[field_name] : null;
    } else if (ceoFields.includes(field_name)) {
      if (field_name === 'ceo_content') {
        const [result] = await query('SELECT ceo_message FROM ceo_content LIMIT 1');
        content = result ? result.ceo_message : null;
      } else if (field_name === 'ceo_image') {
        const [result] = await query('SELECT ceo_image FROM ceo_content LIMIT 1');
        content = result ? result.ceo_image : null;
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid field name",
      });
    }

    res.json({
      success: true,
      data: content,
    });
  } catch (error) {
    console.error("Get Content Field Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============ SUBSCRIPTION MANAGEMENT ============

// Subscription Plans CRUD
export const subscriptionPlansCRUD = {
  // Get All Subscription Plans
  async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = "" } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = "";
      let params = [];

      if (search) {
        whereClause = "WHERE sp.plan_name LIKE ?";
        params.push(`%${search}%`);
      }

      const plans = await query(
        `SELECT sp.*, cm.currency_code, cm.symbol
         FROM subscription_plans sp
         LEFT JOIN currency_master cm ON sp.currency_id = cm.id
         ${whereClause}
         ORDER BY sp.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      );

      const [{ total }] = await query(
        `SELECT COUNT(*) as total FROM subscription_plans sp ${whereClause}`,
        params
      );

      res.json({
        success: true,
        data: plans,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get Subscription Plans Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Get Subscription Plan by ID
  async getById(req, res) {
    try {
      const { id } = req.params;

      const [plan] = await query(
        `SELECT sp.*, cm.currency_code, cm.symbol
         FROM subscription_plans sp
         LEFT JOIN currency_master cm ON sp.currency_id = cm.id
         WHERE sp.id = ?`,
        [id]
      );

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: "Subscription plan not found",
        });
      }

      // Get plan features
      const features = await query(
        `SELECT spf.*, sfm.feature_name, sfm.feature_description
         FROM subscription_plan_features spf
         LEFT JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
         WHERE spf.plan_id = ?`,
        [id]
      );

      res.json({
        success: true,
        data: { ...plan, features },
      });
    } catch (error) {
      console.error("Get Subscription Plan Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Create Subscription Plan
  async create(req, res) {
    try {
      const {
        plan_name,
        duration_months,
        price,
        original_price,
        discount_percentage,
        currency_id = 1,
        is_top_seller = 0,
        is_best_value = 0,
        user_status_id = 1
      } = req.body;

      if (!plan_name || !duration_months || !price) {
        return res.status(400).json({
          success: false,
          message: "Plan name, duration, and price are required",
        });
      }

      const result = await query(
        `INSERT INTO subscription_plans
         (plan_name, duration_months, price, original_price, discount_percentage, currency_id, is_top_seller, is_best_value, user_status_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [plan_name, duration_months, price, original_price, discount_percentage, currency_id, is_top_seller, is_best_value, user_status_id]
      );

      res.status(201).json({
        success: true,
        message: "Subscription plan created successfully",
        id: result.insertId,
      });
    } catch (error) {
      console.error("Create Subscription Plan Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Update Subscription Plan
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        plan_name,
        duration_months,
        price,
        original_price,
        discount_percentage,
        currency_id,
        is_top_seller,
        is_best_value,
        user_status_id
      } = req.body;

      const [existing] = await query("SELECT id FROM subscription_plans WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Subscription plan not found",
        });
      }

      await query(
        `UPDATE subscription_plans SET
         plan_name = COALESCE(?, plan_name),
         duration_months = COALESCE(?, duration_months),
         price = COALESCE(?, price),
         original_price = COALESCE(?, original_price),
         discount_percentage = COALESCE(?, discount_percentage),
         currency_id = COALESCE(?, currency_id),
         is_top_seller = COALESCE(?, is_top_seller),
         is_best_value = COALESCE(?, is_best_value),
         user_status_id = COALESCE(?, user_status_id)
         WHERE id = ?`,
        [plan_name, duration_months, price, original_price, discount_percentage, currency_id, is_top_seller, is_best_value, user_status_id, id]
      );

      res.json({
        success: true,
        message: "Subscription plan updated successfully",
      });
    } catch (error) {
      console.error("Update Subscription Plan Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Delete Subscription Plan
  async delete(req, res) {
    try {
      const { id } = req.params;

      const [existing] = await query("SELECT id FROM subscription_plans WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Subscription plan not found",
        });
      }

      await query("DELETE FROM subscription_plans WHERE id = ?", [id]);

      res.json({
        success: true,
        message: "Subscription plan deleted successfully",
      });
    } catch (error) {
      console.error("Delete Subscription Plan Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
};

// Subscription Plan Features CRUD
export const subscriptionPlanFeaturesCRUD = {
  // Get All Plan Features
  async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = "", plan_id } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = "WHERE 1=1";
      let params = [];

      if (search) {
        whereClause += " AND (sfm.feature_name LIKE ? OR sp.plan_name LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
      }

      if (plan_id) {
        whereClause += " AND spf.plan_id = ?";
        params.push(plan_id);
      }

      const features = await query(
        `SELECT spf.*, sp.plan_name, sfm.feature_name, sfm.feature_description
         FROM subscription_plan_features spf
         LEFT JOIN subscription_plans sp ON spf.plan_id = sp.id
         LEFT JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
         ${whereClause}
         ORDER BY spf.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      );

      const [{ total }] = await query(
        `SELECT COUNT(*) as total FROM subscription_plan_features spf
         LEFT JOIN subscription_plans sp ON spf.plan_id = sp.id
         LEFT JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
         ${whereClause}`,
        params
      );

      res.json({
        success: true,
        data: features,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get Plan Features Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Get Plan Feature by ID
  async getById(req, res) {
    try {
      const { id } = req.params;

      const [feature] = await query(
        `SELECT spf.*, sp.plan_name, sfm.feature_name, sfm.feature_description
         FROM subscription_plan_features spf
         LEFT JOIN subscription_plans sp ON spf.plan_id = sp.id
         LEFT JOIN subscription_features_master sfm ON spf.feature_id = sfm.id
         WHERE spf.id = ?`,
        [id]
      );

      if (!feature) {
        return res.status(404).json({
          success: false,
          message: "Plan feature not found",
        });
      }

      res.json({
        success: true,
        data: feature,
      });
    } catch (error) {
      console.error("Get Plan Feature Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Create Plan Feature
  async create(req, res) {
    try {
      const {
        plan_id,
        feature_id,
        feature_value,
        user_status_id = 1
      } = req.body;

      if (!plan_id || !feature_id) {
        return res.status(400).json({
          success: false,
          message: "Plan ID and Feature ID are required",
        });
      }

      const result = await query(
        `INSERT INTO subscription_plan_features
         (plan_id, feature_id, feature_value, user_status_id)
         VALUES (?, ?, ?, ?)`,
        [plan_id, feature_id, feature_value, user_status_id]
      );

      res.status(201).json({
        success: true,
        message: "Plan feature created successfully",
        id: result.insertId,
      });
    } catch (error) {
      console.error("Create Plan Feature Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Update Plan Feature
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        plan_id,
        feature_id,
        feature_value,
        user_status_id
      } = req.body;

      const [existing] = await query("SELECT id FROM subscription_plan_features WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Plan feature not found",
        });
      }

      await query(
        `UPDATE subscription_plan_features SET
         plan_id = COALESCE(?, plan_id),
         feature_id = COALESCE(?, feature_id),
         feature_value = COALESCE(?, feature_value),
         user_status_id = COALESCE(?, user_status_id)
         WHERE id = ?`,
        [plan_id, feature_id, feature_value, user_status_id, id]
      );

      res.json({
        success: true,
        message: "Plan feature updated successfully",
      });
    } catch (error) {
      console.error("Update Plan Feature Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Delete Plan Feature
  async delete(req, res) {
    try {
      const { id } = req.params;

      const [existing] = await query("SELECT id FROM subscription_plan_features WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Plan feature not found",
        });
      }

      await query("DELETE FROM subscription_plan_features WHERE id = ?", [id]);

      res.json({
        success: true,
        message: "Plan feature deleted successfully",
      });
    } catch (error) {
      console.error("Delete Plan Feature Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
};

// Subscription Features Master CRUD
export const subscriptionFeaturesMasterCRUD = {
  // Get All Features
  async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = "" } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = "";
      let params = [];

      if (search) {
        whereClause = "WHERE feature_name LIKE ? OR feature_description LIKE ?";
        params.push(`%${search}%`, `%${search}%`);
      }

      const features = await query(
        `SELECT * FROM subscription_features_master
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      );

      const [{ total }] = await query(
        `SELECT COUNT(*) as total FROM subscription_features_master ${whereClause}`,
        params
      );

      res.json({
        success: true,
        data: features,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get Features Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Get Feature by ID
  async getById(req, res) {
    try {
      const { id } = req.params;

      const [feature] = await query(
        "SELECT * FROM subscription_features_master WHERE id = ?",
        [id]
      );

      if (!feature) {
        return res.status(404).json({
          success: false,
          message: "Feature not found",
        });
      }

      res.json({
        success: true,
        data: feature,
      });
    } catch (error) {
      console.error("Get Feature Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Create Feature
  async create(req, res) {
    try {
      const {
        feature_name,
        feature_description,
        user_status_id = 1
      } = req.body;

      if (!feature_name) {
        return res.status(400).json({
          success: false,
          message: "Feature name is required",
        });
      }

      const result = await query(
        `INSERT INTO subscription_features_master
         (feature_name, feature_description, user_status_id)
         VALUES (?, ?, ?)`,
        [feature_name, feature_description, user_status_id]
      );

      res.status(201).json({
        success: true,
        message: "Feature created successfully",
        id: result.insertId,
      });
    } catch (error) {
      console.error("Create Feature Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Update Feature
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        feature_name,
        feature_description,
        user_status_id
      } = req.body;

      const [existing] = await query("SELECT id FROM subscription_features_master WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Feature not found",
        });
      }

      await query(
        `UPDATE subscription_features_master SET
         feature_name = COALESCE(?, feature_name),
         feature_description = COALESCE(?, feature_description),
         user_status_id = COALESCE(?, user_status_id)
         WHERE id = ?`,
        [feature_name, feature_description, user_status_id, id]
      );

      res.json({
        success: true,
        message: "Feature updated successfully",
      });
    } catch (error) {
      console.error("Update Feature Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Delete Feature
  async delete(req, res) {
    try {
      const { id } = req.params;

      const [existing] = await query("SELECT id FROM subscription_features_master WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Feature not found",
        });
      }

      await query("DELETE FROM subscription_features_master WHERE id = ?", [id]);

      res.json({
        success: true,
        message: "Feature deleted successfully",
      });
    } catch (error) {
      console.error("Delete Feature Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
};

// Subscription Addons Master CRUD
export const subscriptionAddonsMasterCRUD = {
  // Get All Addons
  async getAll(req, res) {
    try {
      const addons = await query(
        `SELECT sam.*, cm.currency_code, cm.symbol
         FROM subscription_addons_master sam
         LEFT JOIN currency_master cm ON sam.currency_id = cm.id
         ORDER BY sam.created_at DESC`
      );

      res.json({
        success: true,
        data: addons,
      });
    } catch (error) {
      console.error("Get Addons Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Get Addon by ID
  async getById(req, res) {
    try {
      const { id } = req.params;

      const [addon] = await query(
        `SELECT sam.*, cm.currency_code, cm.symbol
         FROM subscription_addons_master sam
         LEFT JOIN currency_master cm ON sam.currency_id = cm.id
         WHERE sam.id = ?`,
        [id]
      );

      if (!addon) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      res.json({
        success: true,
        data: addon,
      });
    } catch (error) {
      console.error("Get Addon Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Create Addon
  async create(req, res) {
    try {
      const {
        addon_name,
        addon_description,
        price,
        currency_id = 1,
        is_active = 1,
        availability = 'post_purchase_only'
      } = req.body;

      if (!addon_name || !price) {
        return res.status(400).json({
          success: false,
          message: "Addon name and price are required",
        });
      }

      const result = await query(
        `INSERT INTO subscription_addons_master
         (addon_name, addon_description, price, currency_id, is_active, availability)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [addon_name, addon_description, price, currency_id, is_active, availability]
      );

      res.status(201).json({
        success: true,
        message: "Addon created successfully",
        id: result.insertId,
      });
    } catch (error) {
      console.error("Create Addon Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Update Addon
  async update(req, res) {
    try {
      const { id } = req.params;
      const {
        addon_name,
        addon_description,
        price,
        currency_id,
        is_active,
        availability
      } = req.body;

      const [existing] = await query("SELECT id FROM subscription_addons_master WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      await query(
        `UPDATE subscription_addons_master SET
         addon_name = COALESCE(?, addon_name),
         addon_description = COALESCE(?, addon_description),
         price = COALESCE(?, price),
         currency_id = COALESCE(?, currency_id),
         is_active = COALESCE(?, is_active),
         availability = COALESCE(?, availability)
         WHERE id = ?`,
        [addon_name, addon_description, price, currency_id, is_active, availability, id]
      );

      res.json({
        success: true,
        message: "Addon updated successfully",
      });
    } catch (error) {
      console.error("Update Addon Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  },

  // Delete Addon
  async delete(req, res) {
    try {
      const { id } = req.params;

      const [existing] = await query("SELECT id FROM subscription_addons_master WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Addon not found",
        });
      }

      await query("DELETE FROM subscription_addons_master WHERE id = ?", [id]);

      res.json({
        success: true,
        message: "Addon deleted successfully",
      });
    } catch (error) {
      console.error("Delete Addon Error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
};

// ============ SUCCESS STORIES MANAGEMENT ============

// Get All Success Stories (Admin)
export async function getAllSuccessStories(req, res) {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];

    if (status) {
      whereClause = 'WHERE status = ?';
      params.push(status);
    }

    const stories = await query(`
      SELECT * FROM success_stories
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM success_stories ${whereClause}
    `, params);

    res.json({
      success: true,
      data: stories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get Success Stories Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Success Story by ID (Admin)
export async function getSuccessStoryById(req, res) {
  try {
    const { id } = req.params;

    const [story] = await query(
      "SELECT * FROM success_stories WHERE id = ?",
      [id]
    );

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Success story not found",
      });
    }

    res.json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error("Get Success Story Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Approve Success Story
export async function approveSuccessStory(req, res) {
  try {
    const { id } = req.params;
    const { is_published = 1 } = req.body;

    const [existing] = await query("SELECT id FROM success_stories WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Success story not found",
      });
    }

    await query(
      "UPDATE success_stories SET status = 'approved', is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [is_published, id]
    );

    res.json({
      success: true,
      message: "Success story approved successfully",
    });
  } catch (error) {
    console.error("Approve Success Story Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Reject Success Story
export async function rejectSuccessStory(req, res) {
  try {
    const { id } = req.params;

    const [existing] = await query("SELECT id FROM success_stories WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Success story not found",
      });
    }

    await query(
      "UPDATE success_stories SET status = 'rejected', is_published = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: "Success story rejected successfully",
    });
  } catch (error) {
    console.error("Reject Success Story Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Success Story Status
export async function updateSuccessStoryStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, is_published } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be: pending, approved, or rejected",
      });
    }

    const [existing] = await query("SELECT id FROM success_stories WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Success story not found",
      });
    }

    await query(
      "UPDATE success_stories SET status = ?, is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [status, is_published ? 1 : 0, id]
    );

    res.json({
      success: true,
      message: "Success story status updated successfully",
    });
  } catch (error) {
    console.error("Update Success Story Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Delete Success Story
export async function deleteSuccessStory(req, res) {
  try {
    const { id } = req.params;

    const [existing] = await query("SELECT id FROM success_stories WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Success story not found",
      });
    }

    await query("DELETE FROM success_stories WHERE id = ?", [id]);

    res.json({
      success: true,
      message: "Success story deleted successfully",
    });
  } catch (error) {
    console.error("Delete Success Story Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Success Story Details
export async function updateSuccessStory(req, res) {
  try {
    const { id } = req.params;
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
      photo_url,
      agree_to_terms,
      feature_in_stories,
      status,
      is_published
    } = req.body;

    const [existing] = await query("SELECT id FROM success_stories WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Success story not found",
      });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];

    if (user_name !== undefined) {
      updates.push('user_name = ?');
      values.push(user_name);
    }
    if (partner_name !== undefined) {
      updates.push('partner_name = ?');
      values.push(partner_name);
    }
    if (user_email !== undefined) {
      updates.push('user_email = ?');
      values.push(user_email);
    }
    if (partner_email !== undefined) {
      updates.push('partner_email = ?');
      values.push(partner_email);
    }
    if (first_met_date !== undefined) {
      updates.push('first_met_date = ?');
      values.push(first_met_date);
    }
    if (wedding_date !== undefined) {
      updates.push('wedding_date = ?');
      values.push(wedding_date);
    }
    if (do_not_disclose !== undefined) {
      updates.push('do_not_disclose = ?');
      values.push(do_not_disclose);
    }
    if (not_yet_fixed !== undefined) {
      updates.push('not_yet_fixed = ?');
      values.push(not_yet_fixed);
    }
    if (story_content !== undefined) {
      updates.push('story_content = ?');
      values.push(story_content);
    }
    if (photo_url !== undefined) {
      updates.push('photo_url = ?');
      values.push(photo_url);
    }
    if (agree_to_terms !== undefined) {
      updates.push('agree_to_terms = ?');
      values.push(agree_to_terms);
    }
    if (feature_in_stories !== undefined) {
      updates.push('feature_in_stories = ?');
      values.push(feature_in_stories);
    }
    if (status !== undefined) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Must be: pending, approved, or rejected",
        });
      }
      updates.push('status = ?');
      values.push(status);
    }
    if (is_published !== undefined) {
      updates.push('is_published = ?');
      values.push(is_published ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    // Add updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await query(
      `UPDATE success_stories SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({
      success: true,
      message: "Success story updated successfully",
    });
  } catch (error) {
    console.error("Update Success Story Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Upload Success Story Photo
export async function uploadSuccessStoryPhoto(req, res) {
  try {
    const { id } = req.params;

    // Check if success story exists
    const [existing] = await query("SELECT id FROM success_stories WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Success story not found",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No photo file provided",
      });
    }

    try {
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `success-stories/${id}/photo-${Date.now()}${fileExtension}`;

      // Upload to S3
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      };

      await s3Client.send(new PutObjectCommand(uploadParams));
      const photoUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

      // Update success story with new photo URL
      await query(
        "UPDATE success_stories SET photo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [photoUrl, id]
      );

      res.json({
        success: true,
        message: "Success story photo uploaded successfully",
        data: {
          photo_url: photoUrl,
          story_id: id
        }
      });

    } catch (uploadError) {
      console.error('Success story photo upload error:', uploadError);
      res.status(500).json({
        success: false,
        message: 'Failed to upload photo'
      });
    }
  } catch (error) {
    console.error('Upload Success Story Photo Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Delete Success Story Photo
export async function deleteSuccessStoryPhoto(req, res) {
  try {
    const { id } = req.params;

    // Check if success story exists
    const [existing] = await query("SELECT photo_url FROM success_stories WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Success story not found",
      });
    }

    // Delete from S3 if photo exists
    if (existing.photo_url) {
      try {
        const key = existing.photo_url.split('.amazonaws.com/')[1];
        await s3Client.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key
        }));
      } catch (s3Error) {
        console.error('S3 delete error:', s3Error);
        // Continue with database update even if S3 delete fails
      }
    }

    // Remove photo URL from database
    await query(
      "UPDATE success_stories SET photo_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id]
    );

    res.json({
      success: true,
      message: "Success story photo deleted successfully",
      data: {
        story_id: id
      }
    });

  } catch (error) {
    console.error('Delete Success Story Photo Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Update Success Story with Photo Upload
export async function updateSuccessStoryWithPhoto(req, res) {
  try {
    const { id } = req.params;
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
      feature_in_stories,
      status,
      is_published
    } = req.body;

    const [existing] = await query("SELECT id, photo_url FROM success_stories WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Success story not found",
      });
    }

    let photoUrl = existing.photo_url; // Keep existing photo URL by default

    // Handle photo upload if file is provided
    if (req.file) {
      try {
        const fileExtension = path.extname(req.file.originalname);
        const fileName = `success-stories/${id}/photo-${Date.now()}${fileExtension}`;

        // Upload new photo to S3
        const uploadParams = {
          Bucket: BUCKET_NAME,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        };

        await s3Client.send(new PutObjectCommand(uploadParams));
        photoUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

        // Delete old photo from S3 if it exists
        if (existing.photo_url) {
          try {
            const oldKey = existing.photo_url.split('.amazonaws.com/')[1];
            await s3Client.send(new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: oldKey
            }));
          } catch (s3Error) {
            console.error('Old photo delete error:', s3Error);
            // Continue even if old photo deletion fails
          }
        }
      } catch (uploadError) {
        console.error('Photo upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload photo'
        });
      }
    }

    // Build dynamic update query
    const updates = [];
    const values = [];

    if (user_name !== undefined) {
      updates.push('user_name = ?');
      values.push(user_name);
    }
    if (partner_name !== undefined) {
      updates.push('partner_name = ?');
      values.push(partner_name);
    }
    if (user_email !== undefined) {
      updates.push('user_email = ?');
      values.push(user_email);
    }
    if (partner_email !== undefined) {
      updates.push('partner_email = ?');
      values.push(partner_email);
    }
    if (first_met_date !== undefined) {
      updates.push('first_met_date = ?');
      values.push(first_met_date);
    }
    if (wedding_date !== undefined) {
      updates.push('wedding_date = ?');
      values.push(wedding_date);
    }
    if (do_not_disclose !== undefined) {
      updates.push('do_not_disclose = ?');
      values.push(do_not_disclose === 'true' || do_not_disclose === true);
    }
    if (not_yet_fixed !== undefined) {
      updates.push('not_yet_fixed = ?');
      values.push(not_yet_fixed === 'true' || not_yet_fixed === true);
    }
    if (story_content !== undefined) {
      updates.push('story_content = ?');
      values.push(story_content);
    }
    if (agree_to_terms !== undefined) {
      updates.push('agree_to_terms = ?');
      values.push(agree_to_terms === 'true' || agree_to_terms === true);
    }
    if (feature_in_stories !== undefined) {
      updates.push('feature_in_stories = ?');
      values.push(feature_in_stories === 'true' || feature_in_stories === true);
    }
    if (status !== undefined) {
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Must be: pending, approved, or rejected",
        });
      }
      updates.push('status = ?');
      values.push(status);
    }
    if (is_published !== undefined) {
      updates.push('is_published = ?');
      values.push(is_published === 'true' || is_published === true ? 1 : 0);
    }

    // Always update photo URL (either new or existing)
    updates.push('photo_url = ?');
    values.push(photoUrl);

    // Add updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await query(
      `UPDATE success_stories SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({
      success: true,
      message: "Success story updated successfully",
      data: {
        photo_url: photoUrl,
        story_id: id,
        photo_uploaded: !!req.file
      }
    });
  } catch (error) {
    console.error("Update Success Story with Photo Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
// Update User Profile (Admin)
export async function updateUserProfile(req, res) {
  try {
    const { id } = req.params;
    const {
      height, weight, marital_status_id, about_myself, blood_group_id,
      diet_id, health_info_id, disability_id, smoking_id, drinking_id,
      occupation, company_name, annual_income
    } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update user profile
    await query(
      `UPDATE user_profiles SET
       height = COALESCE(?, height),
       weight = COALESCE(?, weight),
       marital_status_id = COALESCE(?, marital_status_id),
       about_myself = COALESCE(?, about_myself),
       blood_group_id = COALESCE(?, blood_group_id),
       diet_id = COALESCE(?, diet_id),
       health_info_id = COALESCE(?, health_info_id),
       disability_id = COALESCE(?, disability_id),
       smoking_id = COALESCE(?, smoking_id),
       drinking_id = COALESCE(?, drinking_id)
       WHERE user_id = ?`,
      [height, weight, marital_status_id, about_myself, blood_group_id,
       diet_id, health_info_id, disability_id, smoking_id, drinking_id, id]
    );

    // Update career details if provided
    if (occupation || company_name || annual_income) {
      const [existingCareer] = await query(
        "SELECT id FROM career_details WHERE user_id = ?",
        [id]
      );

      if (existingCareer) {
        await query(
          "UPDATE career_details SET occupation = COALESCE(?, occupation), company_name = COALESCE(?, company_name), annual_income = COALESCE(?, annual_income) WHERE user_id = ?",
          [occupation, company_name, annual_income, id]
        );
      } else {
        await query(
          "INSERT INTO career_details (user_id, occupation, company_name, annual_income, currency_id) VALUES (?, ?, ?, ?, 1)",
          [id, occupation, company_name, annual_income]
        );
      }
    }

    res.json({
      success: true,
      message: "User profile updated successfully",
    });
  } catch (error) {
    console.error("Update User Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User Religious Information (Admin)
export async function updateUserReligiousInfo(req, res) {
  try {
    const { id } = req.params;
    const { religion_id, mother_tongue_id, community_id, caste_id, gothra_id } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!religion_id) {
      return res.status(400).json({
        success: false,
        message: "Religion ID is required",
      });
    }

    // Update user profile with religious information
    await query(
      `UPDATE user_profiles SET religion_id = ?, mother_tongue_id = ?, caste_id = ?
       WHERE user_id = ?`,
      [religion_id, mother_tongue_id || null, caste_id || null, id]
    );

    // Update or create astro details for gothra
    if (gothra_id) {
      const [existingAstro] = await query(
        "SELECT id FROM astro_details WHERE user_id = ?",
        [id]
      );

      if (existingAstro) {
        await query(
          "UPDATE astro_details SET gothra_id = ? WHERE user_id = ?",
          [gothra_id, id]
        );
      } else {
        await query(
          "INSERT INTO astro_details (user_id, gothra_id) VALUES (?, ?)",
          [id, gothra_id]
        );
      }
    }

    res.json({
      success: true,
      message: "User religious information updated successfully",
    });
  } catch (error) {
    console.error("Update User Religious Info Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User Government ID Verification (Admin)
export async function updateUserGovernmentId(req, res) {
  try {
    const { id } = req.params;
    const { id_type_id, id_number } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!id_type_id || !id_number) {
      return res.status(400).json({
        success: false,
        message: "ID type and ID number are required",
      });
    }

    // Check if record exists
    const [existingGovId] = await query(
      "SELECT id FROM user_government_id_verification WHERE user_id = ?",
      [id]
    );

    if (existingGovId) {
      // Update existing record
      await query(
        "UPDATE user_government_id_verification SET id_type_id = ?, id_number = ?, is_verified = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
        [id_type_id, id_number, id]
      );
    } else {
      // Create new record
      await query(
        "INSERT INTO user_government_id_verification (user_id, id_type_id, id_number, is_verified) VALUES (?, ?, ?, FALSE)",
        [id, id_type_id, id_number]
      );
    }

    res.json({
      success: true,
      message: "User government ID updated successfully",
    });
  } catch (error) {
    console.error("Update User Government ID Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User Basic Details (Admin)
export async function updateUserBasic(req, res) {
  try {
    const { id } = req.params;
    const { first_name, middle_name, last_name, date_of_birth, height, weight, marital_status_id, has_children, number_of_children,
            lives_with_family, blood_group_id, profile_managed_by_id, diet_id, health_info_id,
            disability_id, smoking_id, drinking_id } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const updates = [];
    const values = [];

    if (first_name) {
      updates.push('first_name = ?');
      values.push(first_name);
    }
    if (middle_name !== undefined) {
      updates.push('middle_name = ?');
      values.push(middle_name || null);
    }
    if (last_name) {
      updates.push('last_name = ?');
      values.push(last_name);
    }
    if (date_of_birth) {
      updates.push('date_of_birth = ?');
      values.push(date_of_birth);
      const age = new Date().getFullYear() - new Date(date_of_birth).getFullYear();
      updates.push('age = ?');
      values.push(age);
    }
    if (height) {
      updates.push('height = ?');
      values.push(height);
    }
    if (weight) {
      updates.push('weight = ?');
      values.push(weight);
    }
    if (marital_status_id) {
      updates.push('marital_status_id = ?');
      values.push(marital_status_id);
    }
    if (has_children) {
      updates.push('has_children = ?');
      values.push(has_children);
    }
    if (number_of_children) {
      updates.push('number_of_children = ?');
      values.push(number_of_children);
    }
    if (lives_with_family !== undefined) {
      updates.push('lives_with_family = ?');
      values.push(lives_with_family);
    }
    if (blood_group_id) {
      updates.push('blood_group_id = ?');
      values.push(blood_group_id);
    }
    if (profile_managed_by_id) {
      updates.push('profile_managed_by_id = ?');
      values.push(profile_managed_by_id);
    }
    if (diet_id) {
      updates.push('diet_id = ?');
      values.push(Array.isArray(diet_id) ? diet_id[0] : diet_id);
    }
    if (health_info_id) {
      updates.push('health_info_id = ?');
      values.push(health_info_id);
    }
    if (disability_id) {
      updates.push('disability_id = ?');
      values.push(disability_id);
    }
    if (smoking_id) {
      updates.push('smoking_id = ?');
      values.push(smoking_id);
    }
    if (drinking_id) {
      updates.push('drinking_id = ?');
      values.push(drinking_id);
    }

    if (updates.length > 0) {
      values.push(id);
      await query(
        `UPDATE user_profiles SET ${updates.join(', ')} WHERE user_id = ?`,
        values
      );
    }

    res.json({ success: true, message: "User basic details updated successfully" });
  } catch (error) {
    console.error("Update User Basic Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User About Section (Admin)
export async function updateUserAbout(req, res) {
  try {
    const { id } = req.params;
    const { about_myself, disability_id, blood_group_id, diet_id, health_info_id } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Convert diet_id to integer if it's an array
    const dietIdValue = Array.isArray(diet_id) ? diet_id[0] : diet_id;

    await query(
      `UPDATE user_profiles SET about_myself = ?, disability_id = ?, blood_group_id = ?,
       diet_id = ?, health_info_id = ? WHERE user_id = ?`,
      [about_myself, disability_id, blood_group_id, dietIdValue, health_info_id, id]
    );

    res.json({ success: true, message: "User about section updated successfully" });
  } catch (error) {
    console.error("Update User About Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User Astro Details (Admin)
export async function updateUserAstro(req, res) {
  try {
    const { id } = req.params;
    const { country_of_birth_id, state_of_birth, city_of_birth, birth_time,
            birth_time_type, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate birth_time_type - convert to acceptable values
    let validBirthTimeType = null;
    if (birth_time_type) {
      const timeType = birth_time_type.toLowerCase();
      if (timeType === 'am' || timeType === 'pm' || timeType === 'morning' || timeType === 'evening') {
        validBirthTimeType = 'approximate';
      } else if (timeType === 'exact') {
        validBirthTimeType = 'exact';
      } else {
        validBirthTimeType = 'approximate'; // Default to approximate
      }
    }

    const [existingAstro] = await query(`SELECT id FROM astro_details WHERE user_id = ?`, [id]);

    if (existingAstro) {
      await query(
        `UPDATE astro_details SET country_of_birth_id = ?, state_of_birth = ?, city_of_birth = ?,
         birth_time = ?, birth_time_type = ?, manglik_status = ?, dosham = ?, gothra_id = ?,
         rasi_id = ?, nakshatra_id = ? WHERE user_id = ?`,
        [country_of_birth_id, state_of_birth, city_of_birth, birth_time,
         validBirthTimeType, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id, id]
      );
    } else {
      await query(
        `INSERT INTO astro_details (user_id, country_of_birth_id, state_of_birth, city_of_birth,
         birth_time, birth_time_type, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, country_of_birth_id, state_of_birth, city_of_birth, birth_time,
         validBirthTimeType, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id]
      );
    }

    res.json({ success: true, message: "User astro details updated successfully" });
  } catch (error) {
    console.error("Update User Astro Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User Family Details (Admin)
export async function updateUserFamily(req, res) {
  try {
    const { id } = req.params;
    const { father_name, father_occupation_id, mother_name, mother_occupation_id,
            no_of_sisters, no_of_brothers, family_country_id, family_state,
            family_financial_status_id, family_type_id, family_values_id } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const [existingFamily] = await query(`SELECT id FROM family_details WHERE user_id = ?`, [id]);

    if (existingFamily) {
      await query(
        `UPDATE family_details SET father_name = ?, father_occupation_id = ?, mother_name = ?,
         mother_occupation_id = ?, no_of_sisters = ?, no_of_brothers = ?, family_country_id = ?,
         family_state = ?, family_financial_status_id = ?, family_type_id = ?, family_values_id = ?
         WHERE user_id = ?`,
        [father_name, father_occupation_id, mother_name, mother_occupation_id, no_of_sisters,
         no_of_brothers, family_country_id, family_state, family_financial_status_id,
         family_type_id, family_values_id, id]
      );
    } else {
      await query(
        `INSERT INTO family_details (user_id, father_name, father_occupation_id, mother_name,
         mother_occupation_id, no_of_sisters, no_of_brothers, family_country_id, family_state,
         family_financial_status_id, family_type_id, family_values_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, father_name, father_occupation_id, mother_name, mother_occupation_id, no_of_sisters,
         no_of_brothers, family_country_id, family_state, family_financial_status_id,
         family_type_id, family_values_id]
      );
    }

    res.json({ success: true, message: "User family details updated successfully" });
  } catch (error) {
    console.error("Update User Family Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User Career Details (Admin)
export async function updateUserCareer(req, res) {
  try {
    const { id } = req.params;
    const { highest_qualification, college_attended, college_attended_2, working_with_id,
            working_as, employer_name, annual_income, income_type, keep_income_private } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const [existingCareer] = await query(`SELECT id FROM career_details WHERE user_id = ?`, [id]);

    if (existingCareer) {
      await query(
        `UPDATE career_details SET highest_qualification = ?, college_attended = ?,
         working_with_id = ?, working_as = ?, employer_name = ?, annual_income = ?, income_type = ?,
         keep_income_private = ? WHERE user_id = ?`,
        [highest_qualification, college_attended, working_with_id, working_as, employer_name,
         annual_income, income_type, keep_income_private, id]
      );
    } else {
      await query(
        `INSERT INTO career_details (user_id, highest_qualification, college_attended,
         working_with_id, working_as, employer_name, annual_income, income_type, keep_income_private, currency_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, highest_qualification, college_attended, working_with_id, working_as,
         employer_name, annual_income, income_type, keep_income_private]
      );
    }

    // Update education_details with college information
    if (college_attended || college_attended_2) {
      const [eduExists] = await query(`SELECT id FROM education_details WHERE user_id = ?`, [id]);

      if (eduExists) {
        await query(
          `UPDATE education_details SET institution_name = ?, institution_name_2 = ? WHERE user_id = ?`,
          [college_attended, college_attended_2, id]
        );
      } else {
        await query(
          `INSERT INTO education_details (user_id, institution_name, institution_name_2, education_level_id) VALUES (?, ?, ?, 1)`,
          [id, college_attended, college_attended_2]
        );
      }
    }

    res.json({ success: true, message: "User career details updated successfully" });
  } catch (error) {
    console.error("Update User Career Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User Location Details (Admin)
export async function updateUserLocation(req, res) {
  try {
    const { id } = req.params;
    const { current_residence, residency_status, state_living_in, state_id, city_id, country_id, zip_code, latitude, longitude, grew_up_in, ethnic_origin_id } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const [existingLocation] = await query(`SELECT id FROM location_details WHERE user_id = ?`, [id]);

    if (existingLocation) {
      await query(
        `UPDATE location_details SET current_residence = ?, residency_status = ?,
         state_living_in = ?, state_id = ?, city_id = ?, country_id = ?, zip_code = ?, latitude = ?, longitude = ? WHERE user_id = ?`,
        [current_residence, residency_status, state_living_in, state_id, city_id, country_id, zip_code, latitude, longitude, id]
      );
    } else {
      await query(
        `INSERT INTO location_details (user_id, current_residence, residency_status,
         state_living_in, state_id, city_id, country_id, zip_code, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, current_residence, residency_status, state_living_in, state_id, city_id, country_id, zip_code, latitude, longitude]
      );
    }

    // Update grew_up_in and ethnic_origin_id in career_details
    if (grew_up_in !== undefined || ethnic_origin_id !== undefined) {
      const [careerExists] = await query(`SELECT id FROM career_details WHERE user_id = ?`, [id]);

      if (careerExists) {
        const updates = [];
        const values = [];

        if (grew_up_in !== undefined) {
          updates.push('grew_up_in_ids = ?');
          values.push(JSON.stringify(grew_up_in));
        }
        if (ethnic_origin_id !== undefined) {
          updates.push('ethnic_origin_id = ?');
          values.push(ethnic_origin_id);
        }

        if (updates.length > 0) {
          values.push(id);
          await query(
            `UPDATE career_details SET ${updates.join(', ')} WHERE user_id = ?`,
            values
          );
        }
      } else {
        await query(
          `INSERT INTO career_details (user_id, grew_up_in_ids, ethnic_origin_id, currency_id) VALUES (?, ?, ?, 1)`,
          [id, JSON.stringify(grew_up_in || []), ethnic_origin_id || null]
        );
      }
    }

    res.json({ success: true, message: "User location details updated successfully" });
  } catch (error) {
    console.error("Update User Location Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Complete User Profile in Single API (Admin)
export async function updateCompleteUserProfile(req, res) {
  try {
    const { id } = req.params;
    const {
      // Basic user info
      email, phone, country_code_id, status,
      // Profile details
      profile_for, first_name, middle_name, last_name, gender_id, date_of_birth, height, weight,
      marital_status_id, religion_id, caste_id, community_id, mother_tongue_id,
      blood_group_id, diet_id, health_info_id, disability_id, smoking_id, drinking_id,
      profile_managed_by_id, about_myself, has_children, number_of_children, lives_with_family, family_location,
      country_of_birth_id, state_of_birth, city_of_birth, birth_time, birth_time_type,
      manglik_status, dosham, gothra_id, rasi_id, nakshatra_id,
      // Family details
      father_name, father_occupation_id, mother_name, mother_occupation_id,
      no_of_sisters, no_of_brothers, family_country_id, family_state,
      family_financial_status_id, family_type_id, family_values_id,
      // Career details
      highest_qualification, college_attended, working_with_id, working_as,
      employer_name, annual_income, income_type, keep_income_private, profession_id,
      // Location details
      current_residence, residency_status, state_living_in, state_id,
      city_id, country_id, zip_code, latitude, longitude, grew_up_in, ethnic_origin_id,
      // Education details
      education_level_id, education_area_id, field_of_study, graduation_year, graduation_year_2,
      institution_name, institution_name_2, college_attended_2,
      // Government ID
      id_type_id, id_number,
      // Hobbies
      hobby_ids
    } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update users table
    const userUpdates = [];
    const userValues = [];

    if (email) {
      // Check if email is already taken by another user
      const [emailExists] = await query("SELECT id FROM users WHERE email = ? AND id != ?", [email, id]);
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already exists for another user",
        });
      }
      userUpdates.push('email = ?');
      userValues.push(email);
    }
    if (phone) {
      // Check if phone is already taken by another user
      const [phoneExists] = await query("SELECT id FROM users WHERE phone = ? AND id != ?", [phone, id]);
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists for another user",
        });
      }
      userUpdates.push('phone = ?');
      userValues.push(phone);
    }
    if (country_code_id) {
      userUpdates.push('country_code_id = ?');
      userValues.push(country_code_id);
    }
    if (status !== undefined) {
      userUpdates.push('status = ?');
      userValues.push(status);
    }

    if (userUpdates.length > 0) {
      userValues.push(id);
      await query(
        `UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`,
        userValues
      );
    }

    // Update user_profiles table
    const profileUpdates = [];
    const profileValues = [];

    if (first_name) {
      profileUpdates.push('first_name = ?');
      profileValues.push(first_name);
    }
    if (middle_name !== undefined) {
      profileUpdates.push('middle_name = ?');
      profileValues.push(middle_name || null);
    }
    if (last_name) {
      profileUpdates.push('last_name = ?');
      profileValues.push(last_name);
    }
    if (gender_id) {
      profileUpdates.push('gender_id = ?');
      profileValues.push(gender_id);
    }
    if (date_of_birth) {
      profileUpdates.push('date_of_birth = ?');
      profileValues.push(date_of_birth);
      const age = new Date().getFullYear() - new Date(date_of_birth).getFullYear();
      profileUpdates.push('age = ?');
      profileValues.push(age);
    }
    if (height) {
      profileUpdates.push('height = ?');
      profileValues.push(height);
    }
    if (weight) {
      profileUpdates.push('weight = ?');
      profileValues.push(weight);
    }
    if (marital_status_id) {
      profileUpdates.push('marital_status_id = ?');
      profileValues.push(marital_status_id);
    }
    if (religion_id) {
      profileUpdates.push('religion_id = ?');
      profileValues.push(religion_id);
    }
    if (caste_id) {
      profileUpdates.push('caste_id = ?');
      profileValues.push(caste_id);
    }
    if (community_id) {
      profileUpdates.push('community_id = ?');
      profileValues.push(community_id);
    }
    if (mother_tongue_id) {
      profileUpdates.push('mother_tongue_id = ?');
      profileValues.push(mother_tongue_id);
    }
    if (blood_group_id) {
      profileUpdates.push('blood_group_id = ?');
      profileValues.push(blood_group_id);
    }
    if (diet_id) {
      profileUpdates.push('diet_id = ?');
      profileValues.push(Array.isArray(diet_id) ? diet_id[0] : diet_id);
    }
    if (health_info_id) {
      profileUpdates.push('health_info_id = ?');
      profileValues.push(health_info_id);
    }
    if (disability_id) {
      profileUpdates.push('disability_id = ?');
      profileValues.push(disability_id);
    }
    if (smoking_id) {
      profileUpdates.push('smoking_id = ?');
      profileValues.push(smoking_id);
    }
    if (drinking_id) {
      profileUpdates.push('drinking_id = ?');
      profileValues.push(drinking_id);
    }
    if (profile_managed_by_id) {
      profileUpdates.push('profile_managed_by_id = ?');
      profileValues.push(profile_managed_by_id);
    }
    if (about_myself !== undefined) {
      profileUpdates.push('about_myself = ?');
      profileValues.push(about_myself);
    }
    if (has_children !== undefined) {
      profileUpdates.push('has_children = ?');
      // Convert to ENUM values: 'no', 'yes_living_together', 'yes_not_living_together'
      let hasChildrenValue;
      if (has_children == 1 || has_children === 'yes' || has_children === true || has_children === 'yes_living_together') {
        hasChildrenValue = 'yes_living_together'; // Default to living together
      } else if (has_children === 'yes_not_living_together') {
        hasChildrenValue = 'yes_not_living_together';
      } else {
        hasChildrenValue = 'no';
      }
      profileValues.push(hasChildrenValue);

      // Handle number_of_children based on has_children value
      if (hasChildrenValue !== 'no' && number_of_children !== undefined) {
        profileUpdates.push('number_of_children = ?');
        // Handle ENUM values: '1', '2', '3', 'more_than_3'
        const numChildren = parseInt(number_of_children) || 1;
        let childrenCount;
        if (numChildren === 1) {
          childrenCount = '1';
        } else if (numChildren === 2) {
          childrenCount = '2';
        } else if (numChildren === 3) {
          childrenCount = '3';
        } else if (numChildren > 3) {
          childrenCount = 'more_than_3';
        } else {
          childrenCount = '1'; // Default to '1'
        }
        profileValues.push(childrenCount);
      } else if (hasChildrenValue === 'no') {
        // If has_children is 'no', set number_of_children to null
        profileUpdates.push('number_of_children = ?');
        profileValues.push(null);
      }
    } else if (number_of_children !== undefined) {
      // If only number_of_children is provided without has_children
      profileUpdates.push('number_of_children = ?');
      // Handle ENUM values: '1', '2', '3', 'more_than_3'
      const numChildren = parseInt(number_of_children) || 1;
      let childrenCount;
      if (numChildren === 1) {
        childrenCount = '1';
      } else if (numChildren === 2) {
        childrenCount = '2';
      } else if (numChildren === 3) {
        childrenCount = '3';
      } else if (numChildren > 3) {
        childrenCount = 'more_than_3';
      } else {
        childrenCount = '1'; // Default to '1'
      }
      profileValues.push(childrenCount);
    }
    if (lives_with_family !== undefined) {
      profileUpdates.push('lives_with_family = ?');
      profileValues.push(lives_with_family);
    }
    if (family_location !== undefined) {
      profileUpdates.push('family_location = ?');
      profileValues.push(family_location);
    }
    if (profile_for !== undefined) {
      profileUpdates.push('profile_created_by = ?');
      profileValues.push(profile_for);
    }

    if (profileUpdates.length > 0) {
      profileValues.push(id);
      await query(
        `UPDATE user_profiles SET ${profileUpdates.join(', ')} WHERE user_id = ?`,
        profileValues
      );
    }

    // Update astro_details table
    if (country_of_birth_id || state_of_birth || city_of_birth || birth_time || birth_time_type ||
        manglik_status !== undefined || dosham !== undefined || gothra_id || rasi_id || nakshatra_id) {

      // Validate birth_time_type
      let validBirthTimeType = null;
      if (birth_time_type) {
        const timeType = birth_time_type.toLowerCase();
        if (timeType === 'am' || timeType === 'pm' || timeType === 'morning' || timeType === 'evening') {
          validBirthTimeType = 'approximate';
        } else if (timeType === 'exact') {
          validBirthTimeType = 'exact';
        } else {
          validBirthTimeType = 'approximate';
        }
      }

      const [existingAstro] = await query(`SELECT id FROM astro_details WHERE user_id = ?`, [id]);

      if (existingAstro) {
        const astroUpdates = [];
        const astroValues = [];

        if (country_of_birth_id) { astroUpdates.push('country_of_birth_id = ?'); astroValues.push(country_of_birth_id); }
        if (state_of_birth) { astroUpdates.push('state_of_birth = ?'); astroValues.push(state_of_birth); }
        if (city_of_birth) { astroUpdates.push('city_of_birth = ?'); astroValues.push(city_of_birth); }
        if (birth_time) { astroUpdates.push('birth_time = ?'); astroValues.push(birth_time); }
        if (validBirthTimeType) { astroUpdates.push('birth_time_type = ?'); astroValues.push(validBirthTimeType); }
        if (manglik_status !== undefined) { astroUpdates.push('manglik_status = ?'); astroValues.push(manglik_status); }
        if (dosham !== undefined) { astroUpdates.push('dosham = ?'); astroValues.push(dosham); }
        if (gothra_id) { astroUpdates.push('gothra_id = ?'); astroValues.push(gothra_id); }
        if (rasi_id) { astroUpdates.push('rasi_id = ?'); astroValues.push(rasi_id); }
        if (nakshatra_id) { astroUpdates.push('nakshatra_id = ?'); astroValues.push(nakshatra_id); }

        if (astroUpdates.length > 0) {
          astroValues.push(id);
          await query(
            `UPDATE astro_details SET ${astroUpdates.join(', ')} WHERE user_id = ?`,
            astroValues
          );
        }
      } else {
        await query(
          `INSERT INTO astro_details (user_id, country_of_birth_id, state_of_birth, city_of_birth,
           birth_time, birth_time_type, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, country_of_birth_id, state_of_birth, city_of_birth, birth_time,
           validBirthTimeType, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id]
        );
      }
    }

    // Update family_details table
    if (father_name || father_occupation_id || mother_name || mother_occupation_id ||
        no_of_sisters !== undefined || no_of_brothers !== undefined || family_country_id ||
        family_state || family_financial_status_id || family_type_id || family_values_id) {

      const [existingFamily] = await query(`SELECT id FROM family_details WHERE user_id = ?`, [id]);

      if (existingFamily) {
        const familyUpdates = [];
        const familyValues = [];

        if (father_name) { familyUpdates.push('father_name = ?'); familyValues.push(father_name); }
        if (father_occupation_id) { familyUpdates.push('father_occupation_id = ?'); familyValues.push(father_occupation_id); }
        if (mother_name) { familyUpdates.push('mother_name = ?'); familyValues.push(mother_name); }
        if (mother_occupation_id) { familyUpdates.push('mother_occupation_id = ?'); familyValues.push(mother_occupation_id); }
        if (no_of_sisters !== undefined) { familyUpdates.push('no_of_sisters = ?'); familyValues.push(no_of_sisters); }
        if (no_of_brothers !== undefined) { familyUpdates.push('no_of_brothers = ?'); familyValues.push(no_of_brothers); }
        if (family_country_id) { familyUpdates.push('family_country_id = ?'); familyValues.push(family_country_id); }
        if (family_state) { familyUpdates.push('family_state = ?'); familyValues.push(family_state); }
        if (family_financial_status_id) { familyUpdates.push('family_financial_status_id = ?'); familyValues.push(family_financial_status_id); }
        if (family_type_id) { familyUpdates.push('family_type_id = ?'); familyValues.push(family_type_id); }
        if (family_values_id) { familyUpdates.push('family_values_id = ?'); familyValues.push(family_values_id); }

        if (familyUpdates.length > 0) {
          familyValues.push(id);
          await query(
            `UPDATE family_details SET ${familyUpdates.join(', ')} WHERE user_id = ?`,
            familyValues
          );
        }
      } else {
        await query(
          `INSERT INTO family_details (user_id, father_name, father_occupation_id, mother_name,
           mother_occupation_id, no_of_sisters, no_of_brothers, family_country_id, family_state,
           family_financial_status_id, family_type_id, family_values_id, family_status_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [id, father_name, father_occupation_id, mother_name, mother_occupation_id, no_of_sisters,
           no_of_brothers, family_country_id, family_state, family_financial_status_id,
           family_type_id, family_values_id]
        );
      }
    }

    // Update career_details table
    if (highest_qualification || college_attended || college_attended_2 || working_with_id ||
        working_as || employer_name || annual_income !== undefined || income_type ||
        keep_income_private !== undefined || profession_id || grew_up_in || ethnic_origin_id) {

      const [existingCareer] = await query(`SELECT id FROM career_details WHERE user_id = ?`, [id]);

      if (existingCareer) {
        const careerUpdates = [];
        const careerValues = [];

        if (highest_qualification) { careerUpdates.push('highest_qualification = ?'); careerValues.push(highest_qualification); }
        if (college_attended) { careerUpdates.push('college_attended = ?'); careerValues.push(college_attended); }
        if (working_with_id) { careerUpdates.push('working_with_id = ?'); careerValues.push(working_with_id); }
        if (working_as) { careerUpdates.push('working_as = ?'); careerValues.push(working_as); }
        if (employer_name) { careerUpdates.push('employer_name = ?'); careerValues.push(employer_name); }
        if (annual_income !== undefined) { careerUpdates.push('annual_income = ?'); careerValues.push(annual_income); }
        if (income_type) { careerUpdates.push('income_type = ?'); careerValues.push(income_type); }
        if (keep_income_private !== undefined) { careerUpdates.push('keep_income_private = ?'); careerValues.push(keep_income_private); }
        if (profession_id) { careerUpdates.push('profession_id = ?'); careerValues.push(profession_id); }
        if (grew_up_in) { careerUpdates.push('grew_up_in_ids = ?'); careerValues.push(JSON.stringify(grew_up_in)); }
        if (ethnic_origin_id) { careerUpdates.push('ethnic_origin_id = ?'); careerValues.push(ethnic_origin_id); }

        if (careerUpdates.length > 0) {
          careerValues.push(id);
          await query(
            `UPDATE career_details SET ${careerUpdates.join(', ')} WHERE user_id = ?`,
            careerValues
          );
        }
      } else {
        await query(
          `INSERT INTO career_details (user_id, highest_qualification, college_attended, working_with_id,
           working_as, employer_name, annual_income, income_type, keep_income_private, currency_id,
           grew_up_in_ids, ethnic_origin_id, profession_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [id, highest_qualification, college_attended, working_with_id, working_as, employer_name,
           annual_income, income_type, keep_income_private, JSON.stringify(grew_up_in || []), ethnic_origin_id, profession_id || 1]
        );
      }
    }

    // Update location_details table
    if (current_residence || residency_status || state_living_in || state_id ||
        city_id || country_id || zip_code || latitude !== undefined || longitude !== undefined) {

      const [existingLocation] = await query(`SELECT id FROM location_details WHERE user_id = ?`, [id]);

      if (existingLocation) {
        const locationUpdates = [];
        const locationValues = [];

        if (current_residence) { locationUpdates.push('current_residence = ?'); locationValues.push(current_residence); }
        if (residency_status) { locationUpdates.push('residency_status = ?'); locationValues.push(residency_status); }
        if (state_living_in) { locationUpdates.push('state_living_in = ?'); locationValues.push(state_living_in); }
        if (state_id) { locationUpdates.push('state_id = ?'); locationValues.push(state_id); }
        if (city_id) { locationUpdates.push('city_id = ?'); locationValues.push(city_id); }
        if (country_id) { locationUpdates.push('country_id = ?'); locationValues.push(country_id); }
        if (zip_code) { locationUpdates.push('zip_code = ?'); locationValues.push(zip_code); }
        if (latitude !== undefined) { locationUpdates.push('latitude = ?'); locationValues.push(latitude); }
        if (longitude !== undefined) { locationUpdates.push('longitude = ?'); locationValues.push(longitude); }

        if (locationUpdates.length > 0) {
          locationValues.push(id);
          await query(
            `UPDATE location_details SET ${locationUpdates.join(', ')} WHERE user_id = ?`,
            locationValues
          );
        }
      } else {
        await query(
          `INSERT INTO location_details (user_id, current_residence, residency_status,
           state_living_in, state_id, city_id, country_id, zip_code, latitude, longitude)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, current_residence, residency_status, state_living_in, state_id, city_id,
           country_id || 1, zip_code, latitude, longitude]
        );
      }
    }

    // Update education_details table
    if (education_level_id || education_area_id || field_of_study || graduation_year || graduation_year_2 || institution_name || college_attended_2 || institution_name_2) {
      const [existingEducation] = await query(`SELECT id FROM education_details WHERE user_id = ?`, [id]);

      if (existingEducation) {
        const educationUpdates = [];
        const educationValues = [];

        if (education_level_id) { educationUpdates.push('education_level_id = ?'); educationValues.push(education_level_id); }
        if (education_area_id)  { educationUpdates.push('education_area_id = ?');  educationValues.push(education_area_id); }
        if (field_of_study)     { educationUpdates.push('field_of_study = ?');     educationValues.push(field_of_study); }
        if (graduation_year)    { educationUpdates.push('graduation_year = ?');    educationValues.push(graduation_year); }
        if (graduation_year_2)  { educationUpdates.push('graduation_year_2 = ?');  educationValues.push(graduation_year_2); }
        if (institution_name || college_attended) { educationUpdates.push('institution_name = ?'); educationValues.push(institution_name || college_attended); }
        const inst2 = institution_name_2 || college_attended_2;
        if (inst2) { educationUpdates.push('institution_name_2 = ?'); educationValues.push(inst2); }

        if (educationUpdates.length > 0) {
          educationValues.push(id);
          await query(
            `UPDATE education_details SET ${educationUpdates.join(', ')} WHERE user_id = ?`,
            educationValues
          );
        }
      } else {
        const inst2 = institution_name_2 || college_attended_2;
        await query(
          `INSERT INTO education_details (user_id, education_level_id, education_area_id,
           field_of_study, institution_name, institution_name_2, graduation_year, graduation_year_2)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, education_level_id || 1, education_area_id, field_of_study,
           institution_name || college_attended, inst2 || null, graduation_year, graduation_year_2 || null]
        );
      }
    }

    // Update government ID verification
    if (id_type_id || id_number) {
      const [existingGovId] = await query(
        "SELECT id FROM user_government_id_verification WHERE user_id = ?",
        [id]
      );

      if (existingGovId) {
        const govIdUpdates = [];
        const govIdValues = [];

        if (id_type_id) { govIdUpdates.push('id_type_id = ?'); govIdValues.push(id_type_id); }
        if (id_number) { govIdUpdates.push('id_number = ?'); govIdValues.push(id_number); }
        govIdUpdates.push('is_verified = FALSE, updated_at = CURRENT_TIMESTAMP');

        if (govIdUpdates.length > 0) {
          govIdValues.push(id);
          await query(
            `UPDATE user_government_id_verification SET ${govIdUpdates.join(', ')} WHERE user_id = ?`,
            govIdValues
          );
        }
      } else if (id_type_id && id_number) {
        await query(
          "INSERT INTO user_government_id_verification (user_id, id_type_id, id_number, is_verified) VALUES (?, ?, ?, FALSE)",
          [id, id_type_id, id_number]
        );
      }
    }

    // Update hobbies
    if (hobby_ids && Array.isArray(hobby_ids)) {
      // Delete existing hobbies
      await query(`DELETE FROM user_hobbies WHERE user_id = ?`, [id]);

      // Insert new hobbies
      if (hobby_ids.length > 0) {
        const hobbyValues = hobby_ids.map(hobbyId => [id, hobbyId]);
        await query(`INSERT INTO user_hobbies (user_id, hobby_id) VALUES ?`, [hobbyValues]);
      }
    }

    res.json({
      success: true,
      message: "Complete user profile updated successfully",
    });
  } catch (error) {
    console.error("Update Complete User Profile Error:", error);

    // Handle duplicate entry errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.sqlMessage && error.sqlMessage.includes('email')) {
        return res.status(400).json({
          success: false,
          message: "Email already exists for another user"
        });
      }
      if (error.sqlMessage && error.sqlMessage.includes('phone')) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists for another user"
        });
      }
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Create Complete User Profile (Admin)
export async function createCompleteUserProfile(req, res) {
  try {
    const {
      // Basic user info
      email, phone, country_code_id = 1,
      // Profile details
      profile_for, first_name, middle_name, last_name, gender_id, date_of_birth, height, weight,
      marital_status_id, religion_id, caste_id, community_id, mother_tongue_id,
      blood_group_id, diet_id, health_info_id, disability_id, smoking_id, drinking_id,
      profile_managed_by_id, about_myself, has_children, number_of_children, lives_with_family, family_location,
      // Astro details
      country_of_birth_id, state_of_birth, city_of_birth, birth_time, birth_time_type,
      manglik_status, dosham, gothra_id, rasi_id, nakshatra_id,
      // Family details
      father_name, father_occupation_id, mother_name, mother_occupation_id,
      no_of_sisters, no_of_brothers, family_country_id, family_state,
      family_financial_status_id, family_type_id, family_values_id,
      // Career details
      highest_qualification, college_attended, working_with_id, working_as,
      employer_name, annual_income, income_type, keep_income_private, work_type, occupation, company_name,
      // Location details
      current_residence, residency_status, state_living_in, state_id,
      city_id, country_id, zip_code, latitude, longitude, grew_up_in, ethnic_origin_id,
      // Education details
      education_level_id, education_area_id, field_of_study, graduation_year, graduation_year_2,
      institution_name, institution_name_2, college_name_2,
      // Government ID
      id_type_id, id_number,
      // Hobbies
      hobby_ids
    } = req.body;

    if (!email || !first_name || !last_name || !gender_id) {
      return res.status(400).json({
        success: false,
        message: "Email, first name, last name, and gender are required",
      });
    }

    // Check for duplicate entries before insertion (exclude soft-deleted users)
    const [existingEmail] = await query(
      "SELECT id FROM users WHERE email = ? AND status != 4",
      [email]
    );
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    if (phone) {
      const [existingPhone] = await query(
        "SELECT id FROM users WHERE phone = ? AND status != 4",
        [phone]
      );
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    // Generate random 8-digit password (always generated in backend)
    const userPassword = generateRandomPassword();
    console.log(`Generated password for ${email}: ${userPassword}`);

    // Hash the password
    const hashedPassword = await bcrypt.hash(userPassword, 10);

    // Generate unique Super Sathi User ID
    let vivaaha_user_id;
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 10) {
      vivaaha_user_id = `VH${Math.floor(Math.random() * 90000000) + 10000000}`;
      const [existingId] = await query("SELECT id FROM users WHERE vivaaha_user_id = ?", [vivaaha_user_id]);
      if (!existingId) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({
        success: false,
        message: "Unable to generate unique Super Sathi User ID. Please try again.",
      });
    }

    // Create user with hashed password
    const userResult = await query(
      "INSERT INTO users (email, password, phone, vivaaha_user_id, country_code_id, user_type_id, status, email_verified, phone_verified) VALUES (?, ?, ?, ?, ?, 1, 1, 1, 1)",
      [email, hashedPassword, phone, vivaaha_user_id, country_code_id]
    );

    const userId = userResult.insertId;

    // Calculate age from date_of_birth
    const age = date_of_birth ? new Date().getFullYear() - new Date(date_of_birth).getFullYear() : null;

    // Create user profile
    const hasChildrenValue = has_children !== undefined ?
      (has_children == 1 || has_children === 'yes' || has_children === true || has_children === 'yes_living_together' || has_children === 'yes_not_living_together' ?
        (has_children === 'yes_living_together' ? 'yes_living_together' :
         has_children === 'yes_not_living_together' ? 'yes_not_living_together' : 'yes_living_together') : 'no') : 'no';
    let numberOfChildrenValue = null;
    if (hasChildrenValue !== 'no' && number_of_children !== undefined) {
      // Handle ENUM values: '1', '2', '3', 'more_than_3'
      const numChildren = parseInt(number_of_children) || 1;
      if (numChildren === 1) {
        numberOfChildrenValue = '1';
      } else if (numChildren === 2) {
        numberOfChildrenValue = '2';
      } else if (numChildren === 3) {
        numberOfChildrenValue = '3';
      } else if (numChildren > 3) {
        numberOfChildrenValue = 'more_than_3';
      } else {
        numberOfChildrenValue = '1'; // Default to '1'
      }
    }

    await query(
      `INSERT INTO user_profiles (user_id, first_name, middle_name, last_name, gender_id, date_of_birth, age, height, weight,
       marital_status_id, religion_id, caste_id, community_id, mother_tongue_id, blood_group_id, diet_id, health_info_id,
       disability_id, smoking_id, drinking_id, profile_managed_by_id, about_myself, has_children, number_of_children,
       lives_with_family, family_location, profile_created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, first_name, middle_name, last_name, gender_id, date_of_birth, age, height, weight,
       marital_status_id, religion_id, caste_id, community_id, mother_tongue_id, blood_group_id,
       diet_id, health_info_id, disability_id, smoking_id, drinking_id, profile_managed_by_id, about_myself,
       hasChildrenValue, numberOfChildrenValue, lives_with_family !== undefined ? lives_with_family : 1, family_location, profile_for || 'self']
    );

    // Validate birth_time_type - convert to acceptable values
    let validBirthTimeType = null;
    if (birth_time_type) {
      const timeType = birth_time_type.toLowerCase();
      if (timeType === 'am' || timeType === 'pm' || timeType === 'morning' || timeType === 'evening') {
        validBirthTimeType = 'approximate';
      } else if (timeType === 'exact') {
        validBirthTimeType = 'exact';
      } else {
        validBirthTimeType = 'approximate'; // Default to approximate
      }
    }

    // Create astro details if provided
    if (country_of_birth_id || state_of_birth || city_of_birth) {
      await query(
        `INSERT INTO astro_details (user_id, country_of_birth_id, state_of_birth, city_of_birth,
         birth_time, birth_time_type, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, country_of_birth_id, state_of_birth, city_of_birth, birth_time,
         validBirthTimeType, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id]
      );
    }

    // Create family details if provided
    if (father_name || mother_name) {
      await query(
        `INSERT INTO family_details (user_id, father_name, father_occupation_id, mother_name,
         mother_occupation_id, no_of_sisters, no_of_brothers, family_country_id, family_state,
         family_financial_status_id, family_type_id, family_values_id, family_status_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [userId, father_name, father_occupation_id, mother_name, mother_occupation_id, no_of_sisters,
         no_of_brothers, family_country_id, family_state, family_financial_status_id,
         family_type_id, family_values_id]
      );
    }

    // Check if we need to add missing columns to career_details table
    // The following fields might need to be added if they don't exist:
    // - work_type, occupation, company_name (these might be duplicates of existing fields)

    // Create career details if provided
    if (highest_qualification || working_with_id || employer_name || work_type || occupation || company_name) {
      await query(
        `INSERT INTO career_details (user_id, highest_qualification, college_attended, working_with_id,
         working_as, employer_name, annual_income, income_type, keep_income_private, currency_id,
         grew_up_in_ids, ethnic_origin_id, profession_id, occupation, company_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1, ?, ?)`,
        [userId, highest_qualification, college_attended, working_with_id, working_as || occupation,
         employer_name || company_name, annual_income, income_type, keep_income_private,
         JSON.stringify(grew_up_in || []), ethnic_origin_id, occupation || working_as,
         company_name || employer_name]
      );
    }

    // Create location details if provided
    if (current_residence || city_id || country_id) {
      await query(
        `INSERT INTO location_details (user_id, current_residence, residency_status,
         state_living_in, state_id, city_id, country_id, zip_code, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, current_residence, residency_status, state_living_in, state_id, city_id,
         country_id || 1, zip_code, latitude, longitude]
      );
    }

    // Create address details if city provided (similar to user signup)
    if (current_residence || city_id) {
      await query(
        "INSERT INTO address_details (user_id, address_type, city, city_id, country_id) VALUES (?, 'current', ?, ?, ?)",
        [userId, current_residence, city_id, country_id || 1]
      );
    }

    // Create education details if provided
    if (education_level_id || field_of_study || college_attended || institution_name || college_name_2 || institution_name_2) {
      const inst1 = institution_name || college_attended || highest_qualification;
      const inst2 = institution_name_2 || college_name_2 || null;
      await query(
        `INSERT INTO education_details (user_id, education_level_id, education_area_id,
         field_of_study, institution_name, institution_name_2, graduation_year, graduation_year_2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, education_level_id || 1, education_area_id, field_of_study,
         inst1, inst2, graduation_year, graduation_year_2 || null]
      );
    }

    // Add hobbies if provided
    if (hobby_ids && hobby_ids.length > 0) {
      const hobbyValues = hobby_ids.map(hobbyId => [userId, hobbyId]);
      await query(`INSERT INTO user_hobbies (user_id, hobby_id) VALUES ?`, [hobbyValues]);
    }

    // Create government ID verification if provided
    if (id_type_id && id_number) {
      await query(
        "INSERT INTO user_government_id_verification (user_id, id_type_id, id_number, is_verified) VALUES (?, ?, ?, FALSE)",
        [userId, id_type_id, id_number]
      );
    }

    // Send welcome email with password
    try {
      console.log(`Attempting to send welcome email to: ${email}`);
      await sendWelcomeEmail(email, first_name, userPassword, vivaaha_user_id);
      console.log(`✅ SUCCESS: Welcome email sent to ${email}`);
    } catch (emailError) {
      console.error(`❌ ERROR: Welcome email sending failed to ${email}:`, emailError.message || emailError);
      // Don't fail the entire operation if email fails
    }

    res.status(201).json({
      success: true,
      message: "Complete user profile created successfully. Login credentials have been sent to the user's email.",
      user_id: userId,
      vivaaha_user_id: vivaaha_user_id,
      email_sent: true,
      // Don't return the password in the response for security
    });
  } catch (error) {
    console.error("Create Complete User Profile Error:", error);

    // Handle duplicate entry errors
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.sqlMessage && error.sqlMessage.includes('email')) {
        return res.status(400).json({
          success: false,
          message: "Email already exists"
        });
      }
      if (error.sqlMessage && error.sqlMessage.includes('phone')) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists"
        });
      }
      if (error.sqlMessage && error.sqlMessage.includes('vivaaha_user_id')) {
        return res.status(400).json({
          success: false,
          message: "Super Sathi User ID already exists. Please try again."
        });
      }
      // Generic duplicate entry error
      return res.status(400).json({
        success: false,
        message: "Duplicate entry found. Please check your data."
      });
    }

    // Handle database connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ER_ACCESS_DENIED_ERROR') {
      return res.status(500).json({
        success: false,
        message: "Database connection error"
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Update User Hobbies (Admin)
export async function updateUserHobbies(req, res) {
  try {
    const { id } = req.params;
    const { hobby_ids } = req.body;

    // Check if user exists
    const [existing] = await query("SELECT id FROM users WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!Array.isArray(hobby_ids)) {
      return res.status(400).json({
        success: false,
        message: "hobby_ids must be an array",
      });
    }

    // Delete existing hobbies
    await query(`DELETE FROM user_hobbies WHERE user_id = ?`, [id]);

    // Insert new hobbies if provided
    if (hobby_ids.length > 0) {
      const hobbyValues = hobby_ids.map(hobbyId => [id, hobbyId]);
      await query(`INSERT INTO user_hobbies (user_id, hobby_id) VALUES ?`, [hobbyValues]);
    }

    res.json({
      success: true,
      message: "User hobbies updated successfully",
    });
  } catch (error) {
    console.error("Update User Hobbies Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============ ADMIN USER PHOTO MANAGEMENT ============

const MAX_PHOTOS = 20;
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];

// Admin Upload Single User Photo
export async function adminUploadUserPhoto(req, res) {
  try {
    const { id: userId } = req.params;

    // Check if user exists
    const [userExists] = await query("SELECT id FROM users WHERE id = ?", [userId]);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check current photo count
    const [photoCount] = await query(
      "SELECT COUNT(*) as count FROM user_photos WHERE user_id = ?",
      [userId]
    );

    if (photoCount.count >= MAX_PHOTOS) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_PHOTOS} photos allowed per profile`
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No photo file provided'
      });
    }

    try {
      const isPrimary = req.body.is_primary === 'true' || req.body.is_primary === true;
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `profiles/${userId}/${Date.now()}${fileExtension}`;

      // Upload to S3
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      };

      await s3Client.send(new PutObjectCommand(uploadParams));
      const photoUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

      // If setting as primary, unset other primary photos
      if (isPrimary) {
        await query(
          "UPDATE user_photos SET is_primary = FALSE WHERE user_id = ?",
          [userId]
        );
      }

      // Save to database
      const result = await query(
        "INSERT INTO user_photos (user_id, photo_url, is_primary, photo_type) VALUES (?, ?, ?, 'gallery')",
        [userId, photoUrl, isPrimary]
      );

      // Update profile picture in user_profiles if this is primary
      if (isPrimary) {
        await query(
          "UPDATE user_profiles SET profile_picture = ? WHERE user_id = ?",
          [photoUrl, userId]
        );
      }

      res.json({
        success: true,
        message: 'User photo uploaded successfully by admin',
        data: {
          id: result.insertId,
          photo_url: photoUrl,
          is_primary: isPrimary,
          user_id: userId
        }
      });

    } catch (uploadError) {
      console.error('Admin photo upload error:', uploadError);
      res.status(500).json({
        success: false,
        message: 'Failed to upload photo'
      });
    }
  } catch (error) {
    console.error('Admin Upload User Photo Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin Upload Multiple User Photos
export async function adminUploadMultipleUserPhotos(req, res) {
  try {
    const { id: userId } = req.params;

    // Check if user exists
    const [userExists] = await query("SELECT id FROM users WHERE id = ?", [userId]);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check current photo count
    const [photoCount] = await query(
      "SELECT COUNT(*) as count FROM user_photos WHERE user_id = ?",
      [userId]
    );

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No photo files provided'
      });
    }

    const totalPhotos = photoCount.count + req.files.length;
    if (totalPhotos > MAX_PHOTOS) {
      return res.status(400).json({
        success: false,
        message: `Cannot upload ${req.files.length} photos. Maximum ${MAX_PHOTOS} photos allowed per profile. User currently has ${photoCount.count} photos.`
      });
    }

    try {
      const uploadedPhotos = [];
      const { primary_photo_index = -1 } = req.body;
      const primaryIndex = parseInt(primary_photo_index);

      // If setting a primary photo, unset existing primary photos
      if (primaryIndex >= 0 && primaryIndex < req.files.length) {
        await query(
          "UPDATE user_photos SET is_primary = FALSE WHERE user_id = ?",
          [userId]
        );
      }

      // Upload all photos
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const fileExtension = path.extname(file.originalname);
        const fileName = `profiles/${userId}/${Date.now()}_${i}${fileExtension}`;
        const isPrimary = i === primaryIndex;

        // Upload to S3
        const uploadParams = {
          Bucket: BUCKET_NAME,
          Key: fileName,
          Body: file.buffer,
          ContentType: file.mimetype,
        };

        await s3Client.send(new PutObjectCommand(uploadParams));
        const photoUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

        // Save to database
        const result = await query(
          "INSERT INTO user_photos (user_id, photo_url, is_primary, photo_type) VALUES (?, ?, ?, 'gallery')",
          [userId, photoUrl, isPrimary]
        );

        // Update profile picture if this is primary
        if (isPrimary) {
          await query(
            "UPDATE user_profiles SET profile_picture = ? WHERE user_id = ?",
            [photoUrl, userId]
          );
        }

        uploadedPhotos.push({
          id: result.insertId,
          photo_url: photoUrl,
          is_primary: isPrimary,
          original_name: file.originalname
        });
      }

      res.json({
        success: true,
        message: `${req.files.length} photos uploaded successfully for user by admin`,
        data: {
          uploaded_photos: uploadedPhotos,
          total_photos: totalPhotos,
          user_id: userId
        }
      });

    } catch (uploadError) {
      console.error('Admin multiple photos upload error:', uploadError);
      res.status(500).json({
        success: false,
        message: 'Failed to upload photos'
      });
    }
  } catch (error) {
    console.error('Admin Upload Multiple User Photos Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin Get User Photos
export async function adminGetUserPhotos(req, res) {
  try {
    const { id: userId } = req.params;

    // Check if user exists
    const [userExists] = await query("SELECT id FROM users WHERE id = ?", [userId]);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const photos = await query(
      "SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC, upload_date DESC",
      [userId]
    );

    res.json({
      success: true,
      data: {
        photos,
        count: photos.length,
        max_allowed: MAX_PHOTOS,
        user_id: userId
      }
    });

  } catch (error) {
    console.error('Admin Get User Photos Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin Delete User Photo
export async function adminDeleteUserPhoto(req, res) {
  try {
    const { id: userId, photoId } = req.params;

    // Check if user exists
    const [userExists] = await query("SELECT id FROM users WHERE id = ?", [userId]);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get photo details
    const [photo] = await query(
      "SELECT * FROM user_photos WHERE id = ? AND user_id = ?",
      [photoId, userId]
    );

    if (!photo) {
      return res.status(404).json({
        success: false,
        message: 'Photo not found for this user'
      });
    }

    try {
      // Delete from S3
      const key = photo.photo_url.split('.amazonaws.com/')[1];
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
      }));
    } catch (s3Error) {
      console.error('S3 delete error:', s3Error);
    }

    // Delete from database
    await query("DELETE FROM user_photos WHERE id = ?", [photoId]);

    // If this was primary photo, clear profile picture
    if (photo.is_primary) {
      await query(
        "UPDATE user_profiles SET profile_picture = NULL WHERE user_id = ?",
        [userId]
      );
    }

    res.json({
      success: true,
      message: 'User photo deleted successfully by admin',
      data: {
        deleted_photo_id: photoId,
        user_id: userId,
        was_primary: photo.is_primary
      }
    });

  } catch (error) {
    console.error('Admin Delete User Photo Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Admin Set User Primary Photo
export async function adminSetUserPrimaryPhoto(req, res) {
  try {
    const { id: userId, photoId } = req.params;

    // Check if user exists
    const [userExists] = await query("SELECT id FROM users WHERE id = ?", [userId]);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify photo belongs to user
    const [photo] = await query(
      "SELECT * FROM user_photos WHERE id = ? AND user_id = ?",
      [photoId, userId]
    );

    if (!photo) {
      return res.status(404).json({
        success: false,
        message: 'Photo not found for this user'
      });
    }

    // Unset all primary photos for this user
    await query(
      "UPDATE user_photos SET is_primary = FALSE WHERE user_id = ?",
      [userId]
    );

    // Set new primary photo
    await query(
      "UPDATE user_photos SET is_primary = TRUE WHERE id = ?",
      [photoId]
    );

    // Update profile picture
    await query(
      "UPDATE user_profiles SET profile_picture = ? WHERE user_id = ?",
      [photo.photo_url, userId]
    );

    res.json({
      success: true,
      message: 'User primary photo updated successfully by admin',
      data: {
        photo_id: photoId,
        user_id: userId,
        photo_url: photo.photo_url
      }
    });

  } catch (error) {
    console.error('Admin Set User Primary Photo Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ============ ADMIN REFUND MANAGEMENT ============

// Get All Refund Requests (Admin)
export async function getAllRefundRequests(req, res) {
  try {
    const { page = 1, limit = 20, status, search = "" } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    let params = [];

    if (status) {
      whereClause += " AND rr.refund_status = ?";
      params.push(status);
    }

    if (search) {
      whereClause += " AND (u.email LIKE ? OR u.vivaaha_user_id LIKE ? OR up.first_name LIKE ? OR up.last_name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const refundRequests = await query(`
      SELECT rr.*,
             u.email, u.vivaaha_user_id, u.phone,
             up.first_name, up.last_name,
             sp.plan_name, sp.price as plan_price, sp.duration_months,
             p.amount as paid_amount, p.payment_method, p.payment_date,
             us.start_date, us.end_date,
             cm.symbol as currency_symbol,
             DATEDIFF(CURRENT_DATE, us.start_date) as days_used,
             DATEDIFF(us.end_date, us.start_date) as total_days
      FROM refund_requests rr
      LEFT JOIN users u ON rr.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_subscriptions us ON rr.subscription_id = us.id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN payments p ON rr.payment_id = p.id
      LEFT JOIN currency_master cm ON sp.currency_id = cm.id
      ${whereClause}
      ORDER BY rr.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM refund_requests rr
      LEFT JOIN users u ON rr.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: refundRequests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get All Refund Requests Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Refund Request by ID (Admin)
export async function getRefundRequestById(req, res) {
  try {
    const { id } = req.params;

    const [refundRequest] = await query(`
      SELECT rr.*,
             u.email, u.vivaaha_user_id, u.phone,
             up.first_name, up.last_name,
             sp.plan_name, sp.price as plan_price, sp.duration_months,
             p.amount as paid_amount, p.payment_method, p.payment_date, p.order_id,
             us.start_date, us.end_date,
             cm.symbol as currency_symbol,
             DATEDIFF(CURRENT_DATE, us.start_date) as days_used,
             DATEDIFF(us.end_date, us.start_date) as total_days
      FROM refund_requests rr
      LEFT JOIN users u ON rr.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN user_subscriptions us ON rr.subscription_id = us.id
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN payments p ON rr.payment_id = p.id
      LEFT JOIN currency_master cm ON sp.currency_id = cm.id
      WHERE rr.id = ?
    `, [id]);

    if (!refundRequest) {
      return res.status(404).json({
        success: false,
        message: "Refund request not found",
      });
    }

    res.json({
      success: true,
      data: refundRequest,
    });
  } catch (error) {
    console.error("Get Refund Request Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Approve Refund Request (Admin)
export async function approveRefundRequest(req, res) {
  try {
    const { id } = req.params;
    const {
      refund_amount,
      admin_notes = ""
    } = req.body;

    if (!refund_amount || refund_amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid refund amount is required",
      });
    }

    // Check if refund request exists and is pending
    const [existing] = await query(
      "SELECT * FROM refund_requests WHERE id = ? AND refund_status = 'pending'",
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Pending refund request not found",
      });
    }

    // Update refund request
    await query(
      `UPDATE refund_requests SET
       refund_status = 'approved',
       refund_amount = ?,
       admin_notes = ?,
       processed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [refund_amount, admin_notes, id]
    );

    // Cancel the subscription
    await query(
      "UPDATE user_subscriptions SET subscription_status_id = 3, is_active = FALSE WHERE id = ?",
      [existing.subscription_id]
    );

    res.json({
      success: true,
      message: "Refund request approved successfully",
    });
  } catch (error) {
    console.error("Approve Refund Request Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Reject Refund Request (Admin)
export async function rejectRefundRequest(req, res) {
  try {
    const { id } = req.params;
    const { admin_notes = "" } = req.body;

    // Check if refund request exists and is pending
    const [existing] = await query(
      "SELECT id FROM refund_requests WHERE id = ? AND refund_status = 'pending'",
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Pending refund request not found",
      });
    }

    // Update refund request
    await query(
      `UPDATE refund_requests SET
       refund_status = 'rejected',
       admin_notes = ?,
       processed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [admin_notes, id]
    );

    res.json({
      success: true,
      message: "Refund request rejected successfully",
    });
  } catch (error) {
    console.error("Reject Refund Request Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Refund Request Status (Admin)
export async function updateRefundRequestStatus(req, res) {
  try {
    const { id } = req.params;
    const {
      status,
      refund_amount,
      admin_notes = "",
      razorpay_refund_id
    } = req.body;

    if (!['pending', 'approved', 'rejected', 'processed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be: pending, approved, rejected, or processed",
      });
    }

    const [existing] = await query("SELECT * FROM refund_requests WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Refund request not found",
      });
    }

    // Update refund request
    const updateFields = [
      "refund_status = ?",
      "admin_notes = ?",
      "processed_at = CURRENT_TIMESTAMP"
    ];
    const updateValues = [status, admin_notes];

    if (refund_amount) {
      updateFields.push("refund_amount = ?");
      updateValues.push(refund_amount);
    }

    if (razorpay_refund_id) {
      updateFields.push("razorpay_refund_id = ?");
      updateValues.push(razorpay_refund_id);
    }

    updateValues.push(id);

    await query(
      `UPDATE refund_requests SET ${updateFields.join(", ")} WHERE id = ?`,
      updateValues
    );

    // If approved or processed, cancel the subscription
    if (['approved', 'processed'].includes(status)) {
      await query(
        "UPDATE user_subscriptions SET subscription_status_id = 3, is_active = FALSE WHERE id = ?",
        [existing.subscription_id]
      );
    }

    res.json({
      success: true,
      message: "Refund request status updated successfully",
    });
  } catch (error) {
    console.error("Update Refund Request Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Refund Statistics (Admin)
export async function getRefundStatistics(req, res) {
  try {
    const [stats] = await query(`
      SELECT
        COUNT(*) as total_requests,
        COUNT(CASE WHEN refund_status = 'pending' THEN 1 END) as pending_requests,
        COUNT(CASE WHEN refund_status = 'approved' THEN 1 END) as approved_requests,
        COUNT(CASE WHEN refund_status = 'rejected' THEN 1 END) as rejected_requests,
        COUNT(CASE WHEN refund_status = 'processed' THEN 1 END) as processed_requests,
        SUM(CASE WHEN refund_status IN ('approved', 'processed') THEN refund_amount ELSE 0 END) as total_refund_amount,
        AVG(CASE WHEN refund_status IN ('approved', 'processed') THEN refund_amount ELSE NULL END) as avg_refund_amount
      FROM refund_requests
    `);

    // Get monthly refund trends
    const monthlyTrends = await query(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as requests_count,
        SUM(CASE WHEN refund_status IN ('approved', 'processed') THEN refund_amount ELSE 0 END) as refund_amount
      FROM refund_requests
      WHERE created_at >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC
    `);

    res.json({
      success: true,
      data: {
        statistics: stats,
        monthly_trends: monthlyTrends
      }
    });
  } catch (error) {
    console.error("Get Refund Statistics Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============ GENERAL SETTINGS MANAGEMENT ============

// Get General Settings
export async function getGeneralSettings(req, res) {
  try {
    const [settings] = await query('SELECT * FROM general_settings LIMIT 1');

    res.json({
      success: true,
      data: settings || {
        site_name: 'Vivaaha',
        primary_color: '#000000',
        secondary_color: '#000000',
        smtp_encryption: 'tls',
        smtp_from_name: 'Super Sathi',
        subscription_restrictions: 0, //1 is restrictions enable, 0 is restrictions disable
      }
    });
  } catch (error) {
    console.error("Get General Settings Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update General Settings
export async function updateGeneralSettings(req, res) {
  try {
    const {
      site_name,
      site_logo,
      primary_color,
      secondary_color,
      email_1,
      email_2,
      phone_number,
      address,
      facebook_url,
      instagram_url,
      twitter_url,
      linkedin_url,
      youtube_url,
      threads_url,
      smtp_host,
      smtp_port,
      smtp_username,
      smtp_password,
      smtp_encryption,
      smtp_from_email,
      smtp_from_name,
      subscription_restrictions
    } = req.body;

    // Check if settings exist
    const [existing] = await query('SELECT id FROM general_settings LIMIT 1');

    if (existing) {
      // Update existing settings
      await query(
        `UPDATE general_settings SET
         site_name = COALESCE(?, site_name),
         site_logo = COALESCE(?, site_logo),
         primary_color = COALESCE(?, primary_color),
         secondary_color = COALESCE(?, secondary_color),
         email_1 = COALESCE(?, email_1),
         email_2 = COALESCE(?, email_2),
         phone_number = COALESCE(?, phone_number),
         address = COALESCE(?, address),
         facebook_url = COALESCE(?, facebook_url),
         instagram_url = COALESCE(?, instagram_url),
         twitter_url = COALESCE(?, twitter_url),
         linkedin_url = COALESCE(?, linkedin_url),
         youtube_url = COALESCE(?, youtube_url),
         threads_url = COALESCE(?, threads_url),
         smtp_host = COALESCE(?, smtp_host),
         smtp_port = COALESCE(?, smtp_port),
         smtp_username = COALESCE(?, smtp_username),
         smtp_password = COALESCE(?, smtp_password),
         smtp_encryption = COALESCE(?, smtp_encryption),
         smtp_from_email = COALESCE(?, smtp_from_email),
         smtp_from_name = COALESCE(?, smtp_from_name),
         subscription_restrictions = ?,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          site_name, site_logo, primary_color, secondary_color,
          email_1, email_2, phone_number, address,
          facebook_url, instagram_url, twitter_url, linkedin_url,
          youtube_url, threads_url, smtp_host, smtp_port,
          smtp_username, smtp_password, smtp_encryption,
          smtp_from_email, smtp_from_name, subscription_restrictions, existing.id
        ]
      );
    } else {
      // Insert new settings
      await query(
        `INSERT INTO general_settings
         (site_name, site_logo, primary_color, secondary_color,
          email_1, email_2, phone_number, address,
          facebook_url, instagram_url, twitter_url, linkedin_url,
          youtube_url, threads_url, smtp_host, smtp_port,
          smtp_username, smtp_password, smtp_encryption,
          smtp_from_email, smtp_from_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          site_name || 'Vivaaha', site_logo, primary_color || '#000000', secondary_color || '#000000',
          email_1, email_2, phone_number, address,
          facebook_url, instagram_url, twitter_url, linkedin_url,
          youtube_url, threads_url, smtp_host, smtp_port,
          smtp_username, smtp_password, smtp_encryption || 'tls',
          smtp_from_email, smtp_from_name || 'Vivaaha'
        ]
      );
    }

    res.json({
      success: true,
      message: "General settings updated successfully"
    });

    // Reset email transporter so next send picks up new SMTP settings
    EmailService.resetTransporter();
  } catch (error) {
    console.error("Update General Settings Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Upload Site Logo File to S3
export async function uploadSiteLogoFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No logo file uploaded",
      });
    }

    const fileExtension = path.extname(req.file.originalname);
    const fileName = `site-assets/logo-${Date.now()}${fileExtension}`;

    // Upload to S3
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    const logoUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    // Update general settings with new logo URL
    const [existing] = await query('SELECT id FROM general_settings LIMIT 1');

    if (existing) {
      await query(
        'UPDATE general_settings SET site_logo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [logoUrl, existing.id]
      );
    } else {
      await query(
        'INSERT INTO general_settings (site_logo, site_name, primary_color, secondary_color, smtp_encryption, smtp_from_name) VALUES (?, ?, ?, ?, ?, ?)',
        [logoUrl, 'Vivaaha', '#000000', '#000000', 'tls', 'Vivaaha']
      );
    }

    res.json({
      success: true,
      message: "Site logo uploaded successfully",
      logo_url: logoUrl,
    });
  } catch (error) {
    console.error("Upload Site Logo Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============ ADMIN PROFILE MANAGEMENT ============

// Get Admin Profile
export async function getAdminProfile(req, res) {
  try {
    const adminId = req.admin.user_id;

    const [admin] = await query(
      `SELECT u.id, u.email, u.phone, u.created_at,
              COALESCE(up.first_name, '') as first_name,
              COALESCE(up.middle_name, '') as middle_name,
              COALESCE(up.last_name, '') as last_name,
              TRIM(CONCAT(
                COALESCE(up.first_name, ''),
                CASE WHEN up.middle_name IS NOT NULL AND up.middle_name != ''
                     THEN CONCAT(' ', up.middle_name) ELSE '' END,
                CASE WHEN up.last_name IS NOT NULL AND up.last_name != ''
                     THEN CONCAT(' ', up.last_name) ELSE '' END
              )) as full_name
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE u.id = ? AND u.user_type_id = 2`,
      [adminId]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    res.json({
      success: true,
      data: admin,
    });
  } catch (error) {
    console.error("Get Admin Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Admin Profile
export async function updateAdminProfile(req, res) {
  try {
    const adminId = req.admin.user_id;
    const { first_name, middle_name, last_name, phone } = req.body;

    // Check if admin exists
    const [existing] = await query(
      "SELECT id FROM users WHERE id = ? AND user_type_id = 2",
      [adminId]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Update phone in users table if provided
    if (phone !== undefined) {
      await query(
        "UPDATE users SET phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [phone, adminId]
      );
    }

    // Update name fields in user_profiles table if provided
    if (first_name !== undefined || middle_name !== undefined || last_name !== undefined) {
      // Check if profile exists
      const [profileExists] = await query(
        "SELECT id FROM user_profiles WHERE user_id = ?",
        [adminId]
      );

      if (profileExists) {
        // Update existing profile
        const profileUpdates = [];
        const profileValues = [];

        if (first_name !== undefined) {
          profileUpdates.push('first_name = ?');
          profileValues.push(first_name);
        }
        if (middle_name !== undefined) {
          profileUpdates.push('middle_name = ?');
          profileValues.push(middle_name);
        }
        if (last_name !== undefined) {
          profileUpdates.push('last_name = ?');
          profileValues.push(last_name);
        }

        if (profileUpdates.length > 0) {
          profileValues.push(adminId);
          await query(
            `UPDATE user_profiles SET ${profileUpdates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
            profileValues
          );
        }
      } else {
        // Create new profile
        await query(
          "INSERT INTO user_profiles (user_id, first_name, middle_name, last_name, gender_id, date_of_birth) VALUES (?, ?, ?, ?, 1, '1990-01-01')",
          [adminId, first_name || '', middle_name || null, last_name || '']
        );
      }
    }

    // Get updated admin data
    const [updatedAdmin] = await query(
      `SELECT u.id, u.email, u.phone,
              COALESCE(up.first_name, '') as first_name,
              COALESCE(up.middle_name, '') as middle_name,
              COALESCE(up.last_name, '') as last_name,
              TRIM(CONCAT(
                COALESCE(up.first_name, ''),
                CASE WHEN up.middle_name IS NOT NULL AND up.middle_name != ''
                     THEN CONCAT(' ', up.middle_name) ELSE '' END,
                CASE WHEN up.last_name IS NOT NULL AND up.last_name != ''
                     THEN CONCAT(' ', up.last_name) ELSE '' END
              )) as full_name
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       WHERE u.id = ?`,
      [adminId]
    );

    res.json({
      success: true,
      message: "Admin profile updated successfully",
      data: updatedAdmin,
    });
  } catch (error) {
    console.error("Update Admin Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Change Admin Password
export async function changeAdminPassword(req, res) {
  try {
    const adminId = req.admin.user_id;
    const { current_password, new_password, confirm_new_password } = req.body;

    if (!current_password || !new_password || !confirm_new_password) {
      return res.status(400).json({
        success: false,
        message: "Current password, new password, and confirm password are required",
      });
    }

    if (new_password !== confirm_new_password) {
      return res.status(400).json({
        success: false,
        message: "New password and confirm password do not match",
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    // Get current admin data
    const [admin] = await query(
      "SELECT id, password FROM users WHERE id = ? AND user_type_id = 2",
      [adminId]
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Verify current password
    let isValidPassword;
    if (admin.password.startsWith('$2b$') || admin.password.startsWith('$2a$')) {
      // Password is hashed with bcrypt
      isValidPassword = await bcrypt.compare(current_password, admin.password);
    } else {
      // Password is stored as plain text
      isValidPassword = current_password === admin.password;
    }

    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(new_password, 10);

    // Update password
    await query(
      "UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [hashedNewPassword, adminId]
    );

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change Admin Password Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============ ADMIN PAYMENTS MANAGEMENT ============

// Get All Payments History (Admin)
export async function getAllPaymentsHistory(req, res) {
  try {
    const { page = 1, limit = 20, status, payment_method, search = "", start_date, end_date } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    let params = [];

    if (status) {
      whereClause += " AND psm.status_name = ?";
      params.push(status);
    }

    if (payment_method) {
      whereClause += " AND p.payment_method = ?";
      params.push(payment_method);
    }

    if (search) {
      whereClause += " AND (u.email LIKE ? OR u.vivaaha_user_id LIKE ? OR up.first_name LIKE ? OR up.last_name LIKE ? OR p.order_id LIKE ? OR p.payment_id LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (start_date) {
      whereClause += " AND DATE(p.payment_date) >= ?";
      params.push(start_date);
    }

    if (end_date) {
      whereClause += " AND DATE(p.payment_date) <= ?";
      params.push(end_date);
    }

    const payments = await query(`
      SELECT p.*,
             u.email, u.vivaaha_user_id, u.phone,
             up.first_name, up.middle_name, up.last_name,
             sp.plan_name, sp.duration_months,
             psm.status_name as payment_status,
             cm.currency_code, cm.symbol as currency_symbol,
             ccm.dial_code, ccm.country_name,
             (
               SELECT us.start_date FROM user_subscriptions us
               WHERE us.user_id = p.user_id AND us.plan_id = p.plan_id
               ORDER BY us.created_at DESC LIMIT 1
             ) as subscription_start_date,
             (
               SELECT us.end_date FROM user_subscriptions us
               WHERE us.user_id = p.user_id AND us.plan_id = p.plan_id
               ORDER BY us.created_at DESC LIMIT 1
             ) as subscription_end_date,
             (
               SELECT CASE WHEN us.end_date > CURRENT_DATE THEN 'Active' ELSE 'Expired' END
               FROM user_subscriptions us
               WHERE us.user_id = p.user_id AND us.plan_id = p.plan_id
               ORDER BY us.created_at DESC LIMIT 1
             ) as subscription_status
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
      LEFT JOIN currency_master cm ON p.currency_id = cm.id
      LEFT JOIN country_code_master ccm ON u.country_code_id = ccm.id
      ${whereClause}
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
      ${whereClause}
    `, params);

    res.json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get All Payments History Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Payment by ID (Admin)
export async function getPaymentById(req, res) {
  try {
    const { id } = req.params;

    const [payment] = await query(`
      SELECT p.*,
             u.email, u.vivaaha_user_id, u.phone,
             up.first_name, up.middle_name, up.last_name,
             sp.plan_name, sp.duration_months, sp.price as plan_price,
             psm.status_name as payment_status,
             cm.currency_code, cm.symbol as currency_symbol,
             ccm.dial_code, ccm.country_name,
             (
               SELECT us.start_date FROM user_subscriptions us
               WHERE us.user_id = p.user_id AND us.plan_id = p.plan_id
               ORDER BY us.created_at DESC LIMIT 1
             ) as subscription_start_date,
             (
               SELECT us.end_date FROM user_subscriptions us
               WHERE us.user_id = p.user_id AND us.plan_id = p.plan_id
               ORDER BY us.created_at DESC LIMIT 1
             ) as subscription_end_date,
             (
               SELECT CASE WHEN us.end_date > CURRENT_DATE THEN 'Active' ELSE 'Expired' END
               FROM user_subscriptions us
               WHERE us.user_id = p.user_id AND us.plan_id = p.plan_id
               ORDER BY us.created_at DESC LIMIT 1
             ) as subscription_status
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
      LEFT JOIN currency_master cm ON p.currency_id = cm.id
      LEFT JOIN country_code_master ccm ON u.country_code_id = ccm.id
      WHERE p.id = ?
    `, [id]);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("Get Payment Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get User Payments History (Admin)
export async function getUserPaymentsHistory(req, res) {
  try {
    const { id: userId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    // Check if user exists
    const [userExists] = await query("SELECT id FROM users WHERE id = ?", [userId]);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const payments = await query(`
      SELECT p.*,
             sp.plan_name, sp.duration_months, sp.price as plan_price,
             psm.status_name as payment_status,
             cm.currency_code, cm.symbol as currency_symbol,
             (
               SELECT us.start_date FROM user_subscriptions us
               WHERE us.user_id = p.user_id AND us.plan_id = p.plan_id
               ORDER BY us.created_at DESC LIMIT 1
             ) as subscription_start_date,
             (
               SELECT us.end_date FROM user_subscriptions us
               WHERE us.user_id = p.user_id AND us.plan_id = p.plan_id
               ORDER BY us.created_at DESC LIMIT 1
             ) as subscription_end_date,
             (
               SELECT CASE WHEN us.end_date > CURRENT_DATE THEN 'Active' ELSE 'Expired' END
               FROM user_subscriptions us
               WHERE us.user_id = p.user_id AND us.plan_id = p.plan_id
               ORDER BY us.created_at DESC LIMIT 1
             ) as subscription_status
      FROM payments p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
      LEFT JOIN currency_master cm ON p.currency_id = cm.id
      WHERE p.user_id = ?
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(limit), offset]);

    const [{ total }] = await query(
      "SELECT COUNT(*) as total FROM payments WHERE user_id = ?",
      [userId]
    );

    res.json({
      success: true,
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get User Payments History Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Payment Statistics (Admin)
export async function getPaymentStatistics(req, res) {
  try {
    // Overall payment statistics
    const [stats] = await query(`
      SELECT
        COUNT(*) as total_payments,
        COUNT(CASE WHEN psm.status_name = 'paid' THEN 1 END) as successful_payments,
        COUNT(CASE WHEN psm.status_name = 'failed' THEN 1 END) as failed_payments,
        COUNT(CASE WHEN psm.status_name = 'pending' THEN 1 END) as pending_payments,
        SUM(CASE WHEN psm.status_name = 'paid' THEN p.amount ELSE 0 END) as total_revenue,
        AVG(CASE WHEN psm.status_name = 'paid' THEN p.amount ELSE NULL END) as avg_payment_amount,
        COUNT(CASE WHEN p.payment_gateway = 'razorpay' THEN 1 END) as razorpay_payments,
        COUNT(CASE WHEN p.payment_gateway = 'ccavenue' THEN 1 END) as ccavenue_payments
      FROM payments p
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
    `);

    // Monthly revenue trends (last 12 months)
    const monthlyRevenue = await query(`
      SELECT
        DATE_FORMAT(p.payment_date, '%Y-%m') as month,
        COUNT(*) as payment_count,
        SUM(CASE WHEN psm.status_name = 'paid' THEN p.amount ELSE 0 END) as revenue,
        COUNT(CASE WHEN psm.status_name = 'paid' THEN 1 END) as successful_count
      FROM payments p
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
      WHERE p.payment_date >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(p.payment_date, '%Y-%m')
      ORDER BY month DESC
    `);

    // Payment method breakdown
    const paymentMethods = await query(`
      SELECT
        p.payment_gateway,
        COUNT(*) as count,
        SUM(CASE WHEN psm.status_name = 'paid' THEN p.amount ELSE 0 END) as revenue,
        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM payments), 2) as percentage
      FROM payments p
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
      GROUP BY p.payment_gateway
      ORDER BY count DESC
    `);

    // Top subscription plans by revenue
    const topPlans = await query(`
      SELECT
        sp.plan_name,
        sp.duration_months,
        COUNT(p.id) as purchase_count,
        SUM(CASE WHEN psm.status_name = 'paid' THEN p.amount ELSE 0 END) as total_revenue
      FROM payments p
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
      WHERE psm.status_name = 'paid' AND sp.id IS NOT NULL
      GROUP BY sp.id, sp.plan_name, sp.duration_months
      ORDER BY total_revenue DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        overall_statistics: stats,
        monthly_revenue: monthlyRevenue,
        payment_methods: paymentMethods,
        top_subscription_plans: topPlans
      }
    });
  } catch (error) {
    console.error("Get Payment Statistics Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Payment Status (Admin)
export async function updatePaymentStatus(req, res) {
  try {
    const { id } = req.params;
    const { payment_status, admin_notes = "" } = req.body;

    // Map status names to valid database values
    const statusMapping = {
      'pending': 'pending',
      'success': 'paid',
      'paid': 'paid',
      'failed': 'failed',
      'refunded': 'refunded'
    };

    const mappedStatus = statusMapping[payment_status] || payment_status;

    if (!['pending', 'paid', 'failed', 'refunded'].includes(mappedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status. Must be: pending, paid, failed, or refunded",
      });
    }

    const [existing] = await query("SELECT * FROM payments WHERE id = ?", [id]);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // Get the payment status ID from the master table
    const [statusRecord] = await query(
      "SELECT id FROM payment_status_master WHERE status_name = ?",
      [mappedStatus]
    );

    if (!statusRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
      });
    }

    // Update payment status using payment_status_id
    await query(
      "UPDATE payments SET payment_status_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [statusRecord.id, id]
    );

    // Find related subscription if exists
    const [subscription] = await query(
      "SELECT id FROM user_subscriptions WHERE user_id = ? AND plan_id = ? ORDER BY created_at DESC LIMIT 1",
      [existing.user_id, existing.plan_id]
    );

    // If payment is marked as successful, activate the subscription
    if (mappedStatus === 'paid' && subscription) {
      await query(
        "UPDATE user_subscriptions SET subscription_status_id = 1, is_active = TRUE WHERE id = ?",
        [subscription.id]
      );
    }

    // If payment is marked as failed or refunded, deactivate the subscription
    if (['failed', 'refunded'].includes(mappedStatus) && subscription) {
      await query(
        "UPDATE user_subscriptions SET subscription_status_id = 3, is_active = FALSE WHERE id = ?",
        [subscription.id]
      );
    }

    res.json({
      success: true,
      message: "Payment status updated successfully",
    });
  } catch (error) {
    console.error("Update Payment Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ============ SITE SETTINGS MANAGEMENT ============

// Create Site Setting
export async function createSiteSetting(req, res) {
  try {
    const { page_name, title, sub_title, meta_title, meta_description, keywords, status } = req.body;
    const created_by = req.admin?.user_id;

    if (!page_name || !title || !created_by) {
      return res.status(400).json({
        success: false,
        message: 'Page name, title, and created_by are required'
      });
    }

    // Check if page_name already exists
    const [existing] = await query(
      'SELECT id FROM site_settings WHERE page_name = ? AND deleted_at IS NULL',
      [page_name]
    );

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Site setting with this page name already exists'
      });
    }

    const result = await query(
      `INSERT INTO site_settings
      (page_name, title, sub_title, meta_title, meta_description, keywords, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [page_name, title, sub_title || null, meta_title || null, meta_description || null, keywords || null, status || 'active', created_by]
    );

    res.status(201).json({
      success: true,
      message: 'Site setting created successfully',
      data: {
        id: result.insertId,
        page_name,
        title,
        sub_title,
        meta_title,
        meta_description,
        keywords,
        status: status || 'active',
        created_by
      }
    });
  } catch (error) {
    console.error('Error creating site setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Get All Site Settings
export async function getAllSiteSettings(req, res) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let whereClause = 'WHERE deleted_at IS NULL';
    const queryParams: any[] = [];

    if (status && ['active', 'inactive'].includes(status)) {
      whereClause += ' AND status = ?';
      queryParams.push(status);
    }

    // Get total count
    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM site_settings ${whereClause}`,
      queryParams
    );
    const total = countResult.total;

    // Get paginated results
    const rows = await query(
      `SELECT id, page_name, title, sub_title, meta_title, meta_description, keywords, status, created_by, created_at, updated_at
      FROM site_settings ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.status(200).json({
      success: true,
      data: {
        site_settings: rows,
        pagination: {
          current_page: page,
          per_page: limit,
          total: total,
          total_pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching site settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Get Site Setting by ID
export async function getSiteSettingById(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    const [siteSettings] = await query(
      `SELECT id, page_name, title, sub_title, meta_title, meta_description, keywords, status, created_by, created_at, updated_at
      FROM site_settings
      WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (!siteSettings) {
      return res.status(404).json({
        success: false,
        message: 'Site setting not found'
      });
    }

    res.status(200).json({
      success: true,
      data: siteSettings
    });
  } catch (error) {
    console.error('Error fetching site setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Get Site Setting by Name
export async function getSiteSettingByName(req, res) {
  try {
    const { name } = req.params;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Page name is required'
      });
    }

    const [siteSettings] = await query(
      `SELECT id, page_name, title, sub_title, meta_title, meta_description, keywords, status, created_by, created_at, updated_at
      FROM site_settings
      WHERE page_name = ? AND deleted_at IS NULL AND status = 'active'`,
      [name]
    );

    if (!siteSettings) {
      return res.status(404).json({
        success: false,
        message: 'Site setting not found'
      });
    }

    res.status(200).json({
      success: true,
      data: siteSettings
    });
  } catch (error) {
    console.error('Error fetching site setting by name:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Update Site Setting
export async function updateSiteSetting(req, res) {
  try {
    const { id } = req.params;
    const { page_name, title, sub_title, meta_title, meta_description, keywords, status } = req.body;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists
    const [existing] = await query(
      'SELECT id FROM site_settings WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Site setting not found'
      });
    }

    // Check if page_name already exists for other records
    if (page_name) {
      const [duplicateCheck] = await query(
        'SELECT id FROM site_settings WHERE page_name = ? AND id != ? AND deleted_at IS NULL',
        [page_name, id]
      );

      if (duplicateCheck) {
        return res.status(400).json({
          success: false,
          message: 'Site setting with this page name already exists'
        });
      }
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (page_name !== undefined) {
      updateFields.push('page_name = ?');
      updateValues.push(page_name);
    }
    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    if (sub_title !== undefined) {
      updateFields.push('sub_title = ?');
      updateValues.push(sub_title);
    }
    if (meta_title !== undefined) {
      updateFields.push('meta_title = ?');
      updateValues.push(meta_title);
    }
    if (meta_description !== undefined) {
      updateFields.push('meta_description = ?');
      updateValues.push(meta_description);
    }
    if (keywords !== undefined) {
      updateFields.push('keywords = ?');
      updateValues.push(keywords);
    }
    if (status !== undefined && ['active', 'inactive'].includes(status)) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updateValues.push(id);

    await query(
      `UPDATE site_settings SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Get updated record
    const [updatedRecord] = await query(
      `SELECT id, page_name, title, sub_title, meta_title, meta_description, keywords, status, created_by, created_at, updated_at
      FROM site_settings
      WHERE id = ?`,
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Site setting updated successfully',
      data: updatedRecord
    });
  } catch (error) {
    console.error('Error updating site setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Soft Delete Site Setting
export async function deleteSiteSetting(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists and is not already deleted
    const [existing] = await query(
      'SELECT id FROM site_settings WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Site setting not found'
      });
    }

    // Soft delete the record
    await query(
      'UPDATE site_settings SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Site setting deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting site setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// ============ CURRENCY SETTINGS MANAGEMENT ============

// Create Currency Setting
export async function createCurrencySetting(req, res) {
  try {
    const { home_currency_id, system_currency_id, currency_format_id, symbol_format_id, no_of_decimals_id, status } = req.body;
    const created_by = req.admin?.user_id;

    if (!home_currency_id || !system_currency_id || !currency_format_id || !symbol_format_id || !no_of_decimals_id || !created_by) {
      return res.status(400).json({
        success: false,
        message: 'All currency setting fields are required'
      });
    }

    // Validate foreign key references
    const [homeCurrency] = await query('SELECT id FROM currency_master WHERE id = ?', [home_currency_id]);
    const [systemCurrency] = await query('SELECT id FROM currency_master WHERE id = ?', [system_currency_id]);
    const [currencyFormat] = await query('SELECT id FROM currency_format WHERE id = ?', [currency_format_id]);
    const [symbolFormat] = await query('SELECT id FROM symbol_format WHERE id = ?', [symbol_format_id]);
    const [noOfDecimals] = await query('SELECT id FROM no_of_decimals WHERE id = ?', [no_of_decimals_id]);

    if (!homeCurrency || !systemCurrency || !currencyFormat || !symbolFormat || !noOfDecimals) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reference IDs provided'
      });
    }

    const result = await query(
      `INSERT INTO currency_settings
      (home_currency_id, system_currency_id, currency_format_id, symbol_format_id, no_of_decimals_id, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [home_currency_id, system_currency_id, currency_format_id, symbol_format_id, no_of_decimals_id, status || 'active', created_by]
    );

    res.status(201).json({
      success: true,
      message: 'Currency setting created successfully',
      data: {
        id: result.insertId,
        home_currency_id,
        system_currency_id,
        currency_format_id,
        symbol_format_id,
        no_of_decimals_id,
        status: status || 'active',
        created_by
      }
    });
  } catch (error) {
    console.error('Error creating currency setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Get All Currency Settings
export async function getAllCurrencySettings(req, res) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let whereClause = 'WHERE cs.deleted_at IS NULL';
    const queryParams: any[] = [];

    if (status && ['active', 'inactive'].includes(status)) {
      whereClause += ' AND cs.status = ?';
      queryParams.push(status);
    }

    // Get total count
    const [countResult] = await query(
      `SELECT COUNT(*) as total FROM currency_settings cs ${whereClause}`,
      queryParams
    );
    const total = countResult.total;

    // Get paginated results with all related data
    const rows = await query(
      `SELECT cs.id, cs.home_currency_id, cs.system_currency_id, cs.currency_format_id,
              cs.symbol_format_id, cs.no_of_decimals_id, cs.status, cs.created_by,
              cs.created_at, cs.updated_at,
              hc.currency_name as home_currency_name, hc.currency_code as home_currency_code, hc.symbol as home_currency_symbol,
              sc.currency_name as system_currency_name, sc.currency_code as system_currency_code, sc.symbol as system_currency_symbol,
              cf.format_name as currency_format_name, cf.format_pattern, cf.example as format_example,
              sf.format_name as symbol_format_name, sf.format_pattern as symbol_pattern, sf.example as symbol_example,
              nod.decimal_name, nod.decimal_places, nod.example as decimal_example
       FROM currency_settings cs
       LEFT JOIN currency_master hc ON cs.home_currency_id = hc.id
       LEFT JOIN currency_master sc ON cs.system_currency_id = sc.id
       LEFT JOIN currency_format cf ON cs.currency_format_id = cf.id
       LEFT JOIN symbol_format sf ON cs.symbol_format_id = sf.id
       LEFT JOIN no_of_decimals nod ON cs.no_of_decimals_id = nod.id
       ${whereClause}
       ORDER BY cs.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    res.status(200).json({
      success: true,
      data: {
        currency_settings: rows,
        pagination: {
          current_page: page,
          per_page: limit,
          total: total,
          total_pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching currency settings:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Get Currency Setting by ID
export async function getCurrencySettingById(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    const [currencySetting] = await query(
      `SELECT cs.id, cs.home_currency_id, cs.system_currency_id, cs.currency_format_id,
              cs.symbol_format_id, cs.no_of_decimals_id, cs.status, cs.created_by,
              cs.created_at, cs.updated_at,
              hc.currency_name as home_currency_name, hc.currency_code as home_currency_code, hc.symbol as home_currency_symbol,
              sc.currency_name as system_currency_name, sc.currency_code as system_currency_code, sc.symbol as system_currency_symbol,
              cf.format_name as currency_format_name, cf.format_pattern, cf.example as format_example,
              sf.format_name as symbol_format_name, sf.format_pattern as symbol_pattern, sf.example as symbol_example,
              nod.decimal_name, nod.decimal_places, nod.example as decimal_example
       FROM currency_settings cs
       LEFT JOIN currency_master hc ON cs.home_currency_id = hc.id
       LEFT JOIN currency_master sc ON cs.system_currency_id = sc.id
       LEFT JOIN currency_format cf ON cs.currency_format_id = cf.id
       LEFT JOIN symbol_format sf ON cs.symbol_format_id = sf.id
       LEFT JOIN no_of_decimals nod ON cs.no_of_decimals_id = nod.id
       WHERE cs.id = ? AND cs.deleted_at IS NULL`,
      [id]
    );

    if (!currencySetting) {
      return res.status(404).json({
        success: false,
        message: 'Currency setting not found'
      });
    }

    res.status(200).json({
      success: true,
      data: currencySetting
    });
  } catch (error) {
    console.error('Error fetching currency setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Update Currency Setting
export async function updateCurrencySetting(req, res) {
  try {
    const { id } = req.params;
    const { home_currency_id, system_currency_id, currency_format_id, symbol_format_id, no_of_decimals_id, status } = req.body;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists
    const [existing] = await query(
      'SELECT id FROM currency_settings WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Currency setting not found'
      });
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (home_currency_id !== undefined) {
      const [homeCurrency] = await query('SELECT id FROM currency_master WHERE id = ?', [home_currency_id]);
      if (!homeCurrency) {
        return res.status(400).json({
          success: false,
          message: 'Invalid home currency ID'
        });
      }
      updateFields.push('home_currency_id = ?');
      updateValues.push(home_currency_id);
    }

    if (system_currency_id !== undefined) {
      const [systemCurrency] = await query('SELECT id FROM currency_master WHERE id = ?', [system_currency_id]);
      if (!systemCurrency) {
        return res.status(400).json({
          success: false,
          message: 'Invalid system currency ID'
        });
      }
      updateFields.push('system_currency_id = ?');
      updateValues.push(system_currency_id);
    }

    if (currency_format_id !== undefined) {
      const [currencyFormat] = await query('SELECT id FROM currency_format WHERE id = ?', [currency_format_id]);
      if (!currencyFormat) {
        return res.status(400).json({
          success: false,
          message: 'Invalid currency format ID'
        });
      }
      updateFields.push('currency_format_id = ?');
      updateValues.push(currency_format_id);
    }

    if (symbol_format_id !== undefined) {
      const [symbolFormat] = await query('SELECT id FROM symbol_format WHERE id = ?', [symbol_format_id]);
      if (!symbolFormat) {
        return res.status(400).json({
          success: false,
          message: 'Invalid symbol format ID'
        });
      }
      updateFields.push('symbol_format_id = ?');
      updateValues.push(symbol_format_id);
    }

    if (no_of_decimals_id !== undefined) {
      const [noOfDecimals] = await query('SELECT id FROM no_of_decimals WHERE id = ?', [no_of_decimals_id]);
      if (!noOfDecimals) {
        return res.status(400).json({
          success: false,
          message: 'Invalid no of decimals ID'
        });
      }
      updateFields.push('no_of_decimals_id = ?');
      updateValues.push(no_of_decimals_id);
    }

    if (status !== undefined && ['active', 'inactive'].includes(status)) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updateValues.push(id);

    await query(
      `UPDATE currency_settings SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Get updated record
    const [updatedRecord] = await query(
      `SELECT cs.id, cs.home_currency_id, cs.system_currency_id, cs.currency_format_id,
              cs.symbol_format_id, cs.no_of_decimals_id, cs.status, cs.created_by,
              cs.created_at, cs.updated_at,
              hc.currency_name as home_currency_name, hc.currency_code as home_currency_code, hc.symbol as home_currency_symbol,
              sc.currency_name as system_currency_name, sc.currency_code as system_currency_code, sc.symbol as system_currency_symbol,
              cf.format_name as currency_format_name, cf.format_pattern, cf.example as format_example,
              sf.format_name as symbol_format_name, sf.format_pattern as symbol_pattern, sf.example as symbol_example,
              nod.decimal_name, nod.decimal_places, nod.example as decimal_example
       FROM currency_settings cs
       LEFT JOIN currency_master hc ON cs.home_currency_id = hc.id
       LEFT JOIN currency_master sc ON cs.system_currency_id = sc.id
       LEFT JOIN currency_format cf ON cs.currency_format_id = cf.id
       LEFT JOIN symbol_format sf ON cs.symbol_format_id = sf.id
       LEFT JOIN no_of_decimals nod ON cs.no_of_decimals_id = nod.id
       WHERE cs.id = ?`,
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Currency setting updated successfully',
      data: updatedRecord
    });
  } catch (error) {
    console.error('Error updating currency setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Soft Delete Currency Setting
export async function deleteCurrencySetting(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists and is not already deleted
    const [existing] = await query(
      'SELECT id FROM currency_settings WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Currency setting not found'
      });
    }

    // Soft delete the record
    await query(
      'UPDATE currency_settings SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Currency setting deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting currency setting:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Get Currency Formats
export async function getCurrencyFormats(req, res) {
  try {
    const formats = await query(
      'SELECT id, format_name, format_pattern, description, example FROM currency_format WHERE status = "active" ORDER BY id'
    );

    res.status(200).json({
      success: true,
      data: formats
    });
  } catch (error) {
    console.error('Error fetching currency formats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Get Symbol Formats
export async function getSymbolFormats(req, res) {
  try {
    const formats = await query(
      'SELECT id, format_name, format_pattern, description, example FROM symbol_format WHERE status = "active" ORDER BY id'
    );

    res.status(200).json({
      success: true,
      data: formats
    });
  } catch (error) {
    console.error('Error fetching symbol formats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Get No Of Decimals
export async function getNoOfDecimals(req, res) {
  try {
    const decimals = await query(
      'SELECT id, decimal_name, decimal_places, description, example FROM no_of_decimals WHERE status = "active" ORDER BY decimal_places'
    );

    res.status(200).json({
      success: true,
      data: decimals
    });
  } catch (error) {
    console.error('Error fetching no of decimals:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// ============ CURRENCY FORMAT CRUD ============

// Create Currency Format
export async function createCurrencyFormat(req, res) {
  try {
    const { format_name, format_pattern, description, example, status } = req.body;

    if (!format_name || !format_pattern) {
      return res.status(400).json({
        success: false,
        message: 'Format name and pattern are required'
      });
    }

    // Check if format_name already exists
    const [existing] = await query(
      'SELECT id FROM currency_format WHERE format_name = ?',
      [format_name]
    );

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Currency format with this name already exists'
      });
    }

    const result = await query(
      `INSERT INTO currency_format (format_name, format_pattern, description, example, status)
       VALUES (?, ?, ?, ?, ?)`,
      [format_name, format_pattern, description || null, example || null, status || 'active']
    );

    res.status(201).json({
      success: true,
      message: 'Currency format created successfully',
      data: {
        id: result.insertId,
        format_name,
        format_pattern,
        description,
        example,
        status: status || 'active'
      }
    });
  } catch (error) {
    console.error('Error creating currency format:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Update Currency Format
export async function updateCurrencyFormat(req, res) {
  try {
    const { id } = req.params;
    const { format_name, format_pattern, description, example, status } = req.body;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists
    const [existing] = await query(
      'SELECT id FROM currency_format WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Currency format not found'
      });
    }

    // Check if format_name already exists for other records
    if (format_name) {
      const [duplicateCheck] = await query(
        'SELECT id FROM currency_format WHERE format_name = ? AND id != ?',
        [format_name, id]
      );

      if (duplicateCheck) {
        return res.status(400).json({
          success: false,
          message: 'Currency format with this name already exists'
        });
      }
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (format_name !== undefined) {
      updateFields.push('format_name = ?');
      updateValues.push(format_name);
    }
    if (format_pattern !== undefined) {
      updateFields.push('format_pattern = ?');
      updateValues.push(format_pattern);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (example !== undefined) {
      updateFields.push('example = ?');
      updateValues.push(example);
    }
    if (status !== undefined && ['active', 'inactive'].includes(status)) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updateValues.push(id);

    await query(
      `UPDATE currency_format SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Get updated record
    const [updatedRecord] = await query(
      'SELECT id, format_name, format_pattern, description, example, status, created_at, updated_at FROM currency_format WHERE id = ?',
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Currency format updated successfully',
      data: updatedRecord
    });
  } catch (error) {
    console.error('Error updating currency format:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Delete Currency Format
export async function deleteCurrencyFormat(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists
    const [existing] = await query(
      'SELECT id FROM currency_format WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Currency format not found'
      });
    }

    // Check if format is being used in currency_settings
    const [inUse] = await query(
      'SELECT id FROM currency_settings WHERE currency_format_id = ? AND deleted_at IS NULL',
      [id]
    );

    if (inUse) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete currency format as it is being used in currency settings'
      });
    }

    // Delete the record
    await query('DELETE FROM currency_format WHERE id = ?', [id]);

    res.status(200).json({
      success: true,
      message: 'Currency format deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting currency format:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// ============ SYMBOL FORMAT CRUD ============

// Create Symbol Format
export async function createSymbolFormat(req, res) {
  try {
    const { format_name, format_pattern, description, example, status } = req.body;

    if (!format_name || !format_pattern) {
      return res.status(400).json({
        success: false,
        message: 'Format name and pattern are required'
      });
    }

    // Check if format_name already exists
    const [existing] = await query(
      'SELECT id FROM symbol_format WHERE format_name = ?',
      [format_name]
    );

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Symbol format with this name already exists'
      });
    }

    const result = await query(
      `INSERT INTO symbol_format (format_name, format_pattern, description, example, status)
       VALUES (?, ?, ?, ?, ?)`,
      [format_name, format_pattern, description || null, example || null, status || 'active']
    );

    res.status(201).json({
      success: true,
      message: 'Symbol format created successfully',
      data: {
        id: result.insertId,
        format_name,
        format_pattern,
        description,
        example,
        status: status || 'active'
      }
    });
  } catch (error) {
    console.error('Error creating symbol format:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Update Symbol Format
export async function updateSymbolFormat(req, res) {
  try {
    const { id } = req.params;
    const { format_name, format_pattern, description, example, status } = req.body;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists
    const [existing] = await query(
      'SELECT id FROM symbol_format WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Symbol format not found'
      });
    }

    // Check if format_name already exists for other records
    if (format_name) {
      const [duplicateCheck] = await query(
        'SELECT id FROM symbol_format WHERE format_name = ? AND id != ?',
        [format_name, id]
      );

      if (duplicateCheck) {
        return res.status(400).json({
          success: false,
          message: 'Symbol format with this name already exists'
        });
      }
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (format_name !== undefined) {
      updateFields.push('format_name = ?');
      updateValues.push(format_name);
    }
    if (format_pattern !== undefined) {
      updateFields.push('format_pattern = ?');
      updateValues.push(format_pattern);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (example !== undefined) {
      updateFields.push('example = ?');
      updateValues.push(example);
    }
    if (status !== undefined && ['active', 'inactive'].includes(status)) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updateValues.push(id);

    await query(
      `UPDATE symbol_format SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Get updated record
    const [updatedRecord] = await query(
      'SELECT id, format_name, format_pattern, description, example, status, created_at, updated_at FROM symbol_format WHERE id = ?',
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Symbol format updated successfully',
      data: updatedRecord
    });
  } catch (error) {
    console.error('Error updating symbol format:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Delete Symbol Format
export async function deleteSymbolFormat(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists
    const [existing] = await query(
      'SELECT id FROM symbol_format WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Symbol format not found'
      });
    }

    // Check if format is being used in currency_settings
    const [inUse] = await query(
      'SELECT id FROM currency_settings WHERE symbol_format_id = ? AND deleted_at IS NULL',
      [id]
    );

    if (inUse) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete symbol format as it is being used in currency settings'
      });
    }

    // Delete the record
    await query('DELETE FROM symbol_format WHERE id = ?', [id]);

    res.status(200).json({
      success: true,
      message: 'Symbol format deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting symbol format:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// ============ NO OF DECIMALS CRUD ============

// Create No Of Decimals
export async function createNoOfDecimals(req, res) {
  try {
    const { decimal_name, decimal_places, description, example, status } = req.body;

    if (!decimal_name || decimal_places === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Decimal name and decimal places are required'
      });
    }

    if (isNaN(Number(decimal_places)) || Number(decimal_places) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Decimal places must be a non-negative number'
      });
    }

    // Check if decimal_name already exists
    const [existing] = await query(
      'SELECT id FROM no_of_decimals WHERE decimal_name = ?',
      [decimal_name]
    );

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Decimal format with this name already exists'
      });
    }

    const result = await query(
      `INSERT INTO no_of_decimals (decimal_name, decimal_places, description, example, status)
       VALUES (?, ?, ?, ?, ?)`,
      [decimal_name, Number(decimal_places), description || null, example || null, status || 'active']
    );

    res.status(201).json({
      success: true,
      message: 'Decimal format created successfully',
      data: {
        id: result.insertId,
        decimal_name,
        decimal_places: Number(decimal_places),
        description,
        example,
        status: status || 'active'
      }
    });
  } catch (error) {
    console.error('Error creating decimal format:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Update No Of Decimals
export async function updateNoOfDecimals(req, res) {
  try {
    const { id } = req.params;
    const { decimal_name, decimal_places, description, example, status } = req.body;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists
    const [existing] = await query(
      'SELECT id FROM no_of_decimals WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Decimal format not found'
      });
    }

    // Check if decimal_name already exists for other records
    if (decimal_name) {
      const [duplicateCheck] = await query(
        'SELECT id FROM no_of_decimals WHERE decimal_name = ? AND id != ?',
        [decimal_name, id]
      );

      if (duplicateCheck) {
        return res.status(400).json({
          success: false,
          message: 'Decimal format with this name already exists'
        });
      }
    }

    // Validate decimal_places if provided
    if (decimal_places !== undefined && (isNaN(Number(decimal_places)) || Number(decimal_places) < 0)) {
      return res.status(400).json({
        success: false,
        message: 'Decimal places must be a non-negative number'
      });
    }

    // Build update query dynamically
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (decimal_name !== undefined) {
      updateFields.push('decimal_name = ?');
      updateValues.push(decimal_name);
    }
    if (decimal_places !== undefined) {
      updateFields.push('decimal_places = ?');
      updateValues.push(Number(decimal_places));
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (example !== undefined) {
      updateFields.push('example = ?');
      updateValues.push(example);
    }
    if (status !== undefined && ['active', 'inactive'].includes(status)) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    updateValues.push(id);

    await query(
      `UPDATE no_of_decimals SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Get updated record
    const [updatedRecord] = await query(
      'SELECT id, decimal_name, decimal_places, description, example, status, created_at, updated_at FROM no_of_decimals WHERE id = ?',
      [id]
    );

    res.status(200).json({
      success: true,
      message: 'Decimal format updated successfully',
      data: updatedRecord
    });
  } catch (error) {
    console.error('Error updating decimal format:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Delete No Of Decimals
export async function deleteNoOfDecimals(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid ID is required'
      });
    }

    // Check if record exists
    const [existing] = await query(
      'SELECT id FROM no_of_decimals WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Decimal format not found'
      });
    }

    // Check if format is being used in currency_settings
    const [inUse] = await query(
      'SELECT id FROM currency_settings WHERE no_of_decimals_id = ? AND deleted_at IS NULL',
      [id]
    );

    if (inUse) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete decimal format as it is being used in currency settings'
      });
    }

    // Delete the record
    await query('DELETE FROM no_of_decimals WHERE id = ?', [id]);

    res.status(200).json({
      success: true,
      message: 'Decimal format deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting decimal format:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// ============ ADMIN DASHBOARD ============

// Get Admin Dashboard Data
export async function getAdminDashboard(req, res) {
  try {
    // New Members - Last 7 months registration trend
    const newMembersData = await query(`
      SELECT 
        DATE_FORMAT(created_at, '%b %y') as month,
        DATE_FORMAT(created_at, '%Y-%m') as sort_month,
        COUNT(*) as count
      FROM users 
      WHERE user_type_id = 1 
        AND created_at >= DATE_SUB(NOW(), INTERVAL 7 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%b %y'), DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY sort_month ASC
    `);

    // Revenue Overview - Monthly revenue collection
    const revenueData = await query(`
      SELECT 
        DATE_FORMAT(p.payment_date, '%b %y') as month,
        DATE_FORMAT(p.payment_date, '%Y-%m') as sort_month,
        SUM(CASE WHEN psm.status_name = 'paid' THEN p.amount ELSE 0 END) as revenue
      FROM payments p
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
      WHERE p.payment_date >= DATE_SUB(NOW(), INTERVAL 7 MONTH)
      GROUP BY DATE_FORMAT(p.payment_date, '%b %y'), DATE_FORMAT(p.payment_date, '%Y-%m')
      ORDER BY sort_month ASC
    `);

    // Recent Members - Latest registered members
    const recentMembers = await query(`
      SELECT 
        u.id,
        u.email,
        u.vivaaha_user_id,
        up.first_name,
        up.last_name,
        u.created_at,
        'Active' as status,
        (
          SELECT photo_url FROM user_photos 
          WHERE user_id = u.id AND is_primary = 1 
          ORDER BY upload_date DESC LIMIT 1
        ) as profile_image
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.user_type_id = 1
      ORDER BY u.created_at DESC
      LIMIT 5
    `);

    // Recent Payments - Latest membership transactions
    const recentPayments = await query(`
      SELECT 
        p.id,
        p.amount,
        p.payment_date,
        psm.status_name as status,
        cm.symbol as currency_symbol,
        CONCAT(up.first_name, ' ', COALESCE(up.last_name, '')) as user_name,
        sp.plan_name
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id
      LEFT JOIN currency_master cm ON p.currency_id = cm.id
      LEFT JOIN subscription_plans sp ON p.plan_id = sp.id
      WHERE psm.status_name = 'paid'
      ORDER BY p.payment_date DESC
      LIMIT 5
    `);

    // Dashboard Statistics
    const [stats] = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE user_type_id = 1) as total_users,
        (SELECT COUNT(*) FROM users WHERE user_type_id = 1 AND DATE(created_at) = CURDATE()) as today_registrations,
        (SELECT COUNT(*) FROM user_subscriptions WHERE subscription_status_id = 1 AND end_date > NOW()) as active_subscriptions,
        (SELECT SUM(CASE WHEN psm.status_name = 'paid' THEN p.amount ELSE 0 END) 
         FROM payments p 
         LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id 
         WHERE DATE(p.payment_date) = CURDATE()) as today_revenue,
        (SELECT SUM(CASE WHEN psm.status_name = 'paid' THEN p.amount ELSE 0 END) 
         FROM payments p 
         LEFT JOIN payment_status_master psm ON p.payment_status_id = psm.id 
         WHERE MONTH(p.payment_date) = MONTH(NOW()) AND YEAR(p.payment_date) = YEAR(NOW())) as monthly_revenue,
        (SELECT COUNT(*) FROM success_stories WHERE status = 'pending') as pending_success_stories,
        (SELECT COUNT(*) FROM refund_requests WHERE refund_status = 'pending') as pending_refunds
    `);

    res.json({
      success: true,
      data: {
        new_members: {
          chart_data: newMembersData,
          title: "New Members",
          subtitle: "Last 7 months registration trend"
        },
        revenue_overview: {
          chart_data: revenueData,
          title: "Revenue Overview", 
          subtitle: "Monthly revenue collection"
        },
        recent_members: {
          data: recentMembers,
          title: "Recent Members",
          subtitle: "Latest registered members"
        },
        recent_payments: {
          data: recentPayments,
          title: "Recent Payments",
          subtitle: "Latest membership transactions"
        },
        statistics: {
          total_users: stats.total_users || 0,
          today_registrations: stats.today_registrations || 0,
          active_subscriptions: stats.active_subscriptions || 0,
          today_revenue: stats.today_revenue || 0,
          monthly_revenue: stats.monthly_revenue || 0,
          pending_success_stories: stats.pending_success_stories || 0,
          pending_refunds: stats.pending_refunds || 0
        }
      }
    });
  } catch (error) {
    console.error('Admin Dashboard Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}