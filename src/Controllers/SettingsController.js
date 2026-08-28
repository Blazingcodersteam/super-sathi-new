"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPhoneUpdateOTP = sendPhoneUpdateOTP;
exports.updatePhoneWithOTP = updatePhoneWithOTP;
exports.sendEmailUpdateOTP = sendEmailUpdateOTP;
exports.updateEmailWithOTP = updateEmailWithOTP;
exports.getUserSettings = getUserSettings;
exports.updateProfileSettings = updateProfileSettings;
exports.updatePrivacySettings = updatePrivacySettings;
exports.updateNotificationSettings = updateNotificationSettings;
exports.updateAccountSettings = updateAccountSettings;
exports.changePassword = changePassword;
exports.deactivateAccount = deactivateAccount;
exports.deleteAccount = deleteAccount;
exports.blockUser = blockUser;
exports.getBlockedUsers = getBlockedUsers;
exports.updatePhotoPassword = updatePhotoPassword;
exports.getProfileCompletion = getProfileCompletion;
exports.updateShortlistSetting = updateShortlistSetting;
exports.updateDoNotDisturbSetting = updateDoNotDisturbSetting;
exports.updateProfilePrivacySetting = updateProfilePrivacySetting;
exports.getHideProfileDurations = getHideProfileDurations;
exports.hideProfile = hideProfile;
exports.unhideProfile = unhideProfile;
exports.getHideProfileStatus = getHideProfileStatus;
exports.deleteProfile = deleteProfile;
exports.updateContactSettings = updateContactSettings;
exports.updateContactFilterSettings = updateContactFilterSettings;
exports.updateEmailSmsAlertSettings = updateEmailSmsAlertSettings;
exports.getMessageTemplates = getMessageTemplates;
exports.updateMessageSettings = updateMessageSettings;
exports.updateIncomePrivacy = updateIncomePrivacy;
exports.updateDobPrivacy = updateDobPrivacy;
exports.updateContactFilterPrivacy = updateContactFilterPrivacy;
exports.updateEmailPrivacy = updateEmailPrivacy;
exports.updatePhonePrivacy = updatePhonePrivacy;
exports.updatePhotoPrivacy = updatePhotoPrivacy;
exports.updateContactFilterSettingsWithIds = updateContactFilterSettingsWithIds;
exports.updateDisplayNamePrivacy = updateDisplayNamePrivacy;
const utils = require("util");
const bcrypt = require("bcrypt");
const EmailService_1 = require("./EmailService");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Generate random 4-digit OTP
function generateOTP() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}
// Send OTP for Phone Update
async function sendPhoneUpdateOTP(req, res) {
    try {
        const userId = req.user.user_id;
        const { new_phone } = req.body;
        if (!new_phone) {
            return res.status(400).json({
                success: false,
                message: "New phone number is required"
            });
        }
        // Validate phone number format (basic validation)
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(new_phone)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid 10-digit phone number"
            });
        }
        // Check if new phone already exists
        const [existingPhone] = await query("SELECT id FROM users WHERE phone = ? AND id != ?", [new_phone, userId]);
        if (existingPhone) {
            return res.status(400).json({
                success: false,
                message: "Phone number already exists"
            });
        }
        // Get current user email
        const [user] = await query("SELECT email FROM users WHERE id = ?", [userId]);
        if (!user || !user.email) {
            return res.status(400).json({
                success: false,
                message: "User email not found"
            });
        }
        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        // Store OTP with new phone as contact_info
        await query("INSERT INTO otp_verification (user_id, otp_code, otp_type, contact_info, expires_at) VALUES (?, ?, 'phone', ?, ?) ON DUPLICATE KEY UPDATE otp_code = VALUES(otp_code), contact_info = VALUES(contact_info), expires_at = VALUES(expires_at), created_at = NOW()", [userId, otp, new_phone, expiresAt]);
        // Send OTP to user's current email
        try {
            await EmailService_1.EmailService.sendTemplateEmail('phone_update_otp', user.email, { user_name: user.first_name || user.email, otp, new_phone }, {
                fallbackSubject: 'Phone Number Update Verification - OTP',
                fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#d63384">Phone Number Update Verification</h2><p>You have requested to update your phone number to: <strong>${new_phone}</strong></p><p>Your OTP is:</p><div style="background:#f8f9fa;padding:20px;border-radius:5px;margin:20px 0;text-align:center"><h1 style="font-family:monospace;color:#d63384;margin:0">${otp}</h1></div><p>This OTP will expire in 10 minutes.</p></div>`,
            });
            res.json({
                success: true,
                message: "OTP sent successfully to your email for phone number verification",
                new_phone: new_phone,
                email_sent_to: user.email
            });
        }
        catch (emailError) {
            console.error("Email sending failed:", emailError);
            res.status(500).json({
                success: false,
                message: "Failed to send OTP email"
            });
        }
    }
    catch (error) {
        console.error("Send Phone Update OTP Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Phone with OTP Verification
async function updatePhoneWithOTP(req, res) {
    try {
        const userId = req.user.user_id;
        const { new_phone, otp } = req.body;
        if (!new_phone || !otp) {
            return res.status(400).json({
                success: false,
                message: "New phone number and OTP are required"
            });
        }
        // Verify OTP
        const [otpRecord] = await query("SELECT otp_code, expires_at, contact_info FROM otp_verification WHERE user_id = ? AND otp_type = 'phone' AND expires_at > NOW() AND is_verified = FALSE ORDER BY created_at DESC LIMIT 1", [userId]);
        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }
        if (otpRecord.otp_code !== otp || otpRecord.contact_info !== new_phone) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP or phone number mismatch"
            });
        }
        // Check if new phone still doesn't exist (double check)
        const [existingPhone] = await query("SELECT id FROM users WHERE phone = ? AND id != ?", [new_phone, userId]);
        if (existingPhone) {
            return res.status(400).json({
                success: false,
                message: "Phone number already exists"
            });
        }
        // Update phone number
        await query("UPDATE users SET phone = ?, phone_verified = TRUE WHERE id = ?", [new_phone, userId]);
        // Mark OTP as verified
        await query("UPDATE otp_verification SET is_verified = TRUE, verified_at = NOW() WHERE user_id = ? AND otp_type = 'phone'", [userId]);
        res.json({
            success: true,
            message: "Phone number updated successfully",
            new_phone: new_phone
        });
    }
    catch (error) {
        console.error("Update Phone with OTP Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Send OTP for Email Update
async function sendEmailUpdateOTP(req, res) {
    try {
        const userId = req.user.user_id;
        const { new_email } = req.body;
        if (!new_email) {
            return res.status(400).json({
                success: false,
                message: "New email is required"
            });
        }
        // Check if new email already exists
        const [existingEmail] = await query("SELECT id FROM users WHERE email = ? AND id != ?", [new_email, userId]);
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: "Email already exists"
            });
        }
        // Get current user email
        const [user] = await query("SELECT email FROM users WHERE id = ?", [userId]);
        if (!user || !user.email) {
            return res.status(400).json({
                success: false,
                message: "Current email not found"
            });
        }
        // Generate OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        // Store OTP with new email as contact_info
        await query("INSERT INTO otp_verification (user_id, otp_code, otp_type, contact_info, expires_at) VALUES (?, ?, 'email_verification', ?, ?) ON DUPLICATE KEY UPDATE otp_code = VALUES(otp_code), contact_info = VALUES(contact_info), expires_at = VALUES(expires_at), created_at = NOW()", [userId, otp, new_email, expiresAt]);
        // Send OTP to current email
        try {
            await EmailService_1.EmailService.sendTemplateEmail('email_update_otp', user.email, { user_name: user.first_name || user.email, otp, new_email }, {
                fallbackSubject: 'Email Update Verification - OTP',
                fallbackHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#d63384">Email Update Verification</h2><p>You have requested to update your email to: <strong>${new_email}</strong></p><p>Your OTP is:</p><div style="background:#f8f9fa;padding:20px;border-radius:5px;margin:20px 0;text-align:center"><h1 style="font-family:monospace;color:#d63384;margin:0">${otp}</h1></div><p>This OTP will expire in 10 minutes.</p></div>`,
            });
            res.json({
                success: true,
                message: "OTP sent successfully to your current email",
                current_email: user.email,
                otp: otp
            });
        }
        catch (emailError) {
            console.error("Email sending failed:", emailError);
            res.status(500).json({
                success: false,
                message: "Failed to send OTP email"
            });
        }
    }
    catch (error) {
        console.error("Send Email Update OTP Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Email with OTP Verification
async function updateEmailWithOTP(req, res) {
    try {
        const userId = req.user.user_id;
        const { new_email, otp } = req.body;
        if (!new_email || !otp) {
            return res.status(400).json({
                success: false,
                message: "New email and OTP are required"
            });
        }
        // Verify OTP
        const [otpRecord] = await query("SELECT otp_code, expires_at, contact_info FROM otp_verification WHERE user_id = ? AND otp_type = 'email_verification' AND expires_at > NOW() AND is_verified = FALSE ORDER BY created_at DESC LIMIT 1", [userId]);
        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired OTP"
            });
        }
        if (otpRecord.otp_code !== otp || otpRecord.contact_info !== new_email) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP or email mismatch"
            });
        }
        // Check if new email still doesn't exist (double check)
        const [existingEmail] = await query("SELECT id FROM users WHERE email = ? AND id != ?", [new_email, userId]);
        if (existingEmail) {
            return res.status(400).json({
                success: false,
                message: "Email already exists"
            });
        }
        // Update email
        await query("UPDATE users SET email = ? WHERE id = ?", [new_email, userId]);
        // Mark OTP as verified
        await query("UPDATE otp_verification SET is_verified = TRUE, verified_at = NOW() WHERE user_id = ? AND otp_type = 'email_verification'", [userId]);
        res.json({
            success: true,
            message: "Email updated successfully",
            new_email: new_email
        });
    }
    catch (error) {
        console.error("Update Email with OTP Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get User Settings
async function getUserSettings(req, res) {
    try {
        const userId = req.user.user_id;
        // Get basic profile with all new fields including user email and phone
        const [profile] = await query(`SELECT up.*, u.email, u.phone, bg.blood_group, dis.disability_name, hi.health_condition,
              up.diet_id, us.contact_display_status
       FROM user_profiles up
       LEFT JOIN users u ON up.user_id = u.id
       LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
       LEFT JOIN disability_master dis ON up.disability_id = dis.id
       LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
       LEFT JOIN user_settings us ON up.user_id = us.user_id
       WHERE up.user_id = ?`, [userId]);
        // Get diet names for diet_id array
        let diet_names = [];
        if (profile && profile.diet_id) {
            const dietIds = JSON.parse(profile.diet_id);
            if (Array.isArray(dietIds) && dietIds.length > 0) {
                const dietResults = await query(`SELECT diet_name FROM diet_master WHERE id IN (${dietIds.map(() => '?').join(',')})`, dietIds);
                diet_names = dietResults.map(d => d.diet_name);
            }
        }
        if (profile) {
            profile.diet_names = diet_names;
        }
        // Get astro details
        const [astro] = await query(`SELECT ad.*, g.gothra_name, c.country_name
       FROM astro_details ad
       LEFT JOIN gothra_master g ON ad.gothra_id = g.id
       LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
       WHERE ad.user_id = ?`, [userId]);
        // Get family details
        const [family] = await query(`SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
              ffs.status_name as financial_status, c.country_name as family_country
       FROM family_details fd
       LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
       LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
       LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
       LEFT JOIN country_code_master c ON fd.family_country_id = c.id
       WHERE fd.user_id = ?`, [userId]);
        // Get career details
        const [career] = await query(`SELECT cd.*, ww.working_type, c.country_name as country_living
       FROM career_details cd
       LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
       LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
       WHERE cd.user_id = ?`, [userId]);
        // Parse grew_up_in_ids JSON string to array in career
        if (career && career.grew_up_in_ids) {
            try {
                career.grew_up_in_ids = JSON.parse(career.grew_up_in_ids);
            }
            catch (e) {
                career.grew_up_in_ids = [];
            }
        }
        // Get location details with grew_up_in and ethnic_origin from career_details
        const [location] = await query(`SELECT ld.*, c.city_name, s.state_name, co.country_name, cd.grew_up_in_ids, cd.ethnic_origin_id, eo.origin_name as ethnic_origin_name
       FROM location_details ld
       LEFT JOIN cities_master c ON ld.city_id = c.id
       LEFT JOIN states_master s ON ld.state_id = s.id
       LEFT JOIN country_code_master co ON ld.country_id = co.id
       LEFT JOIN career_details cd ON ld.user_id = cd.user_id
       LEFT JOIN ethnic_origin_master eo ON cd.ethnic_origin_id = eo.id
       WHERE ld.user_id = ?`, [userId]);
        // Parse grew_up_in_ids JSON string to array
        if (location && location.grew_up_in_ids) {
            try {
                location.grew_up_in_ids = JSON.parse(location.grew_up_in_ids);
            }
            catch (e) {
                location.grew_up_in_ids = [];
            }
        }
        // Get hobbies
        const hobbies = await query(`SELECT hm.* FROM user_hobbies uh
       JOIN hobbies_master hm ON uh.hobby_id = hm.id
       WHERE uh.user_id = ?`, [userId]);
        // Combine all profile data
        const completeProfile = {
            basic: profile || {},
            astro: astro || {},
            family: family || {},
            career: career || {},
            location: location || {},
            hobbies: hobbies || []
        };
        const [contactFilterSettings] = await query("SELECT * FROM contact_filter_settings WHERE user_id = ?", [userId]);
        const [emailSmsSettings] = await query("SELECT * FROM email_sms_settings WHERE user_id = ?", [userId]);
        const [privacySettings] = await query("SELECT * FROM privacy_settings WHERE user_id = ?", [userId]);
        const [notificationSettings] = await query("SELECT * FROM notification_settings WHERE user_id = ?", [userId]);
        const [accountSettings] = await query("SELECT * FROM account_settings WHERE user_id = ?", [userId]);
        // Get user's selected message template IDs
        const [messageSettings] = await query("SELECT * FROM user_message_settings WHERE user_id = ?", [userId]);
        res.json({
            success: true,
            settings: {
                profile: completeProfile,
                contact_filters: contactFilterSettings || {},
                email_sms: emailSmsSettings || {},
                privacy: privacySettings || {},
                notifications: notificationSettings || {},
                account: accountSettings || {},
                message_settings: messageSettings || {
                    connect_message_id: 1,
                    accept_message_id: 4,
                    remind_message_id: 5
                }
            }
        });
    }
    catch (error) {
        console.error("Get Settings Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Profile Settings
async function updateProfileSettings(req, res) {
    try {
        const userId = req.user.user_id;
        const { contact_display_status } = req.body;
        const [existing] = await query("SELECT id FROM user_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query(`UPDATE user_settings SET
         contact_display_status = ?
         WHERE user_id = ?`, [contact_display_status, userId]);
        }
        else {
            await query(`INSERT INTO user_settings (user_id, contact_display_status)
         VALUES (?, ?)`, [userId, contact_display_status]);
        }
        res.json({
            success: true,
            message: "Profile settings updated successfully"
        });
    }
    catch (error) {
        console.error("Update Profile Settings Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Privacy Settings
async function updatePrivacySettings(req, res) {
    try {
        const userId = req.user.user_id;
        const body = req.body;
        // Build dynamic SET clause — only update fields that are present in the request body
        const ALLOWED_FIELDS = [
            'display_name_privacy',
            'profile_photo_privacy',
            'album_photo_privacy',
            'phone_privacy',
            'email_privacy',
            'contact_filter_privacy',
            'dob_privacy',
            'income_privacy',
            'shortlist_privacy',
            'shortlist_visibility',
            'do_not_disturb',
            'allow_premium_calls',
            'dnd_start_time',
            'dnd_end_time',
            'profile_visibility',
            'video_call_enabled',
            'voice_call_enabled',
            'availability_time_slot',
            'availability_start_time',
            'availability_end_time',
            'availability_days',
        ];
        const updateFields = [];
        const updateValues = [];
        for (const field of ALLOWED_FIELDS) {
            if (body[field] !== undefined) {
                updateFields.push(`${field} = ?`);
                updateValues.push(body[field]);
            }
        }
        // JSON fields — only update if explicitly provided
        if (body.block_users !== undefined) {
            updateFields.push('block_users = ?');
            updateValues.push(JSON.stringify(body.block_users || []));
        }
        if (body.hide_profile_from !== undefined) {
            updateFields.push('hide_profile_from = ?');
            updateValues.push(JSON.stringify(body.hide_profile_from || []));
        }
        if (body.restricted_countries !== undefined) {
            updateFields.push('restricted_countries = ?');
            updateValues.push(JSON.stringify(body.restricted_countries || []));
        }
        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields provided to update' });
        }
        const [existing] = await query('SELECT id FROM privacy_settings WHERE user_id = ?', [userId]);
        if (existing) {
            // UPDATE — only touch the fields that were sent
            await query(`UPDATE privacy_settings SET ${updateFields.join(', ')} WHERE user_id = ?`, [...updateValues, userId]);
        }
        else {
            // INSERT — use provided values, DB defaults fill the rest
            const columns = updateFields.map(f => f.split(' = ?')[0]);
            await query(`INSERT INTO privacy_settings (user_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`, [userId, ...updateValues]);
        }
        res.json({ success: true, message: 'Privacy settings updated successfully' });
    }
    catch (error) {
        console.error('Update Privacy Settings Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
// Update Notification Settings
async function updateNotificationSettings(req, res) {
    try {
        const userId = req.user.user_id;
        const { new_matches, profile_views, messages, interests_received, interests_accepted, photo_requests, contact_requests, horoscope_requests, membership_expiry, promotional_emails, weekly_digest } = req.body;
        const [existing] = await query("SELECT id FROM notification_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query(`UPDATE notification_settings SET
         new_matches = ?, profile_views = ?, messages = ?, interests_received = ?,
         interests_accepted = ?, photo_requests = ?, contact_requests = ?,
         horoscope_requests = ?, membership_expiry = ?, promotional_emails = ?,
         weekly_digest = ?
         WHERE user_id = ?`, [new_matches, profile_views, messages, interests_received, interests_accepted,
                photo_requests, contact_requests, horoscope_requests, membership_expiry,
                promotional_emails, weekly_digest, userId]);
        }
        else {
            await query(`INSERT INTO notification_settings (user_id, new_matches, profile_views, messages,
         interests_received, interests_accepted, photo_requests, contact_requests,
         horoscope_requests, membership_expiry, promotional_emails, weekly_digest)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, new_matches, profile_views, messages, interests_received, interests_accepted,
                photo_requests, contact_requests, horoscope_requests, membership_expiry,
                promotional_emails, weekly_digest]);
        }
        res.json({
            success: true,
            message: "Notification settings updated successfully"
        });
    }
    catch (error) {
        console.error("Update Notification Settings Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Account Settings (now handles email update with OTP)
async function updateAccountSettings(req, res) {
    try {
        const userId = req.user.user_id;
        const { email, otp, two_factor_enabled, login_alerts, session_timeout } = req.body;
        // If email is provided, verify OTP first
        if (email) {
            if (!otp) {
                return res.status(400).json({
                    success: false,
                    message: "OTP is required for email update"
                });
            }
            // Verify OTP
            const [otpRecord] = await query("SELECT otp_code, expires_at, contact_info FROM otp_verification WHERE user_id = ? AND otp_type = 'email_verification' AND expires_at > NOW() AND is_verified = FALSE ORDER BY created_at DESC LIMIT 1", [userId]);
            if (!otpRecord) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid or expired OTP"
                });
            }
            if (otpRecord.otp_code !== otp || otpRecord.contact_info !== email) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid OTP or email mismatch"
                });
            }
            // Update email
            await query("UPDATE users SET email = ? WHERE id = ?", [email, userId]);
            // Mark OTP as verified
            await query("UPDATE otp_verification SET is_verified = TRUE, verified_at = NOW() WHERE user_id = ? AND otp_type = 'email_verification'", [userId]);
        }
        // Update account settings
        const [accountExists] = await query("SELECT id FROM account_settings WHERE user_id = ?", [userId]);
        if (accountExists) {
            await query(`UPDATE account_settings SET
         two_factor_enabled = ?, login_alerts = ?, session_timeout = ?
         WHERE user_id = ?`, [two_factor_enabled, login_alerts, session_timeout, userId]);
        }
        else {
            await query(`INSERT INTO account_settings (user_id, two_factor_enabled, login_alerts, session_timeout)
         VALUES (?, ?, ?, ?)`, [userId, two_factor_enabled, login_alerts, session_timeout]);
        }
        res.json({
            success: true,
            message: email ? "Email and account settings updated successfully" : "Account settings updated successfully"
        });
    }
    catch (error) {
        console.error("Update Account Settings Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Change Password
async function changePassword(req, res) {
    try {
        const userId = req.user.user_id;
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) {
            return res.status(400).json({
                success: false,
                message: "Current password and new password are required"
            });
        }
        // Get current password
        const [user] = await query("SELECT password FROM users WHERE id = ?", [userId]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        // Verify current password
        const isValidPassword = await bcrypt.compare(current_password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                message: "Current password is incorrect"
            });
        }
        // Hash new password
        const hashedNewPassword = await bcrypt.hash(new_password, 10);
        // Update password
        await query("UPDATE users SET password = ? WHERE id = ?", [hashedNewPassword, userId]);
        // Update account settings
        await query(`INSERT INTO account_settings (user_id, password_changed_at)
       VALUES (?, NOW())
       ON DUPLICATE KEY UPDATE password_changed_at = NOW()`, [userId]);
        res.json({
            success: true,
            message: "Password changed successfully"
        });
    }
    catch (error) {
        console.error("Change Password Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Deactivate Account
async function deactivateAccount(req, res) {
    try {
        const userId = req.user.user_id;
        const { reason } = req.body;
        // Update account settings
        await query(`INSERT INTO account_settings (user_id, account_deactivated, deactivation_reason, deactivated_at)
       VALUES (?, TRUE, ?, NOW())
       ON DUPLICATE KEY UPDATE
       account_deactivated = TRUE, deactivation_reason = ?, deactivated_at = NOW()`, [userId, reason, reason]);
        // Update user status
        await query("UPDATE users SET status = 2 WHERE id = ?", // 2 = Inactive
        [userId]);
        res.json({
            success: true,
            message: "Account deactivated successfully"
        });
    }
    catch (error) {
        console.error("Deactivate Account Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Delete Account with Reason
async function deleteAccount(req, res) {
    try {
        const userId = req.user.user_id;
        const { reason_id, additional_feedback } = req.body;
        if (!reason_id) {
            return res.status(400).json({
                success: false,
                message: "Reason is required to delete account"
            });
        }
        // Verify reason exists
        const [reason] = await query("SELECT * FROM delete_account_reasons_master WHERE id = ?", [reason_id]);
        if (!reason) {
            return res.status(400).json({
                success: false,
                message: "Invalid reason selected"
            });
        }
        // Ensure user_account_deletion table exists
        await query(`
      CREATE TABLE IF NOT EXISTS user_account_deletion (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        reason_id INT NOT NULL,
        additional_feedback TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Record deletion reason
        await query("INSERT INTO user_account_deletion (user_id, reason_id, additional_feedback) VALUES (?, ?, ?)", [userId, reason_id, additional_feedback || null]);
        // Free up email/phone so the user can re-register with the same credentials
        await query("UPDATE users SET email = CONCAT(email, '_deleted_', id), phone = CASE WHEN phone IS NOT NULL THEN LEFT(CONCAT(phone, '_d', id), 20) ELSE NULL END, status = 4 WHERE id = ?", [userId]);
        // Clean up OTP verification records for this user so re-registration is not blocked
        await query("DELETE FROM otp_verification WHERE user_id = ?", [userId]);
        res.json({
            success: true,
            message: "Account deleted successfully"
        });
    }
    catch (error) {
        console.error("Delete Account Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Block/Unblock User
async function blockUser(req, res) {
    try {
        const userId = req.user.user_id;
        const { user_id_to_block, action } = req.body; // action: 'block' or 'unblock'
        if (!user_id_to_block) {
            return res.status(400).json({ success: false, message: 'user_id_to_block is required' });
        }
        const [existing] = await query("SELECT block_users FROM privacy_settings WHERE user_id = ?", [userId]);
        let blockedUsers = [];
        if (existing && existing.block_users) {
            blockedUsers = JSON.parse(existing.block_users);
        }
        if (action === 'block') {
            if (!blockedUsers.includes(user_id_to_block)) {
                blockedUsers.push(user_id_to_block);
            }
            // Also insert into user_actions for bidirectional block consistency
            await query(`INSERT IGNORE INTO user_actions (user_id, target_user_id, action_type_id) VALUES (?, ?, 3)`, [userId, user_id_to_block]);
        }
        else if (action === 'unblock') {
            blockedUsers = blockedUsers.filter(id => id !== user_id_to_block);
            // Also remove from user_actions
            await query(`DELETE FROM user_actions WHERE user_id = ? AND target_user_id = ? AND action_type_id = 3`, [userId, user_id_to_block]);
        }
        if (existing) {
            await query("UPDATE privacy_settings SET block_users = ? WHERE user_id = ?", [JSON.stringify(blockedUsers), userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, block_users) VALUES (?, ?)", [userId, JSON.stringify(blockedUsers)]);
        }
        res.json({
            success: true,
            message: `User ${action === 'block' ? 'blocked' : 'unblocked'} successfully`
        });
    }
    catch (error) {
        console.error("Block User Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Blocked Users List
async function getBlockedUsers(req, res) {
    try {
        const userId = req.user.user_id;
        const [privacySettings] = await query("SELECT block_users FROM privacy_settings WHERE user_id = ?", [userId]);
        let blockedUserIds = [];
        if (privacySettings && privacySettings.block_users) {
            blockedUserIds = JSON.parse(privacySettings.block_users);
        }
        if (blockedUserIds.length === 0) {
            return res.json({
                success: true,
                blocked_users: []
            });
        }
        // Get blocked users details
        const blockedUsers = await query(`SELECT u.id, up.first_name, up.last_name, up.profile_picture
       FROM users u
       JOIN user_profiles up ON u.id = up.user_id
       WHERE u.id IN (${blockedUserIds.map(() => '?').join(',')})`, blockedUserIds);
        res.json({
            success: true,
            blocked_users: blockedUsers
        });
    }
    catch (error) {
        console.error("Get Blocked Users Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Photo Password
async function updatePhotoPassword(req, res) {
    try {
        const userId = req.user.user_id;
        const { photo_password, enable_password_protection } = req.body;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET photo_password_protected = ?, photo_password = ? WHERE user_id = ?", [enable_password_protection, photo_password, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, photo_password_protected, photo_password) VALUES (?, ?, ?)", [userId, enable_password_protection, photo_password]);
        }
        res.json({
            success: true,
            message: "Photo password updated successfully"
        });
    }
    catch (error) {
        console.error("Update Photo Password Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Profile Completion Status
async function getProfileCompletion(req, res) {
    try {
        const userId = req.user.user_id;
        const [accountSettings] = await query("SELECT profile_completion_percentage, mandatory_fields_completed FROM account_settings WHERE user_id = ?", [userId]);
        // Calculate profile completion if not stored
        let completionPercentage = 0;
        let mandatoryCompleted = false;
        if (accountSettings) {
            completionPercentage = accountSettings.profile_completion_percentage || 0;
            mandatoryCompleted = accountSettings.mandatory_fields_completed || false;
        }
        res.json({
            success: true,
            profile_completion: {
                percentage: completionPercentage,
                mandatory_fields_completed: mandatoryCompleted
            }
        });
    }
    catch (error) {
        console.error("Get Profile Completion Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Shortlist Visibility Setting
async function updateShortlistSetting(req, res) {
    try {
        const userId = req.user.user_id;
        const { shortlist_visibility } = req.body;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET shortlist_visibility = ? WHERE user_id = ?", [shortlist_visibility, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, shortlist_visibility) VALUES (?, ?)", [userId, shortlist_visibility]);
        }
        res.json({
            success: true,
            message: "Shortlist setting updated successfully"
        });
    }
    catch (error) {
        console.error("Update Shortlist Setting Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Do Not Disturb Setting
async function updateDoNotDisturbSetting(req, res) {
    try {
        const userId = req.user.user_id;
        const { allow_premium_calls } = req.body;
        const do_not_disturb = allow_premium_calls ? 1 : 0;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET allow_premium_calls = ?, do_not_disturb = ? WHERE user_id = ?", [allow_premium_calls, do_not_disturb, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, allow_premium_calls, do_not_disturb) VALUES (?, ?, ?)", [userId, allow_premium_calls, do_not_disturb]);
        }
        res.json({
            success: true,
            message: "Do not disturb setting updated successfully"
        });
    }
    catch (error) {
        console.error("Update Do Not Disturb Setting Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Profile Privacy Setting
async function updateProfilePrivacySetting(req, res) {
    try {
        const userId = req.user.user_id;
        const { profile_visibility } = req.body;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET profile_visibility = ? WHERE user_id = ?", [profile_visibility, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, profile_visibility) VALUES (?, ?)", [userId, profile_visibility]);
        }
        res.json({
            success: true,
            message: "Profile privacy setting updated successfully"
        });
    }
    catch (error) {
        console.error("Update Profile Privacy Setting Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Hide Profile Duration Options
async function getHideProfileDurations(req, res) {
    try {
        const durations = await query("SELECT * FROM hide_profile_duration_master ORDER BY duration_days ASC");
        res.json({
            success: true,
            durations
        });
    }
    catch (error) {
        console.error("Get Hide Profile Durations Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Hide Profile with Duration
async function hideProfile(req, res) {
    try {
        const userId = req.user.user_id;
        const { duration_id } = req.body;
        if (!duration_id) {
            return res.status(400).json({
                success: false,
                message: "Duration ID is required"
            });
        }
        // Get duration details
        const [duration] = await query("SELECT * FROM hide_profile_duration_master WHERE id = ?", [duration_id]);
        if (!duration) {
            return res.status(404).json({
                success: false,
                message: "Invalid duration selected"
            });
        }
        // Check if user already has active hide profile
        const [existing] = await query("SELECT * FROM user_hide_profile WHERE user_id = ? AND is_active = TRUE AND hide_end_date > NOW()", [userId]);
        if (existing) {
            return res.status(400).json({
                success: false,
                message: "Profile is already hidden. Please unhide first to change duration."
            });
        }
        // Calculate end date
        const hideEndDate = new Date();
        hideEndDate.setDate(hideEndDate.getDate() + duration.duration_days);
        // Deactivate any existing hide profile records
        await query("UPDATE user_hide_profile SET is_active = FALSE WHERE user_id = ?", [userId]);
        // Upsert — reuse existing row if one exists, otherwise insert
        const [anyRow] = await query("SELECT id FROM user_hide_profile WHERE user_id = ? ORDER BY id DESC LIMIT 1", [userId]);
        if (anyRow) {
            // Reuse the latest row — update it
            await query("UPDATE user_hide_profile SET duration_id = ?, hide_end_date = ?, is_active = TRUE, hide_start_date = NOW(), updated_at = NOW() WHERE id = ?", [duration_id, hideEndDate, anyRow.id]);
        }
        else {
            // First time — insert
            await query("INSERT INTO user_hide_profile (user_id, duration_id, hide_end_date) VALUES (?, ?, ?)", [userId, duration_id, hideEndDate]);
        }
        res.json({
            success: true,
            message: `Profile hidden for ${duration.duration_name}`,
            hide_until: hideEndDate
        });
    }
    catch (error) {
        console.error("Hide Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Unhide Profile
async function unhideProfile(req, res) {
    try {
        const userId = req.user.user_id;
        // Deactivate current hide profile
        await query("UPDATE user_hide_profile SET is_active = FALSE WHERE user_id = ? AND is_active = TRUE", [userId]);
        res.json({
            success: true,
            message: "Profile unhidden successfully"
        });
    }
    catch (error) {
        console.error("Unhide Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Hide Profile Status
async function getHideProfileStatus(req, res) {
    try {
        const userId = req.user.user_id;
        const [hideStatus] = await query(`
      SELECT uhp.*, hpdm.duration_name, hpdm.duration_days
      FROM user_hide_profile uhp
      JOIN hide_profile_duration_master hpdm ON uhp.duration_id = hpdm.id
      WHERE uhp.user_id = ? AND uhp.is_active = TRUE AND uhp.hide_end_date > NOW()
      ORDER BY uhp.created_at DESC LIMIT 1
    `, [userId]);
        res.json({
            success: true,
            is_hidden: !!hideStatus,
            hide_details: hideStatus || null
        });
    }
    catch (error) {
        console.error("Get Hide Profile Status Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Delete Profile
async function deleteProfile(req, res) {
    try {
        const userId = req.user.user_id;
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({
                success: false,
                message: "Password is required to delete profile"
            });
        }
        // Verify password
        const [user] = await query("SELECT password FROM users WHERE id = ?", [userId]);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({
                success: false,
                message: "Password is incorrect"
            });
        }
        // Mark profile as deleted
        await query(`INSERT INTO account_settings (user_id, profile_deleted)
       VALUES (?, TRUE)
       ON DUPLICATE KEY UPDATE profile_deleted = TRUE`, [userId]);
        // Free up email/phone so the user can re-register with the same credentials
        await query("UPDATE users SET email = CONCAT(email, '_deleted_', id), phone = CASE WHEN phone IS NOT NULL THEN LEFT(CONCAT(phone, '_d', id), 20) ELSE NULL END, status = 4 WHERE id = ?", [userId]);
        // Clean up OTP verification records for this user so re-registration is not blocked
        await query("DELETE FROM otp_verification WHERE user_id = ?", [userId]);
        res.json({
            success: true,
            message: "Profile deleted successfully"
        });
    }
    catch (error) {
        console.error("Delete Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Contact Settings
async function updateContactSettings(req, res) {
    try {
        const userId = req.user.user_id;
        const { phone, contact_display_status } = req.body;
        // Update phone in users table if provided
        if (phone) {
            await query("UPDATE users SET phone = ? WHERE id = ?", [phone, userId]);
        }
        // Update contact display status in user_settings
        const [existing] = await query("SELECT id FROM user_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE user_settings SET contact_display_status = ? WHERE user_id = ?", [contact_display_status, userId]);
        }
        else {
            await query("INSERT INTO user_settings (user_id, contact_display_status) VALUES (?, ?)", [userId, contact_display_status]);
        }
        res.json({
            success: true,
            message: "Contact settings updated successfully"
        });
    }
    catch (error) {
        console.error("Update Contact Settings Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Contact Filter Settings
async function updateContactFilterSettings(req, res) {
    try {
        const userId = req.user.user_id;
        const { age_min, age_max, height_min, height_max, country_filter, religion_filter, community_filter, mother_tongue_filter, marital_status_filter } = req.body;
        const [existing] = await query("SELECT id FROM contact_filter_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query(`UPDATE contact_filter_settings SET
         age_min = ?, age_max = ?, height_min = ?, height_max = ?,
         country_filter = ?, religion_filter = ?, community_filter = ?,
         mother_tongue_filter = ?, marital_status_filter = ?
         WHERE user_id = ?`, [age_min, age_max, height_min, height_max,
                JSON.stringify(country_filter || []), JSON.stringify(religion_filter || []),
                JSON.stringify(community_filter || []), JSON.stringify(mother_tongue_filter || []),
                JSON.stringify(marital_status_filter || []), userId]);
        }
        else {
            await query(`INSERT INTO contact_filter_settings (user_id, age_min, age_max, height_min, height_max,
         country_filter, religion_filter, community_filter, mother_tongue_filter, marital_status_filter)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, age_min, age_max, height_min, height_max,
                JSON.stringify(country_filter || []), JSON.stringify(religion_filter || []),
                JSON.stringify(community_filter || []), JSON.stringify(mother_tongue_filter || []),
                JSON.stringify(marital_status_filter || [])]);
        }
        res.json({
            success: true,
            message: "Contact filter settings updated successfully"
        });
    }
    catch (error) {
        console.error("Update Contact Filter Settings Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Email SMS Alert Settings
async function updateEmailSmsAlertSettings(req, res) {
    try {
        const userId = req.user.user_id;
        const { match_mail_frequency, send_broader_matches, premium_match_mail, recent_visitors_email, shortlisted_email, viewed_profiles_email, similar_profiles_email, contact_alert, message_received_alert, sms_alert, profile_blaster, vivaaha_specials, vivaaha_insite } = req.body;
        const [existing] = await query("SELECT id FROM email_sms_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query(`UPDATE email_sms_settings SET
         match_mail_frequency = ?, send_broader_matches = ?, premium_match_mail = ?,
         recent_visitors_email = ?, shortlisted_email = ?, viewed_profiles_email = ?,
         similar_profiles_email = ?, contact_alert = ?, message_received_alert = ?,
         sms_alert = ?, profile_blaster = ?, vivaaha_specials = ?, vivaaha_insite = ?
         WHERE user_id = ?`, [match_mail_frequency, send_broader_matches, premium_match_mail,
                recent_visitors_email, shortlisted_email, viewed_profiles_email,
                similar_profiles_email, contact_alert, message_received_alert,
                sms_alert, profile_blaster, vivaaha_specials, vivaaha_insite, userId]);
        }
        else {
            await query(`INSERT INTO email_sms_settings (user_id, match_mail_frequency, send_broader_matches,
         premium_match_mail, recent_visitors_email, shortlisted_email, viewed_profiles_email,
         similar_profiles_email, contact_alert, message_received_alert, sms_alert,
         profile_blaster, vivaaha_specials, vivaaha_insite)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, match_mail_frequency, send_broader_matches, premium_match_mail,
                recent_visitors_email, shortlisted_email, viewed_profiles_email,
                similar_profiles_email, contact_alert, message_received_alert,
                sms_alert, profile_blaster, vivaaha_specials, vivaaha_insite]);
        }
        res.json({
            success: true,
            message: "Email SMS alert settings updated successfully"
        });
    }
    catch (error) {
        console.error("Update Email SMS Alert Settings Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Message Templates
async function getMessageTemplates(req, res) {
    try {
        const userId = req.user.user_id;
        // Get all message templates
        const templates = await query(`SELECT * FROM message_templates ORDER BY template_type, id`);
        // Get user's phone to substitute {mobile} placeholder
        const [user] = await query(`SELECT phone FROM users WHERE id = ?`, [userId]);
        const userPhone = (user === null || user === void 0 ? void 0 : user.phone) || '';
        // Replace {mobile} placeholder with actual user phone
        const resolvedTemplates = templates.map(t => {
            var _a;
            return (Object.assign(Object.assign({}, t), { message_text: (_a = t.message_text) === null || _a === void 0 ? void 0 : _a.replace(/\{mobile\}/g, userPhone) }));
        });
        // Get user's current message settings
        const [userSettings] = await query(`SELECT * FROM user_message_settings WHERE user_id = ?`, [userId]);
        res.json({
            success: true,
            templates: resolvedTemplates,
            user_settings: userSettings || {
                connect_message_id: 1,
                accept_message_id: 4,
                remind_message_id: 5
            }
        });
    }
    catch (error) {
        console.error("Get Message Templates Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Message Settings
async function updateMessageSettings(req, res) {
    try {
        const userId = req.user.user_id;
        const { connect_message_id, accept_message_id, remind_message_id } = req.body;
        const [existing] = await query("SELECT id FROM user_message_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query(`UPDATE user_message_settings SET
         connect_message_id = ?, accept_message_id = ?, remind_message_id = ?
         WHERE user_id = ?`, [connect_message_id, accept_message_id, remind_message_id, userId]);
        }
        else {
            await query(`INSERT INTO user_message_settings (user_id, connect_message_id, accept_message_id, remind_message_id)
         VALUES (?, ?, ?, ?)`, [userId, connect_message_id, accept_message_id, remind_message_id]);
        }
        res.json({
            success: true,
            message: "Message settings updated successfully"
        });
    }
    catch (error) {
        console.error("Update Message Settings Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Individual Privacy Settings
async function updateIncomePrivacy(req, res) {
    try {
        const userId = req.user.user_id;
        const { income_privacy } = req.body;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET income_privacy = ? WHERE user_id = ?", [income_privacy, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, income_privacy) VALUES (?, ?)", [userId, income_privacy]);
        }
        res.json({ success: true, message: "Income privacy updated successfully" });
    }
    catch (error) {
        console.error("Update Income Privacy Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
async function updateDobPrivacy(req, res) {
    try {
        const userId = req.user.user_id;
        const { dob_privacy } = req.body;
        const allowed = ['hide_dob', 'show_age_only', 'visible_to_all'];
        if (!allowed.includes(dob_privacy)) {
            return res.status(400).json({ success: false, message: `Invalid dob_privacy value. Allowed: ${allowed.join(', ')}` });
        }
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET dob_privacy = ? WHERE user_id = ?", [dob_privacy, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, dob_privacy) VALUES (?, ?)", [userId, dob_privacy]);
        }
        res.json({ success: true, message: "DOB privacy updated successfully" });
    }
    catch (error) {
        console.error("Update DOB Privacy Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
async function updateContactFilterPrivacy(req, res) {
    try {
        const userId = req.user.user_id;
        const { contact_filter_privacy } = req.body;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET contact_filter_privacy = ? WHERE user_id = ?", [contact_filter_privacy, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, contact_filter_privacy) VALUES (?, ?)", [userId, contact_filter_privacy]);
        }
        res.json({ success: true, message: "Contact filter privacy updated successfully" });
    }
    catch (error) {
        console.error("Update Contact Filter Privacy Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
async function updateEmailPrivacy(req, res) {
    try {
        const userId = req.user.user_id;
        const { email_privacy } = req.body;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET email_privacy = ? WHERE user_id = ?", [email_privacy, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, email_privacy) VALUES (?, ?)", [userId, email_privacy]);
        }
        res.json({ success: true, message: "Email privacy updated successfully" });
    }
    catch (error) {
        console.error("Update Email Privacy Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
async function updatePhonePrivacy(req, res) {
    try {
        const userId = req.user.user_id;
        const { phone_privacy } = req.body;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET phone_privacy = ? WHERE user_id = ?", [phone_privacy, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, phone_privacy) VALUES (?, ?)", [userId, phone_privacy]);
        }
        res.json({ success: true, message: "Phone privacy updated successfully" });
    }
    catch (error) {
        console.error("Update Phone Privacy Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
async function updatePhotoPrivacy(req, res) {
    try {
        const userId = req.user.user_id;
        const { profile_photo_privacy, album_photo_privacy } = req.body;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        // Build dynamic update query based on provided fields
        let updateFields = [];
        let updateValues = [];
        if (profile_photo_privacy !== undefined) {
            updateFields.push('profile_photo_privacy = ?');
            updateValues.push(profile_photo_privacy);
        }
        if (album_photo_privacy !== undefined) {
            updateFields.push('album_photo_privacy = ?');
            updateValues.push(album_photo_privacy);
        }
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No photo privacy fields provided"
            });
        }
        updateValues.push(userId);
        if (existing) {
            await query(`UPDATE privacy_settings SET ${updateFields.join(', ')} WHERE user_id = ?`, updateValues);
        }
        else {
            // For insert, we need to handle both fields
            await query("INSERT INTO privacy_settings (user_id, profile_photo_privacy, album_photo_privacy) VALUES (?, ?, ?)", [userId, profile_photo_privacy || 'visible_to_all', album_photo_privacy || 'visible_to_all']);
        }
        res.json({ success: true, message: "Photo privacy updated successfully" });
    }
    catch (error) {
        console.error("Update Photo Privacy Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update Contact Filter Settings with IDs
async function updateContactFilterSettingsWithIds(req, res) {
    try {
        const userId = req.user.user_id;
        const { age_min, age_max, height_min, height_max, country_filter, religion_filter, community_filter, mother_tongue_filter, marital_status_filter } = req.body;
        const [existing] = await query("SELECT id FROM contact_filter_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query(`UPDATE contact_filter_settings SET
         age_min = ?, age_max = ?, height_min = ?, height_max = ?,
         country_filter_ids = ?, religion_filter_ids = ?, community_filter_ids = ?,
         mother_tongue_filter_ids = ?, marital_status_filter_ids = ?
         WHERE user_id = ?`, [age_min, age_max, height_min, height_max,
                JSON.stringify(country_filter || []), JSON.stringify(religion_filter || []),
                JSON.stringify(community_filter || []), JSON.stringify(mother_tongue_filter || []),
                JSON.stringify(marital_status_filter || []), userId]);
        }
        else {
            await query(`INSERT INTO contact_filter_settings (user_id, age_min, age_max, height_min, height_max,
         country_filter_ids, religion_filter_ids, community_filter_ids, mother_tongue_filter_ids, marital_status_filter_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, age_min, age_max, height_min, height_max,
                JSON.stringify(country_filter || []), JSON.stringify(religion_filter || []),
                JSON.stringify(community_filter || []), JSON.stringify(mother_tongue_filter || []),
                JSON.stringify(marital_status_filter || [])]);
        }
        res.json({
            success: true,
            message: "Contact filter settings updated successfully"
        });
    }
    catch (error) {
        console.error("Update Contact Filter Settings with IDs Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
async function updateDisplayNamePrivacy(req, res) {
    try {
        const userId = req.user.user_id;
        const { display_name_privacy } = req.body;
        const [existing] = await query("SELECT id FROM privacy_settings WHERE user_id = ?", [userId]);
        if (existing) {
            await query("UPDATE privacy_settings SET display_name_privacy = ? WHERE user_id = ?", [display_name_privacy, userId]);
        }
        else {
            await query("INSERT INTO privacy_settings (user_id, display_name_privacy) VALUES (?, ?)", [userId, display_name_privacy]);
        }
        res.json({ success: true, message: "Display name privacy updated successfully" });
    }
    catch (error) {
        console.error("Update Display Name Privacy Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=SettingsController.js.map