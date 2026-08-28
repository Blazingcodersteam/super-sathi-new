"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleCallback = googleCallback;
exports.googleMobileLogin = googleMobileLogin;
const jwt = require("jsonwebtoken");
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const JWT_SECRET = process.env.JWT_SECRET_KEY;
// Get Complete User Profile (copied from AuthController)
async function getCompleteUserProfile(userId) {
    const [basicProfile] = await query(`SELECT u.id, u.email, u.phone, u.country_code_id, u.status, u.email_verified, u.phone_verified, u.vivaaha_user_id,
            up.*, r.religion_name, c.caste_name, g.gender_name, ms.status_name as marital_status,
            mt.language_name as mother_tongue, bg.blood_group, d.diet_name, dis.disability_name, hi.health_condition,
            CASE WHEN dv_aadhaar.verification_status = 'verified' OR up.aadhaar_verified = 1 THEN 1 ELSE 0 END as aadhaar_verified,
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
     WHERE u.id = ?`, [userId]);
    const [astro] = await query(`SELECT ad.*, g.gothra_name, c.country_name as birth_country
     FROM astro_details ad
     LEFT JOIN gothra_master g ON ad.gothra_id = g.id
     LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
     WHERE ad.user_id = ?`, [userId]);
    const [family] = await query(`SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
            ffs.status_name as financial_status, c.country_name as family_country,
            ft.type_name as family_type, fv.value_name as family_values
     FROM family_details fd
     LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
     LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
     LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
     LEFT JOIN country_code_master c ON fd.family_country_id = c.id
     LEFT JOIN family_type_master ft ON fd.family_type_id = ft.id
     LEFT JOIN family_values_master fv ON fd.family_values_id = fv.id
     WHERE fd.user_id = ?`, [userId]);
    const [career] = await query(`SELECT cd.*, ww.working_type, c.country_name as country_living, cur.currency_name, cur.symbol
     FROM career_details cd
     LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
     LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
     LEFT JOIN currency_master cur ON cd.currency_id = cur.id
     WHERE cd.user_id = ?`, [userId]);
    const [location] = await query(`SELECT ld.*, c.city_name FROM location_details ld
     LEFT JOIN cities_master c ON ld.city_id = c.id
     WHERE ld.user_id = ?`, [userId]);
    const [education] = await query(`SELECT ed.*, el.level_name, ea.area_name
     FROM education_details ed
     LEFT JOIN education_level_master el ON ed.education_level_id = el.id
     LEFT JOIN education_area_master ea ON ed.education_area_id = ea.id
     WHERE ed.user_id = ?`, [userId]);
    const hobbies = await query(`SELECT hm.* FROM user_hobbies uh
     JOIN hobbies_master hm ON uh.hobby_id = hm.id
     WHERE uh.user_id = ?`, [userId]);
    const [governmentId] = await query(`SELECT ugiv.*, gitm.id_type_name
     FROM user_government_id_verification ugiv
     LEFT JOIN government_id_type_master gitm ON ugiv.id_type_id = gitm.id
     WHERE ugiv.user_id = ?`, [userId]);
    const photos = await query(`SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC`, [userId]);
    const [subscription] = await query(`SELECT us.*, sp.plan_name, sp.price, sp.duration_months,
            ssm.status_name as subscription_status
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
     LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
     WHERE us.user_id = ? AND us.subscription_status_id = 1
     ORDER BY us.created_at DESC LIMIT 1`, [userId]);
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
// Google OAuth callback handler
async function googleCallback(req, res) {
    var _a;
    try {
        const { id, emails, name, photos } = req.user;
        const email = emails[0].value;
        const firstName = name.givenName;
        const lastName = name.familyName;
        const profilePicture = (_a = photos[0]) === null || _a === void 0 ? void 0 : _a.value;
        // Check if user exists
        let [user] = await query("SELECT * FROM users WHERE email = ?", [email]);
        if (!user) {
            return res.redirect(`${process.env.FRONTEND_URL}?error=user_not_exist&email=${encodeURIComponent(email)}`);
        }
        // Generate JWT token
        const token = jwt.sign({ user_id: user.id, email: user.email, user_type: "user" }, JWT_SECRET, { expiresIn: "24h" });
        // For web: redirect with token
        // if (req.query.platform === 'web') {
        const completeProfile = await getCompleteUserProfile(user.id);
        const profileData = encodeURIComponent(JSON.stringify({ success: true, message: "Login successful", token, profile: completeProfile }));
        return res.redirect(`${process.env.FRONTEND_URL}?data=${profileData}`);
        // }
        // For app: return JSON
        // const completeProfile = await getCompleteUserProfile(user.id);
        res.json({
            success: true,
            message: "Login successful",
            token,
            profile: completeProfile
        });
    }
    catch (error) {
        console.error("Google OAuth Error:", error);
        res.status(500).json({ success: false, message: "Authentication failed" });
    }
}
// Mobile app Google login
async function googleMobileLogin(req, res) {
    try {
        const { googleToken, userInfo } = req.body;
        if (!googleToken || !userInfo) {
            return res.status(400).json({
                success: false,
                message: "Google token and user info required"
            });
        }
        const { email, name, picture, sub: googleId } = userInfo;
        // Check if user exists
        let [user] = await query("SELECT * FROM users WHERE email = ? OR google_id = ?", [email, googleId]);
        if (!user) {
            return res.json({
                success: false,
                message: "User not exist",
                email: email
            });
        }
        // Generate JWT token
        const token = jwt.sign({ user_id: user.id, email: user.email, user_type: "user" }, JWT_SECRET, { expiresIn: "24h" });
        const completeProfile = await getCompleteUserProfile(user.id);
        res.json({
            success: true,
            message: "Login successful",
            token,
            profile: completeProfile
        });
    }
    catch (error) {
        console.error("Google Mobile Login Error:", error);
        res.status(500).json({ success: false, message: "Authentication failed" });
    }
}
//# sourceMappingURL=GoogleAuthController.js.map