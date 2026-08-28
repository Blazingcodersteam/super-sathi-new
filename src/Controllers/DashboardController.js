"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboard = getDashboard;
const utils = require("util");
const privacyFilter_1 = require("../utils/privacyFilter");
// 21-07-2026 - Profile complete condition
const profileCompletion_1 = require("../utils/profileCompletion");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Get Dashboard Data
async function getDashboard(req, res) {
    try {
        const userId = req.user.user_id;
        // Get current user's profile_created_by to apply parent filter
        const [currentUserProfile] = await query(`SELECT profile_created_by FROM user_profiles WHERE user_id = ?`, [userId]);
        const isParent = (currentUserProfile === null || currentUserProfile === void 0 ? void 0 : currentUserProfile.profile_created_by) === 'parent';
        const parentFilter = isParent ? `AND up.profile_created_by = 'parent'` : '';
        // Basic Profile
        const [basic] = await query(`
      SELECT u.id, u.email, u.phone, u.vivaaha_user_id, up.*, 
             rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
             mtm.language_name as mother_tongue, bg.blood_group,
             dis.disability_name, hi.health_condition
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN gender_master gm ON up.gender_id = gm.id
      LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
      LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
      LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
      LEFT JOIN disability_master dis ON up.disability_id = dis.id
      LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
      WHERE u.id = ?
    `, [userId]);
        // Astro Details
        const [astro] = await query(`
      SELECT ad.*, g.gothra_name, c.country_name
      FROM astro_details ad
      LEFT JOIN gothra_master g ON ad.gothra_id = g.id
      LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
      WHERE ad.user_id = ?
    `, [userId]);
        // Family Details
        const [family] = await query(`
      SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
             ffs.status_name as financial_status, c.country_name as family_country
      FROM family_details fd
      LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
      LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
      LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
      LEFT JOIN country_code_master c ON fd.family_country_id = c.id
      WHERE fd.user_id = ?
    `, [userId]);
        // Career Details
        const [career] = await query(`
      SELECT cd.*, cur.currency_code, cur.symbol as currency_symbol
      FROM career_details cd
      LEFT JOIN currency_master cur ON cd.currency_id = cur.id
      WHERE cd.user_id = ?
    `, [userId]);
        // Location Details
        const [location] = await query(`
      SELECT ld.*, c.city_name, s.state_name, co.country_name
      FROM location_details ld
      LEFT JOIN cities_master c ON ld.city_id = c.id
      LEFT JOIN states_master s ON ld.state_id = s.id
      LEFT JOIN country_code_master co ON ld.country_id = co.id
      WHERE ld.user_id = ?
    `, [userId]);
        // Education Details
        const [education] = await query(`
      SELECT ed.*, elm.level_name as education_level
      FROM education_details ed
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      WHERE ed.user_id = ?
    `, [userId]);
        // Government ID
        const [government_id] = await query(`
      SELECT * FROM user_government_id_verification WHERE user_id = ?
    `, [userId]);
        // Hobbies
        const hobbies = await query(`
      SELECT hm.* FROM user_hobbies uh
      JOIN hobbies_master hm ON uh.hobby_id = hm.id
      WHERE uh.user_id = ?
    `, [userId]);
        // Photos
        const photos = await query(`
      SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC
    `, [userId]);
        // Subscription
        const [subscription] = await query(`
      SELECT us.*, sp.plan_name, sp.price, sp.duration_months, ssm.status_name as subscription_status
      FROM user_subscriptions us
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
      WHERE us.user_id = ? ORDER BY us.created_at DESC LIMIT 1
    `, [userId]);
        // Match Actions
        const [sentInterests] = await query(`
      SELECT COUNT(*) as count FROM user_interests WHERE sender_id = ?
    `, [userId]);
        const [receivedInterests] = await query(`
      SELECT COUNT(*) as count FROM user_interests WHERE receiver_id = ? AND status = 'sent'
    `, [userId]);
        const [acceptedConnections] = await query(`
      SELECT COUNT(*) as count FROM user_interests WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'
    `, [userId, userId]);
        // Connect Status
        const [connectRequests] = await query(`
      SELECT COUNT(*) as count FROM connect_now_requests WHERE receiver_id = ? AND status = 'pending'
    `, [userId]);
        // Invitation List with Profile Details
        const invitations = await query(`
      SELECT ui.id as invitation_id, ui.message, ui.status, ui.created_at as invitation_date,
             u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
             up.first_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
             up.height, up.weight, up.marital_status_id, up.religion_id, up.caste_id,
             up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
             up.about_myself, up.profile_picture, up.horoscope_match, up.lives_with_family,
             up.family_location, up.has_children, up.number_of_children, up.diet_id,
             up.blood_group_id, up.disability_id, up.health_info_id,
             rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
             mtm.language_name as mother_tongue, dm.diet_name, bg.blood_group,
             dis.disability_name, hi.health_condition,
             cd.occupation, cd.company_name, cd.annual_income, cd.income_type, cd.currency_id,
             cd.city_living_in, cd.state_living_in, cd.country_living_in_id,
             cur.currency_code, cur.symbol as currency_symbol,
             ed.education_level_id, ed.institution_name, ed.institution_name_2,
             elm.level_name as education_level,
             us.plan_id, sp.plan_name, sp.price as plan_price, sp.duration_months,
             ssm.status_name as subscription_status, us.start_date as subscription_start,
             us.end_date as subscription_end,
             CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status
      FROM (
        SELECT id, sender_id, message, status, created_at
        FROM user_interests
        WHERE receiver_id = ? AND status = 'sent'
          AND sender_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id IN (2, 3)
          )
          AND id = (
            SELECT MAX(id) FROM user_interests ui2
            WHERE ui2.sender_id = user_interests.sender_id
              AND ui2.receiver_id = user_interests.receiver_id
              AND ui2.status = 'sent'
          )
      ) ui
      JOIN users u ON ui.sender_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN gender_master gm ON up.gender_id = gm.id
      LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
      LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
      LEFT JOIN diet_master dm ON up.diet_id = dm.id
      LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
      LEFT JOIN disability_master dis ON up.disability_id = dis.id
      LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN currency_master cur ON cd.currency_id = cur.id
      LEFT JOIN education_details ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
      WHERE u.status = 1 AND up.aadhaar_verified = 1 ${parentFilter}
        -- 21-07-2026 - Profile complete condition
        AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}
      ORDER BY ui.created_at DESC
      LIMIT 10
    `, [userId, userId]);
        // Add match_actions and additional details for each invitation
        const enrichedInvitations = await Promise.all(invitations.map(async (invitation) => {
            const profileId = invitation.id;
            // Get family details
            const [family] = await query(`
        SELECT fd.*, ftm.type_name as family_type, fsm.status_name as family_status,
               fvm.value_name as family_values, cm.country_name as family_country
        FROM family_details fd
        LEFT JOIN family_type_master ftm ON fd.family_type_id = ftm.id
        LEFT JOIN family_status_master fsm ON fd.family_status_id = fsm.id
        LEFT JOIN family_values_master fvm ON fd.family_values_id = fvm.id
        LEFT JOIN country_code_master cm ON fd.family_country_id = cm.id
        WHERE fd.user_id = ?
      `, [profileId]);
            // Get astro details
            const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name as birth_country
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        WHERE ad.user_id = ?
      `, [profileId]);
            // Get location details
            const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        WHERE ld.user_id = ?
      `, [profileId]);
            // Get hobbies
            const hobbies = await query(`
        SELECT hm.hobby_name, hm.category
        FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?
      `, [profileId]);
            // Get photos
            const photos = await query(`
        SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC
      `, [profileId]);
            const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        LEFT JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, invitation.id]);
            const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests 
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, invitation.id, invitation.id, userId]);
            return Object.assign(Object.assign({}, invitation), { family: family || {}, astro: astro || {}, location: location || {}, hobbies: hobbies || [], photos: photos || [], match_actions: matchActions || [], connect_status: (connectStatus === null || connectStatus === void 0 ? void 0 : connectStatus.status) || null });
        }));
        // Premium Matches (users with active subscriptions) — deduplicated by user id
        const premiumMatches = await query(`
      SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
             up.first_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name,
             up.height, up.weight, up.marital_status_id, up.religion_id, up.caste_id,
             up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
             up.about_myself, up.profile_picture, up.horoscope_match, up.lives_with_family,
             up.family_location, up.has_children, up.number_of_children, up.diet_id,
             up.blood_group_id, up.disability_id, up.health_info_id,
             rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
             mtm.language_name as mother_tongue, dm.diet_name, bg.blood_group,
             dis.disability_name, hi.health_condition,
             cd.occupation, cd.company_name, cd.annual_income, cd.income_type, cd.currency_id,
             cd.city_living_in, cd.state_living_in, cd.country_living_in_id,
             cur.currency_code, cur.symbol as currency_symbol,
             ed.education_level_id, ed.institution_name, ed.institution_name_2,
             elm.level_name as education_level,
             latest_sub.plan_id, sp.plan_name, sp.price as plan_price, sp.duration_months,
             ssm.status_name as subscription_status, latest_sub.start_date as subscription_start,
             latest_sub.end_date as subscription_end,
             CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 2 DAY) THEN 'Online' ELSE 'Offline' END as online_status
      FROM users u
      -- Use subquery to get ONE latest active subscription per user (prevents duplicates)
      JOIN (
        SELECT user_id, MAX(id) as max_id
        FROM user_subscriptions
        WHERE subscription_status_id = 1 AND end_date > NOW()
        GROUP BY user_id
      ) active_sub ON u.id = active_sub.user_id
      JOIN user_subscriptions latest_sub ON latest_sub.id = active_sub.max_id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN gender_master gm ON up.gender_id = gm.id
      LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
      LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
      LEFT JOIN diet_master dm ON up.diet_id = dm.id
      LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
      LEFT JOIN disability_master dis ON up.disability_id = dis.id
      LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN currency_master cur ON cd.currency_id = cur.id
      LEFT JOIN education_details ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      LEFT JOIN subscription_plans sp ON latest_sub.plan_id = sp.id
      LEFT JOIN subscription_status_master ssm ON latest_sub.subscription_status_id = ssm.id
      WHERE u.id != ?
        AND u.status = 1
        AND up.gender_id != (SELECT gender_id FROM user_profiles WHERE user_id = ?)
        AND up.aadhaar_verified = 1
        AND up.exclude_from_matchmaking = 0
        -- 21-07-2026 - Profile complete condition
        AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}
        AND u.id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        ${parentFilter}
      ORDER BY latest_sub.end_date DESC
      LIMIT 10
    `, [userId, userId, userId]);
        // New Matches (recently joined users) — exclude premium matches to avoid overlap
        const premiumMatchIds = premiumMatches.map((m) => m.id);
        const excludeIds = [userId, ...premiumMatchIds];
        const placeholders = excludeIds.map(() => '?').join(',');
        const newMatches = await query(`
      SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
             up.first_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name,
             up.height, up.weight, up.marital_status_id, up.religion_id, up.caste_id,
             up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
             up.about_myself, up.profile_picture, up.horoscope_match, up.lives_with_family,
             up.family_location, up.has_children, up.number_of_children, up.diet_id,
             up.blood_group_id, up.disability_id, up.health_info_id,
             rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
             mtm.language_name as mother_tongue, dm.diet_name, bg.blood_group,
             dis.disability_name, hi.health_condition,
             cd.occupation, cd.company_name, cd.annual_income, cd.income_type, cd.currency_id,
             cd.city_living_in, cd.state_living_in, cd.country_living_in_id,
             cur.currency_code, cur.symbol as currency_symbol,
             ed.education_level_id, ed.institution_name, ed.institution_name_2,
             elm.level_name as education_level,
             NULL as plan_id, NULL as plan_name, NULL as plan_price, NULL as duration_months,
             NULL as subscription_status, NULL as subscription_start, NULL as subscription_end,
             CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 2 DAY) THEN 'Online' ELSE 'Offline' END as online_status
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN gender_master gm ON up.gender_id = gm.id
      LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
      LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
      LEFT JOIN diet_master dm ON up.diet_id = dm.id
      LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
      LEFT JOIN disability_master dis ON up.disability_id = dis.id
      LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN currency_master cur ON cd.currency_id = cur.id
      LEFT JOIN education_details ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      WHERE u.id NOT IN (${placeholders})
        AND u.status = 1
        AND up.gender_id != (SELECT gender_id FROM user_profiles WHERE user_id = ?)
        AND up.aadhaar_verified = 1
        AND up.exclude_from_matchmaking = 0
        AND u.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        -- 21-07-2026 - Profile complete condition
        AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}
        AND u.id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        ${parentFilter}
      ORDER BY u.created_at DESC
      LIMIT 10
    `, [...excludeIds, userId, userId]);
        // Add match_actions and additional details for premium matches
        const enrichedPremiumMatches = await Promise.all(premiumMatches.map(async (match) => {
            const profileId = match.id;
            // Get family details
            const [family] = await query(`
        SELECT fd.*, ftm.type_name as family_type, fsm.status_name as family_status,
               fvm.value_name as family_values, cm.country_name as family_country
        FROM family_details fd
        LEFT JOIN family_type_master ftm ON fd.family_type_id = ftm.id
        LEFT JOIN family_status_master fsm ON fd.family_status_id = fsm.id
        LEFT JOIN family_values_master fvm ON fd.family_values_id = fvm.id
        LEFT JOIN country_code_master cm ON fd.family_country_id = cm.id
        WHERE fd.user_id = ?
      `, [profileId]);
            // Get astro details
            const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name as birth_country
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        WHERE ad.user_id = ?
      `, [profileId]);
            // Get location details
            const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        WHERE ld.user_id = ?
      `, [profileId]);
            // Get hobbies
            const hobbies = await query(`
        SELECT hm.hobby_name, hm.category
        FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?
      `, [profileId]);
            // Get photos
            const photos = await query(`
        SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC
      `, [profileId]);
            const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, match.id]);
            const [reportAction] = await query(`
        SELECT ur.id, 'Report' as action_name, 4 as action_type_id
        FROM user_reports ur
        WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
      `, [userId, match.id]);
            const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests 
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, match.id, match.id, userId]);
            const allActions = [...matchActions];
            if (reportAction) {
                allActions.push(reportAction);
            }
            return Object.assign(Object.assign({}, match), { family: family || {}, astro: astro || {}, location: location || {}, hobbies: hobbies || [], photos: photos || [], match_actions: allActions, connect_status: (connectStatus === null || connectStatus === void 0 ? void 0 : connectStatus.status) || null });
        }));
        // Add match_actions and additional details for new matches
        const enrichedNewMatches = await Promise.all(newMatches.map(async (match) => {
            const profileId = match.id;
            // Get family details
            const [family] = await query(`
        SELECT fd.*, ftm.type_name as family_type, fsm.status_name as family_status,
               fvm.value_name as family_values, cm.country_name as family_country
        FROM family_details fd
        LEFT JOIN family_type_master ftm ON fd.family_type_id = ftm.id
        LEFT JOIN family_status_master fsm ON fd.family_status_id = fsm.id
        LEFT JOIN family_values_master fvm ON fd.family_values_id = fvm.id
        LEFT JOIN country_code_master cm ON fd.family_country_id = cm.id
        WHERE fd.user_id = ?
      `, [profileId]);
            // Get astro details
            const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name as birth_country
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        WHERE ad.user_id = ?
      `, [profileId]);
            // Get location details
            const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        WHERE ld.user_id = ?
      `, [profileId]);
            // Get hobbies
            const hobbies = await query(`
        SELECT hm.hobby_name, hm.category
        FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?
      `, [profileId]);
            // Get photos
            const photos = await query(`
        SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC
      `, [profileId]);
            const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, match.id]);
            const [reportAction] = await query(`
        SELECT ur.id, 'Report' as action_name, 4 as action_type_id
        FROM user_reports ur
        WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
      `, [userId, match.id]);
            const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests 
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, match.id, match.id, userId]);
            const allActions = [...matchActions];
            if (reportAction) {
                allActions.push(reportAction);
            }
            return Object.assign(Object.assign({}, match), { family: family || {}, astro: astro || {}, location: location || {}, hobbies: hobbies || [], photos: photos || [], match_actions: allActions, connect_status: (connectStatus === null || connectStatus === void 0 ? void 0 : connectStatus.status) || null });
        }));
        // Apply privacy filter to all match lists before sending
        const filteredPremiumMatches = await (0, privacyFilter_1.applyPrivacyFilterToMatches)(enrichedPremiumMatches, userId);
        const filteredNewMatches = await (0, privacyFilter_1.applyPrivacyFilterToMatches)(enrichedNewMatches, userId);
        const filteredInvitations = await (0, privacyFilter_1.applyPrivacyFilterToMatches)(enrichedInvitations, userId);
        // Activity Summary
        // pending_invitations = received connect requests (pending) only
        const [pendingInvitations] = await query(`SELECT COUNT(*) as count FROM connect_now_requests
       WHERE receiver_id = ? AND status = 'pending'
         AND sender_id NOT IN (
           SELECT target_user_id FROM user_actions
           WHERE user_id = ? AND action_type_id IN (2, 3)
         )`, [userId, userId]).catch(() => [{ count: 0 }]);
        // accepted_invitations = accepted connect requests only (filter: accepted_by_her)
        const [acceptedInvitations] = await query(`SELECT COUNT(*) as count FROM connect_now_requests
       WHERE sender_id = ? AND status = 'accepted'
         AND receiver_id NOT IN (
           SELECT target_user_id FROM user_actions
           WHERE user_id = ? AND action_type_id IN (2, 3)
         )`, [userId, userId]).catch(() => [{ count: 0 }]);
        const [recentVisitors] = await query(`SELECT COUNT(DISTINCT viewer_id) as count FROM profile_views
       WHERE viewed_user_id = ? AND view_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)`, [userId]).catch(() => [{ count: 0 }]);
        const [contactsViewed] = await query(`SELECT COUNT(DISTINCT viewed_user_id) as count FROM profile_views WHERE viewer_id = ?`, [userId]).catch(() => [{ count: 0 }]);
        const [chatsInitiated] = await query(`SELECT COUNT(*) as count FROM chat_conversations WHERE user1_id = ? OR user2_id = ?`, [userId, userId]).catch(() => [{ count: 0 }]);
        // Profile Completion
        const sections = [basic, astro, family, career, location, education, government_id, hobbies.length > 0, photos.length > 0];
        const completedSections = sections.filter(section => section && Object.keys(section).length > 0).length;
        const profileCompletion = Math.round((completedSections / sections.length) * 100);
        res.json({
            success: true,
            data: {
                profile_completion: profileCompletion,
                basic: basic || {},
                astro: astro || {},
                family: family || {},
                career: career || {},
                location: location || {},
                education: education || {},
                government_id: government_id || {},
                hobbies: hobbies || [],
                photos: photos || [],
                subscription: subscription || {},
                match_actions: {
                    sent_interests: (sentInterests === null || sentInterests === void 0 ? void 0 : sentInterests.count) || 0,
                    received_interests: (receivedInterests === null || receivedInterests === void 0 ? void 0 : receivedInterests.count) || 0,
                    accepted_connections: (acceptedConnections === null || acceptedConnections === void 0 ? void 0 : acceptedConnections.count) || 0
                },
                connect_status: {
                    pending_requests: (connectRequests === null || connectRequests === void 0 ? void 0 : connectRequests.count) || 0
                },
                invitations: filteredInvitations,
                premium_matches: filteredPremiumMatches,
                new_matches: filteredNewMatches,
                activity_summary: {
                    pending_invitations: pendingInvitations.count || 0,
                    accepted_invitations: acceptedInvitations.count || 0,
                    recent_visitors: recentVisitors.count || 0,
                    contacts_viewed: contactsViewed.count || 0,
                    chats_initiated: chatsInitiated.count || 0
                }
            }
        });
    }
    catch (error) {
        console.error('Dashboard Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
//# sourceMappingURL=DashboardController.js.map