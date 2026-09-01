"use strict";
// import * as utils from "util";
// import * as jwt from "jsonwebtoken";
// import * as crypto from "crypto";
// import { encodeBase64 } from "./Helper";
// import { sendMail } from "./SendMailController";
// import { EmailService } from "./EmailService";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOtp = sendOtp;
exports.verifyOtp = verifyOtp;
// const db = require("../database");
// const query = utils.promisify(db.query).bind(db);
// const dotenv = require("dotenv");
// const FormData = require("form-data");
// const JWT_SECRET = process.env.JWT_SECRET_KEY;
// export async function sendOtp(req, res) {
//   try {
//     const { email_id } = req.body;
//     if (!email_id) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Email is required" });
//     }
//     const userResult = await query(
//       `SELECT id FROM users WHERE email = ?`,
//       [email_id]
//     );
//     if (userResult.length === 0) {
//       return res
//         .status(200)
//         .json({ success: false, message: "Email not registered" });
//     }
//     const otp = Math.floor(1000 + Math.random() * 9000).toString();
//     const expiresAt = new Date(Date.now() + 1 * 60 * 1000); // 5 minutes from now
//     await query(
//       `INSERT INTO otp_verification (email_id, otp_code, expires_at) VALUES (?, ?, ?)`,
//       [email_id, otp, expiresAt]
//     );
//     try {
//       console.log(`Attempting to send OTP email to: ${email_id}`);
//       await EmailService.sendTemplateEmail(
//         'login_otp',
//         email_id,
//         { user_name: email_id, otp },
//         {
//           fallbackSubject: 'Your Login OTP - Vivaaha',
//           fallbackHtml: `<div style="font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto"><h2 style="color:#4CAF50">Vivaaha Login OTP</h2><p>Your One-Time Password (OTP) for login is:</p><div style="background-color:#f5f5f5;padding:15px;text-align:center;margin:20px 0"><h1 style="color:#4CAF50;font-size:32px;letter-spacing:5px;margin:0">${otp}</h1></div><p>This OTP is valid for <strong>5 minutes</strong> only.</p><p>If you didn't request this OTP, please ignore this email.</p></div>`,
//         }
//       );
//       console.log(`✅ SUCCESS: OTP email sent to ${email_id}`);
//     } catch (emailError) {
//       console.error(`❌ ERROR: Email sending failed to ${email_id}:`, emailError.message || emailError);
//     }
//     res.json({
//       success: true,
//       message: "OTP sent successfully",
//       otp: otp.toString(),
//     });
//   } catch (error) {
//     console.error("Error:", error);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// }
// export async function verifyOtp(req, res) {
//   const { email_id, otp_code } = req.body;
//   try {
//     const [otpRow] = await query(
//       `SELECT * FROM otp_verification
//          WHERE email_id = ? AND otp_code = ? AND is_verified = 'no'
//          ORDER BY created_at DESC LIMIT 1`,
//       [email_id, otp_code]
//     );
//     if (!otpRow) {
//       return res.status(400).json({ success: false, message: "Invalid OTP" });
//     }
//     if (new Date(otpRow.expires_at) < new Date()) {
//       return res.status(400).json({ success: false, message: "OTP expired" });
//     }
//     // Mark OTP as verified
//     await query(
//       `UPDATE otp_verification SET is_verified = 'yes' WHERE id = ?`,
//       [otpRow.id]
//     );
//     // Check if user exists
//     let [user] = await query(`SELECT * FROM users WHERE email = ? LIMIT 1`, [
//       email_id,
//     ]);
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found",
//       });
//     }
//     const token = jwt.sign(
//       {
//         user_id: user.id,
//         email_id: user.email,
//       },
//       JWT_SECRET,
//       { expiresIn: "5d" }
//     );
//     return res.json({
//       success: true,
//       message: "Login successful",
//       token,
//       user,
//     });
//   } catch (error) {
//     console.error("Verify OTP Error:", error);
//     return res.status(500).json({ success: false, message: "Server error" });
//   }
// }
const utils = require("util");
const SMSService_1 = require("./SMSService");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const JWT_SECRET = process.env.JWT_SECRET_KEY;
// OTP lives for 5 minutes. Kept short since it is delivered in real time.
const OTP_TTL_MS = 5 * 60 * 1000;
/**
 * Resolve the target user + phone number from the request body.
 * Accepts either `phone` (preferred, matches the SMS gateway) or `email_id`
 * (falls back to the phone number on the user's record).
 */
