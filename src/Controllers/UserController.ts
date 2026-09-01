import * as utils from "util";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import * as multer from "multer";
import * as path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { sendMail } from "./SendMailController";
import { EmailService } from "./EmailService";
import { generateUniqueVivahaId } from "../Controllers/MatchActionsController";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const JWT_SECRET = process.env.JWT_SECRET_KEY;
const PROFILE_CREATED_BY = ['self', 'parent', 'sibling', 'relative', 'friend'];

function definedFields(mapping: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(mapping)) {
    if (mapping[key] !== undefined) out[key] = mapping[key];
  }
  return out;
}

async function upsertByUser(table, userId, fields) {
  const cols = Object.keys(fields);
  if (cols.length === 0) return;

  const [existing] = await query(`SELECT id FROM ${table} WHERE user_id = ? LIMIT 1`, [userId]);
  if (existing) {
    await query(
      `UPDATE ${table} SET ${cols.map((col) => `${col} = ?`).join(", ")} WHERE user_id = ?`,
      [...cols.map((col) => fields[col]), userId]
    );
  } else {
    await query(
      `INSERT INTO ${table} (user_id, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})`,
      [userId, ...cols.map((col) => fields[col])]
    );
  }
}

function normalizeManglik(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value).toLowerCase();
  if (text === "yes") return "yes";
  if (text === "no") return "no";
  if (text.includes("anshik") || text.includes("partial")) return "yes";
  return "dont_know";
}

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME || "images-2025-new";
const MAX_AUDIO_SIZE = 3 * 1024 * 1024; // 3MB
const ALLOWED_AUDIO_FORMATS = ['mp3', 'wav'];

// Multer configuration for audio files
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AUDIO_SIZE,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    if (ALLOWED_AUDIO_FORMATS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid audio format. Only ${ALLOWED_AUDIO_FORMATS.join(', ')} are allowed.`));
    }
  },
}).single('audio');

// Send matching profiles email to new user
async function sendMatchingProfilesEmail(userId, email, firstName, religionId, communityId, genderId) {
  try {
    // Find opposite gender
    const oppositeGender = genderId === 1 ? 2 : 1;

    // Find matching profiles with same religion and community
    const matchingProfiles = await query(`
      SELECT u.vivaaha_user_id, up.first_name, up.last_name, up.age, up.height, up.profile_picture,
             up.show_vivaaha_id, rm.religion_name, cm.caste_name, citym.city_name, statem.state_name,
             cd.occupation, cd.annual_income,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id
                  ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name)
             END as display_name
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN location_details ld ON u.id = ld.user_id
      LEFT JOIN cities_master citym ON ld.city_id = citym.id
      LEFT JOIN states_master statem ON ld.state_id = statem.id
      WHERE u.id != ? AND u.status = 1 AND up.gender_id = ?
            AND up.religion_id = ? AND up.caste_id = ?
      ORDER BY u.created_at DESC
      LIMIT 10
    `, [userId, oppositeGender, religionId, communityId]);

    if (matchingProfiles.length === 0) {
      return; // No matches found, don't send email
    }

    // Build email content
    let profilesHtml = '';
    matchingProfiles.forEach(profile => {
      const profilePicture = profile.profile_picture && profile.profile_picture.startsWith('http')
        ? profile.profile_picture
        : `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${profile.profile_picture || 'default-avatar.png'}`;

      profilesHtml += `
        <div style="border: 1px solid #ddd; border-radius: 8px; padding: 15px; margin: 10px 0; background-color: #f9f9f9;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="${profilePicture}" alt="Profile" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;" onerror="this.src='https://via.placeholder.com/60x60/cccccc/666666?text=No+Image'">
            <div>
              <h4 style="margin: 0; color: #d63384;">${profile.first_name} ${profile.last_name}</h4>
              <p style="margin: 5px 0; color: #888; font-size: 12px;">Vivaaha ID: ${profile.vivaaha_user_id}</p>
              <p style="margin: 5px 0; color: #666;">Age: ${profile.age || 'N/A'} | Height: ${profile.height || 'N/A'} cm</p>
              <p style="margin: 5px 0; color: #666;">${profile.religion_name || ''} ${profile.caste_name ? '- ' + profile.caste_name : ''}</p>
              <p style="margin: 5px 0; color: #666;">${profile.occupation || ''} ${profile.annual_income ? '| ₹' + profile.annual_income : ''}</p>
              <p style="margin: 5px 0; color: #666;">${profile.city_name || ''} ${profile.state_name ? ', ' + profile.state_name : ''}</p>
            </div>
          </div>
        </div>
      `;
    });

    const emailSubject = `Welcome to Vivaaha! Here are ${matchingProfiles.length} potential matches for you`;
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #d63384;">Welcome to Vivaaha Matrimony, ${firstName}!</h2>
        <p>Congratulations on creating your profile! We've found some potential matches that share your preferences:</p>

        <h3 style="color: #333; border-bottom: 2px solid #d63384; padding-bottom: 5px;">Your Potential Matches</h3>
        ${profilesHtml}

        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #0066cc;"><strong>💡 Tip:</strong> Log in to your account to view complete profiles and connect with your matches!</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'https://vivaaha.com'}/login"
             style="background-color: #d63384; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View All Matches
          </a>
        </div>

        <p>Happy matchmaking!</p>
        <p>Best regards,<br>Vivaaha Matrimony Team</p>
      </div>
    `;

    await EmailService.sendTemplateEmail(
      'welcome_matches',
      email,
      { user_name: firstName, match_count: matchingProfiles.length },
      {
        fallbackSubject: `Welcome to Vivaaha! Here are ${matchingProfiles.length} potential matches for you`,
        fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#d63384">Welcome to Vivaaha Matrimony, ${firstName}!</h2><p>We've found ${matchingProfiles.length} potential matches for you.</p><div style="text-align:center;margin:30px 0"><a href="${process.env.FRONTEND_URL||'https://vivaaha.com'}/login" style="background:#d63384;color:white;padding:12px 30px;text-decoration:none;border-radius:5px;display:inline-block">View All Matches</a></div><p>Best regards,<br>Vivaaha Matrimony Team</p></div>`,
      }
    );
  } catch (error) {
    console.error('Send matching profiles email error:', error);
    throw error;
  }
}

