"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyConnections = getMyConnections;
exports.getTodayMatches = getTodayMatches;
exports.getMatchProfile = getMatchProfile;
exports.compareProfiles = compareProfiles;
const utils = require("util");
const AlertsController_1 = require("./AlertsController");
const privacyFilter_1 = require("../utils/privacyFilter");
// 21-07-2026 - Profile complete condition
const profileCompletion_1 = require("../utils/profileCompletion");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Get My Connections (Connected Matches)
async function getMyConnections(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const connections = await query(`
      SELECT DISTINCT
        u.id, u.vivaaha_user_id,
        up.first_name, up.middle_name, up.last_name, up.profile_picture, up.age, up.show_vivaaha_id,
        up.height, up.religion_id, up.caste_id, up.mother_tongue_id,
        CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
        COALESCE(cim.city_name, cd.city_living_in) as city_living_in,
        CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm.profession_name, cd.occupation) ELSE cd.occupation END as occupation,
        COALESCE(stm.state_name, cd.state_living_in_id) as state_living_in,
        rm.religion_name, csm.caste_name, comm.community_name, mtm.language_name as mother_tongue,
        clc.country_name as country_living,
        cnr.status as connection_status, cnr.created_at as connected_at,
        CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status
      FROM connect_now_requests cnr
      JOIN users u ON (cnr.sender_id = u.id OR cnr.receiver_id = u.id)
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN cities_master cim ON cd.city_living_in = cim.id
      LEFT JOIN states_master stm ON cd.state_living_in_id = stm.id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master csm ON up.caste_id = csm.id
      LEFT JOIN community_master comm ON up.community_id = comm.id
      LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
      LEFT JOIN country_code_master clc ON cd.country_living_in_id = clc.id
      LEFT JOIN profession_master pm ON cd.occupation REGEXP '^[0-9]+$' AND pm.id = CAST(cd.occupation AS UNSIGNED)
      WHERE ((cnr.sender_id = ? OR cnr.receiver_id = ?) AND u.id != ?)
        AND cnr.status = 'accepted'
        AND u.status = 1
        -- 21-07-2026 - Profile complete condition
        AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}
      ORDER BY cnr.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, userId, userId, parseInt(limit), offset]);
        const totalCount = await query(`
      SELECT COUNT(DISTINCT u.id) as count
      FROM connect_now_requests cnr
      JOIN users u ON (cnr.sender_id = u.id OR cnr.receiver_id = u.id)
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE ((cnr.sender_id = ? OR cnr.receiver_id = ?) AND u.id != ?)
        AND cnr.status = 'accepted'
        AND u.status = 1
        -- 21-07-2026 - Profile complete condition
        AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}
    `, [userId, userId, userId]);
        // Apply privacy filters to connections
        const filteredConnections = (await (0, privacyFilter_1.applyPrivacyFilterToMatches)(connections, userId)).filter(p => !p.is_blocked);
        res.json({
            success: true,
            data: {
                connections: filteredConnections,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: totalCount[0].count,
                    total_pages: Math.ceil(totalCount[0].count / parseInt(limit))
                }
            }
        });
    }
    catch (error) {
        console.error("Get My Connections Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Today's Matches
async function getTodayMatches(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        // Check if today matches exist (opposite gender only)
        const [{ existingCount }] = await query(`SELECT COUNT(*) as existingCount FROM matches m
       JOIN users u ON m.user2_id = u.id
       JOIN user_profiles up ON m.user2_id = up.user_id
       WHERE m.user1_id = ? AND m.is_today_match = TRUE AND m.match_date = CURRENT_DATE
         AND up.gender_id != (SELECT gender_id FROM user_profiles WHERE user_id = ?) AND up.aadhaar_verified = 1
         -- 21-07-2026 - Profile complete condition
         AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}`, [userId, userId]);
        let matches = [];
        let total = 0;
        if (existingCount > 0) {
            // Use existing matches
            const todayMatchesQuery = `
        SELECT DISTINCT m.id as match_id, m.match_score, m.created_at as match_date,
               u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.vivaaha_user_id,
               up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
               CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
               up.height, up.marital_status_id, up.religion_id, up.caste_id,
               up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
               up.profile_picture, up.diet_id, up.aadhaar_verified,
               rm.religion_name, cm.caste_name, comm.community_name, gm.gender_name, msm.status_name as marital_status,
               dm.diet_name, mtm.language_name as mother_tongue,
               CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm.profession_name, cd.occupation) ELSE cd.occupation END as occupation,
               cd.company_name, cd.annual_income, COALESCE(cim.city_name, cd.city_living_in) as city_living_in,
               COALESCE(stm.state_name, cd.state_living_in_id) as state_living_in,
               clc.country_name as country_living,
               ed.education_level_id, elm.level_name as education_level,
               pc.overall_compatibility_score,
               CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status
        FROM matches m
        JOIN users u ON (m.user2_id = u.id AND m.user1_id = ?)
        LEFT JOIN user_profiles up ON u.id = up.user_id
        LEFT JOIN religion_master rm ON up.religion_id = rm.id
        LEFT JOIN caste_master cm ON up.caste_id = cm.id
        LEFT JOIN community_master comm ON up.community_id = comm.id
        LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
        LEFT JOIN gender_master gm ON up.gender_id = gm.id
        LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
        LEFT JOIN diet_master dm ON up.diet_id = dm.id
        LEFT JOIN career_details cd ON u.id = cd.user_id
        LEFT JOIN cities_master cim ON cd.city_living_in = cim.id
        LEFT JOIN states_master stm ON cd.state_living_in_id = stm.id
        LEFT JOIN country_code_master clc ON cd.country_living_in_id = clc.id
        LEFT JOIN education_details ed ON u.id = ed.user_id
        LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
        LEFT JOIN profile_compatibility pc ON (pc.user1_id = ? AND pc.user2_id = u.id)
        LEFT JOIN profession_master pm ON cd.occupation REGEXP '^[0-9]+$' AND pm.id = CAST(cd.occupation AS UNSIGNED)
        WHERE m.is_today_match = TRUE AND m.match_date = CURRENT_DATE
          AND up.gender_id != (SELECT gender_id FROM user_profiles WHERE user_id = ?)
          AND up.aadhaar_verified = 1
          AND u.status = 1
          -- 21-07-2026 - Profile complete condition
          AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}
        ORDER BY m.match_score DESC
        LIMIT ? OFFSET ?
      `;
            matches = await query(todayMatchesQuery, [userId, userId, userId, parseInt(limit), offset]);
            // Add match actions for each match
            for (let match of matches) {
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
                const allActions = [...matchActions];
                if (reportAction) {
                    allActions.push(reportAction);
                }
                // Get connect status
                const [connectStatus] = await query(`
          SELECT status FROM connect_now_requests
          WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
          ORDER BY created_at DESC LIMIT 1
        `, [userId, match.id, match.id, userId]);
                match.match_actions = allActions;
                match.connect_status = (connectStatus === null || connectStatus === void 0 ? void 0 : connectStatus.status) || null;
            }
            total = existingCount;
        }
        else {
            // Generate matches based on partner preferences
            const [preferences] = await query(`SELECT * FROM partner_preferences WHERE user_id = ?`, [userId]);
            const [myProfile] = await query(`SELECT gender_id FROM user_profiles WHERE user_id = ?`, [userId]);
            let whereConditions = [`u.id != ?`, `u.status = 1`, `up.exclude_from_matchmaking = FALSE`, `up.aadhaar_verified = 1`,
                `u.id NOT IN (SELECT user_id FROM user_hide_profile WHERE is_active = TRUE AND hide_end_date > NOW())`,
                `u.id NOT IN (SELECT user_id FROM account_settings WHERE profile_hidden = 1)`,
                // Section 11 — exclude visible_to_premium profiles from non-premium viewers
                `u.id NOT IN (
          SELECT ps2.user_id FROM privacy_settings ps2
          WHERE ps2.profile_visibility = 'visible_to_premium'
          AND ? NOT IN (
            SELECT user_id FROM user_subscriptions
            WHERE subscription_status_id = 1 AND end_date > NOW()
          )
        )`
            ];
            let queryParams = [userId, userId];
            // 21-07-2026 - Profile complete condition
            whereConditions.push((0, profileCompletion_1.profileCompleteCondition)("u", "up"));
            // Opposite gender filter
            if (myProfile === null || myProfile === void 0 ? void 0 : myProfile.gender_id) {
                whereConditions.push(`up.gender_id != ?`);
                queryParams.push(myProfile.gender_id);
            }
            if (preferences) {
                // Age filter
                if (preferences.min_age && preferences.max_age) {
                    whereConditions.push(`up.age BETWEEN ? AND ?`);
                    queryParams.push(preferences.min_age, preferences.max_age);
                }
                // Religion filter
                if (preferences.religion_ids) {
                    const religionIds = JSON.parse(preferences.religion_ids);
                    if (religionIds.length > 0) {
                        whereConditions.push(`up.religion_id IN (${religionIds.map(() => '?').join(',')})`);
                        queryParams.push(...religionIds);
                    }
                }
                // Marital status filter
                if (preferences.marital_status_ids) {
                    const maritalIds = JSON.parse(preferences.marital_status_ids);
                    if (maritalIds.length > 0) {
                        whereConditions.push(`up.marital_status_id IN (${maritalIds.map(() => '?').join(',')})`);
                        queryParams.push(...maritalIds);
                    }
                }
                // Income filter
                if (preferences.min_income) {
                    whereConditions.push(`cd.annual_income >= ?`);
                    queryParams.push(preferences.min_income);
                }
            }
            const dynamicMatchQuery = `
        SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.vivaaha_user_id,
               up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
               CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
               up.height, up.marital_status_id, up.religion_id, up.caste_id,
               up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
               up.profile_picture, up.diet_id, up.aadhaar_verified,
               rm.religion_name, cm.caste_name, comm2.community_name, gm.gender_name, msm.status_name as marital_status,
               dm.diet_name, mtm2.language_name as mother_tongue,
               CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm2.profession_name, cd.occupation) ELSE cd.occupation END as occupation,
               cd.company_name, cd.annual_income, COALESCE(cim.city_name, cd.city_living_in) as city_living_in,
               COALESCE(stm2.state_name, cd.state_living_in_id) as state_living_in,
               clc2.country_name as country_living,
               ed.education_level_id, elm.level_name as education_level,
               CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status,
               (
                 CASE WHEN up.religion_id = (SELECT religion_id FROM user_profiles WHERE user_id = ?) THEN 25 ELSE 0 END +
                 CASE WHEN up.caste_id = (SELECT caste_id FROM user_profiles WHERE user_id = ?) THEN 20 ELSE 0 END +
                 CASE WHEN up.mother_tongue_id = (SELECT mother_tongue_id FROM user_profiles WHERE user_id = ?) THEN 15 ELSE 0 END +
                 CASE WHEN ABS(up.age - (SELECT age FROM user_profiles WHERE user_id = ?)) <= 3 THEN 20 ELSE
                      CASE WHEN ABS(up.age - (SELECT age FROM user_profiles WHERE user_id = ?)) <= 5 THEN 10 ELSE 0 END END +
                 CASE WHEN ed.education_level_id >= (SELECT education_level_id FROM education_details WHERE user_id = ?) THEN 10 ELSE 5 END +
                 CASE WHEN cd.annual_income >= (SELECT annual_income FROM career_details WHERE user_id = ?) THEN 10 ELSE 5 END
               ) as match_score
        FROM users u
        LEFT JOIN user_profiles up ON u.id = up.user_id
        LEFT JOIN religion_master rm ON up.religion_id = rm.id
        LEFT JOIN caste_master cm ON up.caste_id = cm.id
        LEFT JOIN community_master comm2 ON up.community_id = comm2.id
        LEFT JOIN mother_tongue_master mtm2 ON up.mother_tongue_id = mtm2.id
        LEFT JOIN gender_master gm ON up.gender_id = gm.id
        LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
        LEFT JOIN diet_master dm ON up.diet_id = dm.id
        LEFT JOIN career_details cd ON u.id = cd.user_id
        LEFT JOIN cities_master cim ON cd.city_living_in = cim.id
        LEFT JOIN states_master stm2 ON cd.state_living_in_id = stm2.id
        LEFT JOIN country_code_master clc2 ON cd.country_living_in_id = clc2.id
        LEFT JOIN education_details ed ON u.id = ed.user_id
        LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
        LEFT JOIN profession_master pm2 ON cd.occupation REGEXP '^[0-9]+$' AND pm2.id = CAST(cd.occupation AS UNSIGNED)
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY match_score DESC
        LIMIT ? OFFSET ?
      `;
            // match_score subqueries in SELECT appear BEFORE WHERE in SQL text,
            // so their params must come first in the params array
            const finalParams = [userId, userId, userId, userId, userId, userId, userId, ...queryParams, parseInt(limit), offset];
            matches = await query(dynamicMatchQuery, finalParams);
            // Add match actions for each match
            for (let match of matches) {
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
                const allActions = [...matchActions];
                if (reportAction) {
                    allActions.push(reportAction);
                }
                // Get connect status
                const [connectStatus] = await query(`
          SELECT status FROM connect_now_requests
          WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
          ORDER BY created_at DESC LIMIT 1
        `, [userId, match.id, match.id, userId]);
                match.match_actions = allActions;
                match.connect_status = (connectStatus === null || connectStatus === void 0 ? void 0 : connectStatus.status) || null;
            }
            // Get total count for dynamic matches
            const countQuery = `
        SELECT COUNT(*) as total FROM users u
        LEFT JOIN user_profiles up ON u.id = up.user_id
        LEFT JOIN career_details cd ON u.id = cd.user_id
        WHERE ${whereConditions.join(' AND ')}
      `;
            const [{ total: dynamicTotal }] = await query(countQuery, queryParams);
            total = dynamicTotal;
        }
        // Apply privacy filters to matches
        const filteredMatches = (await (0, privacyFilter_1.applyPrivacyFilterToMatches)(matches, userId)).filter(p => !p.is_blocked);
        res.json({
            success: true,
            data: {
                matches: filteredMatches,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: total,
                    total_pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    }
    catch (error) {
        console.error("Get Today Matches Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Match Profile Details with Partner Preferences
async function getMatchProfile(req, res) {
    try {
        const { matchId } = req.params;
        const userId = req.user.user_id;
        // Check if either user has blocked the other (bidirectional block)
        const [blockRecord] = await query(`SELECT id FROM user_actions
       WHERE ((user_id = ? AND target_user_id = ?) OR (user_id = ? AND target_user_id = ?))
         AND action_type_id = 3
       LIMIT 1`, [matchId, userId, userId, matchId]);
        if (blockRecord) {
            return res.status(403).json({ success: false, message: "This profile is not available" });
        }
        // Get match profile details with match score
        const [profile] = await query(`
      SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.vivaaha_user_id,
             up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
             up.height, up.marital_status_id, up.religion_id, up.caste_id,
             up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
             up.about_myself, up.profile_picture, up.lives_with_family,
             up.has_children, up.number_of_children, up.diet_id, up.blood_group_id,
             up.disability_id, up.health_info_id,
             rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
             mtm.language_name as mother_tongue, dm.diet_name, bg.blood_group,
             dis.disability_name, hi.health_condition,
             us.plan_id, sp.plan_name, sp.price as plan_price, sp.duration_months,
             ssm.status_name as subscription_status, us.start_date as subscription_start,
             us.end_date as subscription_end,
             COALESCE(m.match_score, ROUND(RAND() * 100, 1)) as match_score,
             CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN matches m ON (m.user1_id = ? AND m.user2_id = u.id)
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN gender_master gm ON up.gender_id = gm.id
      LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
      LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
      LEFT JOIN diet_master dm ON up.diet_id = dm.id
      LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
      LEFT JOIN disability_master dis ON up.disability_id = dis.id
      LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
      LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
      WHERE u.id = ?
        -- 21-07-2026 - Profile complete condition
        AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}`, [userId, matchId]);
        if (!profile) {
            return res.status(404).json({ success: false, message: "Profile not found" });
        }
        // Track profile view
        await query(`
      INSERT INTO profile_views (viewer_id, viewed_user_id, view_date)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE view_date = NOW()
    `, [userId, matchId]);
        // Create profile view alert — once per viewer per day
        const [existing] = await query(`SELECT id FROM user_alerts
       WHERE user_id = ? AND from_user_id = ? AND alert_type_id = 3
         AND DATE(created_at) = CURDATE()
       LIMIT 1`, [matchId, userId]);
        if (!existing) {
            await (0, AlertsController_1.createProfileViewAlert)(matchId, userId);
        }
        // Get career details
        const [career] = await query(`
      SELECT cd.*, cm.currency_code, cm.symbol,
             CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm.profession_name, cd.occupation) ELSE cd.occupation END as occupation
      FROM career_details cd
      LEFT JOIN currency_master cm ON cd.currency_id = cm.id
      LEFT JOIN profession_master pm ON cd.occupation REGEXP '^[0-9]+$' AND pm.id = CAST(cd.occupation AS UNSIGNED)
      WHERE cd.user_id = ?`, [matchId]);
        // Get education details
        const [education] = await query(`
      SELECT ed.*, elm.level_name
      FROM education_details ed
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      WHERE ed.user_id = ?`, [matchId]);
        // Get family details
        const [family] = await query(`
      SELECT fd.*, ftm.type_name as family_type, fsm.status_name as family_status,
             fvm.value_name as family_values, cm.country_name as family_country
      FROM family_details fd
      LEFT JOIN family_type_master ftm ON fd.family_type_id = ftm.id
      LEFT JOIN family_status_master fsm ON fd.family_status_id = fsm.id
      LEFT JOIN family_values_master fvm ON fd.family_values_id = fvm.id
      LEFT JOIN country_code_master cm ON fd.family_country_id = cm.id
      WHERE fd.user_id = ?`, [matchId]);
        // Get partner preferences
        const [partnerPrefs] = await query(`
      SELECT pp.*, cm.currency_code, cm.symbol as currency_symbol
      FROM partner_preferences pp
      LEFT JOIN currency_master cm ON pp.currency_id = cm.id
      WHERE pp.user_id = ?`, [matchId]);
        // Get astro details
        const [astro] = await query(`
      SELECT ad.*, g.gothra_name, c.country_name as birth_country
      FROM astro_details ad
      LEFT JOIN gothra_master g ON ad.gothra_id = g.id
      LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
      WHERE ad.user_id = ?`, [matchId]);
        // Get location details
        const [location] = await query(`
      SELECT ld.*, c.city_name, s.state_name, co.country_name
      FROM location_details ld
      LEFT JOIN cities_master c ON ld.city_id = c.id
      LEFT JOIN states_master s ON ld.state_id = s.id
      LEFT JOIN country_code_master co ON ld.country_id = co.id
      WHERE ld.user_id = ?`, [matchId]);
        // Get hobbies
        const hobbies = await query(`
      SELECT hm.hobby_name, hm.category
      FROM user_hobbies uh
      JOIN hobbies_master hm ON uh.hobby_id = hm.id
      WHERE uh.user_id = ?`, [matchId]);
        // Get photos
        const photos = await query(`
      SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC`, [matchId]);
        // Get match actions (shortlist, block, don't show again)
        const matchActions = await query(`
      SELECT ua.action_type_id, atm.action_name
      FROM user_actions ua
      JOIN action_types_master atm ON ua.action_type_id = atm.id
      WHERE ua.user_id = ? AND ua.target_user_id = ?
    `, [userId, matchId]);
        // Get report status
        const [reportAction] = await query(`
      SELECT ur.id, 'Report' as action_name, 4 as action_type_id
      FROM user_reports ur
      WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
    `, [userId, matchId]);
        // Combine all actions
        const allActions = [...matchActions];
        if (reportAction) {
            allActions.push(reportAction);
        }
        // Get connect status
        const [connectStatus] = await query(`
      SELECT status FROM connect_now_requests
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at DESC LIMIT 1
    `, [userId, matchId, matchId, userId]);
        // Get photo request status (sent by current user to this profile)
        const [photoRequestRecord] = await query(`
      SELECT status FROM user_interests
      WHERE sender_id = ? AND receiver_id = ?
      ORDER BY created_at DESC LIMIT 1
    `, [userId, matchId]);
        // Attach photos BEFORE privacy filter so album_photo_privacy is applied correctly
        profile.photos = photos;
        // Apply privacy filter to profile (handles album_privacy_status + photo_url nulling)
        const filteredProfile = await (0, privacyFilter_1.applyPrivacyFilter)(profile, userId);
        if (!filteredProfile) {
            return res.status(403).json({ success: false, message: "This profile is not available" });
        }
        res.json({
            success: true,
            profile: Object.assign(Object.assign({}, filteredProfile), { career,
                education,
                family,
                astro,
                location,
                hobbies, partner_preferences: partnerPrefs, match_actions: allActions, connect_status: (connectStatus === null || connectStatus === void 0 ? void 0 : connectStatus.status) || null, photo_request_status: (photoRequestRecord === null || photoRequestRecord === void 0 ? void 0 : photoRequestRecord.status) || null })
        });
    }
    catch (error) {
        console.error("Get Match Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Compare My Profile with Match Profile
async function compareProfiles(req, res) {
    try {
        const { matchId } = req.params;
        const userId = req.user.user_id;
        // Get compatibility data
        const [compatibility] = await query(`
      SELECT * FROM profile_compatibility
      WHERE user1_id = ? AND user2_id = ?`, [userId, matchId]);
        // Get my partner preferences
        const [myPrefs] = await query(`
      SELECT * FROM partner_preferences WHERE user_id = ?`, [userId]);
        // Get match partner preferences
        const [matchPrefs] = await query(`
      SELECT * FROM partner_preferences WHERE user_id = ?`, [matchId]);
        // Get my profile details
        const [myProfile] = await query(`
      SELECT up.age, up.height, up.religion_id, up.caste_id, up.mother_tongue_id,
             up.marital_status_id, up.profile_picture, cd.annual_income, cd.city_living_in,
             ed.education_level_id
      FROM user_profiles up
      LEFT JOIN career_details cd ON up.user_id = cd.user_id
      LEFT JOIN education_details ed ON up.user_id = ed.user_id
      WHERE up.user_id = ?`, [userId]);
        // Get match profile details
        const [matchProfile] = await query(`
      SELECT up.age, up.height, up.religion_id, up.caste_id, up.mother_tongue_id,
             up.marital_status_id, up.profile_picture, cd.annual_income, cd.city_living_in,
             ed.education_level_id
      FROM user_profiles up
      LEFT JOIN career_details cd ON up.user_id = cd.user_id
      LEFT JOIN education_details ed ON up.user_id = ed.user_id
      WHERE up.user_id = ?`, [matchId]);
        // Check if profiles exist
        if (!myProfile) {
            return res.status(404).json({ success: false, message: "Your profile not found" });
        }
        if (!matchProfile) {
            return res.status(404).json({ success: false, message: "Match profile not found" });
        }
        // Calculate match percentages
        const matchAnalysis = {
            age_match: checkAgeMatch(myProfile.age, matchPrefs),
            height_match: checkHeightMatch(myProfile.height, matchPrefs),
            religion_match: checkReligionMatch(myProfile.religion_id, matchPrefs),
            location_match: checkLocationMatch(myProfile.city_living_in, matchPrefs),
            education_match: checkEducationMatch(myProfile.education_level_id, matchPrefs),
            income_match: checkIncomeMatch(myProfile.annual_income, matchPrefs),
            overall_compatibility: (compatibility === null || compatibility === void 0 ? void 0 : compatibility.overall_compatibility_score) || 0
        };
        // Get match actions for compare profiles
        const matchActions = await query(`
      SELECT ua.action_type_id, atm.action_name
      FROM user_actions ua
      JOIN action_types_master atm ON ua.action_type_id = atm.id
      WHERE ua.user_id = ? AND ua.target_user_id = ?
    `, [userId, matchId]);
        const [reportAction] = await query(`
      SELECT ur.id, 'Report' as action_name, 4 as action_type_id
      FROM user_reports ur
      WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
    `, [userId, matchId]);
        const allActions = [...matchActions];
        if (reportAction) {
            allActions.push(reportAction);
        }
        res.json({
            success: true,
            data: {
                my_profile: myProfile,
                match_profile: matchProfile,
                my_preferences: myPrefs,
                match_preferences: matchPrefs,
                compatibility: matchAnalysis,
                match_actions: allActions
            }
        });
    }
    catch (error) {
        console.error("Compare Profiles Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Helper functions for match calculations
function checkAgeMatch(age, preferences) {
    if (!preferences || !preferences.min_age || !preferences.max_age)
        return false;
    return age >= preferences.min_age && age <= preferences.max_age;
}
function checkHeightMatch(height, preferences) {
    if (!preferences || !preferences.min_height || !preferences.max_height)
        return false;
    // Simple height comparison logic
    return true; // Simplified for now
}
function checkReligionMatch(religionId, preferences) {
    if (!preferences || !preferences.religion_ids)
        return false;
    const religionIds = JSON.parse(preferences.religion_ids || '[]');
    return religionIds.length === 0 || religionIds.includes(religionId);
}
function checkLocationMatch(city, preferences) {
    if (!preferences || !preferences.state)
        return false;
    return preferences.state.toLowerCase().includes((city === null || city === void 0 ? void 0 : city.toLowerCase()) || '');
}
function checkEducationMatch(educationId, preferences) {
    if (!preferences || !preferences.education_level_ids)
        return false;
    const educationIds = JSON.parse(preferences.education_level_ids || '[]');
    return educationIds.length === 0 || educationIds.includes(educationId);
}
function checkIncomeMatch(income, preferences) {
    if (!preferences || !preferences.min_income)
        return false;
    return income >= preferences.min_income;
}
//# sourceMappingURL=MatchController.js.map