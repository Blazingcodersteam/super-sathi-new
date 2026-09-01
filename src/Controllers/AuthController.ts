import * as utils from "util";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcrypt";
import { sendMail } from "./SendMailController";
import { EmailService } from "./EmailService";
import { sendOtpSms } from "./SMSService";
import { generateUniqueVivahaId } from "./MatchActionsController";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const JWT_SECRET = process.env.JWT_SECRET_KEY;

// Generate OTP (6-digit)
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// // Send OTP Request
// export async function sendOTP(req, res) {
//   try {
//     const { email } = req.body;

//     if (!email) {
//       return res.status(400).json({
//         success: false,
//         message: "Email is required",
//       });
//     }

//     const [user] = await query(
//       "SELECT id, email FROM users WHERE email = ?",
//       [email]
//     );

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }

//     const otp = generateOTP();
//     const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

//     // Store OTP (in production, use Redis or separate OTP table)
//     await query(
//       "UPDATE users SET otp = ?, otp_expires_at = ? WHERE id = ?",
//       [otp, expiresAt, user.id]
//     );

//     console.log(`\n========================================`);
//     console.log(`🔑 LOGIN OTP`);
//     console.log(`   Email : ${email}`);
//     console.log(`   OTP   : ${otp}`);
//     console.log(`   Expires: ${expiresAt.toISOString()}`);
//     console.log(`========================================\n`);

//     try {
//       console.log(`Attempting to send OTP email to: ${email}`);
//       await EmailService.sendTemplateEmail(
//         'login_otp',
//         email,
//         { user_name: 'User', otp },
//         {
//           fallbackSubject: 'Your Login OTP - Vivaaha',
//           fallbackHtml: `<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2 style="color:#4CAF50">Vivaaha Login OTP</h2><p>Dear User,</p><p>Your One-Time Password (OTP) for login is:</p><div style="background-color:#f5f5f5;padding:15px;text-align:center;margin:20px 0"><h1 style="color:#4CAF50;font-size:32px;letter-spacing:5px;margin:0">${otp}</h1></div><p>This OTP is valid for <strong>5 minutes</strong> only.</p><p>If you didn't request this OTP, please ignore this email.</p></div>`,
//         }
//       );
//       console.log(`✅ SUCCESS: OTP email sent to ${email}`);
//     } catch (emailError) {
//       console.error(`❌ ERROR: Email sending failed to ${email}:`, emailError.message || emailError);
//     }

//     res.json({
//       success: true,
//       message: "OTP sent successfully",
//       email: user.email,
//       otp: otp,
//     });
//   } catch (error) {
//     console.error("Send OTP Error:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// }