// Get Complete User Profile
async function getCompleteUserProfile(userId) {
  const [basicProfile] = await query(
    `SELECT u.id, u.email, u.phone, u.country_code_id, u.status, u.email_verified, u.phone_verified, u.vivaaha_user_id,
            up.*, r.religion_name, c.caste_name, cm_comm.community_name, g.gender_name, ms.status_name as marital_status,
            mt.language_name as mother_tongue, bg.blood_group, d.diet_name, dis.disability_name, hi.health_condition,
            CASE WHEN dv_aadhaar.verification_status = 'verified' THEN 1 ELSE 0 END as aadhaar_verified,
            CASE WHEN dv_pan.verification_status = 'verified' THEN 1 ELSE 0 END as pan_verified,
            CASE WHEN dv_dl.verification_status = 'verified' THEN 1 ELSE 0 END as dl_verified,
            CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     LEFT JOIN religion_master r ON up.religion_id = r.id
     LEFT JOIN caste_master c ON up.caste_id = c.id
     LEFT JOIN community_master cm_comm ON up.community_id = cm_comm.id
     LEFT JOIN gender_master g ON up.gender_id = g.id
     LEFT JOIN marital_status_master ms ON up.marital_status_id = ms.id
     LEFT JOIN mother_tongue_master mt ON up.mother_tongue_id = mt.id
     LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
     LEFT JOIN diet_master d ON up.diet_id = d.id
     LEFT JOIN disability_master dis ON up.disability_id = dis.id
     LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
     LEFT JOIN document_verification dv_aadhaar ON u.id = dv_aadhaar.user_id AND dv_aadhaar.document_type = 'aadhaar'
     LEFT JOIN document_verification dv_pan ON u.id = dv_pan.user_id AND dv_pan.document_type = 'pan'
     LEFT JOIN document_verification dv_dl ON u.id = dv_dl.user_id AND dv_dl.document_type = 'driving_license'
     WHERE u.id = ?`,
    [userId]
  );

  const [astro] = await query(
    `SELECT ad.*, g.gothra_name, c.country_name as birth_country
     FROM astro_details ad
     LEFT JOIN gothra_master g ON ad.gothra_id = g.id
     LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
     WHERE ad.user_id = ?`,
    [userId]
  );

  const [family] = await query(
    `SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
            ffs.status_name as financial_status, c.country_name as family_country,
            ft.type_name as family_type, fv.value_name as family_values
     FROM family_details fd
     LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
     LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
     LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
     LEFT JOIN country_code_master c ON fd.family_country_id = c.id
     LEFT JOIN family_type_master ft ON fd.family_type_id = ft.id
     LEFT JOIN family_values_master fv ON fd.family_values_id = fv.id
     WHERE fd.user_id = ?`,
    [userId]
  );

  const [career] = await query(
    `SELECT cd.*, ww.working_type, c.country_name as country_living, cur.currency_name, cur.symbol,
            CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm.profession_name, cd.occupation) ELSE cd.occupation END as occupation
     FROM career_details cd
     LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
     LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
     LEFT JOIN currency_master cur ON cd.currency_id = cur.id
     LEFT JOIN profession_master pm ON cd.occupation REGEXP '^[0-9]+$' AND pm.id = CAST(cd.occupation AS UNSIGNED)
     WHERE cd.user_id = ?`,
    [userId]
  );

  const [location] = await query(
    `SELECT ld.*, c.city_name, s.state_name, co.country_name, cd.grew_up_in_ids, cd.ethnic_origin_id, eo.origin_name as ethnic_origin_name
     FROM location_details ld
     LEFT JOIN cities_master c ON ld.city_id = c.id
     LEFT JOIN states_master s ON ld.state_id = s.id
     LEFT JOIN country_code_master co ON ld.country_id = co.id
     LEFT JOIN career_details cd ON ld.user_id = cd.user_id
     LEFT JOIN ethnic_origin_master eo ON cd.ethnic_origin_id = eo.id
     WHERE ld.user_id = ?`,
    [userId]
  );

  // Parse grew_up_in_ids JSON string to array
  if (location && location.grew_up_in_ids) {
    try {
      location.grew_up_in_ids = JSON.parse(location.grew_up_in_ids);
    } catch (e) {
      location.grew_up_in_ids = [];
    }
  }

  const [education] = await query(
    `SELECT ed.*, el.level_name, ea.area_name
     FROM education_details ed
     LEFT JOIN education_level_master el ON ed.education_level_id = el.id
     LEFT JOIN education_area_master ea ON ed.education_area_id = ea.id
     WHERE ed.user_id = ?`,
    [userId]
  );

  const hobbies = await query(
    `SELECT hm.* FROM user_hobbies uh
     JOIN hobbies_master hm ON uh.hobby_id = hm.id
     WHERE uh.user_id = ?`,
    [userId]
  );

  const [governmentId] = await query(
    `SELECT ugiv.*, gitm.id_type_name
     FROM user_government_id_verification ugiv
     LEFT JOIN government_id_type_master gitm ON ugiv.id_type_id = gitm.id
     WHERE ugiv.user_id = ?`,
    [userId]
  );

  const photos = await query(
    `SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC`,
    [userId]
  );

  const [subscription] = await query(
    `SELECT us.*, sp.plan_name, sp.price, sp.duration_months,
            ssm.status_name as subscription_status
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
     LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
     WHERE us.user_id = ? AND us.subscription_status_id = 1
     ORDER BY us.created_at DESC LIMIT 1`,
    [userId]
  );
  console.log("basicProfile ", basicProfile);
  return {
    basic: basicProfile || {},
    astro: astro || {},
    family: family || {},
    career: career || {},
    location: location || {},
    education: education || {},
    hobbies: hobbies || [],
    government_id: governmentId || {},
    photos: photos || [],
    subscription: subscription || {}
  };
}

