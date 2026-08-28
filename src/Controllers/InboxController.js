"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReceivedInterests = getReceivedInterests;
exports.getAcceptedConnections = getAcceptedConnections;
exports.getRequests = getRequests;
exports.getSentInterests = getSentInterests;
exports.acceptInterest = acceptInterest;
exports.declineInterest = declineInterest;
exports.sendPhotoRequest = sendPhotoRequest;
exports.cancelPhotoRequest = cancelPhotoRequest;
exports.getDeletedInterests = getDeletedInterests;
exports.getInboxSummary = getInboxSummary;
exports.acceptInterestFromInbox = acceptInterestFromInbox;
exports.declineInterestFromInbox = declineInterestFromInbox;
exports.cancelInvitation = cancelInvitation;
exports.sendReminder = sendReminder;
exports.getReminders = getReminders;
exports.getCancelledInvitations = getCancelledInvitations;
exports.getMatchesForInbox = getMatchesForInbox;
const utils = require("util");
const AlertsController_1 = require("./AlertsController");
const privacyFilter_1 = require("../utils/privacyFilter");
// 21-07-2026 - Profile complete condition
const profileCompletion_1 = require("../utils/profileCompletion");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Get profile details helper function
async function getProfileDetails(userId, currentUserId) {
    const [profile] = await query(`
    SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
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
           COALESCE(cim2.city_name, cd.city_living_in) as city_living_in, COALESCE(stm2.state_name, cd.state_living_in_id) as state_living_in, cd.country_living_in_id,
           clc2.country_name as country_living,
           cur.currency_code, cur.symbol as currency_symbol,
           ed.education_level_id, ed.institution_name, ed.institution_name_2,
           elm.level_name as education_level,
           us.plan_id, sp.plan_name, sp.price as plan_price, sp.duration_months,
           ssm.status_name as subscription_status, us.start_date as subscription_start,
           us.end_date as subscription_end,
           CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status
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
    LEFT JOIN cities_master cim2 ON cd.city_living_in = cim2.id
    LEFT JOIN states_master stm2 ON cd.state_living_in_id = stm2.id
    LEFT JOIN country_code_master clc2 ON cd.country_living_in_id = clc2.id
    LEFT JOIN currency_master cur ON cd.currency_id = cur.id
    LEFT JOIN education_details ed ON u.id = ed.user_id
    LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
    LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
    LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
    LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
    WHERE u.id = ? AND u.status = 1
      -- 21-07-2026 - Profile complete condition
      AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}
  `, [userId]);
    if (!profile)
        return null;
    // Get additional details
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
    const [astro] = await query(`
    SELECT ad.*, g.gothra_name, c.country_name
    FROM astro_details ad
    LEFT JOIN gothra_master g ON ad.gothra_id = g.id
    LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
    WHERE ad.user_id = ?
  `, [userId]);
    const [location] = await query(`
    SELECT ld.*, c.city_name, s.state_name, co.country_name
    FROM location_details ld
    LEFT JOIN cities_master c ON ld.city_id = c.id
    LEFT JOIN states_master s ON ld.state_id = s.id
    LEFT JOIN country_code_master co ON ld.country_id = co.id
    WHERE ld.user_id = ?
  `, [userId]);
    const hobbies = await query(`
    SELECT hm.* FROM user_hobbies uh
    JOIN hobbies_master hm ON uh.hobby_id = hm.id
    WHERE uh.user_id = ?
  `, [userId]);
    const photos = await query(`
    SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC
  `, [userId]);
    // Get connect status
    const [connectStatus] = await query(`
    SELECT status FROM connect_now_requests 
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at DESC LIMIT 1
  `, [currentUserId, userId, userId, currentUserId]);
    // Get match actions
    const matchActions = await query(`
    SELECT ua.action_type_id, atm.action_name
    FROM user_actions ua
    LEFT JOIN action_types_master atm ON ua.action_type_id = atm.id
    WHERE ua.user_id = ? AND ua.target_user_id = ?
  `, [currentUserId, userId]);
    const filtered = await Promise.resolve().then(() => require('../utils/privacyFilter')).then(m => m.applyPrivacyFilter(Object.assign(Object.assign({}, profile), { family: family || {}, astro: astro || {}, location: location || {}, hobbies: hobbies || [], photos: photos || [], connect_status: (connectStatus === null || connectStatus === void 0 ? void 0 : connectStatus.status) || null, match_actions: matchActions || [] }), currentUserId));
    return filtered;
}
// Get Received Interests (Inbox - Received Tab)
async function getReceivedInterests(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10, sort = 'most_relevant' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let orderBy = 'ui.created_at DESC';
        if (sort === 'newest_first') {
            orderBy = 'ui.created_at DESC';
        }
        else if (sort === 'oldest_first') {
            orderBy = 'ui.created_at ASC';
        }
        const interests = await query(`
      SELECT ui.id, ui.sender_id, ui.message, ui.status, ui.created_at,
             DATE_FORMAT(ui.created_at, '%d %b') as formatted_date,
             CASE 
               WHEN DATE(ui.created_at) = CURDATE() THEN 'Today'
               WHEN DATE(ui.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 'Yesterday'
               ELSE DATE_FORMAT(ui.created_at, '%d %b')
             END as display_date
      FROM user_interests ui
      WHERE ui.receiver_id = ? AND ui.status = 'sent'
        AND ui.sender_id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND ui.sender_id NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `, [userId, userId, userId, parseInt(limit), offset]);
        // Get profile details for each sender
        const enrichedInterests = (await Promise.all(interests.map(async (interest) => {
            const profile = await getProfileDetails(interest.sender_id, userId);
            if (!profile)
                return null;
            return {
                interest_id: interest.id,
                sender_id: interest.sender_id,
                message: interest.message,
                status: interest.status,
                created_at: interest.created_at,
                formatted_date: interest.formatted_date,
                display_date: interest.display_date,
                profile: profile,
                action_message: "She invited you to Connect"
            };
        }))).filter(Boolean);
        const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM user_interests
      WHERE receiver_id = ? AND status = 'sent'
        AND sender_id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND sender_id NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);
        res.json({
            success: true,
            data: {
                received_interests: enrichedInterests,
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
        console.error("Get Received Interests Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Accepted Connections (Inbox - Accepted Tab)
async function getAcceptedConnections(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10, filter = 'accepted_by_her' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        // accepted_by_her → others accepted my interest/connect request
        // accepted_by_me  → I accepted their interest/connect request
        // ── 1. Accepted interests ────────────────────────────────────────────────
        let interestWhere = '';
        if (filter === 'accepted_by_me') {
            // I am receiver and I accepted
            interestWhere = 'ui.receiver_id = ? AND ui.status = \'accepted\'';
        }
        else {
            // I am sender and they accepted
            interestWhere = 'ui.sender_id = ? AND ui.status = \'accepted\'';
        }
        const acceptedInterests = await query(`
      SELECT 'interest' as connection_source,
             ui.id, ui.sender_id, ui.receiver_id, ui.message, ui.response_message,
             ui.status, ui.created_at, ui.updated_at,
             CASE 
               WHEN DATE(ui.updated_at) = CURDATE() THEN 'Today'
               WHEN DATE(ui.updated_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 'Yesterday'
               ELSE DATE_FORMAT(ui.updated_at, '%d %b')
             END as display_date
      FROM user_interests ui
      WHERE ${interestWhere}
        AND (CASE WHEN ui.sender_id = ? THEN ui.receiver_id ELSE ui.sender_id END) NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND (CASE WHEN ui.sender_id = ? THEN ui.receiver_id ELSE ui.sender_id END) NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
      ORDER BY ui.updated_at DESC
      LIMIT ? OFFSET ?
    `, [userId, userId, userId, userId, userId, parseInt(limit), offset]);
        // ── 2. Accepted connect_now_requests ─────────────────────────────────────
        let connectWhere = '';
        if (filter === 'accepted_by_me') {
            // I am receiver and I accepted
            connectWhere = 'cnr.receiver_id = ? AND cnr.status = \'accepted\'';
        }
        else {
            // I am sender and they accepted
            connectWhere = 'cnr.sender_id = ? AND cnr.status = \'accepted\'';
        }
        const acceptedConnects = await query(`
      SELECT 'connect' as connection_source,
             cnr.id, cnr.sender_id, cnr.receiver_id, cnr.message, NULL as response_message,
             cnr.status, cnr.created_at, cnr.updated_at,
             CASE 
               WHEN DATE(cnr.updated_at) = CURDATE() THEN 'Today'
               WHEN DATE(cnr.updated_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 'Yesterday'
               ELSE DATE_FORMAT(cnr.updated_at, '%d %b')
             END as display_date
      FROM connect_now_requests cnr
      WHERE ${connectWhere}
        AND (CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END) NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND (CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END) NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
      ORDER BY cnr.updated_at DESC
    `, [userId, userId, userId, userId, userId]);
        // ── 3. Merge & enrich ────────────────────────────────────────────────────
        const allAccepted = [...acceptedInterests, ...acceptedConnects]
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        const enrichedConnections = (await Promise.all(allAccepted.map(async (connection) => {
            const otherUserId = connection.sender_id === userId ? connection.receiver_id : connection.sender_id;
            const profile = await getProfileDetails(otherUserId, userId);
            if (!profile)
                return null;
            return {
                connection_id: connection.id,
                connection_source: connection.connection_source,
                other_user_id: otherUserId,
                message: connection.message,
                response_message: connection.response_message,
                status: connection.status,
                created_at: connection.created_at,
                updated_at: connection.updated_at,
                display_date: connection.display_date,
                profile: profile,
                connection_type: filter === 'accepted_by_me' ? 'accepted_by_me' : 'accepted_by_her'
            };
        }))).filter(Boolean);
        // ── 4. Total count ───────────────────────────────────────────────────────
        const [{ interestTotal }] = await query(`
      SELECT COUNT(*) as interestTotal FROM user_interests ui
      WHERE ${interestWhere}
        AND (CASE WHEN ui.sender_id = ? THEN ui.receiver_id ELSE ui.sender_id END) NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND (CASE WHEN ui.sender_id = ? THEN ui.receiver_id ELSE ui.sender_id END) NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId, userId, userId]);
        const [{ connectTotal }] = await query(`
      SELECT COUNT(*) as connectTotal FROM connect_now_requests cnr
      WHERE ${connectWhere}
        AND (CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END) NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND (CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END) NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId, userId, userId]);
        const total = (interestTotal || 0) + (connectTotal || 0);
        res.json({
            success: true,
            data: {
                accepted_connections: enrichedConnections,
                filter: filter,
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
        console.error("Get Accepted Connections Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Requests (Inbox - Requests Tab)
async function getRequests(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10, type = 'pending_requests', filter = 'all_requests' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let requests = [];
        let total = 0;
        if (type === 'pending_requests') {
            // Get pending interest requests and connect requests
            const interestRequests = await query(`
        SELECT 
          CASE WHEN LOWER(ui.message) LIKE '%photo%' THEN 'photo' ELSE 'interest' END as request_type,
          ui.id, ui.sender_id as from_user_id, ui.receiver_id as to_user_id,
               ui.message, ui.status, ui.created_at,
               DATE_FORMAT(ui.created_at, '%d %b') as formatted_date
        FROM user_interests ui
        WHERE ui.receiver_id = ? AND ui.status = 'sent'
          AND ui.sender_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND ui.sender_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
        ORDER BY ui.created_at DESC
        LIMIT ? OFFSET ?
      `, [userId, userId, userId, parseInt(limit), offset]);
            const connectRequests = await query(`
        SELECT 'connect' as request_type, cnr.id, cnr.sender_id as from_user_id, cnr.receiver_id as to_user_id,
               cnr.message, cnr.status, cnr.created_at,
               DATE_FORMAT(cnr.created_at, '%d %b') as formatted_date
        FROM connect_now_requests cnr
        WHERE cnr.receiver_id = ? AND cnr.status = 'pending'
          AND cnr.sender_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND cnr.sender_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
        ORDER BY cnr.created_at DESC
      `, [userId, userId, userId]);
            requests = [...interestRequests, ...connectRequests];
            const [interestCount] = await query(`
        SELECT COUNT(*) as total FROM user_interests WHERE receiver_id = ? AND status = 'sent'
          AND sender_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND sender_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
      `, [userId, userId, userId]);
            const [connectCount] = await query(`
        SELECT COUNT(*) as total FROM connect_now_requests WHERE receiver_id = ? AND status = 'pending'
          AND sender_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND sender_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
      `, [userId, userId, userId]);
            total = ((interestCount === null || interestCount === void 0 ? void 0 : interestCount.total) || 0) + ((connectCount === null || connectCount === void 0 ? void 0 : connectCount.total) || 0);
        }
        else if (type === 'accepted_requests') {
            requests = await query(`
        SELECT 'interest' as request_type, ui.id, ui.sender_id as from_user_id, ui.receiver_id as to_user_id,
               ui.message, ui.response_message, ui.status, ui.created_at, ui.updated_at,
               DATE_FORMAT(ui.updated_at, '%d %b') as formatted_date
        FROM user_interests ui
        WHERE ui.receiver_id = ? AND ui.status = 'accepted'
          AND ui.sender_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND ui.sender_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
        ORDER BY ui.updated_at DESC
        LIMIT ? OFFSET ?
      `, [userId, userId, userId, parseInt(limit), offset]);
            const [{ total: acceptedTotal }] = await query(`
        SELECT COUNT(*) as total FROM user_interests WHERE receiver_id = ? AND status = 'accepted'
          AND sender_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND sender_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
      `, [userId, userId, userId]);
            total = acceptedTotal;
        }
        else if (type === 'sent_requests') {
            const sentInterests = await query(`
        SELECT 
          CASE WHEN LOWER(ui.message) LIKE '%photo%' THEN 'photo' ELSE 'interest' END as request_type,
          ui.id, ui.sender_id as from_user_id, ui.receiver_id as to_user_id,
               ui.message, ui.status, ui.created_at,
               DATE_FORMAT(ui.created_at, '%d %b') as formatted_date,
               CASE 
                 WHEN ui.status = 'sent' THEN 'You requested her to add Photo'
                 WHEN ui.status = 'accepted' THEN 'Request accepted'
                 WHEN ui.status = 'declined' THEN 'Request declined'
               END as request_message
        FROM user_interests ui
        WHERE ui.sender_id = ?
          AND ui.receiver_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND ui.receiver_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
        ORDER BY ui.created_at DESC
        LIMIT ? OFFSET ?
      `, [userId, userId, userId, parseInt(limit), offset]);
            const sentConnects = await query(`
        SELECT 'connect' as request_type, cnr.id, cnr.sender_id as from_user_id, cnr.receiver_id as to_user_id,
               cnr.message, cnr.status, cnr.created_at,
               DATE_FORMAT(cnr.created_at, '%d %b') as formatted_date,
               'Connect request sent' as request_message
        FROM connect_now_requests cnr
        WHERE cnr.sender_id = ?
          AND cnr.receiver_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND cnr.receiver_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
        ORDER BY cnr.created_at DESC
      `, [userId, userId, userId]);
            requests = [...sentInterests, ...sentConnects];
            const [sentInterestCount] = await query(`
        SELECT COUNT(*) as total FROM user_interests WHERE sender_id = ?
          AND receiver_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND receiver_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
      `, [userId, userId, userId]);
            const [sentConnectCount] = await query(`
        SELECT COUNT(*) as total FROM connect_now_requests WHERE sender_id = ?
          AND receiver_id NOT IN (
            SELECT target_user_id FROM user_actions
            WHERE user_id = ? AND action_type_id = 3
          )
          AND receiver_id NOT IN (
            SELECT user_id FROM user_actions
            WHERE target_user_id = ? AND action_type_id = 3
          )
      `, [userId, userId, userId]);
            total = ((sentInterestCount === null || sentInterestCount === void 0 ? void 0 : sentInterestCount.total) || 0) + ((sentConnectCount === null || sentConnectCount === void 0 ? void 0 : sentConnectCount.total) || 0);
        }
        // Get profile details for each request
        const enrichedRequests = (await Promise.all(requests.map(async (request) => {
            const otherUserId = request.from_user_id === userId ? request.to_user_id : request.from_user_id;
            const profile = await getProfileDetails(otherUserId, userId);
            if (!profile)
                return null;
            return {
                request_id: request.id,
                request_type: request.request_type,
                from_user_id: request.from_user_id,
                to_user_id: request.to_user_id,
                message: request.message,
                response_message: request.response_message || null,
                status: request.status,
                created_at: request.created_at,
                updated_at: request.updated_at || request.created_at,
                formatted_date: request.formatted_date,
                request_message: request.request_message || (request.request_type === 'interest' ? 'Interest request' : 'Connect request'),
                profile: profile
            };
        }))).filter(Boolean);
        res.json({
            success: true,
            data: {
                requests: enrichedRequests,
                type: type,
                filter: filter,
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
        console.error("Get Requests Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Sent Interests (Inbox - Sent Tab)
async function getSentInterests(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        // ── 1. Sent interests ────────────────────────────────────────────────────
        const sentInterests = await query(`
      SELECT 'interest' as sent_type,
             ui.id, ui.receiver_id as other_user_id, ui.message, ui.status, ui.created_at, ui.updated_at,
             CASE 
               WHEN DATE(ui.created_at) = CURDATE() THEN 'Today'
               WHEN DATE(ui.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 'Yesterday'
               ELSE DATE_FORMAT(ui.created_at, '%d %b')
             END as display_date
      FROM user_interests ui
      WHERE ui.sender_id = ? AND ui.status IN ('sent', 'accepted')
        AND ui.receiver_id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND ui.receiver_id NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);
        // ── 2. Sent connect requests ─────────────────────────────────────────────
        const sentConnects = await query(`
      SELECT 'connect' as sent_type,
             cnr.id, cnr.receiver_id as other_user_id, cnr.message, cnr.status, cnr.created_at, cnr.updated_at,
             CASE 
               WHEN DATE(cnr.created_at) = CURDATE() THEN 'Today'
               WHEN DATE(cnr.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 'Yesterday'
               ELSE DATE_FORMAT(cnr.created_at, '%d %b')
             END as display_date
      FROM connect_now_requests cnr
      WHERE cnr.sender_id = ? AND cnr.status IN ('pending', 'accepted')
        AND cnr.receiver_id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND cnr.receiver_id NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);
        // ── 3. Merge & sort by created_at DESC ───────────────────────────────────
        const allSent = [...sentInterests, ...sentConnects]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(offset, offset + parseInt(limit));
        const enriched = (await Promise.all(allSent.map(async (item) => {
            const profile = await getProfileDetails(item.other_user_id, userId);
            if (!profile)
                return null;
            const isConnect = item.sent_type === 'connect';
            let statusMessage;
            if (isConnect) {
                statusMessage = item.status === 'pending' ? 'Pending' : 'Accepted';
            }
            else {
                statusMessage = item.status === 'sent' ? 'Pending' : 'Accepted';
            }
            return {
                interest_id: item.id,
                sent_type: item.sent_type, // 'interest' | 'connect'
                receiver_id: item.other_user_id,
                message: item.message,
                status: item.status,
                created_at: item.created_at,
                updated_at: item.updated_at,
                display_date: item.display_date,
                profile: profile,
                status_message: statusMessage
            };
        }))).filter(Boolean);
        const total = sentInterests.length + sentConnects.length;
        res.json({
            success: true,
            data: {
                sent_interests: enriched,
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
        console.error("Get Sent Interests Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Accept Interest (POST endpoint)
async function acceptInterest(req, res) {
    try {
        const userId = req.user.user_id;
        const { interest_id, invitation_id, message } = req.body;
        const targetId = interest_id || invitation_id;
        if (!targetId) {
            return res.status(400).json({
                success: false,
                message: "interest_id is required"
            });
        }
        const [interest] = await query(`
      SELECT * FROM user_interests WHERE id = ? AND receiver_id = ? AND status = 'sent'
    `, [targetId, userId]);
        if (!interest) {
            return res.status(404).json({
                success: false,
                message: "Interest not found or already processed"
            });
        }
        await query(`
      UPDATE user_interests 
      SET status = 'accepted', response_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [message || "Thank you for your interest!", targetId]);
        res.json({
            success: true,
            message: "Interest accepted successfully"
        });
    }
    catch (error) {
        console.error("Accept Interest Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Decline Interest (POST endpoint)
async function declineInterest(req, res) {
    try {
        const userId = req.user.user_id;
        const { interest_id, invitation_id } = req.body;
        const targetId = interest_id || invitation_id;
        if (!targetId) {
            return res.status(400).json({
                success: false,
                message: "interest_id is required"
            });
        }
        const [interest] = await query(`
      SELECT * FROM user_interests WHERE id = ? AND receiver_id = ? AND status = 'sent'
    `, [targetId, userId]);
        if (!interest) {
            return res.status(404).json({
                success: false,
                message: "Interest not found or already processed"
            });
        }
        await query(`
      UPDATE user_interests 
      SET status = 'declined', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [targetId]);
        res.json({
            success: true,
            message: "Interest declined successfully"
        });
    }
    catch (error) {
        console.error("Decline Interest Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Send Photo Request
async function sendPhotoRequest(req, res) {
    try {
        const userId = req.user.user_id;
        const { receiver_id, user_id, message } = req.body;
        const targetUserId = receiver_id || user_id;
        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                message: "receiver_id is required"
            });
        }
        const [existingRequest] = await query(`
      SELECT * FROM user_interests 
      WHERE sender_id = ? AND receiver_id = ?
    `, [userId, targetUserId]);
        if (existingRequest) {
            if (existingRequest.status === 'sent') {
                return res.status(400).json({
                    success: false,
                    message: "Photo request already sent and pending"
                });
            }
            else if (existingRequest.status === 'accepted') {
                return res.status(400).json({
                    success: false,
                    message: "Photo request already accepted"
                });
            }
            else if (existingRequest.status === 'declined') {
                // Update existing declined request to sent
                await query(`
          UPDATE user_interests 
          SET status = 'sent', message = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [message || "I would like to see your photos.", existingRequest.id]);
                // Create alert for photo request
                await (0, AlertsController_1.createPhotoRequestAlert)(targetUserId, userId);
                return res.json({
                    success: true,
                    message: "Photo request sent successfully"
                });
            }
        }
        await query(`
      INSERT INTO user_interests (sender_id, receiver_id, message, status, created_at)
      VALUES (?, ?, ?, 'sent', CURRENT_TIMESTAMP)
    `, [userId, targetUserId, message || "I would like to see your photos."]);
        // Create alert for photo request
        await (0, AlertsController_1.createPhotoRequestAlert)(targetUserId, userId);
        res.json({
            success: true,
            message: "Photo request sent successfully"
        });
    }
    catch (error) {
        console.error("Send Photo Request Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Cancel Photo Request
async function cancelPhotoRequest(req, res) {
    try {
        const userId = req.user.user_id;
        const { receiver_id } = req.body;
        if (!receiver_id) {
            return res.status(400).json({ success: false, message: "receiver_id is required" });
        }
        const [existing] = await query(`
      SELECT id FROM user_interests WHERE sender_id = ? AND receiver_id = ? AND status = 'sent'
    `, [userId, receiver_id]);
        if (!existing) {
            return res.status(404).json({ success: false, message: "No pending photo request found" });
        }
        await query(`
      UPDATE user_interests SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [existing.id]);
        res.json({ success: true, message: "Photo request cancelled successfully" });
    }
    catch (error) {
        console.error("Cancel Photo Request Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Deleted/Declined Interests (Inbox - Deleted Tab)
async function getDeletedInterests(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10, filter = 'all_requests' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let whereClause = '';
        let params = [];
        if (filter === 'cancelled_by_me') {
            // Interests I declined
            whereClause = 'ui.receiver_id = ? AND ui.status = ?';
            params = [userId, 'declined'];
        }
        else if (filter === 'cancelled_by_them') {
            // Interests they declined
            whereClause = 'ui.sender_id = ? AND ui.status = ?';
            params = [userId, 'declined'];
        }
        else {
            // All declined interests
            whereClause = '(ui.receiver_id = ? OR ui.sender_id = ?) AND ui.status = ?';
            params = [userId, userId, 'declined'];
        }
        const deletedInterests = await query(`
      SELECT ui.id, ui.sender_id, ui.receiver_id, ui.message, ui.status, ui.created_at, ui.updated_at,
             DATE_FORMAT(ui.updated_at, '%d %b') as formatted_date,
             CASE 
               WHEN DATE(ui.updated_at) = CURDATE() THEN 'Today'
               WHEN DATE(ui.updated_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 'Yesterday'
               ELSE DATE_FORMAT(ui.updated_at, '%d %b')
             END as display_date
      FROM user_interests ui
      WHERE ${whereClause}
      ORDER BY ui.updated_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);
        // Get profile details for each deleted interest
        const enrichedDeletedInterests = (await Promise.all(deletedInterests.map(async (interest) => {
            const otherUserId = interest.sender_id === userId ? interest.receiver_id : interest.sender_id;
            const profile = await getProfileDetails(otherUserId, userId);
            if (!profile)
                return null;
            const declinedBy = interest.receiver_id === userId ? 'me' : 'them';
            return {
                interest_id: interest.id,
                sender_id: interest.sender_id,
                receiver_id: interest.receiver_id,
                other_user_id: otherUserId,
                message: interest.message,
                status: interest.status,
                created_at: interest.created_at,
                updated_at: interest.updated_at,
                formatted_date: interest.formatted_date,
                display_date: interest.display_date,
                profile: profile,
                declined_by: declinedBy,
                decline_message: declinedBy === 'me' ? 'You declined this invitation' : 'She declined your invitation. This member cannot be contacted.'
            };
        }))).filter(Boolean);
        const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM user_interests ui
      WHERE ${whereClause}
    `, params);
        res.json({
            success: true,
            data: {
                deleted_interests: enrichedDeletedInterests,
                filter: filter,
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
        console.error("Get Deleted Interests Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Inbox Summary (counts for each tab)
async function getInboxSummary(req, res) {
    try {
        const userId = req.user.user_id;
        // Get received interests count (excluding blocked)
        const [receivedCount] = await query(`
      SELECT COUNT(*) as count FROM user_interests
      WHERE receiver_id = ? AND status = 'sent'
        AND sender_id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id = 3
        )
        AND sender_id NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);
        // Get accepted connections count (interests + connect_now_requests, excluding blocked)
        const [acceptedInterestCount] = await query(`
      SELECT COUNT(*) as count FROM user_interests
      WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'
        AND (CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id = 3
        )
        AND (CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId, userId, userId, userId]);
        const [acceptedConnectCount] = await query(`
      SELECT COUNT(*) as count FROM connect_now_requests
      WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'
        AND (CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id = 3
        )
        AND (CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END) NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId, userId, userId, userId]);
        const acceptedCount = { count: ((acceptedInterestCount === null || acceptedInterestCount === void 0 ? void 0 : acceptedInterestCount.count) || 0) + ((acceptedConnectCount === null || acceptedConnectCount === void 0 ? void 0 : acceptedConnectCount.count) || 0) };
        // Get pending requests count (both interests and connects, excluding blocked)
        const [pendingInterestsCount] = await query(`
      SELECT COUNT(*) as count FROM user_interests
      WHERE receiver_id = ? AND status = 'sent'
        AND sender_id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id = 3
        )
        AND sender_id NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);
        const [pendingConnectsCount] = await query(`
      SELECT COUNT(*) as count FROM connect_now_requests
      WHERE receiver_id = ? AND status = 'pending'
        AND sender_id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id = 3
        )
        AND sender_id NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);
        // Get sent interests count
        const [sentInterestsCount] = await query(`
      SELECT COUNT(*) as count FROM user_interests
      WHERE sender_id = ? AND status IN ('sent', 'accepted')
        AND receiver_id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id = 3
        )
        AND receiver_id NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);
        // Get sent connect requests count
        const [sentConnectsCount] = await query(`
      SELECT COUNT(*) as count FROM connect_now_requests
      WHERE sender_id = ? AND status IN ('pending', 'accepted')
        AND receiver_id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id = 3
        )
        AND receiver_id NOT IN (
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);
        const sentTotal = ((sentInterestsCount === null || sentInterestsCount === void 0 ? void 0 : sentInterestsCount.count) || 0) + ((sentConnectsCount === null || sentConnectsCount === void 0 ? void 0 : sentConnectsCount.count) || 0);
        // Get deleted/declined interests count
        const [deletedCount] = await query(`
      SELECT COUNT(*) as count FROM user_interests
      WHERE (sender_id = ? OR receiver_id = ?) AND status = 'declined'
    `, [userId, userId]);
        // Get cancelled invitations count
        const [cancelledCount] = await query(`
      SELECT COUNT(*) as count FROM user_interests
      WHERE sender_id = ? AND status = 'declined' AND updated_at > created_at
    `, [userId]);
        const summary = {
            received: (receivedCount === null || receivedCount === void 0 ? void 0 : receivedCount.count) || 0,
            accepted: (acceptedCount === null || acceptedCount === void 0 ? void 0 : acceptedCount.count) || 0,
            requests: ((pendingInterestsCount === null || pendingInterestsCount === void 0 ? void 0 : pendingInterestsCount.count) || 0) + ((pendingConnectsCount === null || pendingConnectsCount === void 0 ? void 0 : pendingConnectsCount.count) || 0),
            sent: sentTotal,
            deleted: (deletedCount === null || deletedCount === void 0 ? void 0 : deletedCount.count) || 0,
            cancelled: (cancelledCount === null || cancelledCount === void 0 ? void 0 : cancelledCount.count) || 0
        };
        res.json({
            success: true,
            data: summary
        });
    }
    catch (error) {
        console.error("Get Inbox Summary Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Accept Interest from Inbox
async function acceptInterestFromInbox(req, res) {
    try {
        const userId = req.user.user_id;
        const { interest_id, message } = req.body;
        if (!interest_id) {
            return res.status(400).json({
                success: false,
                message: "interest_id is required"
            });
        }
        // Verify the interest exists and user is the receiver
        const [interest] = await query(`
      SELECT * FROM user_interests WHERE id = ? AND receiver_id = ? AND status = 'sent'
    `, [interest_id, userId]);
        if (!interest) {
            return res.status(404).json({
                success: false,
                message: "Interest not found or already processed"
            });
        }
        // Update interest status to accepted
        await query(`
      UPDATE user_interests 
      SET status = 'accepted', response_message = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [message || "Thank you for your interest! I would like to connect with you too.", interest_id]);
        res.json({
            success: true,
            message: "Interest accepted successfully"
        });
    }
    catch (error) {
        console.error("Accept Interest from Inbox Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Decline Interest from Inbox
async function declineInterestFromInbox(req, res) {
    try {
        const userId = req.user.user_id;
        const { interest_id } = req.body;
        if (!interest_id) {
            return res.status(400).json({
                success: false,
                message: "interest_id is required"
            });
        }
        // Verify the interest exists and user is the receiver
        const [interest] = await query(`
      SELECT * FROM user_interests WHERE id = ? AND receiver_id = ? AND status = 'sent'
    `, [interest_id, userId]);
        if (!interest) {
            return res.status(404).json({
                success: false,
                message: "Interest not found or already processed"
            });
        }
        // Update interest status to declined
        await query(`
      UPDATE user_interests 
      SET status = 'declined', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [interest_id]);
        res.json({
            success: true,
            message: "Interest declined successfully"
        });
    }
    catch (error) {
        console.error("Decline Interest from Inbox Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Cancel Invitation
async function cancelInvitation(req, res) {
    try {
        const userId = req.user.user_id;
        const { invitation_id } = req.body;
        if (!invitation_id) {
            return res.status(400).json({
                success: false,
                message: "invitation_id is required"
            });
        }
        // Verify the invitation exists and user is the sender
        const [invitation] = await query(`
      SELECT * FROM user_interests WHERE id = ? AND sender_id = ? AND status = 'sent'
    `, [invitation_id, userId]);
        if (!invitation) {
            return res.status(404).json({
                success: false,
                message: "Invitation not found or already processed"
            });
        }
        // Update invitation status to declined (since cancelled is not in ENUM)
        await query(`
      UPDATE user_interests 
      SET status = 'declined', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [invitation_id]);
        res.json({
            success: true,
            message: "Invitation cancelled successfully"
        });
    }
    catch (error) {
        console.error("Cancel Invitation Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Send Reminder
async function sendReminder(req, res) {
    try {
        const userId = req.user.user_id;
        const { invitation_id, message, sent_type = 'interest' } = req.body;
        if (!invitation_id) {
            return res.status(400).json({
                success: false,
                message: "invitation_id is required"
            });
        }
        let receiverId;
        let createdAt;
        if (sent_type === 'connect') {
            // Connect now request
            const [connectRequest] = await query(`
        SELECT * FROM connect_now_requests WHERE id = ? AND sender_id = ? AND status = 'pending'
      `, [invitation_id, userId]);
            if (!connectRequest) {
                return res.status(404).json({
                    success: false,
                    message: "Connect request not found or already processed"
                });
            }
            receiverId = connectRequest.receiver_id;
            createdAt = connectRequest.created_at;
        }
        else {
            // Interest / invitation
            const [invitation] = await query(`
        SELECT * FROM user_interests WHERE id = ? AND sender_id = ? AND status = 'sent'
      `, [invitation_id, userId]);
            if (!invitation) {
                return res.status(404).json({
                    success: false,
                    message: "Invitation not found or already processed"
                });
            }
            receiverId = invitation.receiver_id;
            createdAt = invitation.created_at;
        }
        // Check if 24 hours have passed since the request was sent
        const hoursPassed = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60));
        if (hoursPassed < 24) {
            return res.status(400).json({
                success: false,
                message: "You can send a reminder only after 24 hours"
            });
        }
        // Check if a reminder was already sent in the last 24 hours
        const [recentReminder] = await query(`
      SELECT id FROM interest_reminders
      WHERE sender_id = ? AND receiver_id = ?
        AND TIMESTAMPDIFF(HOUR, created_at, NOW()) < 24
      ORDER BY created_at DESC LIMIT 1
    `, [userId, receiverId]);
        if (recentReminder) {
            return res.status(400).json({
                success: false,
                message: "You already sent a reminder recently. Please wait 24 hours before sending another."
            });
        }
        // Insert reminder record
        await query(`
      INSERT INTO interest_reminders (interest_id, sender_id, receiver_id, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `, [invitation_id, userId, receiverId]);
        res.json({
            success: true,
            message: "Reminder sent successfully"
        });
    }
    catch (error) {
        console.error("Send Reminder Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Reminders List
async function getReminders(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const reminders = await query(`
      SELECT ir.id, ir.interest_id, ir.receiver_id, ir.created_at,
             ui.message as original_message,
             DATE_FORMAT(ir.created_at, '%d %b') as formatted_date
      FROM interest_reminders ir
      JOIN user_interests ui ON ir.interest_id = ui.id
      WHERE ir.sender_id = ?
      ORDER BY ir.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(limit), offset]);
        const enrichedReminders = await Promise.all(reminders.map(async (reminder) => {
            const profile = await getProfileDetails(reminder.receiver_id, userId);
            return {
                reminder_id: reminder.id,
                interest_id: reminder.interest_id,
                receiver_id: reminder.receiver_id,
                original_message: reminder.original_message,
                created_at: reminder.created_at,
                formatted_date: reminder.formatted_date,
                profile: profile
            };
        }));
        const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM interest_reminders WHERE sender_id = ?
    `, [userId]);
        res.json({
            success: true,
            data: {
                reminders: enrichedReminders,
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
        console.error("Get Reminders Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Cancelled Invitations
async function getCancelledInvitations(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const cancelledInvitations = await query(`
      SELECT ui.id, ui.receiver_id, ui.message, ui.status, ui.created_at, ui.updated_at,
             DATE_FORMAT(ui.updated_at, '%d %b') as formatted_date,
             CASE 
               WHEN DATE(ui.updated_at) = CURDATE() THEN 'Today'
               WHEN DATE(ui.updated_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) THEN 'Yesterday'
               ELSE DATE_FORMAT(ui.updated_at, '%d %b')
             END as display_date
      FROM user_interests ui
      WHERE ui.sender_id = ? AND ui.status = 'declined' AND ui.updated_at > ui.created_at
      ORDER BY ui.updated_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(limit), offset]);
        const enrichedCancelledInvitations = await Promise.all(cancelledInvitations.map(async (invitation) => {
            const profile = await getProfileDetails(invitation.receiver_id, userId);
            return {
                invitation_id: invitation.id,
                receiver_id: invitation.receiver_id,
                message: invitation.message,
                status: invitation.status,
                created_at: invitation.created_at,
                updated_at: invitation.updated_at,
                formatted_date: invitation.formatted_date,
                display_date: invitation.display_date,
                profile: profile,
                status_message: 'Cancelled by you'
            };
        }));
        const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM user_interests WHERE sender_id = ? AND status = 'declined' AND updated_at > created_at
    `, [userId]);
        res.json({
            success: true,
            data: {
                cancelled_invitations: enrichedCancelledInvitations,
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
        console.error("Get Cancelled Invitations Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get Matches for Inbox — opposite gender, not yet connected
async function getMatchesForInbox(req, res) {
    try {
        const userId = req.user.user_id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        // Get current user's gender and profile_created_by
        const [me] = await query('SELECT up.gender_id, up.profile_created_by FROM user_profiles up WHERE up.user_id = ?', [userId]);
        if (!me)
            return res.status(404).json({ success: false, message: 'Profile not found' });
        // Opposite gender: male(1) → female(2), female(2) → male(1), other(3) → all
        const oppositeGenderId = me.gender_id === 1 ? 2 : me.gender_id === 2 ? 1 : null;
        const genderFilter = oppositeGenderId ? 'AND up.gender_id = ?' : '';
        const genderParam = oppositeGenderId ? [oppositeGenderId] : [];
        // Parent filter: if current user is parent-managed, only show parent-managed profiles
        const parentFilter = me.profile_created_by === 'parent' ? `AND up.profile_created_by = 'parent'` : '';
        const queryParams = [
            userId, userId, userId, userId, ...genderParam, userId, userId, userId, userId, parseInt(limit), offset
        ];
        const profiles = await query(`
      SELECT
        u.id, u.vivaaha_user_id,
        up.first_name, up.last_name, up.show_vivaaha_id, up.age, up.height,
        up.gender_id, up.religion_id, up.caste_id, up.mother_tongue_id,
        CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id
             ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name)
        END as display_name,
        rm.religion_name, cm.caste_name, comm.community_name, mtm.language_name as mother_tongue,
        cd.occupation, COALESCE(cim.city_name, cd.city_living_in) as city_living_in,
        COALESCE(stm.state_name, cd.state_living_in_id) as state_living_in,
        clc.country_name as country_living,
        CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status,
        -- Interest status this user sent to them
        (SELECT ui.status FROM user_interests ui
         WHERE ui.sender_id = ? AND ui.receiver_id = u.id
         ORDER BY ui.created_at DESC LIMIT 1) as my_interest_status,
        (SELECT ui.id FROM user_interests ui
         WHERE ui.sender_id = ? AND ui.receiver_id = u.id
         ORDER BY ui.created_at DESC LIMIT 1) as my_interest_id,
        -- Connect request status (pending/declined/cancelled)
        (SELECT cnr.status FROM connect_now_requests cnr
         WHERE cnr.sender_id = ? AND cnr.receiver_id = u.id
         ORDER BY cnr.created_at DESC LIMIT 1) as connect_status,
        -- Primary photo as both primary_photo and profile_picture so resolvePhotoUrl works
        (SELECT ph.photo_url FROM user_photos ph
         WHERE ph.user_id = u.id AND ph.is_primary = 1 LIMIT 1) as primary_photo,
        (SELECT ph.photo_url FROM user_photos ph
         WHERE ph.user_id = u.id AND ph.is_primary = 1 LIMIT 1) as profile_picture
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN community_master comm ON up.community_id = comm.id
      LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN cities_master cim ON cd.city_living_in = cim.id
      LEFT JOIN states_master stm ON cd.state_living_in_id = stm.id
      LEFT JOIN country_code_master clc ON cd.country_living_in_id = clc.id
      WHERE u.id != ?
        AND u.status = 1
        AND up.aadhaar_verified = 1
        -- 21-07-2026 - Profile complete condition
        AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}
        ${genderFilter}
        ${parentFilter}
        -- Exclude already accepted connections
        AND NOT EXISTS (
          SELECT 1 FROM connect_now_requests cnr
          WHERE cnr.status = 'accepted'
            AND ((cnr.sender_id = ? AND cnr.receiver_id = u.id)
              OR (cnr.sender_id = u.id AND cnr.receiver_id = ?))
        )
        -- Exclude ignored/blocked members (bidirectional)
        AND u.id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
          UNION
          SELECT user_id FROM user_actions
          WHERE target_user_id = ? AND action_type_id = 3
        )
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, queryParams);
        const filteredProfiles = (await (0, privacyFilter_1.applyPrivacyFilterToMatches)(profiles, userId)).filter(p => !p.is_blocked);
        // Attach album photos + privacy status for each profile
        const enrichedProfiles = await Promise.all(filteredProfiles.map(async (profile) => {
            var _a;
            const photos = await query(`SELECT id, photo_url, is_primary FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC, id ASC`, [profile.id]);
            const [ps] = await query(`SELECT album_photo_privacy FROM privacy_settings WHERE user_id = ?`, [profile.id]);
            const ap = (_a = ps === null || ps === void 0 ? void 0 : ps.album_photo_privacy) !== null && _a !== void 0 ? _a : 'visible_to_all';
            let albumPrivacyStatus = 'visible';
            if (ap === 'hide_from_all') {
                albumPrivacyStatus = 'hidden';
            }
            else if (ap === 'visible_to_premium_only' || ap === 'visible_to_liked') {
                albumPrivacyStatus = 'premium_only';
            }
            return Object.assign(Object.assign({}, profile), { photos, album_privacy_status: albumPrivacyStatus, album_count: photos.filter((p) => !p.is_primary).length });
        }));
        const [{ total }] = await query(`
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id != ? AND u.status = 1
        AND up.aadhaar_verified = 1
        -- 21-07-2026 - Profile complete condition
        AND ${(0, profileCompletion_1.profileCompleteCondition)("u", "up")}
        ${genderFilter}
        ${parentFilter}
        AND NOT EXISTS (
          SELECT 1 FROM connect_now_requests cnr
          WHERE cnr.status = 'accepted'
            AND ((cnr.sender_id = ? AND cnr.receiver_id = u.id)
              OR (cnr.sender_id = u.id AND cnr.receiver_id = ?))
        )
        AND u.id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id IN (2, 3)
        )
    `, [userId, ...genderParam, userId, userId, userId]);
        res.json({
            success: true,
            data: {
                profiles: enrichedProfiles,
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
        console.error('Get Matches For Inbox Error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
}
//# sourceMappingURL=InboxController.js.map