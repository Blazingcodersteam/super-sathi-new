"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOTP = sendOTP;
exports.verifyOTP = verifyOTP;
exports.resetPassword = resetPassword;
const utils = require("util");
const bcrypt = require("bcrypt");
const EmailService_1 = require("./EmailService");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Generate 4-digit OTP
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}
// Send OTP to Email
async function sendOTP(req, res) {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required",
            });
        }
        // Check if input is email or mobile
        const isEmail = email.includes('@');
        const searchField = isEmail ? 'email' : 'phone';
        // Check if user exists
        const [user] = await query(`SELECT id, email, phone FROM users WHERE ${searchField} = ?`, [email]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: `${isEmail ? 'Email' : 'Phone number'} not found`,
            });
        }
        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        // Delete old OTPs for this email
        await query("DELETE FROM password_reset_otps WHERE email = ?", [email]);
        // Save OTP to database
        await query("INSERT INTO password_reset_otps (user_id, email, otp, expires_at) VALUES (?, ?, ?, ?)", [user.id, email, otp, expiresAt]);
        // Send OTP via email if email is provided
        if (isEmail) {
            await EmailService_1.EmailService.sendTemplateEmail('password_reset', email, { user_name: user.first_name || email, otp }, {
                fallbackSubject: 'Password Reset OTP - Vivaaha',
                fallbackHtml: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>Password Reset OTP</h2><p>Your OTP for password reset is:</p><h1 style="color:#4CAF50;font-size:32px;letter-spacing:5px">${otp}</h1><p>This OTP will expire in 10 minutes.</p><p>If you didn't request this, please ignore this email.</p></div>`,
            });
        }
        res.json({
            success: true,
            message: isEmail ? "OTP sent to your email" : "OTP generated for phone",
            otp: otp, // Return OTP in response for testing (remove in production)
        });
    }
    catch (error) {
        console.error("Send OTP Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Verify OTP
async function verifyOTP(req, res) {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required",
            });
        }
        // Check OTP
        const [otpRecord] = await query("SELECT * FROM password_reset_otps WHERE email = ? AND otp = ? AND is_used = 0 AND expires_at > NOW()", [email, otp]);
        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP",
            });
        }
        res.json({
            success: true,
            message: "OTP verified successfully",
        });
    }
    catch (error) {
        console.error("Verify OTP Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Reset Password
async function resetPassword(req, res) {
    try {
        const { email, otp, new_password } = req.body;
        if (!email || !otp || !new_password) {
            return res.status(400).json({
                success: false,
                message: "Email, OTP, and new password are required",
            });
        }
        if (new_password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters",
            });
        }
        // Verify OTP
        const [otpRecord] = await query("SELECT * FROM password_reset_otps WHERE email = ? AND otp = ? AND is_used = 0 AND expires_at > NOW()", [email, otp]);
        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP",
            });
        }
        // Hash new password
        const hashedPassword = await bcrypt.hash(new_password, 10);
        // Update password
        await query("UPDATE users SET password = ? WHERE email = ?", [hashedPassword, email]);
        // Mark OTP as used
        await query("UPDATE password_reset_otps SET is_used = 1 WHERE id = ?", [otpRecord.id]);
        res.json({
            success: true,
            message: "Password reset successfully",
        });
    }
    catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=ForgotPasswordController.js.map