export async function sendOTP(req, res) {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone is required",
      });
    }
    const [user] = await query(
      "SELECT id, phone FROM users WHERE phone = ? AND status != 4",
      [phone]
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Persist OTP on the user record (users.otp / users.otp_expires_at).
    await query(
      "UPDATE users SET otp = ?, otp_expires_at = ? WHERE id = ?",
      [otp, expiresAt, user.id]
    );

    // Deliver the OTP over SMS in real time.
    const sms = await sendOtpSms(user.phone, otp);

    // if (!sms.success) {
    //   return res.status(502).json({
    //     success: false,
    //     message: "Could not send OTP. Please try again.",
    //     error: sms.error,
    //   });
    // }

    res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error) {
    console.error("Send OTP Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Complete User Profile
async function getCompleteUserProfile(userId) {
  const [basicProfile] = await query(
    `SELECT u.id, u.email, u.phone, u.country_code_id, u.status, u.email_verified, u.phone_verified, u.vivaaha_user_id,
            up.*, r.religion_name, c.caste_name, g.gender_name, ms.status_name as marital_status,
            mt.language_name as mother_tongue, bg.blood_group, d.diet_name, dis.disability_name, hi.health_condition,
            CASE WHEN dv_aadhaar.verification_status = 'verified' OR up.aadhaar_verified = 1 THEN 1 ELSE 0 END as aadhaar_verified,
            CASE WHEN dv_pan.verification_status = 'verified' THEN 1 ELSE 0 END as pan_verified,
            CASE WHEN dv_dl.verification_status = 'verified' THEN 1 ELSE 0 END as dl_verified,
            CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name
     FROM users u
     LEFT JOIN user_profiles up ON u.id = up.user_id
     LEFT JOIN religion_master r ON up.religion_id = r.id
     LEFT JOIN caste_master c ON up.caste_id = c.id
     LEFT JOIN gender_master g ON up.gender_id = g.id
     LEFT JOIN marital_status_master ms ON up.marital_status_id = ms.id
     LEFT JOIN mother_tongue_master mt ON up.mother_tongue_id = mt.id
     LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
     LEFT JOIN diet_master d ON up.diet_id = d.id
     LEFT JOIN disability_master dis ON up.disability_id = dis.id
     LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
     LEFT JOIN document_verification dv_aadhaar ON u.id = dv_aadhaar.user_id AND dv_aadhaar.document_type = 'aadhaar' AND dv_aadhaar.verification_status = 'verified'
     LEFT JOIN document_verification dv_pan ON u.id = dv_pan.user_id AND dv_pan.document_type = 'pan' AND dv_pan.verification_status = 'verified'
     LEFT JOIN document_verification dv_dl ON u.id = dv_dl.user_id AND dv_dl.document_type = 'driving_license' AND dv_dl.verification_status = 'verified'
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
    `SELECT cd.*, ww.working_type, c.country_name as country_living, cur.currency_name, cur.symbol
     FROM career_details cd
     LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
     LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
     LEFT JOIN currency_master cur ON cd.currency_id = cur.id
     WHERE cd.user_id = ?`,
    [userId]
  );

  const [location] = await query(
    `SELECT ld.*, c.city_name FROM location_details ld
     LEFT JOIN cities_master c ON ld.city_id = c.id
     WHERE ld.user_id = ?`,
    [userId]
  );

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

// Login with Password
export async function loginWithPassword(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const [user] = await query(
      `SELECT u.id, u.email, u.password, u.status FROM users u WHERE u.email = ?`,
      [email]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with this email",
      });
    }

    if (user.status === 4) {
      return res.status(403).json({
        success: false,
        message: "This account has been deleted. Please contact support if this is a mistake.",
      });
    }

    if (user.status === 2) {
      return res.status(403).json({
        success: false,
        message: "This account has been deactivated. Please contact support to reactivate.",
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      { user_id: user.id, email: user.email, user_type: "user" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const completeProfile = await getCompleteUserProfile(user.id);

    res.json({
      success: true,
      message: "Login successful",
      token,
      profile: completeProfile,
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// // Login with OTP
// export async function loginWithOTP(req, res) {
//   try {
//     const { email, otp } = req.body;

//     if (!email || !otp) {
//       return res.status(400).json({
//         success: false,
//         message: "Email and OTP are required",
//       });
//     }

//     const [user] = await query(
//       `SELECT u.id, u.email, u.otp, u.otp_expires_at, u.status FROM users u WHERE u.email = ?`,
//       [email]
//     );

//     if (!user) {
//       return res.status(401).json({
//         success: false,
//         message: "Invalid credentials",
//       });
//     }

//     if (user.status === 4) {
//       return res.status(403).json({
//         success: false,
//         message: "This account has been deleted. Please contact support if this is a mistake.",
//       });
//     }

//     if (user.status === 2) {
//       return res.status(403).json({
//         success: false,
//         message: "This account has been deactivated. Please contact support to reactivate.",
//       });
//     }

//     if (!user.otp || user.otp !== otp) {
//       return res.status(401).json({
//         success: false,
//         message: "Invalid OTP",
//       });
//     }

//     if (new Date() > new Date(user.otp_expires_at)) {
//       return res.status(401).json({
//         success: false,
//         message: "OTP expired",
//       });
//     }

//     // Clear OTP after successful login
//     await query(
//       "UPDATE users SET otp = NULL, otp_expires_at = NULL WHERE id = ?",
//       [user.id]
//     );

//     const token = jwt.sign(
//       { user_id: user.id, email: user.email, user_type: "user" },
//       JWT_SECRET,
//       { expiresIn: "30d" }
//     );

//     const completeProfile = await getCompleteUserProfile(user.id);

//     res.json({
//       success: true,
//       message: "Login successful",
//       token,
//       profile: completeProfile,
//     });
//   } catch (error) {
//     console.error("OTP Login Error:", error);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// }


export async function loginWithOTP(req, res) {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required",
      });
    }

    const [user] = await query(
      `SELECT u.id, u.email, u.phone, u.status, u.otp, u.otp_expires_at FROM users u WHERE u.phone = ?`,
      [phone]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (user.status === 4) {
      return res.status(403).json({
        success: false,
        message: "This account has been deleted. Please contact support if this is a mistake.",
      });
    }

    if (user.status === 2) {
      return res.status(403).json({
        success: false,
        message: "This account has been deactivated. Please contact support to reactivate.",
      });
    }

    // Verify the OTP that was delivered over SMS.
    if (!user.otp || String(user.otp) !== String(otp)) {
      return res.status(401).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (!user.otp_expires_at || new Date() > new Date(user.otp_expires_at)) {
      return res.status(401).json({
        success: false,
        message: "OTP expired",
      });
    }

    // Clear OTP after successful login
    await query(
      "UPDATE users SET otp = NULL, otp_expires_at = NULL WHERE id = ?",
      [user.id]
    );

    // Mark the user verified on OTP login (no separate KYC step)
    await query(
      "UPDATE user_profiles SET aadhaar_verified = 1 WHERE user_id = ?",
      [user.id]
    );

    const token = jwt.sign(
      { user_id: user.id, email: user.email, user_type: "user" },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    const completeProfile = await getCompleteUserProfile(user.id);

    res.json({
      success: true,
      message: "Login successful",
      token,
      profile: completeProfile,
    });
  } catch (error) {
    console.error("OTP Login Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Logesh
// Allowed values for user_profiles.profile_created_by
const PROFILE_CREATED_BY = ['self', 'parent', 'sibling', 'relative', 'friend'];

/**
 * Registration step 1 — send an OTP to a NEW user's phone.
 *
 * The user submits the same fields captured at sign-up (profile_for, phone,
 * country_code_id). We generate + store a 'registration' OTP keyed by phone
 * (there is no user row yet, so it lives in otp_verification with user_id = 0)
 * and deliver it over SMS. Once the user enters the code, `afterotp` creates
 * the profile.
 */
export async function beforeOTP(req, res) {
  try {
    console.log("Before OTP - Send OTP Request Body:", req.body);

    const { profile_for, phone, country_code_id } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    // This is the new-user flow: reject numbers that are already registered.
    const [existingPhone] = await query(
      "SELECT id FROM users WHERE phone = ? AND status != 4",
      [phone]
    );
    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: "Phone number already registered. Please log in instead.",
        is_existing_user: true,
      });
    }

    // Generate + store the OTP (6-digit). No user row exists yet, so it is
    // stored against user_id = 0 with otp_type = 'registration', keyed by phone.
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Deliver the OTP over SMS in real time.
    const sms = await sendOtpSms(phone, otp);

    // if (!sms.success) {
    //   return res.status(502).json({
    //     success: false,
    //     message: "Could not send OTP. Please try again.",
    //     error: sms.error,
    //   });
    // }


    // Generate unique Vivaaha ID (system identifier used across the app for lookups)
    const vivahaUserId = await generateUniqueVivahaId();

    // Create the user record. Only phone + country_code_id are captured here;
    // every other column is left to its default / NULL (email, password, etc.).
    const userResult = await query(
      "INSERT INTO users (phone, country_code_id, vivaaha_user_id, user_type_id, status, phone_verified) VALUES (?, ?, ?, 1, 1, TRUE)",
      [phone, country_code_id || 1, vivahaUserId]
    );

    const userId = userResult.insertId;
    console.log("User created with ID:", userId);

    // Create the profile record storing only "profile is for".
    // Every other column is left to its default / NULL, except aadhaar_verified
    // which is set to 1 right after OTP verification (no separate KYC step) so
    // the user is immediately visible in search / matches / inbox.

    // Normalise "profile is for" to the allowed enum value
    const profileCreatedBy = PROFILE_CREATED_BY.includes(profile_for)
      ? profile_for
      : 'self';

    await query(
      "INSERT INTO user_profiles (user_id, profile_created_by, aadhaar_verified) VALUES (?, ?, 1)",
      [userId, profileCreatedBy]
    );

    // Persist OTP on the user record (users.otp / users.otp_expires_at).
    await query(
      "UPDATE users SET otp = ?, otp_expires_at = ? WHERE id = ?",
      [otp, expiresAt, userId]
    );

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      // Echo back the sign-up context so the client can pass it to afterotp.
      profile_for: profile_for || null,
      phone,
      country_code_id: country_code_id || 1,
    });
  } catch (error) {
    console.error("Before OTP Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function afterotp(req, res) {
  try {
    console.log("After OTP - Create Profile Request Body:", req.body);

    // Only these fields are captured at this step
    const { profile_for, phone, country_code_id } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    if (!JWT_SECRET) {
      console.error("JWT_SECRET not found in environment variables");
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      });
    }

    // Normalise "profile is for" to the allowed enum value
    const profileCreatedBy = PROFILE_CREATED_BY.includes(profile_for)
      ? profile_for
      : 'self';

    // Check if phone already exists (exclude soft-deleted users)
    const [existingPhone] = await query(
      "SELECT id FROM users WHERE phone = ? AND status != 4",
      [phone]
    );
    if (existingPhone) {
      // Phone already registered — return the existing user instead of erroring
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
        profile,
      });
    }

    // Generate unique Vivaaha ID (system identifier used across the app for lookups)
    const vivahaUserId = await generateUniqueVivahaId();

    // Create the user record. Only phone + country_code_id are captured here;
    // every other column is left to its default / NULL (email, password, etc.).
    const userResult = await query(
      "INSERT INTO users (phone, country_code_id, vivaaha_user_id, user_type_id, status, phone_verified) VALUES (?, ?, ?, 1, 1, TRUE)",
      [phone, country_code_id || 1, vivahaUserId]
    );

    const userId = userResult.insertId;
    console.log("User created with ID:", userId);

    // Create the profile record storing only "profile is for".
    // Every other column is left to its default / NULL, except aadhaar_verified
    // which is set to 1 right after OTP verification (no separate KYC step) so
    // the user is immediately visible in search / matches / inbox.
    await query(
      "INSERT INTO user_profiles (user_id, profile_created_by, aadhaar_verified) VALUES (?, ?, 1)",
      [userId, profileCreatedBy]
    );

    // Generate access token
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
      phone,
    });
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