async function resolveRecipient(body) {
    const { phone, email_id } = body || {};
    if (phone) {
        const [user] = await query(`SELECT id, phone FROM users WHERE phone = ? AND status != 4 LIMIT 1`, [phone]);
        return { user, phone };
    }
    if (email_id) {
        const [user] = await query(`SELECT id, phone FROM users WHERE email = ? AND status != 4 LIMIT 1`, [email_id]);
        return { user, phone: user ? user.phone : null };
    }
    return { user: null, phone: null };
}
async function sendOtp(req, res) {
    try {
        // const { user, phone } = await resolveRecipient(req.body);
        const { phone } = req.body;
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: "Phone number is required",
            });
        }
        const [user] = await query(`SELECT id, phone FROM users WHERE phone = ? AND status != 4 LIMIT 1`, [phone]);
        if (user) {
            return res
                .status(200)
                .json({ success: false, message: "Phone number already registered" });
        }
        // 6-digit OTP (requires otp_verification.otp_code to be varchar(6) —
        // see migrations/widen_otp_code_to_6.sql).
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        console.log("[sendOtp] inserting OTP row", {
            phone,
            otpType: "phone",
            expiresAt,
        });
        const otpInsertResult = await query(`INSERT INTO otp_verification (user_id, otp_code, otp_type, contact_info, expires_at)
       VALUES (?, ?, 'phone', ?, ?)`, [0, otp, phone, expiresAt]);
        const insertedOtpId = otpInsertResult === null || otpInsertResult === void 0 ? void 0 : otpInsertResult.insertId;
        const [insertedOtp] = insertedOtpId
            ? await query(`SELECT id, user_id, otp_type, contact_info, expires_at, created_at
             FROM otp_verification WHERE id = ? LIMIT 1`, [insertedOtpId])
            : await query(`SELECT id, user_id, otp_type, contact_info, expires_at, created_at
             FROM otp_verification
            WHERE contact_info = ? AND otp_code = ? AND otp_type = 'phone'
            ORDER BY created_at DESC LIMIT 1`, [phone, otp]);
        console.log("[sendOtp] OTP insert result", {
            insertId: insertedOtpId,
            affectedRows: otpInsertResult === null || otpInsertResult === void 0 ? void 0 : otpInsertResult.affectedRows,
            inserted: Boolean(insertedOtp),
            row: insertedOtp || null,
        });
        // Deliver the OTP over SMS in real time.
        const sms = await (0, SMSService_1.sendOtpSms)(phone, otp);
        // if (!sms.success) {
        //   return res.status(502).json({
        //     success: false,
        //     message: "Could not send OTP. Please try again.",
        //     error: sms.error,
        //   });
        // }
        return res.json({
            success: true,
            message: "OTP sent successfully",
        });
    }
    catch (error) {
        console.error("Send OTP Error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}
async function verifyOtp(req, res) {
    try {
        const { phone, otp_code } = req.body;
        // const { user } = await resolveRecipient(req.body);
        if (!otp_code) {
            return res
                .status(400)
                .json({ success: false, message: "OTP is required" });
        }
        const [userdata] = await query(`SELECT id, expires_at FROM otp_verification
         WHERE contact_info = ? AND otp_type = 'phone' AND is_verified = 0
         ORDER BY created_at DESC LIMIT 1`, [phone]);
        if (!userdata) {
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        }
        const [otpRow] = await query(`SELECT id, expires_at FROM otp_verification
         WHERE contact_info = ? AND otp_code = ? AND otp_type = 'phone' AND is_verified = 0
         ORDER BY created_at DESC LIMIT 1`, [phone, otp_code]);
        if (!otpRow) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }
        if (new Date(otpRow.expires_at) < new Date()) {
            return res.status(400).json({ success: false, message: "OTP expired" });
        }
        // Mark this OTP as verified.
        await query(`UPDATE otp_verification SET is_verified = 1, verified_at = NOW() WHERE id = ?`, [otpRow.id]);
        // Load the full user record for the response / token.
        // const [fullUser] = await query(`SELECT * FROM users WHERE id = ? LIMIT 1`, [
        //   user.id,
        // ]);
        // const token = jwt.sign(
        //   {
        //     user_id: fullUser.id,
        //     email_id: fullUser.email,
        //     phone: fullUser.phone,
        //   },
        //   JWT_SECRET,
        //   { expiresIn: "5d" }
        // );
        return res.json({
            success: true,
            message: "OTP Verify successful",
        });
    }
    catch (error) {
        console.error("Verify OTP Error:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=OTPController.js.map