// Generate random 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP for Name Update
export async function sendNameUpdateOTP(req, res) {
  try {
    const userId = req.user.user_id;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Get user details
    const [user] = await query(
      "SELECT email, phone FROM users WHERE id = ?",
      [userId]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Verify email belongs to user
    if (user.email !== email) {
      return res.status(400).json({
        success: false,
        message: "Email does not match your account"
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP using existing otp_verification table
    await query(
      "INSERT INTO otp_verification (user_id, otp_code, otp_type, contact_info, expires_at) VALUES (?, ?, 'name_update', ?, ?) ON DUPLICATE KEY UPDATE otp_code = VALUES(otp_code), expires_at = VALUES(expires_at), created_at = NOW()",
      [userId, otp, email, expiresAt]
    );

    // Send OTP via email
    try {
      await EmailService.sendTemplateEmail(
        'name_update_otp',
        email,
        { user_name: email, otp },
        {
          fallbackSubject: 'Name Update Verification - OTP',
          fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#d63384">Name Update Verification</h2><p>Your OTP is:</p><div style="background:#f8f9fa;padding:20px;border-radius:5px;margin:20px 0;text-align:center"><h1 style="font-family:monospace;color:#d63384;margin:0">${otp}</h1></div><p>This OTP will expire in 10 minutes.</p></div>`,
        }
      );

      res.json({
        success: true,
        message: "OTP sent successfully to your email"
      });
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      res.status(500).json({
        success: false,
        message: "Failed to send OTP email"
      });
    }
  } catch (error) {
    console.error("Send Name Update OTP Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Name with OTP Verification
export async function updateNameWithOTP(req, res) {
  try {
    const userId = req.user.user_id;
    const { first_name, middle_name, last_name, otp } = req.body;

    if (!first_name || !last_name || !otp) {
      return res.status(400).json({
        success: false,
        message: "First name, last name, and OTP are required"
      });
    }

    // Verify OTP using existing otp_verification table
    const [otpRecord] = await query(
      "SELECT otp_code, expires_at FROM otp_verification WHERE user_id = ? AND otp_type = 'name_update' AND expires_at > NOW() AND is_verified = FALSE ORDER BY created_at DESC LIMIT 1",
      [userId]
    );

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }

    if (otpRecord.otp_code !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }

    // Update name
    await query(
      "UPDATE user_profiles SET first_name = ?, middle_name = ?, last_name = ? WHERE user_id = ?",
      [first_name, middle_name || null, last_name, userId]
    );

    // Mark OTP as verified
    await query(
      "UPDATE otp_verification SET is_verified = TRUE, verified_at = NOW() WHERE user_id = ? AND otp_type = 'name_update'",
      [userId]
    );

    res.json({
      success: true,
      message: "Name updated successfully"
    });
  } catch (error) {
    console.error("Update Name with OTP Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Generate random 6-character password with caps, small letters, and numbers
function generatePassword(): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';

  let password = '';

  // Ensure at least one of each type
  password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
  password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));

  // Fill remaining 3 characters with random mix
  const allChars = uppercase + lowercase + numbers;
  for (let i = 3; i < 6; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  // Shuffle the password to randomize positions
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Send Email Verification OTP
export async function sendEmailVerificationOTPOld(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Check if email already exists (exclude soft-deleted users)
    const [existingEmail] = await query("SELECT id FROM users WHERE email = ? AND status != 4", [email]);
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    // If a deleted account still holds this email (edge case), free it now
    await query(
      "UPDATE users SET email = CONCAT(email, '_deleted_', id) WHERE email = ? AND status = 4",
      [email]
    );

    // Clear any old OTP verification records for this email so re-registration works
    await query(
      "DELETE FROM otp_verification WHERE contact_info = ? AND otp_type = 'email_verification'",
      [email]
    );

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP
    await query(
      "INSERT INTO otp_verification (user_id, otp_code, otp_type, contact_info, expires_at) VALUES (0, ?, 'email_verification', ?, ?) ON DUPLICATE KEY UPDATE otp_code = VALUES(otp_code), expires_at = VALUES(expires_at), created_at = NOW()",
      [otp, email, expiresAt]
    );

    console.log(`\n========================================`);
    console.log(`📧 EMAIL VERIFICATION OTP`);
    console.log(`   Email : ${email}`);
    console.log(`   OTP   : ${otp}`);
    console.log(`   Expires: ${expiresAt.toISOString()}`);
    console.log(`========================================\n`);

    // Send OTP via email
    await EmailService.sendTemplateEmail(
      'email_verification',
      email,
      { user_name: email, otp },
      {
        fallbackSubject: 'Email Verification - OTP',
        fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#d63384">Email Verification</h2><p>Your OTP for email verification is:</p><div style="background:#f8f9fa;padding:20px;border-radius:5px;margin:20px 0;text-align:center"><h1 style="font-family:monospace;color:#d63384;margin:0">${otp}</h1></div><p>This OTP will expire in 10 minutes.</p></div>`,
      }
    );

    res.json({
      success: true,
      message: "OTP sent successfully to your email"
    });
  } catch (error) {
    console.error("Send Email Verification OTP Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Send OTP for registration compatibility. Keeps the old email behavior when
// email is supplied, and supports the old phone-based profile creation flow.
export async function sendEmailVerificationOTP(req, res) {
  try {
    const { phone, email } = req.body;
    if (!phone) {
      return sendEmailVerificationOTPOld(req, res);
    }

    const [existingPhone] = await query(
      "SELECT id FROM users WHERE phone = ? AND status != 4",
      [phone]
    );
    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: "Phone number already registered. Please log in instead.",
        is_existing_user: true
      });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query(
      "DELETE FROM otp_verification WHERE contact_info = ? AND otp_type = 'registration' AND is_verified = FALSE",
      [phone]
    );
    await query(
      "INSERT INTO otp_verification (user_id, otp_code, otp_type, contact_info, expires_at) VALUES (0, ?, 'registration', ?, ?)",
      [otp, phone, expiresAt]
    );

    console.log(`\n========================================`);
    console.log(`PHONE REGISTRATION OTP`);
    console.log(`   Phone : ${phone}`);
    console.log(`   OTP   : ${otp}`);
    console.log(`   Expires: ${expiresAt.toISOString()}`);
    console.log(`========================================\n`);

    res.json({
      success: true,
      message: "OTP sent successfully",
      profile_for: req.body.profile_for || null,
      phone,
      email: email || null,
      country_code_id: req.body.country_code_id || 1
    });
  } catch (error) {
    console.error("Send Registration OTP Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Verify Email OTP
export async function verifyEmailOTPOld(req, res) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required"
      });
    }

    // Verify OTP
    const [otpRecord] = await query(
      "SELECT otp_code, expires_at FROM otp_verification WHERE contact_info = ? AND otp_type = 'email_verification' AND expires_at > NOW() AND is_verified = FALSE ORDER BY created_at DESC LIMIT 1",
      [email]
    );

    if (!otpRecord || otpRecord.otp_code !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }

    // Mark OTP as verified
    await query(
      "UPDATE otp_verification SET is_verified = TRUE, verified_at = NOW() WHERE contact_info = ? AND otp_type = 'email_verification'",
      [email]
    );

    res.json({
      success: true,
      message: "Email verified successfully"
    });
  } catch (error) {
    console.error("Verify Email OTP Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Create User Profile
export async function createProfileOld(req, res) {
  try {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              CREATE PROFILE - FULL DEBUG                     ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("\n📥 FULL REQUEST BODY:", JSON.stringify(req.body, null, 2));
    console.log("\n🔑 Environment check - JWT_SECRET exists:", !!JWT_SECRET);

    const {
      profile_for,
      first_name,
      middle_name,
      last_name,
      religion_id,
      community_id,
      email,
      date_of_birth,
      country_id,
      phone,
      country_code_id,
      password,
      gender_id,
      caste_id,
      city,
      city_id,
      lives_with_family,
      family_location,
      marital_status_id,
      has_children,
      number_of_children,
      height,
      diet,
      diet_id,
      education_level,
      college_name,
      college_name_2,
      annual_income,
      income_type,
      work_type,
      occupation,
      company_name,
      about_myself,
      exclude_from_matchmaking,
      mother_tongue_id,
    } = req.body;

    if (!email || !first_name || !last_name || !date_of_birth) {
      return res.status(400).json({
        success: false,
        message: "Required fields missing (email, first_name, last_name, date_of_birth)",
      });
    }

    // ═══ BUG FIX: Resolve diet_id (app sends "diet" key, not "diet_id") ═══
    const resolvedDietId = diet_id || diet || 1;

    // ═══ BUG FIX: Resolve city name from city_id (app sends numeric city_id) ═══
    let resolvedCityName = null;
    let resolvedStateId = null;
    let resolvedStateName = null;
    if (city_id) {
      const [cityRow] = await query("SELECT city_name, state_id FROM cities_master WHERE id = ?", [city_id]);
      if (cityRow) {
        resolvedCityName = cityRow.city_name;
        resolvedStateId = cityRow.state_id;
        if (cityRow.state_id) {
          const [stateRow] = await query("SELECT state_name FROM states_master WHERE id = ?", [cityRow.state_id]);
          if (stateRow) resolvedStateName = stateRow.state_name;
        }
      }
    }
    // Fallback: if city is a string (not numeric), use it directly
    if (!resolvedCityName && city && isNaN(Number(city))) {
      resolvedCityName = city;
    }

    // ═══ BUG FIX: Resolve occupation name from ID (app sends numeric occupation ID) ═══
    let resolvedOccupation = occupation;
    if (occupation && !isNaN(Number(occupation))) {
      const [profRow] = await query("SELECT profession_name FROM profession_master WHERE id = ?", [occupation]);
      if (profRow) {
        resolvedOccupation = profRow.profession_name;
      }
    }

    // ═══ BUG FIX: Resolve country_living_in_id from country_id ═══
    const resolvedCountryLivingInId = country_id || 1;

    console.log("\n🔧 RESOLVED VALUES:");
    console.log("   diet_id: app sent diet=", diet, "diet_id=", diet_id, "→ resolved:", resolvedDietId);
    console.log("   city: app sent city=", city, "→ resolved name:", resolvedCityName);
    console.log("   state_id: looked up from city_id=", city_id, "→ resolved:", resolvedStateId);
    console.log("   occupation: app sent=", occupation, "→ resolved:", resolvedOccupation);
    console.log("   country_living_in_id: from country_id=", country_id, "→ resolved:", resolvedCountryLivingInId);

    // Verify email is verified (skip for Google sign-in users who have google_verified flag)
    const { google_verified } = req.body;
    if (!google_verified) {
      const [emailVerified] = await query(
        "SELECT is_verified FROM otp_verification WHERE contact_info = ? AND otp_type = 'email_verification' AND is_verified = TRUE ORDER BY verified_at DESC LIMIT 1",
        [email]
      );

      if (!emailVerified) {
        return res.status(400).json({
          success: false,
          message: "Email not verified. Please verify your email first."
        });
      }
    }

    if (!JWT_SECRET) {
      console.error("JWT_SECRET not found in environment variables");
      return res.status(500).json({
        success: false,
        message: "Server configuration error"
      });
    }

    // Check if email exists (exclude soft-deleted users)
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

    // Check if phone exists (exclude soft-deleted users)
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

    // Clear email/phone from deleted accounts to avoid UNIQUE constraint conflicts
    await query(
      "UPDATE users SET email = CONCAT(email, '_deleted_', id), phone = CASE WHEN phone IS NOT NULL THEN CONCAT(phone, '_deleted_', id) ELSE phone END WHERE email = ? AND status = 4",
      [email]
    );
    if (phone) {
      await query(
        "UPDATE users SET phone = CONCAT(phone, '_deleted_', id) WHERE phone = ? AND status = 4",
        [phone]
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate unique Vivaaha ID
    const vivahaUserId = await generateUniqueVivahaId();

    // Calculate age
    const birthDate = new Date(date_of_birth);
    const age = new Date().getFullYear() - birthDate.getFullYear();

    // Create user with email_verified = true
    console.log("Creating user with data:", { email, phone, country_code_id, vivahaUserId });
    console.log("\n📝 [1/6] INSERTING INTO users TABLE:", { email, phone, vivahaUserId, country_code_id: country_code_id || 1 });
    const userResult = await query(
      "INSERT INTO users (email, password, phone, vivaaha_user_id, country_code_id, user_type_id, status, email_verified) VALUES (?, ?, ?, ?, ?, 1, 1, TRUE)",
      [email, hashedPassword, phone, vivahaUserId, country_code_id || 1]
    );

    const userId = userResult.insertId;
    console.log("✅ User created with ID:", userId);

    // Create profile
    // await query(
    //   `INSERT INTO user_profiles (user_id, first_name, middle_name, last_name, gender_id, date_of_birth, age,
    //    height, marital_status_id, has_children, number_of_children, religion_id, caste_id, profile_created_by, lives_with_family, family_location, about_myself, exclude_from_matchmaking, diet_id)
    //    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    //   [
    const profileData = {
      userId, first_name, middle_name: middle_name || null, last_name,
      gender_id: gender_id || 1, date_of_birth, age, height,
      marital_status_id: marital_status_id || 1, has_children: has_children || 'no',
      number_of_children: number_of_children || null, religion_id: religion_id || 1,
      caste_id: caste_id || 1, community_id: community_id || null,
      profile_for: profile_for || 'self', lives_with_family: lives_with_family !== undefined ? lives_with_family : true,
      family_location: family_location || null, about_myself: about_myself || null,
      exclude_from_matchmaking: exclude_from_matchmaking || false, diet_id: resolvedDietId,
      mother_tongue_id: mother_tongue_id || null
    };
    console.log("\n📝 [2/6] INSERTING INTO user_profiles TABLE:", JSON.stringify(profileData, null, 2));
    await query(`INSERT INTO user_profiles (user_id, first_name, middle_name, last_name, gender_id, date_of_birth, age,
       height, marital_status_id, has_children, number_of_children, religion_id, caste_id, community_id, profile_created_by, lives_with_family, family_location, about_myself, exclude_from_matchmaking, diet_id, mother_tongue_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        userId,
        first_name,
        middle_name || null,
        last_name,
        gender_id || 1,
        date_of_birth,
        age,
        height,
        marital_status_id || 1,
        has_children || 'no',
        number_of_children || null,
        religion_id || 1,
        caste_id || 1,
        community_id || null,
        profile_for || 'self',
        lives_with_family !== undefined ? lives_with_family : true,
        family_location || null,
        about_myself || null,
        exclude_from_matchmaking || false,
        resolvedDietId,
        mother_tongue_id || null
      ]
    );
    console.log("✅ user_profiles inserted");

    // Create education details if provided
    if (education_level || college_name) {
      console.log("\n📝 [3/6] INSERTING INTO education_details:", { userId, education_level: education_level || 1, college_name, college_name_2: college_name_2 || null });
      await query(
        "INSERT INTO education_details (user_id, education_level_id, institution_name, institution_name_2) VALUES (?, ?, ?, ?)",
        [userId, education_level || 1, college_name, college_name_2 || null]
      );
      console.log("✅ education_details inserted");
    } else {
      console.log("\n⚠️  [3/6] SKIPPED education_details - no education_level or college_name provided");
    }

    // Create career details if provided
    if (occupation || company_name || annual_income) {
      // ═══ BUG FIX: Resolve working_with_id from work_type string ═══
      let resolvedWorkingWithId = null;
      if (work_type) {
        const [wwRow] = await query("SELECT id FROM working_with_master WHERE working_type = ?", [work_type]);
        if (wwRow) {
          resolvedWorkingWithId = wwRow.id;
        }
      }

      // ═══ BUG FIX: Resolve education level name from ID ═══
      let resolvedEducationLevelName = null;
      if (education_level) {
        const [elRow] = await query("SELECT level_name FROM education_level_master WHERE id = ?", [education_level]);
        if (elRow) {
          resolvedEducationLevelName = elRow.level_name;
        }
      }

      console.log("\n📝 [4/6] INSERTING INTO career_details:", { userId, resolvedOccupation, company_name, annual_income, income_type: income_type || 'yearly', country_living_in_id: resolvedCountryLivingInId, city_living_in: resolvedCityName || null, working_with_id: resolvedWorkingWithId, state_living_in_id: resolvedStateId });
      await query(
        `INSERT INTO career_details (user_id, occupation, company_name, annual_income, income_type, currency_id, country_living_in_id, city_living_in, working_with_id, working_as, employer_name, highest_qualification, college_attended, state_living_in_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, resolvedOccupation, company_name, annual_income, income_type || 'yearly', 1, resolvedCountryLivingInId, resolvedCityName || null, resolvedWorkingWithId, resolvedOccupation, company_name, resolvedEducationLevelName, college_name || null, resolvedStateId || null]
      );
      console.log("✅ career_details inserted");
    } else {
      console.log("\n⚠️  [4/6] SKIPPED career_details - no occupation, company_name, or annual_income provided");
    }

    // Create address if city provided
    if (city || city_id) {
      console.log("\n📝 [5/6] INSERTING INTO address_details:", { userId, city: resolvedCityName, city_id, country_id: country_id || 1 });
      await query(
        "INSERT INTO address_details (user_id, address_type, city, city_id, country_id) VALUES (?, 'current', ?, ?, ?)",
        [userId, resolvedCityName, city_id, country_id || 1]
      );
      console.log("✅ address_details inserted");
    } else {
      console.log("\n⚠️  [5/6] SKIPPED address_details - no city or city_id provided");
    }

    // Always create location details record
    console.log("\n📝 [6/6] INSERTING INTO location_details:", { userId, current_residence: resolvedCityName, city_id: city_id || null, state_id: resolvedStateId, state_living_in: resolvedStateName, country_id: country_id || 1 });
    await query(
      "INSERT INTO location_details (user_id, current_residence, city_id, state_id, state_living_in, country_id) VALUES (?, ?, ?, ?, ?, ?)",
      [userId, resolvedCityName || null, city_id || null, resolvedStateId, resolvedStateName || null, country_id || 1]
    );
    console.log("✅ location_details inserted");



    // Generate access token
    const token = jwt.sign(
      { user_id: userId, email: email, user_type: "user" },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Generate and send default password via email
    const defaultPassword = generatePassword();
    const hashedDefaultPassword = await bcrypt.hash(defaultPassword, 10);

    // Update user with default password
    await query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedDefaultPassword, userId]
    );

    // Send password via email
    try {
      await EmailService.sendTemplateEmail(
        'user_registration',
        email,
        { user_name: `${first_name} ${last_name}`, email, temp_password: defaultPassword, profile_id: vivahaUserId || userId },
        {
          fallbackSubject: 'Registration Successful!',
          fallbackHtml: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
              <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h2 style="color: #d63384; text-align: center; margin-bottom: 30px;">Registration Successful!</h2>

                <p style="font-size: 16px; color: #333;">Dear <strong>${first_name} ${last_name}</strong>,</p>

                <p style="font-size: 14px; color: #666; line-height: 1.6;">Thank you for registering with Vivaaha Matrimony!</p>

                <p style="font-size: 14px; color: #666; line-height: 1.6;">Your account has been created successfully and is currently under review by our team. You will receive an email notification once your account is approved.</p>

                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #d63384;">
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; font-weight: bold; color: #333;">Profile ID:</td>
                      <td style="padding: 8px 0; color: #d63384; font-weight: bold;">${vivahaUserId}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: bold; color: #333;">Registered Email:</td>
                      <td style="padding: 8px 0; color: #666;">${email}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: bold; color: #333;">Temporary Password:</td>
                      <td style="padding: 8px 0; font-family: monospace; background: #e9ecef; padding: 5px 8px; border-radius: 4px; font-weight: bold; color: #d63384;">${defaultPassword}</td>
                    </tr>
                  </table>
                </div>

                <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <p style="margin: 0; color: #856404; font-size: 14px;">
                    <strong>Note:</strong> This process usually takes 24-48 hours. Please change your password after your first login for security purposes.
                  </p>
                </div>

                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.FRONTEND_URL || 'https://vivaaha.com'}/login"
                     style="background-color: #d63384; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                    Login to Your Account
                  </a>
                </div>

                <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

                <p style="font-size: 14px; color: #666; margin-bottom: 5px;">Best regards,</p>
                <p style="font-size: 14px; color: #d63384; font-weight: bold; margin: 0;">Vivaaha Matrimony Team</p>
              </div>
            </div>
          `,
        }
      );
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
    }

    // Get complete profile data
    const completeProfile = await getCompleteUserProfile(userId);

    // Find and send matching profiles email
    try {
      await sendMatchingProfilesEmail(userId, email, first_name, religion_id, community_id, gender_id);
    } catch (emailError) {
      console.error("Failed to send matching profiles email:", emailError);
      // Don't fail registration if email fails
    }

    const responseData = {
      success: true,
      message: "Profile created successfully",
      user_id: userId,
      vivaaha_user_id: vivahaUserId,
      access_token: token,
      default_password: defaultPassword,
      default_password_sent: true,
      profile: completeProfile
    };

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║              CREATE PROFILE - RESPONSE                       ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("\n📤 FULL RESPONSE (profile section):", JSON.stringify(completeProfile, null, 2));
    console.log("\n🔍 MISSING DATA CHECK:");
    console.log("   - career.grew_up_in_ids:", completeProfile.career?.grew_up_in_ids || "❌ MISSING");
    console.log("   - career.ethnic_origin_id:", completeProfile.career?.ethnic_origin_id || "❌ MISSING");
    console.log("   - career.country_living_in_id:", completeProfile.career?.country_living_in_id || "❌ MISSING");
    console.log("   - career.city_living_in:", completeProfile.career?.city_living_in || "❌ MISSING");
    console.log("   - location.state_id:", completeProfile.location?.state_id || "❌ MISSING");
    console.log("   - location.city_name:", completeProfile.location?.city_name || "❌ MISSING");
    console.log("   - basic.community_id:", completeProfile.basic?.community_id || "❌ MISSING");
    console.log("   - basic.mother_tongue_id:", completeProfile.basic?.mother_tongue_id || "❌ MISSING");
    console.log("   - education:", completeProfile.education ? "✅ EXISTS" : "❌ MISSING");
    console.log("   - family:", completeProfile.family && Object.keys(completeProfile.family).length > 0 ? "✅ EXISTS" : "❌ MISSING (not created during signup)");
    console.log("   - astro:", completeProfile.astro && Object.keys(completeProfile.astro).length > 0 ? "✅ EXISTS" : "❌ MISSING (not created during signup)");
    console.log("══════════════════════════════════════════════════════════════\n");

    res.status(201).json(responseData);
  } catch (error) {
    console.error("Create Profile Error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
      stack: error.stack
    });

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
    }

    // Handle database connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ER_ACCESS_DENIED_ERROR') {
      return res.status(500).json({
        success: false,
        message: "Database connection error"
      });
    }

    // Handle missing environment variables
    if (!JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "JWT configuration error"
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Create profile after phone OTP verification. This matches the old profile
// wizard flow: only phone, country_code_id and profile_for are saved initially;
// the remaining profile data is collected screen-by-screen later.
export async function createProfile(req, res) {
  try {
    const { profile_for, phone, country_code_id } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required"
      });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Server configuration error"
      });
    }

    const profileCreatedBy = PROFILE_CREATED_BY.includes(profile_for) ? profile_for : "self";

    const [existingPhone] = await query(
      "SELECT id FROM users WHERE phone = ? AND status != 4",
      [phone]
    );
    if (existingPhone) {
      const profile = await getCompleteUserProfile(existingPhone.id);
      const existingToken = jwt.sign(
        { user_id: existingPhone.id, user_type: "user" },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      return res.status(200).json({
        success: true,
        message: "User Information",
        is_existing_user: true,
        user_id: existingPhone.id,
        vivaaha_user_id: profile.basic?.vivaaha_user_id || null,
        access_token: existingToken,
        profile_for: profile.basic?.profile_created_by || null,
        phone,
        profile
      });
    }

    const [verifiedOtp] = await query(
      "SELECT id FROM otp_verification WHERE contact_info = ? AND otp_type = 'phone' AND is_verified = TRUE ORDER BY verified_at DESC, created_at DESC LIMIT 1",
      [phone]
    );
    if (!verifiedOtp) {
      return res.status(400).json({
        success: false,
        message: "Phone OTP verification is required before profile creation"
      });
    }

    const vivahaUserId = await generateUniqueVivahaId();
    const userResult = await query(
      "INSERT INTO users (phone, country_code_id, vivaaha_user_id, user_type_id, status, phone_verified) VALUES (?, ?, ?, 1, 1, TRUE)",
      [phone, country_code_id || 1, vivahaUserId]
    );

    const userId = userResult.insertId;
    await query(
      "INSERT INTO user_profiles (user_id, profile_created_by, aadhaar_verified) VALUES (?, ?, 1)",
      [userId, profileCreatedBy]
    );

    const token = jwt.sign(
      { user_id: userId, user_type: "user" },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      success: true,
      message: "Profile created successfully",
      user_id: userId,
      vivaaha_user_id: vivahaUserId,
      access_token: token,
      profile_for: profileCreatedBy,
      phone
    });
  } catch (error) {
    console.error("Create Profile Error:", error);
    if (error.code === "ER_DUP_ENTRY" && error.sqlMessage && error.sqlMessage.includes("phone")) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists"
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

// Get User Profile
export async function getProfile(req, res) {
  try {
    const userId = req.user.user_id;
    console.log("\n👤 GET PROFILE called for user_id:", userId);

    const basicResult = await query(
      `SELECT u.vivaaha_user_id, up.age, up.date_of_birth, up.height, up.marital_status_id, up.blood_group_id,
              up.about_myself, up.exclude_from_matchmaking, up.diet_id, up.show_vivaaha_id,
              up.profile_picture, up.first_name, up.middle_name, up.last_name,
              up.religion_id, up.community_id, up.caste_id, up.mother_tongue_id,
              r.religion_name, c.caste_name, cm_comm.community_name,
              mt.language_name as mother_tongue,
              CASE WHEN dv_aadhaar.verification_status = 'verified' THEN 1 ELSE 0 END as aadhaar_verified,
              CASE WHEN dv_pan.verification_status = 'verified' THEN 1 ELSE 0 END as pan_verified,
              CASE WHEN dv_dl.verification_status = 'verified' THEN 1 ELSE 0 END as dl_verified,
              CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name,
              bg.blood_group, msm.status_name as marital_status
       FROM user_profiles up
       LEFT JOIN users u ON up.user_id = u.id
       LEFT JOIN religion_master r ON up.religion_id = r.id
       LEFT JOIN caste_master c ON up.caste_id = c.id
       LEFT JOIN community_master cm_comm ON up.community_id = cm_comm.id
       LEFT JOIN mother_tongue_master mt ON up.mother_tongue_id = mt.id
       LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
       LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
       LEFT JOIN document_verification dv_aadhaar ON u.id = dv_aadhaar.user_id AND dv_aadhaar.document_type = 'aadhaar'
       LEFT JOIN document_verification dv_pan ON u.id = dv_pan.user_id AND dv_pan.document_type = 'pan'
       LEFT JOIN document_verification dv_dl ON u.id = dv_dl.user_id AND dv_dl.document_type = 'driving_license'
       WHERE up.user_id = ?`,
      [userId]
    );

    if (!basicResult || basicResult.length === 0) {
      console.error('No basic profile found for user_id:', userId);
    }

    const astroResult = await query(
      `SELECT ad.*, g.gothra_name, c.country_name
       FROM astro_details ad
       LEFT JOIN gothra_master g ON ad.gothra_id = g.id
       LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
       WHERE ad.user_id = ?`,
      [userId]
    );

    const familyResult = await query(
      `SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
              ffs.status_name as financial_status, c.country_name as family_country
       FROM family_details fd
       LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
       LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
       LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
       LEFT JOIN country_code_master c ON fd.family_country_id = c.id
       WHERE fd.user_id = ?`,
      [userId]
    );

    const careerResult = await query(
      `SELECT cd.*, ww.working_type, c.country_name as country_living,
              CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm.profession_name, cd.occupation) ELSE cd.occupation END as occupation
       FROM career_details cd
       LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
       LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
       LEFT JOIN profession_master pm ON cd.occupation REGEXP '^[0-9]+$' AND pm.id = CAST(cd.occupation AS UNSIGNED)
       WHERE cd.user_id = ?`,
      [userId]
    );

    // Parse grew_up_in_ids JSON string to array
    if (careerResult[0] && careerResult[0].grew_up_in_ids) {
      try {
        careerResult[0].grew_up_in_ids = JSON.parse(careerResult[0].grew_up_in_ids);
      } catch (e) {
        careerResult[0].grew_up_in_ids = [];
      }
    }

    const locationResult = await query(
      `SELECT ld.*, c.city_name, s.state_name, co.country_name FROM location_details ld
       LEFT JOIN cities_master c ON ld.city_id = c.id
       LEFT JOIN states_master s ON ld.state_id = s.id
       LEFT JOIN country_code_master co ON ld.country_id = co.id
       WHERE ld.user_id = ?`,
      [userId]
    );

    const hobbies = await query(
      `SELECT hm.* FROM user_hobbies uh
       JOIN hobbies_master hm ON uh.hobby_id = hm.id
       WHERE uh.user_id = ?`,
      [userId]
    );

    const governmentIdResult = await query(
      `SELECT ugiv.id_type_id, ugiv.id_number, ugiv.is_verified, gitm.id_type_name
       FROM user_government_id_verification ugiv
       LEFT JOIN government_id_type_master gitm ON ugiv.id_type_id = gitm.id
       WHERE ugiv.user_id = ?`,
      [userId]
    );

    const [subscription] = await query(
      `SELECT us.*, sp.plan_name, sp.price, sp.duration_months,
              ssm.status_name as subscription_status
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
       LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
       WHERE us.user_id = ? AND us.subscription_status_id = 1
       ORDER BY us.created_at DESC LIMIT 1`,
      [userId]
    );

    const profileResponse = {
      success: true,
      profile: {
        basic: basicResult[0] || null,
        astro: astroResult[0] || null,
        family: familyResult[0] || null,
        career: careerResult[0] || null,
        location: locationResult[0] || null,
        hobbies: hobbies || [],
        government_id: governmentIdResult[0] || null,
        subscription: subscription || null
      },
    };

    console.log("\n📤 GET PROFILE RESPONSE for user_id:", userId);
    console.log("   basic:", JSON.stringify(basicResult[0] || null));
    console.log("   career:", JSON.stringify(careerResult[0] || null));
    console.log("   location:", JSON.stringify(locationResult[0] || null));
    console.log("   family:", familyResult[0] ? "✅ exists" : "❌ null");
    console.log("   astro:", astroResult[0] ? "✅ exists" : "❌ null");
    console.log("   hobbies count:", hobbies?.length || 0);
    console.log("   subscription:", subscription ? "✅ exists" : "❌ null");

    res.json(profileResponse);
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update User Profile
export async function updateProfile(req, res) {
  try {
    const userId = req.user.user_id;
    const {
      first_name,
      middle_name,
      last_name,
      height,
      weight,
      about_me,
      mother_tongue,
      occupation,
      company_name,
      annual_income,
    } = req.body;

    // Convert mother_tongue to integer or null
    const motherTongueId = mother_tongue ? parseInt(mother_tongue) || null : null;

    // Update profile
    await query(
      `UPDATE user_profiles SET first_name = ?, middle_name = ?, last_name = ?, height = ?,
       weight = ?, about_me = ?, mother_tongue_id = ? WHERE user_id = ?`,
      [first_name, middle_name || null, last_name, height, weight, about_me, motherTongueId, userId]
    );

    // Update career if provided
    if (occupation || company_name || annual_income) {
      const [existingCareer] = await query(
        "SELECT id FROM career_details WHERE user_id = ?",
        [userId]
      );

      if (existingCareer) {
        await query(
          "UPDATE career_details SET occupation = ?, company_name = ?, annual_income = ? WHERE user_id = ?",
          [occupation, company_name, annual_income, userId]
        );
      } else {
        await query(
          "INSERT INTO career_details (user_id, occupation, company_name, annual_income, currency_id) VALUES (?, ?, ?, ?, 1)",
          [userId, occupation, company_name, annual_income]
        );
      }
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Religious Information
export async function updateReligiousInfoOld(req, res) {
  try {
    const userId = req.user.user_id;
    const { religion_id, mother_tongue_id, community_id, caste_id, gothra_id } = req.body;

    if (!religion_id) {
      return res.status(400).json({
        success: false,
        message: "Religion ID is required",
      });
    }

    // Update user profile with religious information
    await query(
      `UPDATE user_profiles SET religion_id = ?, mother_tongue_id = ?, community_id = ?, caste_id = ?
       WHERE user_id = ?`,
      [religion_id, mother_tongue_id || null, community_id || null, caste_id || null, userId]
    );

    // Update or create astro details for gothra
    if (gothra_id) {
      const [existingAstro] = await query(
        "SELECT id FROM astro_details WHERE user_id = ?",
        [userId]
      );

      if (existingAstro) {
        await query(
          "UPDATE astro_details SET gothra_id = ? WHERE user_id = ?",
          [gothra_id, userId]
        );
      } else {
        await query(
          "INSERT INTO astro_details (user_id, gothra_id) VALUES (?, ?)",
          [userId, gothra_id]
        );
      }
    }

    res.json({
      success: true,
      message: "Religious information updated successfully",
    });
  } catch (error) {
    console.error("Update Religious Info Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Religious Information
export async function updateReligiousInfo(req, res) {
  try {
    const userId = req.user.user_id;
    const { religion_id, mother_tongue_id, community_id, caste_id, gothra_id } = req.body;

    const profileFields = definedFields({
      religion_id,
      mother_tongue_id,
      community_id,
      caste_id
    });
    if (Object.keys(profileFields).length > 0) {
      await upsertByUser("user_profiles", userId, profileFields);
    }

    const astroFields = definedFields({
      gothra_id,
      manglik_status: normalizeManglik(req.body.manglik_status)
    });
    if (Object.keys(astroFields).length > 0) {
      await upsertByUser("astro_details", userId, astroFields);
    }

    res.json({
      success: true,
      message: "Religious information updated successfully"
    });
  } catch (error) {
    console.error("Update Religious Info Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Government ID Verification
export async function updateGovernmentId(req, res) {
  try {
    const userId = req.user.user_id;
    const { id_type_id, id_number } = req.body;

    if (!id_type_id || !id_number) {
      return res.status(400).json({
        success: false,
        message: "ID type and ID number are required",
      });
    }

    // Check if record exists
    const [existing] = await query(
      "SELECT id FROM user_government_id_verification WHERE user_id = ?",
      [userId]
    );

    if (existing) {
      // Update existing record
      await query(
        "UPDATE user_government_id_verification SET id_type_id = ?, id_number = ?, is_verified = FALSE, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
        [id_type_id, id_number, userId]
      );
    } else {
      // Create new record
      await query(
        "INSERT INTO user_government_id_verification (user_id, id_type_id, id_number, is_verified) VALUES (?, ?, ?, FALSE)",
        [userId, id_type_id, id_number]
      );
    }

    res.json({
      success: true,
      message: "Government ID updated successfully",
    });
  } catch (error) {
    console.error("Update Government ID Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

async function markUserFullyVerified(userId) {
  await query(
    `UPDATE user_profiles
       SET aadhaar_verified = 1, pan_verified = 1, dl_verified = 1,
           document_verified = 1, verification_score = 100
     WHERE user_id = ?`,
    [userId]
  );

  await query(
    "UPDATE users SET phone_verified = 1 WHERE id = ?",
    [userId]
  );

  for (const docType of ["aadhaar", "pan", "driving_license"]) {
    const [existing] = await query(
      "SELECT id FROM document_verification WHERE user_id = ? AND document_type = ? LIMIT 1",
      [userId, docType]
    );
    if (existing) {
      await query(
        "UPDATE document_verification SET verification_status = 'verified', verified_at = NOW(), updated_at = NOW() WHERE id = ?",
        [existing.id]
      );
    } else {
      await query(
        "INSERT INTO document_verification (user_id, document_type, document_number, verification_status, verified_at) VALUES (?, ?, '', 'verified', NOW())",
        [userId, docType]
      );
    }
  }
}

export async function completeProfile(req, res) {
  try {
    const userId = req.user.user_id;
    await markUserFullyVerified(userId);
    res.json({
      success: true,
      message: "Profile completed successfully",
      profile: await getCompleteUserProfile(userId)
    });
  } catch (error) {
    console.error("Complete Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Master Data
export async function getMasterData(req, res) {
  try {
    const [religions, communities, castes, countries, countryCodes, states, cities, genders, maritalStatuses, educationLevels, currencies, familyStatuses, familyTypes, familyValues, generalStatuses, subscriptionPlans, subscriptionPlanFeatures, subscriptionStatuses, userStatuses, bloodGroups, diets, disabilities, healthInfo, gothras, parentOccupations, familyFinancialStatuses, workingWith, hobbies, motherTongues, professions, profileManagedBy, governmentIdTypes, reportReasons, ethnicOrigins, actionTypes, subscriptionAddons, hideDurations, deleteAccountReasons, drinkingTypes, smokingTypes, rasiTypes, nakshatraTypes, websiteContent, ceoContent] = await Promise.all([
      query("SELECT id, religion_name, user_status_id as status FROM religion_master WHERE user_status_id = 1 ORDER BY religion_name"),
      query("SELECT id, community_name, user_status_id as status FROM community_master WHERE user_status_id = 1 ORDER BY community_name"),
      query("SELECT id, caste_name, user_status_id as status FROM caste_master WHERE user_status_id = 1 ORDER BY caste_name"),
      query("SELECT * FROM country_code_master WHERE status = 1 ORDER BY country_name"),
      query("SELECT * FROM country_code_master WHERE status = 1 ORDER BY country_name"),
      query("SELECT * FROM states_master WHERE status = 1 ORDER BY state_name"),
      query("SELECT * FROM cities_master WHERE status = 1 AND city_name REGEXP '^[A-Za-z]' AND LENGTH(city_name) >= 3 AND city_name NOT REGEXP '^[0-9]+$' ORDER BY city_name"),
      query("SELECT * FROM gender_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM marital_status_master WHERE status = 1 AND status_name != 'Married' AND (description IS NULL OR description != 'Married') ORDER BY id"),
      query("SELECT * FROM education_level_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM currency_master WHERE status = 1 ORDER BY currency_name"),
      query("SELECT * FROM family_status_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM family_type_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM family_values_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM general_status_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM subscription_plans WHERE user_status_id = 1 ORDER BY id"),
      query("SELECT * FROM subscription_plan_features ORDER BY id"),
      query("SELECT * FROM subscription_status_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM user_status_master ORDER BY id"),
      query("SELECT * FROM blood_group_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM diet_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM disability_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM health_info_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM gothra_master WHERE status = 1 ORDER BY gothra_name"),
      query("SELECT * FROM parent_occupation_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM family_financial_status_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM working_with_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM hobbies_master WHERE status = 1 ORDER BY category, hobby_name"),
      query("SELECT * FROM mother_tongue_master WHERE status = 1 ORDER BY language_name"),
      query("SELECT * FROM profession_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM profile_managed_by_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM government_id_type_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM report_reasons_master WHERE status = 1 ORDER BY COALESCE(parent_id, id), CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, id"),
      query("SELECT * FROM ethnic_origin_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM action_types_master WHERE status = 1 ORDER BY id"),
      query("SELECT sam.*, cm.currency_code, cm.symbol FROM subscription_addons_master sam LEFT JOIN currency_master cm ON sam.currency_id = cm.id WHERE sam.is_active = 1 ORDER BY sam.price ASC"),
      query("SELECT * FROM hide_profile_duration_master WHERE status = 1 ORDER BY duration_days"),
      query("SELECT * FROM delete_account_reasons_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM drinking_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM smoking_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM rasi_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM nakshatra_master WHERE status = 1 ORDER BY id"),
      query("SELECT * FROM website_content ORDER BY id DESC LIMIT 1"),
      query("SELECT * FROM ceo_content ORDER BY id DESC LIMIT 1"),
    ]);

    res.json({
      success: true,
      data: {
        religions,
        communities,
        castes,
        countries,
        countryCodes,
        states,
        cities,
        genders,
        maritalStatuses,
        educationLevels,
        currencies,
        familyStatuses,
        familyTypes,
        familyValues,
        generalStatuses,
        subscriptionPlans,
        subscriptionPlanFeatures,
        subscriptionStatuses,
        userStatuses,
        bloodGroups,
        diets,
        disabilities,
        healthInfo,
        gothras,
        parentOccupations,
        familyFinancialStatuses,
        workingWith,
        hobbies,
        motherTongues,
        professions,
        profileManagedBy,
        governmentIdTypes,
        reportReasons,
        ethnicOrigins,
        actionTypes,
        subscriptionAddons,
        hideDurations,
        deleteAccountReasons,
        drinkingTypes,
        smokingTypes,
        rasiTypes,
        nakshatraTypes,
        websiteContent: websiteContent[0] || null,
        ceoContent: ceoContent[0] || null,
      },
    });
  } catch (error) {
    console.error("Get Master Data Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
// Get Subscription Restriction Status
export async function getSubscriptionRestrictionStatus(req, res) {
  try {
    const [general] = await query(
      `SELECT subscription_restrictions
       FROM general_settings
       LIMIT 1`
    );

    res.json({
      success: true,
      subscription_restrictions: Number(general?.subscription_restrictions || 0)
    });
  } catch (error) {
    console.error("Get Subscription Restriction Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
// Upload About Myself Audio
export async function uploadAboutMyselfAudio(req, res) {
  try {
    const userId = req.user.user_id;

    // Check if profile is managed by parent
    const [profile] = await query(
      "SELECT profile_created_by FROM user_profiles WHERE user_id = ?",
      [userId]
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found"
      });
    }

    if (profile.profile_created_by !== 'parent') {
      return res.status(403).json({
        success: false,
        message: "Audio upload is only allowed for profiles managed by parent"
      });
    }

    audioUpload(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              message: 'Audio file size must be less than 3MB'
            });
          }
        }
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No audio file provided'
        });
      }

      try {
        const fileExtension = path.extname(req.file.originalname);
        const fileName = `audio/about-myself/${userId}/${Date.now()}${fileExtension}`;

        // Upload to S3
        const uploadParams = {
          Bucket: BUCKET_NAME,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        };

        await s3Client.send(new PutObjectCommand(uploadParams));
        const audioUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

        // Save to database
        await query(
          "INSERT INTO user_audio_files (user_id, s3_path, file_size) VALUES (?, ?, ?)",
          [userId, audioUrl, req.file.size]
        );

        res.json({
          success: true,
          message: 'About myself audio uploaded successfully',
          data: {
            s3_path: audioUrl,
            file_size: req.file.size
          }
        });

      } catch (uploadError) {
        console.error('Audio upload error:', uploadError);
        res.status(500).json({
          success: false,
          message: 'Failed to upload audio file'
        });
      }
    });

  } catch (error) {
    console.error('Upload About Myself Audio Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Verify registration OTP. Keeps the old email behavior when email is supplied.
export async function verifyEmailOTP(req, res) {
  try {
    const { phone, otp } = req.body;
    if (!phone) {
      return verifyEmailOTPOld(req, res);
    }
    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "Phone and OTP are required"
      });
    }

    const [otpRecord] = await query(
      "SELECT id, otp_code FROM otp_verification WHERE contact_info = ? AND otp_type = 'registration' AND expires_at > NOW() AND is_verified = FALSE ORDER BY created_at DESC LIMIT 1",
      [phone]
    );

    if (!otpRecord || otpRecord.otp_code !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP"
      });
    }

    await query(
      "UPDATE otp_verification SET is_verified = TRUE, verified_at = NOW() WHERE id = ?",
      [otpRecord.id]
    );

    res.json({
      success: true,
      message: "OTP verified successfully",
      phone,
      profile_for: req.body.profile_for || null,
      country_code_id: req.body.country_code_id || 1
    });
  } catch (error) {
    console.error("Verify Registration OTP Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}