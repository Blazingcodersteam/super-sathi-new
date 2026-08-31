import * as utils from "util";
import {
  createInterestAlert,
  createInterestAcceptedAlert,
  createInterestDeclinedAlert,
  createPhotoRequestAlert,
  createShortlistAlert,
  createConnectNowAlert,
  createConnectAcceptedAlert,
  createConnectDeclinedAlert,
} from "./AlertsController";
import { applyPrivacyFilterToMatches, applyPrivacyFilter } from "../utils/privacyFilter";
// 21-07-2026 - Profile complete condition
import { profileCompleteCondition } from "../utils/profileCompletion";
import { isViewerPremium } from "../utils/subscriptionAccess";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

function connectPerfNow(): number {
  return performance.now();
}

function connectPerfElapsed(start: number): number {
  return Math.round(connectPerfNow() - start);
}

function connectPerfMeta(perf): string {
  if (!perf) return "";
  const parts = [`request=${perf.requestId}`];
  if (perf.userId !== undefined) parts.push(`user=${perf.userId}`);
  if (perf.targetUserId !== undefined) parts.push(`target=${perf.targetUserId}`);
  if (perf.connectionId !== undefined) parts.push(`connection=${perf.connectionId}`);
  return parts.join(" ");
}

function logConnectPerf(perf, label: string, start: number, extra = "") {
  if (!perf) return;
  const suffix = extra ? ` ${extra}` : "";
  console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} ${label}: ${connectPerfElapsed(start)}ms${suffix}`);
}

// Get parent filter clause for a user — returns SQL snippet
async function getParentFilter(userId: number): Promise<string> {
  const [profile] = await query(
    `SELECT profile_created_by FROM user_profiles WHERE user_id = ?`, [userId]
  );
  return profile?.profile_created_by === 'parent' ? `AND up.profile_created_by = 'parent'` : '';
}

// Generate Vivaaha Unique ID
function generateVivahaId(): string {
  const prefix = "SS";
  const randomNumber = Math.floor(10000000 + Math.random() * 90000000);
  return `${prefix}${randomNumber}`;
}

// Generate unique Vivaaha ID
export async function generateUniqueVivahaId(): Promise<string> {
  let vivahaId: string;
  let attempts = 0;

  do {
    vivahaId = generateVivahaId();
    const [existing] = await query("SELECT id FROM users WHERE vivaaha_user_id = ?", [vivahaId]);
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  return vivahaId;
}

// Update Display Preference
export async function updateDisplayPreference(req, res) {
  try {
    const userId = req.user.user_id;
    const { show_vivaaha_id } = req.body;

    await query(
      "UPDATE user_profiles SET show_vivaaha_id = ? WHERE user_id = ?",
      [show_vivaaha_id ? 1 : 0, userId]
    );

    res.json({
      success: true,
      message: `Display preference updated to show ${show_vivaaha_id ? 'Vivaaha ID' : 'Name'}`
    });
  } catch (error) {
    console.error("Update Display Preference Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Send Interest
export async function sendInterest(req, res) {
  try {
    const userId = req.user.user_id;
    const { target_user_id, message } = req.body;

    if (target_user_id === userId) {
      return res.status(400).json({ success: false, message: "You cannot send an interest to yourself" });
    }

    // Insert interest
    await query(
      "INSERT INTO user_interests (sender_id, receiver_id, message, status) VALUES (?, ?, ?, 'sent') ON DUPLICATE KEY UPDATE message = VALUES(message), status = 'sent', updated_at = CURRENT_TIMESTAMP",
      [userId, target_user_id, message]
    );

    // Create alert for receiver
    await createInterestAlert(target_user_id, userId);

    res.json({ success: true, message: "Interest sent successfully" });
  } catch (error) {
    console.error("Send Interest Error:", error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: "Interest already sent to this user" });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Accept Interest
export async function acceptInterest(req, res) {
  try {
    const userId = req.user.user_id;
    const { interest_id, message } = req.body;

    await query(
      "UPDATE user_interests SET status = 'accepted', response_message = ? WHERE id = ? AND receiver_id = ?",
      [message, interest_id, userId]
    );

    // Notify the original sender that their interest was accepted
    const [interest] = await query(
      "SELECT sender_id FROM user_interests WHERE id = ?", [interest_id]
    );
    if (interest) await createInterestAcceptedAlert(interest.sender_id, userId);

    res.json({ success: true, message: "Interest accepted successfully" });
  } catch (error) {
    console.error("Accept Interest Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Decline Interest
export async function declineInterest(req, res) {
  try {
    const userId = req.user.user_id;
    const { interest_id } = req.body;

    await query(
      "UPDATE user_interests SET status = 'declined' WHERE id = ? AND receiver_id = ?",
      [interest_id, userId]
    );

    // Notify the original sender that their interest was declined
    const [interest] = await query(
      "SELECT sender_id FROM user_interests WHERE id = ?", [interest_id]
    );
    if (interest) await createInterestDeclinedAlert(interest.sender_id, userId);

    res.json({ success: true, message: "Interest declined successfully" });
  } catch (error) {
    console.error("Decline Interest Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Remove from Shortlist
export async function removeFromShortlist(req, res) {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;

    // Remove from shortlist
    await query(
      "DELETE FROM user_actions WHERE user_id = ? AND target_user_id = ? AND action_type_id = 1",
      [userId, id]
    );

    // If there is a pending connect request between these two users, decline it
    await query(
      "UPDATE connect_now_requests SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'",
      [userId, id]
    );

    res.json({ success: true, message: "Removed from shortlist successfully" });
  } catch (error) {
    console.error("Remove from Shortlist Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Unblock User (removes both directions of the block)
export async function unblockUser(req, res) {
  try {
    const userId = req.user.user_id;
    const targetId = parseInt(req.params.id);

    // Check if user is actually blocked
    const [isBlocked] = await query(
      "SELECT id FROM user_actions WHERE user_id = ? AND target_user_id = ? AND action_type_id = 3",
      [userId, targetId]
    );
    if (!isBlocked) {
      return res.status(400).json({ success: false, message: "User is not blocked" });
    }

    // Remove only the blocker's row (A→B)
    await query(
      "DELETE FROM user_actions WHERE user_id = ? AND target_user_id = ? AND action_type_id = 3",
      [userId, targetId]
    );
     // Sync privacy_settings.block_users JSON array
    const [existing] = await query(
      "SELECT block_users FROM privacy_settings WHERE user_id = ?", [userId]
    );
    if (existing && existing.block_users) {
      let blockedUsers = JSON.parse(existing.block_users);
      blockedUsers = blockedUsers.filter(id => id !== targetId);
      await query("UPDATE privacy_settings SET block_users = ? WHERE user_id = ?",
        [JSON.stringify(blockedUsers), userId]);
    }

    res.json({ success: true, message: "User unblocked successfully" });
  } catch (error) {
    console.error("Unblock User Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Interests Sent
export async function getInterestsSent(req, res) {
  try {
    const userId = req.user.user_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const interests = await query(`
      SELECT ui.*, up.first_name, up.middle_name, up.last_name, up.profile_picture
      FROM user_interests ui
      JOIN user_profiles up ON ui.receiver_id = up.user_id
      WHERE ui.sender_id = ?
      ORDER BY ui.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    res.json({ success: true, data: interests });
  } catch (error) {
    console.error("Get Interests Sent Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Interests Received
export async function getInterestsReceived(req, res) {
  try {
    const userId = req.user.user_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const interests = await query(`
      SELECT ui.*, up.first_name, up.middle_name, up.last_name, up.profile_picture
      FROM user_interests ui
      JOIN user_profiles up ON ui.sender_id = up.user_id
      WHERE ui.receiver_id = ?
        AND ui.sender_id NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
        )
      ORDER BY ui.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, userId, limit, offset]);

    res.json({ success: true, data: interests });
  } catch (error) {
    console.error("Get Interests Received Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Shortlisted Profiles
export async function getShortlistedProfiles(req, res) {
  try {
    const userId = req.user.user_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const parentFilter = await getParentFilter(userId);

    const shortlisted = await query(`
      SELECT ua.created_at as shortlisted_date, u.id
      FROM user_actions ua
      JOIN users u ON ua.target_user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE ua.user_id = ? AND ua.action_type_id = 1 AND u.status = 1 ${parentFilter}
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
        AND ua.target_user_id NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
        )
      ORDER BY ua.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, userId, limit, offset]);

    // Get complete profile details for each shortlisted user
    const enrichedProfiles = await Promise.all(shortlisted.map(async (item) => {
      const profileId = item.id;

      // Get complete profile with subscription details
      const [profile] = await query(`
        SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
               up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
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
               COALESCE(cim.city_name, cd.city_living_in) as city_living_in, COALESCE(stm.state_name, cd.state_living_in_id) as state_living_in, cd.country_living_in_id,
               clc.country_name as country_living,
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
        LEFT JOIN cities_master cim ON cd.city_living_in = cim.id
        LEFT JOIN states_master stm ON cd.state_living_in_id = stm.id
        LEFT JOIN country_code_master clc ON cd.country_living_in_id = clc.id
        LEFT JOIN currency_master cur ON cd.currency_id = cur.id
        LEFT JOIN education_details ed ON u.id = ed.user_id
        LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
        LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
        LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
        LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
        WHERE u.id = ?
          -- 21-07-2026 - Profile complete condition
          AND ${profileCompleteCondition("u", "up")}
      `, [profileId]);

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
      `, [profileId]);

      const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        WHERE ad.user_id = ?
      `, [profileId]);

      const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        WHERE ld.user_id = ?
      `, [profileId]);

      const hobbies = await query(`
        SELECT hm.* FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?
      `, [profileId]);

      const photos = await query(`
        SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC
      `, [profileId]);

      // Get match actions
      const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, profileId]);

      const [reportAction] = await query(`
        SELECT ur.id, 'Report' as action_name, 4 as action_type_id
        FROM user_reports ur
        WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
      `, [userId, profileId]);

      const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profileId, profileId, userId]);

      const allActions = [...matchActions];
      if (reportAction) {
        allActions.push(reportAction);
      }

      if (!profile) return null;
      return {
        shortlisted_date: item.shortlisted_date,
        ...profile,
        family: family || {},
        astro: astro || {},
        location: location || {},
        hobbies: hobbies || [],
        photos: photos || [],
        match_actions: allActions,
        connect_status: connectStatus?.status || null
      };
    }));

    const filteredShortlisted = (await applyPrivacyFilterToMatches(
      enrichedProfiles.filter((p: any) => p !== null && p !== undefined), userId)).filter(p => !p.is_blocked);

    const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM user_actions ua
      JOIN users u ON ua.target_user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE ua.user_id = ? AND ua.action_type_id = 1 AND u.status = 1 ${parentFilter}
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
        AND ua.target_user_id NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
          UNION
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);

    res.json({
      success: true,
      data: {
        shortlisted_profiles: filteredShortlisted,
        pagination: {
          current_page: page,
          per_page: limit,
          total_records: total,
          total_pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error("Get Shortlisted Profiles Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Blocked Users
export async function getBlockedUsers(req, res) {
  try {
    const userId = req.user.user_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const parentFilter = await getParentFilter(userId);

    const blocked = await query(`
      SELECT ua.created_at as blocked_date, u.id
      FROM user_actions ua
      JOIN users u ON ua.target_user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE ua.user_id = ? AND ua.action_type_id = 3 ${parentFilter}
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
      ORDER BY ua.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

    // Get complete profile details for each blocked user
    const enrichedProfiles = await Promise.all(blocked.map(async (item) => {
      const profileId = item.id;

      // Get complete profile with subscription details
      const [profile] = await query(`
        SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
               up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
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
               COALESCE(cim.city_name, cd.city_living_in) as city_living_in, COALESCE(stm.state_name, cd.state_living_in_id) as state_living_in, cd.country_living_in_id,
               clc.country_name as country_living,
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
        LEFT JOIN cities_master cim ON cd.city_living_in = cim.id
        LEFT JOIN states_master stm ON cd.state_living_in_id = stm.id
        LEFT JOIN country_code_master clc ON cd.country_living_in_id = clc.id
        LEFT JOIN currency_master cur ON cd.currency_id = cur.id
        LEFT JOIN education_details ed ON u.id = ed.user_id
        LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
        LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
        LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
        LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
        WHERE u.id = ?
          -- 21-07-2026 - Profile complete condition
          AND ${profileCompleteCondition("u", "up")}
      `, [profileId]);

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
      `, [profileId]);

      const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        WHERE ad.user_id = ?
      `, [profileId]);

      const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        WHERE ld.user_id = ?
      `, [profileId]);

      const hobbies = await query(`
        SELECT hm.* FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?
      `, [profileId]);

      const photos = await query(`
        SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC
      `, [profileId]);

      // Get match actions
      const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, profileId]);

      const [reportAction] = await query(`
        SELECT ur.id, 'Report' as action_name, 4 as action_type_id
        FROM user_reports ur
        WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
      `, [userId, profileId]);

      const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profileId, profileId, userId]);

      const allActions = [...matchActions];
      if (reportAction) {
        allActions.push(reportAction);
      }

      if (!profile) return null;
      return {
        blocked_date: item.blocked_date,
        ...profile,
        family: family || {},
        astro: astro || {},
        location: location || {},
        hobbies: hobbies || [],
        photos: photos || [],
        match_actions: allActions,
        connect_status: connectStatus?.status || null
      };
    }));

    const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM user_actions
      WHERE user_id = ? AND action_type_id = 3
    `, [userId]);

     // Do NOT apply privacy filter here — these are blocked users, we want to show their info
    const validProfiles = enrichedProfiles.filter((p: any) => p !== null && p !== undefined);
    res.json({
      success: true,
      data: {
        blocked_users: validProfiles,
        pagination: {
          current_page: page,
          per_page: limit,
          total_records: total,
          total_pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error("Get Blocked Users Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Add to Shortlist
export async function addToShortlist(req, res) {
  try {
    const userId = req.user.user_id;
    const { target_user_id } = req.body;

    if (target_user_id === userId) {
      return res.status(400).json({ success: false, message: "You cannot shortlist yourself" });
    }

    await query(
      "INSERT INTO user_actions (user_id, target_user_id, action_type_id) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP",
      [userId, target_user_id]
    );

    // Section 12 — only notify if shortlist_visibility = 'let_others_know' (default)
    // 'do_not_let_others_know' → skip alert entirely
    const [ps] = await query(
      `SELECT shortlist_visibility FROM privacy_settings WHERE user_id = ?`,
      [target_user_id]
    );
    const visibility = ps?.shortlist_visibility ?? 'let_others_know';
    if (visibility !== 'do_not_let_others_know') {
      await createShortlistAlert(target_user_id, userId);
    }

    res.json({ success: true, message: "Added to shortlist successfully" });
  } catch (error) {
    console.error("Add to Shortlist Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Don't Show Again
export async function dontShowAgain(req, res) {
  try {
    const userId = req.user.user_id;
    const { target_user_id } = req.body;

    await query(
      "INSERT INTO user_actions (user_id, target_user_id, action_type_id) VALUES (?, ?, 2) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP",
      [userId, target_user_id]
    );

    res.json({ success: true, message: "Profile hidden successfully" });
  } catch (error) {
    console.error("Don't Show Again Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Block Profile (bidirectional — blocked user also cannot see blocker's profile)
export async function blockProfile(req, res) {
  try {
    const userId = req.user.user_id;
    const { target_user_id } = req.body;

    // Check if already blocked
    const [alreadyBlocked] = await query(
      "SELECT id FROM user_actions WHERE user_id = ? AND target_user_id = ? AND action_type_id = 3",
      [userId, target_user_id]
    );
    if (alreadyBlocked) {
      return res.status(400).json({ success: false, message: "User already blocked" });
    }

    // Insert only one-directional block (A→B)
    // Visibility is bidirectional via OR condition in privacyFilter
    await query(
      "INSERT INTO user_actions (user_id, target_user_id, action_type_id) VALUES (?, ?, 3) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP",
      [userId, target_user_id]
    );

    // Sync privacy_settings.block_users JSON array
    const [existing] = await query(
      "SELECT block_users FROM privacy_settings WHERE user_id = ?", [userId]
    );
    let blockedUsers = [];
    if (existing && existing.block_users) {
      blockedUsers = JSON.parse(existing.block_users);
    }
    if (!blockedUsers.includes(target_user_id)) {
      blockedUsers.push(target_user_id);
    }
    if (existing) {
      await query("UPDATE privacy_settings SET block_users = ? WHERE user_id = ?",
        [JSON.stringify(blockedUsers), userId]);
    } else {
      await query("INSERT INTO privacy_settings (user_id, block_users) VALUES (?, ?)",
        [userId, JSON.stringify(blockedUsers)]);
    }

    res.json({ success: true, message: "Profile blocked successfully" });
  } catch (error) {
    console.error("Block Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Report Profile/Photo
export async function reportProfile(req, res) {
  try {
    const userId = req.user.user_id;
    const { target_user_id, reason_ids, report_type = 'profile', description } = req.body;

    if (!target_user_id || !reason_ids || !Array.isArray(reason_ids) || reason_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "target_user_id and reason_ids array are required"
      });
    }

    // Validate reason IDs exist
    const validReasons = await query(
      "SELECT id FROM report_reasons_master WHERE id IN (" + reason_ids.map(() => '?').join(',') + ")",
      reason_ids
    );

    if (validReasons.length !== reason_ids.length) {
      return res.status(400).json({
        success: false,
        message: "One or more invalid reason IDs provided"
      });
    }

    await query(
      "INSERT INTO user_reports (reporter_id, reported_user_id, report_reason_ids, report_type, description) VALUES (?, ?, ?, ?, ?)",
      [userId, target_user_id, JSON.stringify(reason_ids), report_type, description]
    );

    res.json({ success: true, message: "Report submitted successfully" });
  } catch (error) {
    console.error("Report Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Report Reasons
export async function getReportReasons(req, res) {
  try {
    const reasons = await query(
      "SELECT id, reason_name, parent_id FROM report_reasons_master ORDER BY COALESCE(parent_id, id), CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, id"
    );

    // Structure the reasons into categories
    const categories = [];
    const categoryMap = new Map();

    reasons.forEach(reason => {
      if (reason.parent_id === null) {
        // This is a main category
        const category = {
          id: reason.id,
          category_name: reason.reason_name,
          reasons: []
        };
        categories.push(category);
        categoryMap.set(reason.id, category);
      } else {
        // This is a sub-reason
        const parentCategory = categoryMap.get(reason.parent_id);
        if (parentCategory) {
          parentCategory.reasons.push({
            id: reason.id,
            reason_name: reason.reason_name
          });
        }
      }
    });

    res.json({ success: true, data: categories });
  } catch (error) {
    console.error("Get Report Reasons Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Recently Viewed Members
export async function getRecentlyViewedMembers(req, res) {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const parentFilter = await getParentFilter(userId);

    // Get current user's gender to filter opposite gender only
    const [currentUser] = await query(
      `SELECT gender_id FROM user_profiles WHERE user_id = ?`, [userId]
    );
    const oppositeGender = currentUser?.gender_id === 1 ? 2 : 1;

    const recentlyViewed = await query(`
      SELECT latest_views.view_date, u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
             up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
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
             COALESCE(cim3.city_name, cd.city_living_in) as city_living_in, COALESCE(stm3.state_name, cd.state_living_in_id) as state_living_in, cd.country_living_in_id,
             clc3.country_name as country_living,
             cur.currency_code, cur.symbol as currency_symbol,
             ed.education_level_id, ed.institution_name, ed.institution_name_2,
             elm.level_name as education_level,
             (
               SELECT sp2.plan_name FROM user_subscriptions us2
               JOIN subscription_plans sp2 ON us2.plan_id = sp2.id
               WHERE us2.user_id = u.id AND us2.subscription_status_id = 1
               ORDER BY us2.created_at DESC LIMIT 1
             ) as plan_name,
             (
               SELECT sp2.price FROM user_subscriptions us2
               JOIN subscription_plans sp2 ON us2.plan_id = sp2.id
               WHERE us2.user_id = u.id AND us2.subscription_status_id = 1
               ORDER BY us2.created_at DESC LIMIT 1
             ) as plan_price,
             CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status
      FROM (
        SELECT pv.viewed_user_id, MAX(pv.view_date) as view_date
        FROM profile_views pv
        JOIN user_profiles up2 ON pv.viewed_user_id = up2.user_id
        WHERE pv.viewer_id = ? AND up2.gender_id = ? AND pv.viewed_user_id NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND pv.viewed_user_id IN (SELECT id FROM users WHERE status = 1)
        GROUP BY pv.viewed_user_id
        ORDER BY MAX(pv.view_date) DESC
        LIMIT ? OFFSET ?
      ) latest_views
      JOIN users u ON latest_views.viewed_user_id = u.id
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
      LEFT JOIN (
        SELECT user_id, occupation, company_name, annual_income, income_type, currency_id,
               city_living_in, state_living_in_id, country_living_in_id
        FROM career_details WHERE id IN (
          SELECT MAX(id) FROM career_details GROUP BY user_id
        )
      ) cd ON u.id = cd.user_id
      LEFT JOIN cities_master cim3 ON cd.city_living_in = cim3.id
      LEFT JOIN states_master stm3 ON cd.state_living_in_id = stm3.id
      LEFT JOIN country_code_master clc3 ON cd.country_living_in_id = clc3.id
      LEFT JOIN currency_master cur ON cd.currency_id = cur.id
      LEFT JOIN (
        SELECT user_id, education_level_id, institution_name, institution_name_2
        FROM education_details WHERE id IN (
          SELECT MAX(id) FROM education_details GROUP BY user_id
        )
      ) ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      WHERE
        -- 21-07-2026 - Profile complete condition
        ${profileCompleteCondition("u", "up")}
      ORDER BY latest_views.view_date DESC
    `, [userId, oppositeGender, userId, parseInt(limit), offset]);

    // Get complete profile details for each recently viewed user
    const enrichedProfiles = await Promise.all(recentlyViewed.map(async (profile) => {
      const profileId = profile.id;

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

      // Get match actions
      const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, profileId]);

      const [reportAction] = await query(`
        SELECT ur.id, 'Report' as action_name, 4 as action_type_id
        FROM user_reports ur
        WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
      `, [userId, profileId]);

      const [connectStatus] = await query(`
        SELECT status, created_at, message FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profileId, profileId, userId]);

      const allActions = [...matchActions];
      if (reportAction) {
        allActions.push(reportAction);
      }

      if (!profile) return null;
      return {
        view_date: profile.view_date,
        ...profile,
        family: family || {},
        astro: astro || {},
        location: location || {},
        hobbies: hobbies || [],
        photos: photos || [],
        match_actions: allActions,
        connect_status: connectStatus?.status || null
      };
    }));

    const [{ total }] = await query(`
      SELECT COUNT(DISTINCT pv.viewed_user_id) as total
      FROM profile_views pv
      JOIN user_profiles up2 ON pv.viewed_user_id = up2.user_id
      JOIN users u ON pv.viewed_user_id = u.id
      WHERE pv.viewer_id = ? AND up2.gender_id = ? AND u.status = 1 AND pv.viewed_user_id NOT IN (
        SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
      )
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up2")}
    `, [userId, oppositeGender, userId]);

    const filteredRecentlyViewed = (await applyPrivacyFilterToMatches(
      enrichedProfiles.filter((p: any) => p !== null && p !== undefined), userId)).filter(p => !p.is_blocked);
    res.json({
      success: true,
      data: {
        recently_viewed: filteredRecentlyViewed,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_records: total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("Get Recently Viewed Members Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Who Viewed My Profile
export async function getWhoViewedMyProfile(req, res) {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const parentFilter = await getParentFilter(userId);

    // Get current user's gender to filter opposite gender only
    const [currentUser] = await query(
      `SELECT gender_id FROM user_profiles WHERE user_id = ?`, [userId]
    );
    const oppositeGender = currentUser?.gender_id === 1 ? 2 : 1;

    const profileViewers = await query(`
      SELECT latest_views.view_date, u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
             up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
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
             COALESCE(cim4.city_name, cd.city_living_in) as city_living_in, COALESCE(stm4.state_name, cd.state_living_in_id) as state_living_in, cd.country_living_in_id,
             clc4.country_name as country_living,
             cur.currency_code, cur.symbol as currency_symbol,
             ed.education_level_id, ed.institution_name, ed.institution_name_2,
             elm.level_name as education_level,
             (
               SELECT sp2.plan_name FROM user_subscriptions us2
               JOIN subscription_plans sp2 ON us2.plan_id = sp2.id
               WHERE us2.user_id = u.id AND us2.subscription_status_id = 1
               ORDER BY us2.created_at DESC LIMIT 1
             ) as plan_name,
             (
               SELECT sp2.price FROM user_subscriptions us2
               JOIN subscription_plans sp2 ON us2.plan_id = sp2.id
               WHERE us2.user_id = u.id AND us2.subscription_status_id = 1
               ORDER BY us2.created_at DESC LIMIT 1
             ) as plan_price,
             CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status
      FROM (
        SELECT pv.viewer_id, MAX(pv.view_date) as view_date
        FROM profile_views pv
        JOIN user_profiles up2 ON pv.viewer_id = up2.user_id
        WHERE pv.viewed_user_id = ? AND up2.gender_id = ? AND pv.viewer_id NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND pv.viewer_id IN (SELECT id FROM users WHERE status = 1)
        GROUP BY pv.viewer_id
        ORDER BY MAX(pv.view_date) DESC
        LIMIT ? OFFSET ?
      ) latest_views
      JOIN users u ON latest_views.viewer_id = u.id
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
      LEFT JOIN (
        SELECT user_id, occupation, company_name, annual_income, income_type, currency_id,
               city_living_in, state_living_in_id, country_living_in_id
        FROM career_details WHERE id IN (
          SELECT MAX(id) FROM career_details GROUP BY user_id
        )
      ) cd ON u.id = cd.user_id
      LEFT JOIN cities_master cim4 ON cd.city_living_in = cim4.id
      LEFT JOIN states_master stm4 ON cd.state_living_in_id = stm4.id
      LEFT JOIN country_code_master clc4 ON cd.country_living_in_id = clc4.id
      LEFT JOIN currency_master cur ON cd.currency_id = cur.id
      LEFT JOIN (
        SELECT user_id, education_level_id, institution_name, institution_name_2
        FROM education_details WHERE id IN (
          SELECT MAX(id) FROM education_details GROUP BY user_id
        )
      ) ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      WHERE
        -- 21-07-2026 - Profile complete condition
        ${profileCompleteCondition("u", "up")}
      ORDER BY latest_views.view_date DESC
    `, [userId, oppositeGender, userId, parseInt(limit), offset]);

    // Get complete profile details for each viewer
    const enrichedProfiles2 = await Promise.all(profileViewers.map(async (profile) => {
      const profileId = profile.id;

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

      // Get match actions
      const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, profileId]);

      const [reportAction] = await query(`
        SELECT ur.id, 'Report' as action_name, 4 as action_type_id
        FROM user_reports ur
        WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
      `, [userId, profileId]);

      const [connectStatus] = await query(`
        SELECT status, created_at, message FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profileId, profileId, userId]);

      const allActions = [...matchActions];
      if (reportAction) {
        allActions.push(reportAction);
      }

      if (!profile) return null;
      return {
        view_date: profile.view_date,
        ...profile,
        family: family || {},
        astro: astro || {},
        location: location || {},
        hobbies: hobbies || [],
        photos: photos || [],
        match_actions: allActions,
        connect_status: connectStatus?.status || null
      };
    }));

    const [{ total: totalViewers }] = await query(`
      SELECT COUNT(DISTINCT pv.viewer_id) as total
      FROM profile_views pv
      JOIN user_profiles up2 ON pv.viewer_id = up2.user_id
      JOIN users u ON pv.viewer_id = u.id
      WHERE pv.viewed_user_id = ? AND up2.gender_id = ? AND u.status = 1 AND pv.viewer_id NOT IN (
        SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
      )
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up2")}
    `, [userId, oppositeGender, userId]);

    const filteredViewers = (await applyPrivacyFilterToMatches(
      enrichedProfiles2.filter((p: any) => p !== null && p !== undefined), userId)).filter(p => !p.is_blocked);
    res.json({
      success: true,
      data: {
        profile_viewers: filteredViewers,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_records: totalViewers,
          total_pages: Math.ceil(totalViewers / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("Get Who Viewed My Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Ignored Members (Don't Show Again)
export async function getIgnoredMembers(req, res) {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const parentFilter = await getParentFilter(userId);

    const ignoredMembers = await query(`
      SELECT ua.created_at as ignored_date, u.id
      FROM user_actions ua
      JOIN users u ON ua.target_user_id = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE ua.user_id = ? AND ua.action_type_id = 2 ${parentFilter}
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
      ORDER BY ua.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(limit), offset]);

    // Get complete profile details for each ignored user
    const enrichedProfiles = await Promise.all(ignoredMembers.map(async (ignored) => {
      const profileId = ignored.id;

      // Get basic profile
      const [profile] = await query(`
        SELECT u.id, u.vivaaha_user_id, up.*, bg.blood_group, dis.disability_name, hi.health_condition,
               rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
               mtm.language_name as mother_tongue, dm.diet_name,
               CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
               CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status
        FROM user_profiles up
        LEFT JOIN users u ON up.user_id = u.id
        LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
        LEFT JOIN disability_master dis ON up.disability_id = dis.id
        LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
        LEFT JOIN religion_master rm ON up.religion_id = rm.id
        LEFT JOIN caste_master cm ON up.caste_id = cm.id
        LEFT JOIN gender_master gm ON up.gender_id = gm.id
        LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
        LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
        LEFT JOIN diet_master dm ON up.diet_id = dm.id
        WHERE up.user_id = ?
          -- 21-07-2026 - Profile complete condition
          AND ${profileCompleteCondition("u", "up")}
      `, [profileId]);

      // Get astro details
      const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        WHERE ad.user_id = ?
      `, [profileId]);

      // Get family details
      const [family] = await query(`
        SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
               ffs.status_name as financial_status, c.country_name as family_country
        FROM family_details fd
        LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
        LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
        LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
        LEFT JOIN country_code_master c ON fd.family_country_id = c.id
        WHERE fd.user_id = ?
      `, [profileId]);

      // Get career details
      const [career] = await query(`
        SELECT cd.*, ww.working_type, c.country_name as country_living
        FROM career_details cd
        LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
        LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
        WHERE cd.user_id = ?
      `, [profileId]);

      // Get location details
      const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name, cd.grew_up_in_ids, cd.ethnic_origin_id, eo.origin_name as ethnic_origin_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        LEFT JOIN career_details cd ON ld.user_id = cd.user_id
        LEFT JOIN ethnic_origin_master eo ON cd.ethnic_origin_id = eo.id
        WHERE ld.user_id = ?
      `, [profileId]);

      // Get hobbies
      const hobbies = await query(`
        SELECT hm.* FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?
      `, [profileId]);

      // Get match actions
      const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, profileId]);

      const [reportAction] = await query(`
        SELECT ur.id, 'Report' as action_name, 4 as action_type_id
        FROM user_reports ur
        WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
      `, [userId, profileId]);

      const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profileId, profileId, userId]);

      const allActions = [...matchActions];
      if (reportAction) {
        allActions.push(reportAction);
      }

      return {
        ignored_date: ignored.ignored_date,
        profile: {
          basic: profile || {},
          astro: astro || {},
          family: family || {},
          career: career || {},
          location: location || {},
          hobbies: hobbies || []
        },
        match_actions: allActions,
        connect_status: connectStatus?.status || null
      };
    }));

    const [{ total }] = await query(`
      SELECT COUNT(*) as total FROM user_actions
      WHERE user_id = ? AND action_type_id = 2
    `, [userId]);

    res.json({
      success: true,
      data: {
        ignored_members: enrichedProfiles,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_records: total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("Get Ignored Members Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Remove from Ignored Members (Undo Don't Show Again)
export async function removeFromIgnored(req, res) {
  try {
    const userId = req.user.user_id;
    const { targetUserId } = req.params;

    await query(`
      DELETE FROM user_actions
      WHERE user_id = ? AND target_user_id = ? AND action_type_id = 2
    `, [userId, targetUserId]);

    res.json({
      success: true,
      message: "User removed from ignored list successfully"
    });
  } catch (error) {
    console.error("Remove from Ignored Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Connect Now
export async function connectNow(req, res) {
  const perf = req.connectPerf || null;
  const totalStart = perf?.startedAt ?? connectPerfNow();
  try {
    const userId = req.user.user_id;
    const { target_user_id, message } = req.body;
    if (perf) {
      perf.userId = userId;
      perf.targetUserId = target_user_id;
      console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} Connect API started`);
    }

    const validationStart = perf ? connectPerfNow() : 0;
    if (target_user_id === userId) {
      logConnectPerf(perf, "request-validation", validationStart, "(self-connect-rejected)");
      if (perf) console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} TOTAL API TIME: ${connectPerfElapsed(totalStart)}ms`);
      return res.status(400).json({ success: false, message: "You cannot send a connect request to yourself" });
    }
    logConnectPerf(perf, "request-validation", validationStart);

    if (perf) {
      console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} subscription-limit-check: 0ms (not present in current connect-now flow)`);
      console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} block-check: 0ms (not present in current connect-now flow)`);
      console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} duplicate-connection-check: 0ms (handled inside create-connection upsert)`);
      console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} receiver-filter-db-queries: 0ms (not present in current connect-now flow)`);
    }

    const createConnectionStart = perf ? connectPerfNow() : 0;
    const connectionResult = await query(
      "INSERT INTO connect_now_requests (sender_id, receiver_id, message, status) VALUES (?, ?, ?, 'pending') ON DUPLICATE KEY UPDATE message = VALUES(message), status = 'pending', updated_at = CURRENT_TIMESTAMP",
      [userId, target_user_id, message]
    );
    if (perf && connectionResult?.insertId) perf.connectionId = connectionResult.insertId;
    logConnectPerf(perf, "create-connection-db-operation", createConnectionStart);

    // Create alert for receiver
    const notificationStart = perf ? connectPerfNow() : 0;
    await createConnectNowAlert(target_user_id, userId, perf);
    logConnectPerf(perf, "create-notification-total", notificationStart);

    if (perf) {
      console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} sms-whatsapp: 0ms (not present in current connect-now flow)`);
      console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} activity-logging: 0ms (not present in current connect-now flow)`);
      console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} other-operations: 0ms`);
      console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} TOTAL API TIME: ${connectPerfElapsed(totalStart)}ms`);
    }

    res.json({ success: true, message: "Connect request sent successfully" });
  } catch (error) {
    console.error("Connect Now Error:", error);
    if (perf) console.log(`[CONNECT-PERF] ${connectPerfMeta(perf)} TOTAL API TIME: ${connectPerfElapsed(totalStart)}ms (error)`);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Accept Connect Request
export async function acceptConnectRequest(req, res) {
  try {
    const userId = req.user.user_id;
    const { request_id } = req.body;

    if (!request_id) {
      return res.status(400).json({ success: false, message: "request_id is required" });
    }

    const result = await query(
      "UPDATE connect_now_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND receiver_id = ? AND status = 'pending'",
      [request_id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Request not found, already processed, or you are not the receiver"
      });
    }

    // Notify the original sender that their connect request was accepted
    const [req2] = await query(
      "SELECT sender_id FROM connect_now_requests WHERE id = ?", [request_id]
    );
    if (req2) await createConnectAcceptedAlert(req2.sender_id, userId);

    res.json({ success: true, message: "Connect request accepted successfully" });
  } catch (error) {
    console.error("Accept Connect Request Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Decline Connect Request
export async function declineConnectRequest(req, res) {
  try {
    const userId = req.user.user_id;
    const { request_id } = req.body;

    if (!request_id) {
      return res.status(400).json({ success: false, message: "request_id is required" });
    }

    const result = await query(
      "UPDATE connect_now_requests SET status = 'declined', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND receiver_id = ? AND status = 'pending'",
      [request_id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Request not found, already processed, or you are not the receiver"
      });
    }

    // Notify the original sender that their connect request was declined
    const [req2] = await query(
      "SELECT sender_id FROM connect_now_requests WHERE id = ?", [request_id]
    );
    if (req2) await createConnectDeclinedAlert(req2.sender_id, userId);

    res.json({ success: true, message: "Connect request declined successfully" });
  } catch (error) {
    console.error("Decline Connect Request Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Cancel Connect Request (by sender — A withdraws their own pending OR accepted request)
export async function cancelConnectRequest(req, res) {
  try {
    const userId = req.user.user_id;
    const { request_id, target_user_id } = req.body;

    let result;
    if (request_id) {
      result = await query(
        "UPDATE connect_now_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND sender_id = ? AND status IN ('pending', 'accepted')",
        [request_id, userId]
      );
    } else if (target_user_id) {
      // Allow cancelling both pending and accepted connections (either direction)
      result = await query(
        "UPDATE connect_now_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)) AND status IN ('pending', 'accepted')",
        [userId, target_user_id, target_user_id, userId]
      );
    } else {
      return res.status(400).json({ success: false, message: "request_id or target_user_id is required" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Request not found, already cancelled, or not authorized"
      });
    }

    res.json({ success: true, message: "Connect request cancelled successfully" });
  } catch (error) {
    console.error("Cancel Connect Request Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Connect Requests
export async function getConnectRequests(req, res) {
  try {
    const userId = req.user.user_id;
    const { type = 'received' } = req.query;

    // For received: only show pending (not yet actioned)
    // For sent: show all EXCEPT cancelled so sender can track status
    const statusFilter = type === 'received' ? `AND cnr.status = 'pending'` : `AND cnr.status != 'cancelled'`;
    const joinSide = type === 'sent' ? 'cnr.receiver_id' : 'cnr.sender_id';
    const whereClause = type === 'sent' ? 'cnr.sender_id = ?' : 'cnr.receiver_id = ?';

    const requests = await query(`
      SELECT cnr.id, cnr.sender_id, cnr.receiver_id, cnr.status, cnr.message, cnr.created_at, cnr.updated_at,
             up.first_name, up.middle_name, up.last_name,
             COALESCE(up.profile_picture, (SELECT photo_url FROM user_photos WHERE user_id = ${joinSide} ORDER BY is_primary DESC LIMIT 1)) as profile_picture,
             up.age, up.height,
             up.religion_id, up.caste_id, up.show_vivaaha_id,
             rm.religion_name, cm.caste_name,
             cd.occupation, cd.city_living_in,
             u.vivaaha_user_id,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id
                  ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name)
             END as display_name,
             (SELECT COUNT(*) FROM user_photos ph WHERE ph.user_id = ${joinSide} AND ph.is_primary = 0) as album_count
      FROM connect_now_requests cnr
      JOIN users u ON ${joinSide} = u.id
      LEFT JOIN user_profiles up ON ${joinSide} = up.user_id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN career_details cd ON ${joinSide} = cd.user_id
      WHERE ${whereClause} ${statusFilter}
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
        AND ${joinSide} NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
        )
        AND ${joinSide} NOT IN (
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        )
      ORDER BY cnr.created_at DESC
    `, [userId, userId, userId]);

    res.json({ success: true, data: (await applyPrivacyFilterToMatches(requests, userId)).filter(p => !p.is_blocked) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Initial Matches for New Users
export async function getInitialMatches(req, res) {
  try {
    const userId = req.user.user_id;

    // Check subscription → limit 10 for subscribed, 3 for free.
    // isViewerPremium() also returns true for everyone while the admin subscription
    // restrictions switch is off, so free members get the full 10 in that mode.
    const hasSubscription = await isViewerPremium(userId);
    const limit = hasSubscription ? 10 : 3;

    // Get current user's gender and preferences
    const [currentUser] = await query(`
      SELECT up.gender_id, up.profile_created_by FROM user_profiles up WHERE up.user_id = ?
    `, [userId]);

    if (!currentUser) {
      return res.status(400).json({ success: false, message: "User profile not found" });
    }

    // Get partner preferences
    const [preferences] = await query(`
      SELECT * FROM partner_preferences WHERE user_id = ?
    `, [userId]);

    // Determine opposite gender (1 = male, 2 = female)
    const oppositeGender = currentUser.gender_id === 1 ? 2 : 1;

    // Build WHERE conditions based on preferences
    let whereConditions = [`u.id != ?`, `u.status = 1`, `up.gender_id = ?`, `up.aadhaar_verified = 1`];
    let queryParams = [userId, oppositeGender];

    // 21-07-2026 - Profile complete condition
    whereConditions.push(profileCompleteCondition("u", "up"));

    // If current user profile is managed by parent, only show parent-managed profiles
    if (currentUser.profile_created_by === 'parent') {
      whereConditions.push(`up.profile_created_by = 'parent'`);
    }

    if (preferences) {
      // Age filter
      if (preferences.min_age) {
        whereConditions.push(`up.age >= ?`);
        queryParams.push(preferences.min_age);
      }
      if (preferences.max_age) {
        whereConditions.push(`up.age <= ?`);
        queryParams.push(preferences.max_age);
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

      // Location filter
      if (preferences.country_ids) {
        const countryIds = JSON.parse(preferences.country_ids);
        if (countryIds.length > 0) {
          whereConditions.push(`cd.country_living_in_id IN (${countryIds.map(() => '?').join(',')})`);
          queryParams.push(...countryIds);
        }
      }

      // Income filter
      if (preferences.min_income && preferences.min_income > 0) {
        whereConditions.push(`cd.annual_income >= ?`);
        queryParams.push(preferences.min_income);
      }
    }

    // Exclude hidden profiles (Section 11)
    whereConditions.push(`u.id NOT IN (
      SELECT user_id FROM user_hide_profile WHERE is_active = TRUE AND hide_end_date > NOW()
    )`);
    whereConditions.push(`u.id NOT IN (
      SELECT user_id FROM account_settings WHERE profile_hidden = 1
    )`);

    // Exclude blocked/ignored users
    whereConditions.push(`u.id NOT IN (
      SELECT target_user_id FROM user_actions
      WHERE user_id = ? AND action_type_id IN (2, 3)
    )`);
    queryParams.push(userId);

    // Exclude users already in connect_now_requests (either direction, any status)
    whereConditions.push(`u.id NOT IN (
      SELECT receiver_id FROM connect_now_requests WHERE sender_id = ?
      UNION
      SELECT sender_id FROM connect_now_requests WHERE receiver_id = ?
    )`);
    queryParams.push(userId);
    queryParams.push(userId);

    queryParams.push(limit);

    const matchIds = await query(`
      SELECT u.id
      FROM users u
      JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY RAND()
      LIMIT ?
    `, queryParams);

    const enrichedMatches = await Promise.all(matchIds.map(async (match) => {
      const profileId = match.id;

      const [profile] = await query(`
        SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
               up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age,
               up.height, up.weight, up.marital_status_id, up.religion_id, up.caste_id,
               up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
               up.about_myself, up.profile_picture, up.horoscope_match, up.lives_with_family,
               up.family_location, up.has_children, up.number_of_children, up.diet_id,
               up.blood_group_id, up.disability_id, up.health_info_id, up.show_vivaaha_id,
               rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
               mtm.language_name as mother_tongue, dm.diet_name, bg.blood_group,
               dis.disability_name, hi.health_condition,
               cd.occupation, cd.company_name, cd.annual_income, cd.income_type, cd.currency_id,
               COALESCE(cim.city_name, cd.city_living_in) as city_living_in, COALESCE(stm.state_name, cd.state_living_in_id) as state_living_in, cd.country_living_in_id,
               clc.country_name as country_living,
               cur.currency_code, cur.symbol as currency_symbol,
               ed.education_level_id, ed.institution_name, ed.institution_name_2,
               elm.level_name as education_level,
               us.plan_id, sp.plan_name, sp.price as plan_price, sp.duration_months,
               ssm.status_name as subscription_status, us.start_date as subscription_start,
               us.end_date as subscription_end,
               CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name
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
        LEFT JOIN cities_master cim ON cd.city_living_in = cim.id
        LEFT JOIN states_master stm ON cd.state_living_in_id = stm.id
        LEFT JOIN country_code_master clc ON cd.country_living_in_id = clc.id
        LEFT JOIN currency_master cur ON cd.currency_id = cur.id
        LEFT JOIN education_details ed ON u.id = ed.user_id
        LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
        LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
        LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
        LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
        WHERE u.id = ?
          -- 21-07-2026 - Profile complete condition
          AND ${profileCompleteCondition("u", "up")}
      `, [profileId]);

      const [family] = await query(`
        SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
               ffs.status_name as financial_status, c.country_name as family_country
        FROM family_details fd
        LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
        LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
        LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
        LEFT JOIN country_code_master c ON fd.family_country_id = c.id
        WHERE fd.user_id = ?
      `, [profileId]);

      const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        WHERE ad.user_id = ?
      `, [profileId]);

      const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        WHERE ld.user_id = ?
      `, [profileId]);

      const hobbies = await query(`
        SELECT hm.* FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?
      `, [profileId]);

      const photos = await query(`
        SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC
      `, [profileId]);

      // Get comprehensive match action details
      const [connectStatus] = await query(`
        SELECT status, created_at, message FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profileId, profileId, userId]);

      const [shortlistStatus] = await query(`
        SELECT created_at FROM user_actions
        WHERE user_id = ? AND target_user_id = ? AND action_type_id = 1
      `, [userId, profileId]);

      const [interestStatus] = await query(`
        SELECT status, created_at, message FROM user_interests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profileId, profileId, userId]);

      const [blockedStatus] = await query(`
        SELECT created_at FROM user_actions
        WHERE user_id = ? AND target_user_id = ? AND action_type_id = 3
      `, [userId, profileId]);

      const [ignoredStatus] = await query(`
        SELECT created_at FROM user_actions
        WHERE user_id = ? AND target_user_id = ? AND action_type_id = 2
      `, [userId, profileId]);

      if (!profile) return null;
      // Calculate match percentage (basic algorithm)
      const matchPercentage = calculateMatchPercentage(profile, family, astro, location);

      return {
        ...profile,
        family: family || {},
        astro: astro || {},
        location: location || {},
        hobbies: hobbies || [],
        photos: photos || [],
        match_percentage: matchPercentage,
        connect_status: connectStatus?.status || null,
        match_actions: {
          shortlist: {
            is_shortlisted: !!shortlistStatus,
            date: shortlistStatus?.created_at || null
          },
          interest: {
            status: interestStatus?.status || null,
            date: interestStatus?.created_at || null,
            message: interestStatus?.message || null
          },
          block: {
            is_blocked: !!blockedStatus,
            date: blockedStatus?.created_at || null
          },
          ignore: {
            is_ignored: !!ignoredStatus,
            date: ignoredStatus?.created_at || null
          }
        }
      };
    }));

    // ── Apply privacy filter to all matches (DOB, income, photo, phone, email)
    const filteredMatches = await applyPrivacyFilterToMatches(
      enrichedMatches.filter(Boolean),
      userId
    );

    res.json({
      success: true,
      data: {
        matches: filteredMatches,
        total_matches: filteredMatches.length,
        has_subscription: hasSubscription,
        limit_reached: !hasSubscription
      }
    });
  } catch (error) {
    console.error("Get Initial Matches Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Helper function to calculate match percentage
function calculateMatchPercentage(profile, family, astro, location) {
  let score = 0;
  let totalCriteria = 0;

  // Religion match (20%)
  if (profile?.religion_id) {
    totalCriteria += 20;
    // This would need user's preferences to compare
    score += 15; // Default partial match
  }

  // Caste match (15%)
  if (profile?.caste_id) {
    totalCriteria += 15;
    score += 10; // Default partial match
  }

  // Location match (15%)
  if (location?.city_id) {
    totalCriteria += 15;
    score += 12; // Default partial match
  }

  // Education match (15%)
  if (profile?.education_level) {
    totalCriteria += 15;
    score += 12; // Default partial match
  }

  // Age compatibility (10%)
  if (profile?.age) {
    totalCriteria += 10;
    score += 8; // Default partial match
  }

  // Income match (10%)
  if (profile?.annual_income) {
    totalCriteria += 10;
    score += 7; // Default partial match
  }

  // Family values (10%)
  if (family?.family_type) {
    totalCriteria += 10;
    score += 8; // Default partial match
  }

  // Horoscope match (5%)
  if (astro?.rasi) {
    totalCriteria += 5;
    score += 3; // Default partial match
  }

  return totalCriteria > 0 ? Math.round((score / totalCriteria) * 100) : 75;
}

// Get Match Plan Details
export async function getMatchPlanDetails(req, res) {
  try {
    const userId = req.user.user_id;

    // Get user's subscription details
    const [subscription] = await query(`
      SELECT us.*, sp.plan_name, sp.price, sp.duration_months, sp.features,
             sp.daily_matches_limit, sp.monthly_matches_limit, sp.can_view_contact_info,
             sp.can_send_unlimited_interests, sp.priority_customer_support,
             ssm.status_name as subscription_status
      FROM user_subscriptions us
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
      WHERE us.user_id = ? AND us.subscription_status_id = 1
    `, [userId]);

    // Get today's match usage
    const [todayUsage] = await query(`
      SELECT COUNT(*) as matches_viewed_today
      FROM profile_views pv
      WHERE pv.viewer_id = ? AND DATE(pv.view_date) = CURDATE()
    `, [userId]);

    // Get monthly match usage
    const [monthlyUsage] = await query(`
      SELECT COUNT(*) as matches_viewed_this_month
      FROM profile_views pv
      WHERE pv.viewer_id = ? AND MONTH(pv.view_date) = MONTH(CURDATE()) AND YEAR(pv.view_date) = YEAR(CURDATE())
    `, [userId]);

    // Get interests sent today
    const [interestsSentToday] = await query(`
      SELECT COUNT(*) as interests_sent_today
      FROM user_interests ui
      WHERE ui.sender_id = ? AND DATE(ui.created_at) = CURDATE()
    `, [userId]);

    // Get available matches count
    const [availableMatches] = await query(`
      SELECT COUNT(*) as available_matches
      FROM users u
      JOIN user_profiles up ON u.id = up.user_id
      WHERE u.id != ? AND u.status = 1
      -- 21-07-2026 - Profile complete condition
      AND ${profileCompleteCondition("u", "up")}
      AND u.id NOT IN (
        SELECT target_user_id FROM user_actions
        WHERE user_id = ? AND action_type_id IN (2, 3)
      )
    `, [userId, userId]);

    const planDetails = {
      subscription: subscription || {
        plan_name: "Free Plan",
        daily_matches_limit: 5,
        monthly_matches_limit: 50,
        can_view_contact_info: false,
        can_send_unlimited_interests: false,
        priority_customer_support: false
      },
      usage: {
        matches_viewed_today: todayUsage?.matches_viewed_today || 0,
        matches_viewed_this_month: monthlyUsage?.matches_viewed_this_month || 0,
        interests_sent_today: interestsSentToday?.interests_sent_today || 0,
        available_matches: availableMatches?.available_matches || 0
      },
      limits: {
        daily_matches_remaining: Math.max(0, (subscription?.daily_matches_limit || 5) - (todayUsage?.matches_viewed_today || 0)),
        monthly_matches_remaining: Math.max(0, (subscription?.monthly_matches_limit || 50) - (monthlyUsage?.matches_viewed_this_month || 0)),
        can_send_more_interests: subscription?.can_send_unlimited_interests || (interestsSentToday?.interests_sent_today || 0) < 3
      }
    };

    res.json({ success: true, data: planDetails });
  } catch (error) {
    console.error("Get Match Plan Details Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Match Action Summary
export async function getMatchActionSummary(req, res) {
  try {
    const userId = req.user.user_id;

    // Get interests summary
    const [interestsSent] = await query(`
      SELECT COUNT(*) as total_sent,
             SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
             SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
             SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as pending
      FROM user_interests WHERE sender_id = ?
    `, [userId]);

    const [interestsReceived] = await query(`
      SELECT COUNT(*) as total_received,
             SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
             SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
             SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as pending
      FROM user_interests WHERE receiver_id = ?
    `, [userId]);

    // Get connect requests summary
    const [connectsSent] = await query(`
      SELECT COUNT(*) as total_sent,
             SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
             SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM connect_now_requests WHERE sender_id = ?
    `, [userId]);

    const [connectsReceived] = await query(`
      SELECT COUNT(*) as total_received,
             SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
             SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM connect_now_requests WHERE receiver_id = ?
    `, [userId]);

    // Get shortlist count (exclude blocked/ignored profiles)
    const [shortlistCount] = await query(`
      SELECT COUNT(*) as total_shortlisted
      FROM user_actions WHERE user_id = ? AND action_type_id = 1
        AND target_user_id NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
          UNION
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        )
    `, [userId, userId, userId]);

    // Get blocked count
    const [blockedCount] = await query(`
      SELECT COUNT(*) as total_blocked
      FROM user_actions WHERE user_id = ? AND action_type_id = 3
    `, [userId]);

    // Get ignored count
    const [ignoredCount] = await query(`
      SELECT COUNT(*) as total_ignored
      FROM user_actions WHERE user_id = ? AND action_type_id = 2
    `, [userId]);

    // Get profile views
    const [profileViews] = await query(`
      SELECT COUNT(*) as total_views,
             COUNT(DISTINCT viewed_user_id) as unique_profiles_viewed
      FROM profile_views WHERE viewer_id = ?
    `, [userId]);

    const summary = {
      interests: {
        sent: {
          total: interestsSent?.total_sent || 0,
          accepted: interestsSent?.accepted || 0,
          declined: interestsSent?.declined || 0,
          pending: interestsSent?.pending || 0
        },
        received: {
          total: interestsReceived?.total_received || 0,
          accepted: interestsReceived?.accepted || 0,
          declined: interestsReceived?.declined || 0,
          pending: interestsReceived?.pending || 0
        }
      },
      connects: {
        sent: {
          total: connectsSent?.total_sent || 0,
          accepted: connectsSent?.accepted || 0,
          declined: connectsSent?.declined || 0,
          pending: connectsSent?.pending || 0
        },
        received: {
          total: connectsReceived?.total_received || 0,
          accepted: connectsReceived?.accepted || 0,
          declined: connectsReceived?.declined || 0,
          pending: connectsReceived?.pending || 0
        }
      },
      actions: {
        shortlisted: shortlistCount?.total_shortlisted || 0,
        blocked: blockedCount?.total_blocked || 0,
        ignored: ignoredCount?.total_ignored || 0
      },
      profile_activity: {
        total_views: profileViews?.total_views || 0,
        unique_profiles_viewed: profileViews?.unique_profiles_viewed || 0
      }
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    console.error("Get Match Action Summary Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Bulk Match Actions
export async function bulkMatchActions(req, res) {
  try {
    const userId = req.user.user_id;
    const { action_type, target_user_ids, message } = req.body;

    if (!action_type || !target_user_ids || !Array.isArray(target_user_ids)) {
      return res.status(400).json({
        success: false,
        message: "action_type and target_user_ids array are required"
      });
    }

    const results = [];

    for (const targetUserId of target_user_ids) {
      try {
        switch (action_type) {
          case 'shortlist':
            await query(
              "INSERT INTO user_actions (user_id, target_user_id, action_type_id) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP",
              [userId, targetUserId]
            );
            break;

          case 'interest':
            await query(
              "INSERT INTO user_interests (sender_id, receiver_id, message, status) VALUES (?, ?, ?, 'sent') ON DUPLICATE KEY UPDATE message = VALUES(message), updated_at = CURRENT_TIMESTAMP",
              [userId, targetUserId, message || "Hi! I'm interested in your profile."]
            );
            break;

          case 'connect':
            await query(
              "INSERT INTO connect_now_requests (sender_id, receiver_id, message, status) VALUES (?, ?, ?, 'pending') ON DUPLICATE KEY UPDATE message = VALUES(message), status = 'pending', updated_at = CURRENT_TIMESTAMP",
              [userId, targetUserId, message || "Hi! I would like to connect with you."]
            );
            break;

          case 'ignore':
            await query(
              "INSERT INTO user_actions (user_id, target_user_id, action_type_id) VALUES (?, ?, 2) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP",
              [userId, targetUserId]
            );
            break;

          case 'block':
            await query(
              "INSERT INTO user_actions (user_id, target_user_id, action_type_id) VALUES (?, ?, 3) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP",
              [userId, targetUserId]
            );
            break;

          default:
            results.push({ user_id: targetUserId, status: 'failed', error: 'Invalid action type' });
            continue;
        }

        results.push({ user_id: targetUserId, status: 'success' });
      } catch (error) {
        results.push({ user_id: targetUserId, status: 'failed', error: error.message });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;

    res.json({
      success: true,
      message: `${action_type} action completed for ${successCount} out of ${target_user_ids.length} users`,
      results
    });
  } catch (error) {
    console.error("Bulk Match Actions Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Connect with Selected Matches
export async function connectWithSelected(req, res) {
  try {
    const userId = req.user.user_id;
    const { selected_user_ids, message = "Hi! I would like to connect with you." } = req.body;

    if (!selected_user_ids || !Array.isArray(selected_user_ids)) {
      return res.status(400).json({ success: false, message: "selected_user_ids array is required" });
    }

    // Get ignored and blocked user IDs
    const ignoredBlockedUsers = await query(
      "SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)",
      [userId]
    );
    const ignoredBlockedIds = new Set(ignoredBlockedUsers.map(u => u.target_user_id));

    const results = [];
    for (const targetUserId of selected_user_ids) {
      try {
        // Skip if user is ignored or blocked
        if (ignoredBlockedIds.has(targetUserId)) {
          results.push({ user_id: targetUserId, status: 'skipped', reason: 'User is ignored or blocked' });
          continue;
        }

        await query(
          "INSERT INTO connect_now_requests (sender_id, receiver_id, message, status) VALUES (?, ?, ?, 'pending') ON DUPLICATE KEY UPDATE message = VALUES(message), status = 'pending', updated_at = CURRENT_TIMESTAMP",
          [userId, targetUserId, message]
        );

        // Create alert for each receiver
        await createConnectNowAlert(targetUserId, userId);

        results.push({ user_id: targetUserId, status: 'sent' });
      } catch (error) {
        results.push({ user_id: targetUserId, status: 'failed' });
      }
    }

    res.json({
      success: true,
      message: `Connect requests sent to ${results.filter(r => r.status === 'sent').length} users`,
      results
    });
  } catch (error) {
    console.error("Connect with Selected Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}



// Get My Connections
export async function getMyConnections(req, res) {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Fix: use subquery to avoid GROUP BY on computed alias
    const connections = await query(`
      SELECT cnr.created_at as connected_date, cnr.status,
             CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END as connected_user_id
      FROM connect_now_requests cnr
      JOIN users u ON (CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END) = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE (cnr.sender_id = ? OR cnr.receiver_id = ?)
        AND cnr.status = 'accepted'
        AND cnr.sender_id != cnr.receiver_id
        AND u.status = 1
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
        AND CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END != ?
        AND CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 2
        )
      ORDER BY cnr.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, userId, userId, userId, userId, userId, userId, userId, parseInt(limit as string), offset]);

    const enrichedConnections = await Promise.all(connections.map(async (conn) => {
      const profileId = conn.connected_user_id;

      const [profile] = await query(`
        SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
               up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
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
               COALESCE(cim.city_name, cd.city_living_in) as city_living_in, COALESCE(stm.state_name, cd.state_living_in_id) as state_living_in, cd.country_living_in_id,
               clc.country_name as country_living,
               cur.currency_code, cur.symbol as currency_symbol,
               ed.education_level_id, ed.institution_name, ed.institution_name_2,
               elm.level_name as education_level,
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
        LEFT JOIN cities_master cim ON cd.city_living_in = cim.id
        LEFT JOIN states_master stm ON cd.state_living_in_id = stm.id
        LEFT JOIN country_code_master clc ON cd.country_living_in_id = clc.id
        LEFT JOIN currency_master cur ON cd.currency_id = cur.id
        LEFT JOIN education_details ed ON u.id = ed.user_id
        LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
        WHERE u.id = ?
          -- 21-07-2026 - Profile complete condition
          AND ${profileCompleteCondition("u", "up")}
      `, [profileId]);

      const [family] = await query(`
        SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
               ffs.status_name as financial_status, c.country_name as family_country
        FROM family_details fd
        LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
        LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
        LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
        LEFT JOIN country_code_master c ON fd.family_country_id = c.id
        WHERE fd.user_id = ?
      `, [profileId]);

      const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        WHERE ad.user_id = ?
      `, [profileId]);

      const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        WHERE ld.user_id = ?
      `, [profileId]);

      const hobbies = await query(`
        SELECT hm.* FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?
      `, [profileId]);

      const photos = await query(`
        SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC
      `, [profileId]);

      // Skip if profile not found (deleted/inactive user)
      if (!profile) return null;

      // Get connect status
      const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profileId, profileId, userId]);

      return {
        connected_date: conn.connected_date,
        status: conn.status,
        ...profile,
        family: family || {},
        astro: astro || {},
        location: location || {},
        hobbies: hobbies || [],
        photos: photos || [],
        connect_status: connectStatus?.status || null
      };
    }));

    const [{ total }] = await query(`
      SELECT COUNT(*) as total
      FROM connect_now_requests cnr
      JOIN users u ON (CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END) = u.id
      LEFT JOIN user_profiles up ON u.id = up.user_id
      WHERE (cnr.sender_id = ? OR cnr.receiver_id = ?) AND cnr.status = 'accepted'
        AND u.status = 1
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
        AND CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 2
        )
    `, [userId, userId, userId, userId, userId]);

    const filteredConnections = (await applyPrivacyFilterToMatches(
      enrichedConnections.filter((c: any) => c !== null && c !== undefined),
      userId
    )).filter(p => !p.is_blocked);
    res.json({
      success: true,
      data: {
        connections: filteredConnections,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_records: total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("Get My Connections Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


// Get Connection Status with a specific user
export async function getConnectionStatus(req, res) {
  try {
    const userId = req.user.user_id;
    const { target_user_id } = req.params;

    // Get connect request between the two users (either direction)
    const [request] = await query(
      `SELECT cnr.id, cnr.sender_id, cnr.receiver_id, cnr.status,
              up.first_name, up.middle_name, up.last_name, up.profile_picture,
              u.vivaaha_user_id
       FROM connect_now_requests cnr
       JOIN users u ON u.id = ?
       LEFT JOIN user_profiles up ON up.user_id = ?
       WHERE (cnr.sender_id = ? AND cnr.receiver_id = ?)
          OR (cnr.sender_id = ? AND cnr.receiver_id = ?)
       ORDER BY cnr.updated_at DESC
       LIMIT 1`,
      [target_user_id, target_user_id, userId, target_user_id, target_user_id, userId]
    );

    if (!request) {
      return res.json({
        success: true,
        data: {
          status: null, // no request sent at all
          first_name: null,
          last_name: null,
          profile_picture: null,
          vivaaha_user_id: null,
        }
      });
    }

    res.json({
      success: true,
      data: {
        status: request.status,           // 'pending' | 'accepted' | 'declined'
        i_am_sender: request.sender_id === userId,
        first_name: request.first_name,
        last_name: request.last_name,
        profile_picture: request.profile_picture,
        vivaaha_user_id: request.vivaaha_user_id,
      }
    });
  } catch (error) {
    console.error('Get Connection Status Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Lightweight accepted connections list for chat suggestion
export async function getAcceptedConnections(req, res) {
  try {
    const userId = req.user.user_id;

    const connections = await query(`
      SELECT
        CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END as user_id,
        up.first_name,
        up.last_name,
        up.profile_picture,
        u.vivaaha_user_id,
        up.age,
        cd.city_living_in,
        cd.occupation,
        CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online'
             WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 60 MINUTE) THEN 'Recently active'
             ELSE 'Offline' END as online_status
      FROM connect_now_requests cnr
      JOIN users u ON u.id = CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN career_details cd ON cd.user_id = u.id
      WHERE (cnr.sender_id = ? OR cnr.receiver_id = ?)
        AND cnr.status = 'accepted'
        AND u.status = 1
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
        AND CASE WHEN cnr.sender_id = ? THEN cnr.receiver_id ELSE cnr.sender_id END NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id IN (2, 3)
        )
      ORDER BY cnr.updated_at DESC
    `, [userId, userId, userId, userId, userId, userId]);

    res.json({ success: true, data: connections });
  } catch (error) {
    console.error('Get Accepted Connections Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}
