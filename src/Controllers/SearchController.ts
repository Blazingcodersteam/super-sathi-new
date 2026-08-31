import * as utils from "util";
import { applyPrivacyFilterToMatches, applyPrivacyFilter } from "../utils/privacyFilter";
// 21-07-2026 - Profile complete condition
import { profileCompleteCondition } from "../utils/profileCompletion";
import { areSubscriptionRestrictionsEnabled } from "../utils/subscriptionAccess";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// Comprehensive Profile Search with Array-based ID filters
export async function searchProfilesComprehensive(req, res) {
  try {
    const userId = req.user.user_id;
    const {
      min_age, max_age, religion_ids, caste_ids, marital_status_ids, min_income, max_income,
      mother_tongue_ids, city_ids, education_level_ids, occupation, profile_created_by,
      min_height, max_height, blood_group_ids, diet_ids, family_type_ids, family_status_ids,
      family_values_ids, father_occupation_ids, mother_occupation_ids, family_financial_status_ids,
      gothra_ids, rasi_ids, nakshatra_ids, dosham, state_ids, working_with_ids, currency_ids,
      income_type, education_area_ids, smoking, drinking, subscription_status, recently_joined,
      income_range, working_with, profession_area, active_members,
      match_type, verification_status, photo_settings, country_ids, disability_ids,
      health_info_ids, profession_ids, has_children, lives_with_family, weight_min, weight_max,
      manglik_status, eating_habits, community_ids, profile_managed_by_ids, currency_id, number_of_children,
      page = 1, limit = 10
    } = req.query;

    console.log('Search filters received:', {
      min_age, max_age, religion_ids, caste_ids, community_ids, marital_status_ids,
      min_income, max_income, mother_tongue_ids, city_ids, state_ids, country_ids,
      education_level_ids, education_area_ids, working_with_ids, profession_ids,
      min_height, max_height, blood_group_ids, diet_ids, health_info_ids, disability_ids,
      profile_managed_by_ids, family_type_ids, family_values_ids, father_occupation_ids,
      mother_occupation_ids, family_financial_status_ids, gothra_ids, rasi_ids, nakshatra_ids,
      currency_id, income_type, smoking, drinking, dosham, manglik_status, has_children,
      number_of_children, lives_with_family, subscription_status, recently_joined,
      active_members, eating_habits, match_type, verification_status, photo_settings
    });

    const [currentUser] = await query(
      "SELECT up.gender_id, up.profile_created_by FROM user_profiles up WHERE up.user_id = ?", [userId]
    );

    let whereConditions = ["u.id != ?", "u.status = 1", "up.aadhaar_verified = 1"];
    let queryParams = [userId];

    // If current user profile is managed by parent, only show parent-managed profiles
    if (currentUser?.profile_created_by === 'parent') {
      whereConditions.push("up.profile_created_by = 'parent'");
    }

    // Helper function to parse array parameters
    const parseArrayParam = (param) => {
      if (!param) return [];
      if (Array.isArray(param)) return param.map(id => parseInt(id)).filter(id => !isNaN(id));
      try {
        const parsed = JSON.parse(param);
        return Array.isArray(parsed)
          ? parsed.map(id => parseInt(id)).filter(id => !isNaN(id))
          : [parseInt(parsed)].filter(id => !isNaN(id));
      } catch {
        return String(param).split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      }
    };

    const addMultiValueFilter = (param, column) => {
      const ids = parseArrayParam(param);
      if (ids.length > 0) {
        whereConditions.push(`${column} IN (${ids.map(() => '?').join(',')})`);
        queryParams.push(...ids);
      }
    };

    // Parse all array parameters
    const religionIds = parseArrayParam(religion_ids);
    const casteIds = parseArrayParam(caste_ids);
    const communityIds = parseArrayParam(community_ids);
    const maritalIds = parseArrayParam(marital_status_ids);
    const tongueIds = parseArrayParam(mother_tongue_ids);
    const cityIds = parseArrayParam(city_ids);
    const stateIds = parseArrayParam(state_ids);
    const countryIds = parseArrayParam(country_ids);
    const eduIds = parseArrayParam(education_level_ids);
    const eduAreaIds = parseArrayParam(education_area_ids);
    const bloodIds = parseArrayParam(blood_group_ids);
    const dietIds = parseArrayParam(diet_ids);
    const workingIds = parseArrayParam(working_with_ids);
    const professionIds = parseArrayParam(profession_ids);
    const currencyIds = parseArrayParam(currency_ids);
    const disabilityIds = parseArrayParam(disability_ids);
    const healthIds = parseArrayParam(health_info_ids);
    const profileManagedIds = parseArrayParam(profile_managed_by_ids);
    const familyTypeIds = parseArrayParam(family_type_ids);
    const familyStatusIds = parseArrayParam(family_status_ids);
    const familyValueIds = parseArrayParam(family_values_ids);
    const fatherOccIds = parseArrayParam(father_occupation_ids);
    const motherOccIds = parseArrayParam(mother_occupation_ids);
    const finStatusIds = parseArrayParam(family_financial_status_ids);
    const gothraIds = parseArrayParam(gothra_ids);
    const rasiIds = parseArrayParam(rasi_ids);
    const nakshatraIds = parseArrayParam(nakshatra_ids);

    console.log('Parsed array parameters:', {
      religionIds, casteIds, communityIds, maritalIds, tongueIds, cityIds, stateIds, countryIds,
      eduIds, eduAreaIds, bloodIds, dietIds, workingIds, professionIds, currencyIds,
      disabilityIds, healthIds, profileManagedIds, familyTypeIds, familyStatusIds,
      familyValueIds, fatherOccIds, motherOccIds, finStatusIds, gothraIds, rasiIds, nakshatraIds
    });

    // Opposite gender filter
    if (currentUser?.gender_id) {
      const oppositeGender = currentUser.gender_id === 1 ? 2 : 1;
      whereConditions.push("up.gender_id = ?");
      queryParams.push(oppositeGender);
    }

    // Age filters
    if (min_age) {
      whereConditions.push("up.age >= ?");
      queryParams.push(parseInt(min_age));
    }
    if (max_age) {
      whereConditions.push("up.age <= ?");
      queryParams.push(parseInt(max_age));
    }

    // Build OR conditions for array-based filters - ALL FILTERS USE OR LOGIC
    let orConditions = [];
    let orParams = [];

    // Religion filter
    if (religionIds.length > 0) {
      orConditions.push(`up.religion_id IN (${religionIds.map(() => '?').join(',')})`);
      orParams.push(...religionIds);
    }

    // Caste filter
    if (casteIds.length > 0) {
      orConditions.push(`up.caste_id IN (${casteIds.map(() => '?').join(',')})`);
      orParams.push(...casteIds);
    }

    // Community filter
    if (communityIds.length > 0) {
      orConditions.push(`caste.community_id IN (${communityIds.map(() => '?').join(',')})`);
      orParams.push(...communityIds);
    }

    // Marital status filter
    if (maritalIds.length > 0) {
      orConditions.push(`up.marital_status_id IN (${maritalIds.map(() => '?').join(',')})`);
      orParams.push(...maritalIds);
    }

    // Mother tongue filter
    if (tongueIds.length > 0) {
      orConditions.push(`up.mother_tongue_id IN (${tongueIds.map(() => '?').join(',')})`);
      orParams.push(...tongueIds);
    }

    // City filter
    if (cityIds.length > 0) {
      orConditions.push(`ld.city_id IN (${cityIds.map(() => '?').join(',')})`);
      orParams.push(...cityIds);
    }

    // State filter
    if (stateIds.length > 0) {
      orConditions.push(`ld.state_id IN (${stateIds.map(() => '?').join(',')})`);
      orParams.push(...stateIds);
    }

    // Country filter
    if (countryIds.length > 0) {
      orConditions.push(`(ld.country_id IN (${countryIds.map(() => '?').join(',')}) OR ld.country_id IS NULL)`);
      orParams.push(...countryIds);
    }

    // Education level filter
    if (eduIds.length > 0) {
      orConditions.push(`ed.education_level_id IN (${eduIds.map(() => '?').join(',')})`);
      orParams.push(...eduIds);
    }

    // Education area filter
    if (eduAreaIds.length > 0) {
      orConditions.push(`ed.education_area_id IN (${eduAreaIds.map(() => '?').join(',')})`);
      orParams.push(...eduAreaIds);
    }

    // Blood group filter
    if (bloodIds.length > 0) {
      orConditions.push(`up.blood_group_id IN (${bloodIds.map(() => '?').join(',')})`);
      orParams.push(...bloodIds);
    }

    // Diet filter
    if (dietIds.length > 0) {
      orConditions.push(`up.diet_id IN (${dietIds.map(() => '?').join(',')})`);
      orParams.push(...dietIds);
    }

    // Working with filter
    if (workingIds.length > 0) {
      orConditions.push(`cd.working_with_id IN (${workingIds.map(() => '?').join(',')})`);
      orParams.push(...workingIds);
    }

    // Profession filter
    if (professionIds.length > 0) {
      orConditions.push(`cd.profession_id IN (${professionIds.map(() => '?').join(',')})`);
      orParams.push(...professionIds);
    }

    // Disability filter
    if (disabilityIds.length > 0) {
      orConditions.push(`up.disability_id IN (${disabilityIds.map(() => '?').join(',')})`);
      orParams.push(...disabilityIds);
    }

    // Health info filter
    if (healthIds.length > 0) {
      orConditions.push(`up.health_info_id IN (${healthIds.map(() => '?').join(',')})`);
      orParams.push(...healthIds);
    }

    // Family type filter
    if (familyTypeIds.length > 0) {
      orConditions.push(`fd.family_type_id IN (${familyTypeIds.map(() => '?').join(',')})`);
      orParams.push(...familyTypeIds);
    }

    // Family status filter
    if (familyStatusIds.length > 0) {
      orConditions.push(`fd.family_status_id IN (${familyStatusIds.map(() => '?').join(',')})`);
      orParams.push(...familyStatusIds);
    }

    // Family values filter
    if (familyValueIds.length > 0) {
      orConditions.push(`fd.family_values_id IN (${familyValueIds.map(() => '?').join(',')})`);
      orParams.push(...familyValueIds);
    }

    // Father occupation filter
    if (fatherOccIds.length > 0) {
      orConditions.push(`fd.father_occupation_id IN (${fatherOccIds.map(() => '?').join(',')})`);
      orParams.push(...fatherOccIds);
    }

    // Mother occupation filter
    if (motherOccIds.length > 0) {
      orConditions.push(`fd.mother_occupation_id IN (${motherOccIds.map(() => '?').join(',')})`);
      orParams.push(...motherOccIds);
    }

    // Family financial status filter
    if (finStatusIds.length > 0) {
      orConditions.push(`fd.family_financial_status_id IN (${finStatusIds.map(() => '?').join(',')})`);
      orParams.push(...finStatusIds);
    }

    // Gothra filter
    if (gothraIds.length > 0) {
      orConditions.push(`astro.gothra_id IN (${gothraIds.map(() => '?').join(',')})`);
      orParams.push(...gothraIds);
    }

    // Rasi filter
    if (rasiIds.length > 0) {
      orConditions.push(`astro.rasi_id IN (${rasiIds.map(() => '?').join(',')})`);
      orParams.push(...rasiIds);
    }

    // Nakshatra filter
    if (nakshatraIds.length > 0) {
      orConditions.push(`astro.nakshatra_id IN (${nakshatraIds.map(() => '?').join(',')})`);
      orParams.push(...nakshatraIds);
    }

    // Add OR conditions to main WHERE clause if any exist
    // Each filter group is its own AND condition with OR within the group
    if (religionIds.length > 0) {
      whereConditions.push(`up.religion_id IN (${religionIds.map(() => '?').join(',')})`);
      queryParams.push(...religionIds);
    }
    if (casteIds.length > 0) {
      whereConditions.push(`up.caste_id IN (${casteIds.map(() => '?').join(',')})`);
      queryParams.push(...casteIds);
    }
    if (communityIds.length > 0) {
      whereConditions.push(`caste.community_id IN (${communityIds.map(() => '?').join(',')})`);
      queryParams.push(...communityIds);
    }
    if (maritalIds.length > 0) {
      whereConditions.push(`up.marital_status_id IN (${maritalIds.map(() => '?').join(',')})`);
      queryParams.push(...maritalIds);
    }
    if (tongueIds.length > 0) {
      whereConditions.push(`up.mother_tongue_id IN (${tongueIds.map(() => '?').join(',')})`);
      queryParams.push(...tongueIds);
    }
    if (cityIds.length > 0) {
      whereConditions.push(`ld.city_id IN (${cityIds.map(() => '?').join(',')})`);
      queryParams.push(...cityIds);
    }
    if (stateIds.length > 0) {
      whereConditions.push(`ld.state_id IN (${stateIds.map(() => '?').join(',')})`);
      queryParams.push(...stateIds);
    }
    if (countryIds.length > 0) {
      whereConditions.push(`(ld.country_id IN (${countryIds.map(() => '?').join(',')}) OR ld.country_id IS NULL)`);
      queryParams.push(...countryIds);
    }
    if (eduIds.length > 0) {
      whereConditions.push(`ed.education_level_id IN (${eduIds.map(() => '?').join(',')})`);
      queryParams.push(...eduIds);
    }
    if (eduAreaIds.length > 0) {
      whereConditions.push(`ed.education_area_id IN (${eduAreaIds.map(() => '?').join(',')})`);
      queryParams.push(...eduAreaIds);
    }
    if (bloodIds.length > 0) {
      whereConditions.push(`up.blood_group_id IN (${bloodIds.map(() => '?').join(',')})`);
      queryParams.push(...bloodIds);
    }
    if (dietIds.length > 0) {
      whereConditions.push(`up.diet_id IN (${dietIds.map(() => '?').join(',')})`);
      queryParams.push(...dietIds);
    }
    if (workingIds.length > 0) {
      whereConditions.push(`cd.working_with_id IN (${workingIds.map(() => '?').join(',')})`);
      queryParams.push(...workingIds);
    }
    if (professionIds.length > 0) {
      whereConditions.push(`cd.profession_id IN (${professionIds.map(() => '?').join(',')})`);
      queryParams.push(...professionIds);
    }
    if (disabilityIds.length > 0) {
      whereConditions.push(`up.disability_id IN (${disabilityIds.map(() => '?').join(',')})`);
      queryParams.push(...disabilityIds);
    }
    if (healthIds.length > 0) {
      whereConditions.push(`up.health_info_id IN (${healthIds.map(() => '?').join(',')})`);
      queryParams.push(...healthIds);
    }
    if (familyTypeIds.length > 0) {
      whereConditions.push(`fd.family_type_id IN (${familyTypeIds.map(() => '?').join(',')})`);
      queryParams.push(...familyTypeIds);
    }
    if (familyStatusIds.length > 0) {
      whereConditions.push(`fd.family_status_id IN (${familyStatusIds.map(() => '?').join(',')})`);
      queryParams.push(...familyStatusIds);
    }
    if (familyValueIds.length > 0) {
      whereConditions.push(`fd.family_values_id IN (${familyValueIds.map(() => '?').join(',')})`);
      queryParams.push(...familyValueIds);
    }
    if (fatherOccIds.length > 0) {
      whereConditions.push(`fd.father_occupation_id IN (${fatherOccIds.map(() => '?').join(',')})`);
      queryParams.push(...fatherOccIds);
    }
    if (motherOccIds.length > 0) {
      whereConditions.push(`fd.mother_occupation_id IN (${motherOccIds.map(() => '?').join(',')})`);
      queryParams.push(...motherOccIds);
    }
    if (finStatusIds.length > 0) {
      whereConditions.push(`fd.family_financial_status_id IN (${finStatusIds.map(() => '?').join(',')})`);
      queryParams.push(...finStatusIds);
    }
    if (gothraIds.length > 0) {
      whereConditions.push(`astro.gothra_id IN (${gothraIds.map(() => '?').join(',')})`);
      queryParams.push(...gothraIds);
    }
    if (rasiIds.length > 0) {
      whereConditions.push(`astro.rasi_id IN (${rasiIds.map(() => '?').join(',')})`);
      queryParams.push(...rasiIds);
    }
    if (nakshatraIds.length > 0) {
      whereConditions.push(`astro.nakshatra_id IN (${nakshatraIds.map(() => '?').join(',')})`);
      queryParams.push(...nakshatraIds);
    }

    // Income filters
    if (min_income) {
      whereConditions.push("(cd.annual_income >= ? OR cd.annual_income IS NULL)");
      queryParams.push(parseFloat(min_income));
    }
    if (max_income) {
      whereConditions.push("(cd.annual_income <= ? OR cd.annual_income IS NULL)");
      queryParams.push(parseFloat(max_income));
    }

    // Height filters — height stored as "4ft 5in - 134cm" format, filter value is in cm from Flutter
    if (min_height) {
      whereConditions.push(`(up.height IS NOT NULL AND up.height != '' AND (
        CASE
          WHEN up.height REGEXP '[0-9]+cm' THEN
            CAST(REGEXP_SUBSTR(up.height, '[0-9]+cm') AS UNSIGNED)
          WHEN up.height REGEXP '^[0-9]+''[0-9]+' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, '''', 1) AS UNSIGNED) * 12 +
            CAST(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, '''', -1), '[0-9]+') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+ft' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, 'ft', 1) AS UNSIGNED) * 12 +
            CAST(COALESCE(NULLIF(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, 'ft', -1), '[0-9]+'), ''), '0') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+$' THEN
            CAST(up.height AS UNSIGNED)
          ELSE 0
        END
      ) >= ?)`);
      queryParams.push(parseInt(min_height));
    }
    if (max_height) {
      whereConditions.push(`(up.height IS NOT NULL AND up.height != '' AND (
        CASE
          WHEN up.height REGEXP '[0-9]+cm' THEN
            CAST(REGEXP_SUBSTR(up.height, '[0-9]+cm') AS UNSIGNED)
          WHEN up.height REGEXP '^[0-9]+''[0-9]+' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, '''', 1) AS UNSIGNED) * 12 +
            CAST(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, '''', -1), '[0-9]+') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+ft' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, 'ft', 1) AS UNSIGNED) * 12 +
            CAST(COALESCE(NULLIF(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, 'ft', -1), '[0-9]+'), ''), '0') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+$' THEN
            CAST(up.height AS UNSIGNED)
          ELSE 0
        END
      ) <= ?)`);
      queryParams.push(parseInt(max_height));
    }

    // Dosham filter
    if (dosham && dosham !== 'open_to_all') {
      whereConditions.push("astro.dosham = ?");
      queryParams.push(dosham);
    }

    // Manglik status filter
    if (manglik_status && manglik_status !== 'open_to_all') {
      whereConditions.push("astro.manglik_status = ?");
      queryParams.push(manglik_status);
    }

    // Smoking filter
    if (smoking && smoking !== 'open_to_all') {
      let smokingId;
      if (smoking === 'no' || smoking === 'never') smokingId = 1;
      else if (smoking === 'occasionally') smokingId = 2;
      else if (smoking === 'socially') smokingId = 3;
      else if (smoking === 'regularly') smokingId = 4;
      else if (smoking === 'prefer_not_to_say') smokingId = 5;
      else smokingId = parseInt(smoking);
      if (!isNaN(smokingId)) {
        whereConditions.push("up.smoking_id = ?");
        queryParams.push(smokingId);
      }
    }

    // Drinking filter
    if (drinking && drinking !== 'open_to_all') {
      let drinkingId;
      if (drinking === 'no' || drinking === 'never') drinkingId = 1;
      else if (drinking === 'occasionally') drinkingId = 2;
      else if (drinking === 'socially') drinkingId = 3;
      else if (drinking === 'regularly') drinkingId = 4;
      else if (drinking === 'prefer_not_to_say') drinkingId = 5;
      else drinkingId = parseInt(drinking);
      if (!isNaN(drinkingId)) {
        whereConditions.push("up.drinking_id = ?");
        queryParams.push(drinkingId);
      }
    }

    // Recently joined filter
    if (recently_joined && recently_joined !== 'open_to_all') {
      if (recently_joined === 'within_day') whereConditions.push("u.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
      else if (recently_joined === 'within_week') whereConditions.push("u.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)");
      else if (recently_joined === 'within_month') whereConditions.push("u.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)");
    }

    // Active members filter
    if (active_members && active_members !== 'open_to_all') {
      if (active_members === 'within_day') whereConditions.push("u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
      else if (active_members === 'within_week') whereConditions.push("u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)");
      else if (active_members === 'within_month') whereConditions.push("u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)");
    }

    // Subscription filter
    if (subscription_status === 'premium') {
      whereConditions.push("us.subscription_status_id = 1 AND us.is_active = 1");
    }

    // Photo settings filter
    if (photo_settings && photo_settings !== 'open_to_all') {
      if (photo_settings === 'visible_to_all') {
        whereConditions.push("(up.profile_picture IS NOT NULL AND up.profile_picture != '')");
      } else if (photo_settings === 'with_photos') {
        whereConditions.push("EXISTS (SELECT 1 FROM user_photos WHERE user_id = u.id)");
      }
    }

    // Exclude hidden profiles (Section 11: user_hide_profile + account_settings.profile_hidden)
    whereConditions.push(`u.id NOT IN (
      SELECT user_id FROM user_hide_profile
      WHERE is_active = TRUE AND hide_end_date > NOW()
    )`);
    whereConditions.push(`u.id NOT IN (
      SELECT user_id FROM account_settings WHERE profile_hidden = 1
    )`);

    // Section 11 — exclude visible_to_premium profiles from non-premium viewers.
    // Skipped entirely when the admin subscription-restrictions switch is off: the owner
    // picked the audience CLASS "premium members", and with restrictions off every member
    // counts as premium, so the profile is visible to everyone. The queryParams.push has to
    // stay inside the guard — dropping the condition without its bind would shift every
    // later placeholder by one and silently corrupt the whole WHERE clause.
    if (await areSubscriptionRestrictionsEnabled()) {
      whereConditions.push(`u.id NOT IN (
        SELECT ps2.user_id FROM privacy_settings ps2
        WHERE ps2.profile_visibility = 'visible_to_premium'
        AND ? NOT IN (
          SELECT user_id FROM user_subscriptions
          WHERE subscription_status_id = 1 AND end_date > NOW()
        )
      )`);
      queryParams.push(userId);
    }
    // Exclude blocked users — bidirectional
    whereConditions.push(`u.id NOT IN (
      SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
      UNION
      SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
    )`);
    queryParams.push(userId, userId);

    // 21-07-2026 - Profile complete condition
    whereConditions.push(profileCompleteCondition("u", "up"));

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = whereConditions.join(" AND ");

    const searchQuery = `
      SELECT DISTINCT u.id, u.vivaaha_user_id, u.created_at, u.email_verified, u.phone_verified,
             up.first_name, up.middle_name, up.last_name, up.age, up.height, up.weight, up.profile_picture, up.show_vivaaha_id,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
             up.religion_id, up.caste_id, up.marital_status_id, up.mother_tongue_id, up.diet_id,
             up.has_children, up.number_of_children, up.lives_with_family, up.about_myself,
             rm.religion_name, cm.caste_name, msm.status_name as marital_status,
             mtm.language_name as mother_tongue, dm.diet_name, bg.blood_group,
             CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm.profession_name, cd.occupation) ELSE cd.occupation END as occupation,
             cd.annual_income, cd.city_living_in, cd.income_type,
             ld.city_id, ld.state_id, ld.country_id, citym.city_name, statem.state_name, countrym.country_name,
             clc3.country_name as country_living,
             ed.education_level_id, ed.education_area_id, elm.level_name as education_level, eam.area_name as education_area,
             fd.family_type_id, fd.family_status_id, fd.family_values_id,
             astro.gothra_id, astro.manglik_status, astro.dosham, astro.rasi_id, astro.nakshatra_id,
             rasm.rasi_name, nm.nakshatra_name, sm.smoking_type, drm.drinking_type,
             CASE WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'Online' WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(MINUTE, u.last_active_at, NOW()), 'm ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN CONCAT('Active ', TIMESTAMPDIFF(HOUR, u.last_active_at, NOW()), 'h ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(DAY, u.last_active_at, NOW()), 'd ago') WHEN u.last_active_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN CONCAT('Active ', TIMESTAMPDIFF(WEEK, u.last_active_at, NOW()), 'w ago') ELSE 'Offline' END as online_status
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
      LEFT JOIN mother_tongue_master mtm ON up.mother_tongue_id = mtm.id
      LEFT JOIN diet_master dm ON up.diet_id = dm.id
      LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN country_code_master clc3 ON cd.country_living_in_id = clc3.id
      LEFT JOIN location_details ld ON u.id = ld.user_id
      LEFT JOIN cities_master citym ON ld.city_id = citym.id
      LEFT JOIN states_master statem ON ld.state_id = statem.id
      LEFT JOIN country_code_master countrym ON ld.country_id = countrym.id
      LEFT JOIN education_details ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      LEFT JOIN education_area_master eam ON ed.education_area_id = eam.id
      LEFT JOIN family_details fd ON u.id = fd.user_id
      LEFT JOIN astro_details astro ON u.id = astro.user_id
      LEFT JOIN rasi_master rasm ON astro.rasi_id = rasm.id
      LEFT JOIN nakshatra_master nm ON astro.nakshatra_id = nm.id
      LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
      LEFT JOIN smoking_master sm ON up.smoking_id = sm.id
      LEFT JOIN drinking_master drm ON up.drinking_id = drm.id
      LEFT JOIN caste_master caste ON up.caste_id = caste.id
      LEFT JOIN profession_master pm ON cd.occupation REGEXP '^[0-9]+$' AND pm.id = CAST(cd.occupation AS UNSIGNED)
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const profiles = await query(searchQuery, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN location_details ld ON u.id = ld.user_id
      LEFT JOIN education_details ed ON u.id = ed.user_id
      LEFT JOIN family_details fd ON u.id = fd.user_id
      LEFT JOIN astro_details astro ON u.id = astro.user_id
      LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
      LEFT JOIN smoking_master sm ON up.smoking_id = sm.id
      LEFT JOIN drinking_master drm ON up.drinking_id = drm.id
      LEFT JOIN caste_master caste ON up.caste_id = caste.id
      WHERE ${whereClause}
    `;

    const countParams = queryParams.slice(0, -2);
    const [{ total }] = await query(countQuery, countParams);

    // Add match actions for each profile
    const enrichedProfiles = await Promise.all(profiles.map(async (profile) => {
      const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, profile.id]);

      const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profile.id, profile.id, userId]);

      // Get audio files for each profile
      const audioFiles = await query(`
        SELECT * FROM user_audio_files WHERE user_id = ? ORDER BY created_at DESC
      `, [profile.id]);

      return {
        ...profile,
        audio_files: audioFiles || [],
        match_actions: matchActions,
        connect_status: connectStatus?.status || null
      };
    }));

    // Apply privacy filter to all results
    const filteredProfiles = (await applyPrivacyFilterToMatches(enrichedProfiles, userId)).filter(p => !p.is_blocked);

    res.json({
      success: true,
      data: {
        profiles: filteredProfiles,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_records: total,
          total_pages: Math.ceil(total / parseInt(limit))
        },
        applied_filters: {
          min_age: min_age ? parseInt(min_age) : null,
          max_age: max_age ? parseInt(max_age) : null,
          religion_ids: religionIds,
          caste_ids: casteIds,
          marital_status_ids: maritalIds,
          mother_tongue_ids: tongueIds,
          city_ids: cityIds,
          state_ids: stateIds,
          country_ids: countryIds,
          education_level_ids: eduIds,
          education_area_ids: eduAreaIds,
          blood_group_ids: bloodIds,
          diet_ids: dietIds,
          working_with_ids: workingIds,
          profession_ids: professionIds,
          currency_ids: currencyIds,
          disability_ids: disabilityIds,
          health_info_ids: healthIds,
          family_type_ids: familyTypeIds,
          family_status_ids: familyStatusIds,
          family_values_ids: familyValueIds,
          father_occupation_ids: fatherOccIds,
          mother_occupation_ids: motherOccIds,
          family_financial_status_ids: finStatusIds,
          gothra_ids: gothraIds,
          rasi_ids: rasiIds,
          nakshatra_ids: nakshatraIds,
          min_income: min_income ? parseFloat(min_income) : null,
          max_income: max_income ? parseFloat(max_income) : null,
          min_height: min_height ? parseInt(min_height) : null,
          max_height: max_height ? parseInt(max_height) : null,
          weight_min: weight_min ? parseInt(weight_min) : null,
          weight_max: weight_max ? parseInt(weight_max) : null,
          occupation,
          profile_created_by,
          income_type,
          dosham,
          manglik_status,
          smoking,
          drinking,
          subscription_status,
          recently_joined,
          active_members,
          match_type,
          verification_status,
          photo_settings,
          has_children,
          lives_with_family,
          eating_habits
        }
      }
    });
  } catch (error) {
    console.error("Comprehensive Search Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Search Profiles with Filters
export async function searchProfilesOLD(req, res) {
  try {
    const userId = req.user.user_id;
    const {
      min_age,
      max_age,
      gender_id,
      religion_id,
      caste_id,
      marital_status_id,
      min_income,
      max_income,
      mother_tongue,
      city,
      state,
      country_id,
      education_level_id,
      occupation,
      profile_created_by,
      // Physical attributes
      min_height,
      max_height,
      blood_group_id,
      diet_id,
      disability_id,
      // Family details
      family_type_id,
      family_status_id,
      family_values_id,
      father_occupation_id,
      mother_occupation_id,
      family_financial_status_id,
      // Astro details
      gothra_id,
      rasi_id,
      nakshatra_id,
      dosham,
      manglik_status,
      // Location details
      state_id,
      city_id,
      // Career details
      working_with_id,
      currency_id,
      income_type,
      // Education details
      education_area_id,
      // Lifestyle
      smoking,
      drinking,
      // Subscription
      subscription_status,
      // New filters from UI
      match_type, // 'open_to_all' or '2_way_matches'
      verification_status, // 'open_to_all', 'blue_tick_profiles'
      photo_settings, // 'open_to_all', 'visible_to_all', 'protected_photo'
      recently_joined, // 'open_to_all', 'within_day', 'within_week', 'within_month'
      active_members, // 'open_to_all', 'within_day', 'within_week', 'within_month'
      income_range, // '15_20', '20_30', '30_50', '75_1cr'
      eating_habits, // 'non_veg', 'veg', 'eggetarian'
      working_with, // 'private_company', 'non_working', 'business_self_employed'
      profession_area, // 'it_software', 'non_working', 'medical_healthcare', 'admin_hr'
      page = 1,
      limit = 10
    } = req.query;

    // Get current user's gender to show opposite gender profiles
    const [currentUser] = await query(
      "SELECT up.gender_id, up.profile_created_by FROM user_profiles up WHERE up.user_id = ?",
      [userId]
    );

    let whereConditions = ["u.id != ?", "u.status = 1", "up.aadhaar_verified = 1"];
    let queryParams = [userId];

    // If current user profile is managed by parent, only show parent-managed profiles
    if (currentUser?.profile_created_by === 'parent') {
      whereConditions.push("up.profile_created_by = 'parent'");
    }

    // Helper function to parse array parameters
    const parseArrayParam = (param) => {
      if (!param) return [];
      if (Array.isArray(param)) return param.map(id => parseInt(id)).filter(id => !isNaN(id));
      try {
        const parsed = JSON.parse(param);
        return Array.isArray(parsed)
          ? parsed.map(id => parseInt(id)).filter(id => !isNaN(id))
          : [parseInt(parsed)].filter(id => !isNaN(id));
      } catch {
        return String(param).split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      }
    };

    const addMultiValueFilter = (param, column) => {
      const ids = parseArrayParam(param);
      if (ids.length > 0) {
        whereConditions.push(`${column} IN (${ids.map(() => '?').join(',')})`);
        queryParams.push(...ids);
      }
    };

    // Exclude hidden profiles (Section 11: user_hide_profile + account_settings.profile_hidden)
    whereConditions.push(`u.id NOT IN (
      SELECT user_id FROM user_hide_profile
      WHERE is_active = TRUE AND hide_end_date > NOW()
    )`);
    whereConditions.push(`u.id NOT IN (
      SELECT user_id FROM account_settings WHERE profile_hidden = 1
    )`);

    // Section 11 — exclude visible_to_premium profiles from non-premium viewers.
    // Skipped entirely when the admin subscription-restrictions switch is off: the owner
    // picked the audience CLASS "premium members", and with restrictions off every member
    // counts as premium, so the profile is visible to everyone. The queryParams.push has to
    // stay inside the guard — dropping the condition without its bind would shift every
    // later placeholder by one and silently corrupt the whole WHERE clause.
    if (await areSubscriptionRestrictionsEnabled()) {
      whereConditions.push(`u.id NOT IN (
        SELECT ps2.user_id FROM privacy_settings ps2
        WHERE ps2.profile_visibility = 'visible_to_premium'
        AND ? NOT IN (
          SELECT user_id FROM user_subscriptions
          WHERE subscription_status_id = 1 AND end_date > NOW()
        )
      )`);
      queryParams.push(userId);
    }
    // Exclude blocked users — bidirectional
    whereConditions.push(`u.id NOT IN (
      SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
      UNION
      SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
    )`);
    queryParams.push(userId, userId);

    // 21-07-2026 - Profile complete condition
    whereConditions.push(profileCompleteCondition("u", "up"));

    // Show opposite gender by default
    if (currentUser && currentUser.gender_id) {
      const oppositeGender = currentUser.gender_id === 1 ? 2 : 1;
      whereConditions.push("up.gender_id = ?");
      queryParams.push(gender_id || oppositeGender);
    }

    // Age filter
    if (min_age) {
      whereConditions.push("up.age >= ?");
      queryParams.push(parseInt(min_age));
    }
    if (max_age) {
      whereConditions.push("up.age <= ?");
      queryParams.push(parseInt(max_age));
    }

    // Religion filter
    addMultiValueFilter(religion_id, "up.religion_id");

    // Caste filter
    if (caste_id) {
      whereConditions.push("up.caste_id = ?");
      queryParams.push(parseInt(caste_id));
    }

    // Marital status filter
    addMultiValueFilter(marital_status_id, "up.marital_status_id");

    // Mother tongue filter
    addMultiValueFilter(mother_tongue, "up.mother_tongue_id");

    // Profile created by filter
    if (profile_created_by) {
      if (profile_created_by === 'parent_guardian') {
        whereConditions.push("up.profile_created_by IN ('parent', 'relative')");
      } else if (profile_created_by !== 'open_to_all') {
        whereConditions.push("up.profile_created_by = ?");
        queryParams.push(profile_created_by);
      }
    }

    // Recently joined filter
    if (recently_joined && recently_joined !== 'open_to_all') {
      if (recently_joined === 'within_day') {
        whereConditions.push("u.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
      } else if (recently_joined === 'within_week') {
        whereConditions.push("u.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)");
      } else if (recently_joined === 'within_month') {
        whereConditions.push("u.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)");
      }
    }

    // Income range filter
    if (income_range) {
      if (income_range === '15_20') {
        whereConditions.push("cd.annual_income BETWEEN 1500000 AND 2000000");
      } else if (income_range === '20_30') {
        whereConditions.push("cd.annual_income BETWEEN 2000000 AND 3000000");
      } else if (income_range === '30_50') {
        whereConditions.push("cd.annual_income BETWEEN 3000000 AND 5000000");
      } else if (income_range === '75_1cr') {
        whereConditions.push("cd.annual_income BETWEEN 7500000 AND 10000000");
      }
    }

    // Working with filter
    if (working_with && working_with !== 'open_to_all') {
      if (working_with === 'private_company') {
        whereConditions.push("cd.working_with_id = 1");
      } else if (working_with === 'non_working') {
        whereConditions.push("(cd.working_with_id IS NULL OR cd.working_with_id = 5)");
      } else if (working_with === 'business_self_employed') {
        whereConditions.push("cd.working_with_id IN (2, 3)");
      }
    }

    // Profession area filter
    if (profession_area && profession_area !== 'open_to_all') {
      if (profession_area === 'it_software') {
        whereConditions.push("cd.profession_id IN (SELECT id FROM profession_master WHERE profession_name LIKE '%Software%' OR profession_name LIKE '%IT%')");
      } else if (profession_area === 'medical_healthcare') {
        whereConditions.push("cd.profession_id IN (SELECT id FROM profession_master WHERE profession_name LIKE '%Doctor%' OR profession_name LIKE '%Medical%')");
      } else if (profession_area === 'admin_hr') {
        whereConditions.push("cd.profession_id IN (SELECT id FROM profession_master WHERE profession_name LIKE '%Admin%' OR profession_name LIKE '%HR%')");
      }
    }

    // Income filter
    if (min_income || max_income) {
      if (min_income) {
        whereConditions.push("cd.annual_income >= ?");
        queryParams.push(parseFloat(min_income));
      }
      if (max_income) {
        whereConditions.push("cd.annual_income <= ?");
        queryParams.push(parseFloat(max_income));
      }
    }

    // Location filters
    if (city) {
      whereConditions.push("ad.city LIKE ?");
      queryParams.push(`%${city}%`);
    }
    if (state) {
      whereConditions.push("(ad.state LIKE ? OR ld.state_living_in LIKE ?)");
      queryParams.push(`%${state}%`, `%${state}%`);
    }
    if (country_id) {
      whereConditions.push("(ad.country_id = ? OR ld.country_id = ?)");
      queryParams.push(parseInt(country_id), parseInt(country_id));
    }

    // Education filter
    if (education_level_id) {
      whereConditions.push("ed.education_level_id = ?");
      queryParams.push(parseInt(education_level_id));
    }

    // Occupation filter
    if (occupation) {
      whereConditions.push("cd.occupation LIKE ?");
      queryParams.push(`%${occupation}%`);
    }

    // Physical attributes filters — height filter value is in cm from Flutter
    if (min_height) {
      whereConditions.push(`(up.height IS NOT NULL AND up.height != '' AND (
        CASE
          WHEN up.height REGEXP '[0-9]+cm' THEN
            CAST(REGEXP_SUBSTR(up.height, '[0-9]+cm') AS UNSIGNED)
          WHEN up.height REGEXP '^[0-9]+''[0-9]+' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, '''', 1) AS UNSIGNED) * 12 +
            CAST(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, '''', -1), '[0-9]+') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+ft' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, 'ft', 1) AS UNSIGNED) * 12 +
            CAST(COALESCE(NULLIF(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, 'ft', -1), '[0-9]+'), ''), '0') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+$' THEN
            CAST(up.height AS UNSIGNED)
          ELSE 0
        END
      ) >= ?)`);
      queryParams.push(parseInt(min_height));
    }
    if (max_height) {
      whereConditions.push(`(up.height IS NOT NULL AND up.height != '' AND (
        CASE
          WHEN up.height REGEXP '[0-9]+cm' THEN
            CAST(REGEXP_SUBSTR(up.height, '[0-9]+cm') AS UNSIGNED)
          WHEN up.height REGEXP '^[0-9]+''[0-9]+' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, '''', 1) AS UNSIGNED) * 12 +
            CAST(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, '''', -1), '[0-9]+') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+ft' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, 'ft', 1) AS UNSIGNED) * 12 +
            CAST(COALESCE(NULLIF(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, 'ft', -1), '[0-9]+'), ''), '0') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+$' THEN
            CAST(up.height AS UNSIGNED)
          ELSE 0
        END
      ) <= ?)`);
      queryParams.push(parseInt(max_height));
    }
    if (blood_group_id) {
      whereConditions.push("up.blood_group_id = ?");
      queryParams.push(parseInt(blood_group_id));
    }
    if (diet_id) {
      whereConditions.push("up.diet_id = ?");
      queryParams.push(parseInt(diet_id));
    }
    if (disability_id) {
      whereConditions.push("up.disability_id = ?");
      queryParams.push(parseInt(disability_id));
    }

    // Family details filters
    if (family_type_id) {
      whereConditions.push("fd.family_type_id = ?");
      queryParams.push(parseInt(family_type_id));
    }
    if (family_status_id) {
      whereConditions.push("fd.family_status_id = ?");
      queryParams.push(parseInt(family_status_id));
    }
    if (family_values_id) {
      whereConditions.push("fd.family_values_id = ?");
      queryParams.push(parseInt(family_values_id));
    }
    if (father_occupation_id) {
      whereConditions.push("fd.father_occupation_id = ?");
      queryParams.push(parseInt(father_occupation_id));
    }
    if (mother_occupation_id) {
      whereConditions.push("fd.mother_occupation_id = ?");
      queryParams.push(parseInt(mother_occupation_id));
    }
    if (family_financial_status_id) {
      whereConditions.push("fd.family_financial_status_id = ?");
      queryParams.push(parseInt(family_financial_status_id));
    }

    // Astro details filters
    if (gothra_id) {
      whereConditions.push("astro.gothra_id = ?");
      queryParams.push(parseInt(gothra_id));
    }

    // Location details filters
    if (state_id) {
      whereConditions.push("ld.state_id = ?");
      queryParams.push(parseInt(state_id));
    }
    if (city_id) {
      whereConditions.push("ld.city_id = ?");
      queryParams.push(parseInt(city_id));
    }

    // Career details filters
    if (working_with_id) {
      whereConditions.push("cd.working_with_id = ?");
      queryParams.push(parseInt(working_with_id));
    }
    if (currency_id) {
      whereConditions.push("cd.currency_id = ?");
      queryParams.push(parseInt(currency_id));
    }
    if (income_type) {
      whereConditions.push("cd.income_type = ?");
      queryParams.push(income_type);
    }

    // Education details filters
    if (education_area_id) {
      whereConditions.push("ed.education_area_id = ?");
      queryParams.push(parseInt(education_area_id));
    }

    // Lifestyle filters
    if (smoking && smoking !== 'open_to_all') {
      // Map string values to IDs
      let smokingId;
      if (smoking === 'no' || smoking === 'never') {
        smokingId = 1; // 'never'
      } else if (smoking === 'occasionally') {
        smokingId = 2;
      } else if (smoking === 'socially') {
        smokingId = 3;
      } else if (smoking === 'regularly') {
        smokingId = 4;
      } else if (smoking === 'prefer_not_to_say') {
        smokingId = 5;
      } else {
        smokingId = parseInt(smoking);
      }
      
      if (!isNaN(smokingId)) {
        whereConditions.push("up.smoking_id = ?");
        queryParams.push(smokingId);
      }
    }
    if (drinking && drinking !== 'open_to_all') {
      // Map string values to IDs
      let drinkingId;
      if (drinking === 'no' || drinking === 'never') {
        drinkingId = 1; // 'never'
      } else if (drinking === 'occasionally') {
        drinkingId = 2;
      } else if (drinking === 'socially') {
        drinkingId = 3;
      } else if (drinking === 'regularly') {
        drinkingId = 4;
      } else if (drinking === 'prefer_not_to_say') {
        drinkingId = 5;
      } else {
        drinkingId = parseInt(drinking);
      }
      
      if (!isNaN(drinkingId)) {
        whereConditions.push("up.drinking_id = ?");
        queryParams.push(drinkingId);
      }
    }

    // Dosham filter (astro details)
    if (dosham && dosham !== 'open_to_all') {
      whereConditions.push("astro.dosham = ?");
      queryParams.push(dosham);
    }

    // Manglik status filter
    if (manglik_status && manglik_status !== 'open_to_all') {
      whereConditions.push("astro.manglik_status = ?");
      queryParams.push(manglik_status);
    }

    // Rasi and Nakshatra filters
    if (rasi_id) {
      whereConditions.push("astro.rasi_id = ?");
      queryParams.push(parseInt(rasi_id));
    }

    if (nakshatra_id) {
      whereConditions.push("astro.nakshatra_id = ?");
      queryParams.push(parseInt(nakshatra_id));
    }

    // Active members filter
    if (active_members && active_members !== 'open_to_all') {
      if (active_members === 'within_day') {
        whereConditions.push("u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
      } else if (active_members === 'within_week') {
        whereConditions.push("u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)");
      } else if (active_members === 'within_month') {
        whereConditions.push("u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)");
      }
    }

    // Eating habits filter (diet) - use array of IDs
    if (eating_habits && eating_habits !== 'open_to_all') {
      const eatingHabitsIds = parseArrayParam(eating_habits);
      if (eatingHabitsIds.length > 0) {
        whereConditions.push(`up.diet_id IN (${eatingHabitsIds.map(() => '?').join(',')})`);
        queryParams.push(...eatingHabitsIds);
      }
    }

    // Match type filter (2-way matches)
    if (match_type && match_type === '2_way_matches') {
      // This would require checking partner preferences compatibility
      // For now, we'll skip this complex filter
    }

    // Verification status filter
    if (verification_status && verification_status === 'blue_tick_profiles') {
      // This would require a verification status field
      // whereConditions.push("up.is_verified = TRUE");
    }

    // Photo settings filter
    if (photo_settings && photo_settings !== 'open_to_all') {
      if (photo_settings === 'visible_to_all') {
        whereConditions.push("up.profile_picture IS NOT NULL AND up.profile_picture != ''");
      } else if (photo_settings === 'protected_photo') {
        whereConditions.push("up.profile_picture IS NOT NULL AND EXISTS (SELECT 1 FROM user_photos WHERE user_id = u.id AND photo_type = 'protected')");
      }
    }

    // Subscription filter
    if (subscription_status) {
      if (subscription_status === 'premium') {
        whereConditions.push("us.subscription_status_id = 1 AND us.is_active = 1");
      } else if (subscription_status === 'free') {
        whereConditions.push("(us.subscription_status_id IS NULL OR us.subscription_status_id != 1)");
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = whereConditions.join(" AND ");

    const searchQuery = `
      SELECT DISTINCT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
             up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
             up.height, up.weight, up.marital_status_id, up.religion_id, up.caste_id,
             up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
             up.about_myself, up.profile_picture, up.horoscope_match, up.lives_with_family,
             up.family_location, up.has_children, up.number_of_children, up.diet_id,
             up.blood_group_id, up.disability_id, up.health_info_id, up.drinking_id, up.smoking_id,
             rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
             mtm.language_name as mother_tongue, dm.diet_name, bg.blood_group,
             dis.disability_name, hi.health_condition, drm.drinking_type, sm.smoking_type,
             CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm2.profession_name, cd.occupation) ELSE cd.occupation END as occupation,
             cd.company_name, cd.annual_income, cd.income_type, cd.currency_id,
             COALESCE(cim5.city_name, cd.city_living_in) as city_living_in, COALESCE(stm5.state_name, cd.state_living_in_id) as state_living_in, cd.country_living_in_id,
             clc4.country_name as country_living,
             cur.currency_code, cur.symbol as currency_symbol,
             ad.city, ad.state, ad.country_id, ctm.country_name,
             ed.education_level_id, ed.institution_name, ed.institution_name_2,
             elm.level_name as education_level,
             us.plan_id, sp.plan_name, sp.price as plan_price, sp.duration_months,
             ssm.status_name as subscription_status, us.start_date as subscription_start,
             us.end_date as subscription_end,
             DATEDIFF(NOW(), u.created_at) as days_since_joined,
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
      LEFT JOIN drinking_master drm ON up.drinking_id = drm.id
      LEFT JOIN smoking_master sm ON up.smoking_id = sm.id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN cities_master cim5 ON cd.city_living_in = cim5.id
      LEFT JOIN states_master stm5 ON cd.state_living_in_id = stm5.id
      LEFT JOIN country_code_master clc4 ON cd.country_living_in_id = clc4.id
      LEFT JOIN currency_master cur ON cd.currency_id = cur.id
      LEFT JOIN address_details ad ON u.id = ad.user_id
      LEFT JOIN country_code_master ctm ON ad.country_id = ctm.id
      LEFT JOIN education_details ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      LEFT JOIN family_details fd ON u.id = fd.user_id
      LEFT JOIN astro_details astro ON u.id = astro.user_id
      LEFT JOIN location_details ld ON u.id = ld.user_id
      LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
      LEFT JOIN profession_master pm2 ON cd.occupation REGEXP '^[0-9]+$' AND pm2.id = CAST(cd.occupation AS UNSIGNED)
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const profiles = await query(searchQuery, queryParams);

    // Remove duplicates and filter out own profile
    const uniqueProfiles = profiles.reduce((acc, profile) => {
      if (profile.id !== userId && !acc.find(p => p.id === profile.id)) {
        acc.push(profile);
      }
      return acc;
    }, []);

    // Get additional details for each profile
    const enrichedProfiles = await Promise.all(uniqueProfiles.map(async (profile) => {
      // Get family details
      const [family] = await query(`
        SELECT fd.*, ftm.type_name as family_type, fsm.status_name as family_status,
               fvm.value_name as family_values, cm.country_name as family_country
        FROM family_details fd
        LEFT JOIN family_type_master ftm ON fd.family_type_id = ftm.id
        LEFT JOIN family_status_master fsm ON fd.family_status_id = fsm.id
        LEFT JOIN family_values_master fvm ON fd.family_values_id = fvm.id
        LEFT JOIN country_code_master cm ON fd.family_country_id = cm.id
        WHERE fd.user_id = ?`, [profile.id]);

      // Get astro details
      const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name as birth_country, rm.rasi_name, nm.nakshatra_name
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        LEFT JOIN rasi_master rm ON ad.rasi_id = rm.id
        LEFT JOIN nakshatra_master nm ON ad.nakshatra_id = nm.id
        WHERE ad.user_id = ?`, [profile.id]);

      // Get location details
      const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        WHERE ld.user_id = ?`, [profile.id]);

      // Get hobbies
      const hobbies = await query(`
        SELECT hm.hobby_name, hm.category
        FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?`, [profile.id]);

      // Get photos with full URLs
      const photos = await query(`
        SELECT id, photo_url, is_primary, photo_type, upload_date FROM user_photos 
        WHERE user_id = ? ORDER BY is_primary DESC, upload_date DESC`, [profile.id]);
      
      // Get audio files
      const audioFiles = await query(`
        SELECT * FROM user_audio_files WHERE user_id = ? ORDER BY created_at DESC`, [profile.id]);
      
      // Ensure profile_picture has full URL
      if (profile.profile_picture && !profile.profile_picture.startsWith('http')) {
        profile.profile_picture = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${profile.profile_picture}`;
      }

      // Get match actions (shortlist, block, don't show again)
      const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, profile.id]);

      // Get report status
      const [reportAction] = await query(`
        SELECT ur.id, 'Report' as action_name, 4 as action_type_id
        FROM user_reports ur
        WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
      `, [userId, profile.id]);

      // Get connect status
      const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profile.id, profile.id, userId]);

      // Combine all actions
      const allActions = [...matchActions];
      if (reportAction) {
        allActions.push(reportAction);
      }

      return {
        ...profile,
        family: family || {},
        astro: astro || {},
        location: location || {},
        hobbies: hobbies || [],
        photos: photos || [],
        audio_files: audioFiles || [],
        match_actions: allActions,
        connect_status: connectStatus?.status || null
      };
    }));

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN address_details ad ON u.id = ad.user_id
      LEFT JOIN country_code_master ctm ON ad.country_id = ctm.id
      LEFT JOIN education_details ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      LEFT JOIN family_details fd ON u.id = fd.user_id
      LEFT JOIN astro_details astro ON u.id = astro.user_id
      LEFT JOIN location_details ld ON u.id = ld.user_id
      LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
      WHERE ${whereClause}
    `;

    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const [{ total }] = await query(countQuery, countParams);

    // Apply privacy filter to all results
    const filteredProfiles = (await applyPrivacyFilterToMatches(enrichedProfiles, userId)).filter(p => !p.is_blocked);

    res.json({
      success: true,
      data: {
        profiles: filteredProfiles,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_records: total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("Search Profiles Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function searchProfiles(req, res) {
  try {
    const userId = req.user.user_id;
    const {
      min_age,
      max_age,
      gender_id,
      religion_id,
      caste_id,
      marital_status_id,
      min_income,
      max_income,
      mother_tongue,
      city,
      state,
      country_id,
      education_level_id,
      occupation,
      profile_created_by,
      // Physical attributes
      min_height,
      max_height,
      blood_group_id,
      diet_id,
      disability_id,
      // Family details
      family_type_id,
      family_status_id,
      family_values_id,
      father_occupation_id,
      mother_occupation_id,
      family_financial_status_id,
      // Astro details
      gothra_id,
      rasi_id,
      nakshatra_id,
      dosham,
      manglik_status,
      // Location details
      state_id,
      city_id,
      // Career details
      working_with_id,
      currency_id,
      income_type,
      // Education details
      education_area_id,
      // Lifestyle
      smoking,
      drinking,
      // Subscription
      subscription_status,
      // New filters from UI
      match_type, // 'open_to_all' or '2_way_matches'
      verification_status, // 'open_to_all', 'blue_tick_profiles'
      photo_settings, // 'open_to_all', 'visible_to_all', 'protected_photo'
      recently_joined, // 'open_to_all', 'within_day', 'within_week', 'within_month'
      active_members, // 'open_to_all', 'within_day', 'within_week', 'within_month'
      income_range, // '15_20', '20_30', '30_50', '75_1cr'
      eating_habits, // 'non_veg', 'veg', 'eggetarian'
      working_with, // 'private_company', 'non_working', 'business_self_employed'
      profession_area, // 'it_software', 'non_working', 'medical_healthcare', 'admin_hr'
      page = 1,
      limit = 10
    } = req.query;

    // Get current user's gender to show opposite gender profiles
    const [currentUser] = await query(
      "SELECT up.gender_id, up.profile_created_by FROM user_profiles up WHERE up.user_id = ?",
      [userId]
    );

    let whereConditions = ["u.id != ?", "u.status = 1", "up.aadhaar_verified = 1"];
    let queryParams = [userId];

    // If current user profile is managed by parent, only show parent-managed profiles
    if (currentUser?.profile_created_by === 'parent') {
      whereConditions.push("up.profile_created_by = 'parent'");
    }

    // Helper function to parse array parameters
    const parseArrayParam = (param) => {
      if (!param) return [];
      if (Array.isArray(param)) return param.map(id => parseInt(id)).filter(id => !isNaN(id));
      try {
        const parsed = JSON.parse(param);
        return Array.isArray(parsed)
          ? parsed.map(id => parseInt(id)).filter(id => !isNaN(id))
          : [parseInt(parsed)].filter(id => !isNaN(id));
      } catch {
        return String(param).split(',').map(id => parseInt(id)).filter(id => !isNaN(id));
      }
    };

    const addMultiValueFilter = (param, column) => {
      const ids = parseArrayParam(param);
      if (ids.length > 0) {
        whereConditions.push(`${column} IN (${ids.map(() => '?').join(',')})`);
        queryParams.push(...ids);
      }
    };

    // Exclude hidden profiles (Section 11: user_hide_profile + account_settings.profile_hidden)
    whereConditions.push(`u.id NOT IN (
      SELECT user_id FROM user_hide_profile
      WHERE is_active = TRUE AND hide_end_date > NOW()
    )`);
    whereConditions.push(`u.id NOT IN (
      SELECT user_id FROM account_settings WHERE profile_hidden = 1
    )`);

    // Section 11 — exclude visible_to_premium profiles from non-premium viewers.
    // Skipped entirely when the admin subscription-restrictions switch is off: the owner
    // picked the audience CLASS "premium members", and with restrictions off every member
    // counts as premium, so the profile is visible to everyone. The queryParams.push has to
    // stay inside the guard — dropping the condition without its bind would shift every
    // later placeholder by one and silently corrupt the whole WHERE clause.
    if (await areSubscriptionRestrictionsEnabled()) {
      whereConditions.push(`u.id NOT IN (
        SELECT ps2.user_id FROM privacy_settings ps2
        WHERE ps2.profile_visibility = 'visible_to_premium'
        AND ? NOT IN (
          SELECT user_id FROM user_subscriptions
          WHERE subscription_status_id = 1 AND end_date > NOW()
        )
      )`);
      queryParams.push(userId);
    }
    // Exclude blocked users — bidirectional
    whereConditions.push(`u.id NOT IN (
      SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
      UNION
      SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
    )`);
    queryParams.push(userId, userId);

    // 21-07-2026 - Profile complete condition
    whereConditions.push(profileCompleteCondition("u", "up"));

    // Show opposite gender by default
    if (currentUser && currentUser.gender_id) {
      const oppositeGender = currentUser.gender_id === 1 ? 2 : 1;
      whereConditions.push("up.gender_id = ?");
      queryParams.push(gender_id || oppositeGender);
    }

    // Age filter
    if (min_age) {
      whereConditions.push("up.age >= ?");
      queryParams.push(parseInt(min_age));
    }
    if (max_age) {
      whereConditions.push("up.age <= ?");
      queryParams.push(parseInt(max_age));
    }

    // Religion filter
    addMultiValueFilter(religion_id, "up.religion_id");

    // Caste filter
    if (caste_id) {
      whereConditions.push("up.caste_id = ?");
      queryParams.push(parseInt(caste_id));
    }

    // Marital status filter
    addMultiValueFilter(marital_status_id, "up.marital_status_id");

    // Mother tongue filter
    addMultiValueFilter(mother_tongue, "up.mother_tongue_id");

    // Profile created by filter
    if (profile_created_by) {
      if (profile_created_by === 'parent_guardian') {
        whereConditions.push("up.profile_created_by IN ('parent', 'relative')");
      } else if (profile_created_by !== 'open_to_all') {
        whereConditions.push("up.profile_created_by = ?");
        queryParams.push(profile_created_by);
      }
    }

    // Recently joined filter
    if (recently_joined && recently_joined !== 'open_to_all') {
      if (recently_joined === 'within_day') {
        whereConditions.push("u.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
      } else if (recently_joined === 'within_week') {
        whereConditions.push("u.created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)");
      } else if (recently_joined === 'within_month') {
        whereConditions.push("u.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)");
      }
    }

    // Income range filter
    if (income_range) {
      if (income_range === '15_20') {
        whereConditions.push("cd.annual_income BETWEEN 1500000 AND 2000000");
      } else if (income_range === '20_30') {
        whereConditions.push("cd.annual_income BETWEEN 2000000 AND 3000000");
      } else if (income_range === '30_50') {
        whereConditions.push("cd.annual_income BETWEEN 3000000 AND 5000000");
      } else if (income_range === '75_1cr') {
        whereConditions.push("cd.annual_income BETWEEN 7500000 AND 10000000");
      }
    }

    // Working with filter
    if (working_with && working_with !== 'open_to_all') {
      if (working_with === 'private_company') {
        whereConditions.push("cd.working_with_id = 1");
      } else if (working_with === 'non_working') {
        whereConditions.push("(cd.working_with_id IS NULL OR cd.working_with_id = 5)");
      } else if (working_with === 'business_self_employed') {
        whereConditions.push("cd.working_with_id IN (2, 3)");
      }
    }

    // Profession area filter
    if (profession_area && profession_area !== 'open_to_all') {
      if (profession_area === 'it_software') {
        whereConditions.push("cd.profession_id IN (SELECT id FROM profession_master WHERE profession_name LIKE '%Software%' OR profession_name LIKE '%IT%')");
      } else if (profession_area === 'medical_healthcare') {
        whereConditions.push("cd.profession_id IN (SELECT id FROM profession_master WHERE profession_name LIKE '%Doctor%' OR profession_name LIKE '%Medical%')");
      } else if (profession_area === 'admin_hr') {
        whereConditions.push("cd.profession_id IN (SELECT id FROM profession_master WHERE profession_name LIKE '%Admin%' OR profession_name LIKE '%HR%')");
      }
    }

    // Income filter
    if (min_income || max_income) {
      if (min_income) {
        whereConditions.push("cd.annual_income >= ?");
        queryParams.push(parseFloat(min_income));
      }
      if (max_income) {
        whereConditions.push("cd.annual_income <= ?");
        queryParams.push(parseFloat(max_income));
      }
    }

    // Location filters
    if (city) {
      whereConditions.push("ad.city LIKE ?");
      queryParams.push(`%${city}%`);
    }
    if (state) {
      whereConditions.push("(ad.state LIKE ? OR ld.state_living_in LIKE ?)");
      queryParams.push(`%${state}%`, `%${state}%`);
    }
    if (country_id) {
      whereConditions.push("(ad.country_id = ? OR ld.country_id = ?)");
      queryParams.push(parseInt(country_id), parseInt(country_id));
    }

    // Education filter
    if (education_level_id) {
      whereConditions.push("ed.education_level_id = ?");
      queryParams.push(parseInt(education_level_id));
    }

    // Occupation filter
    if (occupation) {
      whereConditions.push("cd.occupation LIKE ?");
      queryParams.push(`%${occupation}%`);
    }

    // Physical attributes filters — height filter value is in cm from Flutter
    if (min_height) {
      whereConditions.push(`(up.height IS NOT NULL AND up.height != '' AND (
        CASE
          WHEN up.height REGEXP '[0-9]+cm' THEN
            CAST(REGEXP_SUBSTR(up.height, '[0-9]+cm') AS UNSIGNED)
          WHEN up.height REGEXP '^[0-9]+''[0-9]+' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, '''', 1) AS UNSIGNED) * 12 +
            CAST(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, '''', -1), '[0-9]+') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+ft' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, 'ft', 1) AS UNSIGNED) * 12 +
            CAST(COALESCE(NULLIF(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, 'ft', -1), '[0-9]+'), ''), '0') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+$' THEN
            CAST(up.height AS UNSIGNED)
          ELSE 0
        END
      ) >= ?)`);
      queryParams.push(parseInt(min_height));
    }
    if (max_height) {
      whereConditions.push(`(up.height IS NOT NULL AND up.height != '' AND (
        CASE
          WHEN up.height REGEXP '[0-9]+cm' THEN
            CAST(REGEXP_SUBSTR(up.height, '[0-9]+cm') AS UNSIGNED)
          WHEN up.height REGEXP '^[0-9]+''[0-9]+' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, '''', 1) AS UNSIGNED) * 12 +
            CAST(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, '''', -1), '[0-9]+') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+ft' THEN
            ROUND((CAST(SUBSTRING_INDEX(up.height, 'ft', 1) AS UNSIGNED) * 12 +
            CAST(COALESCE(NULLIF(REGEXP_SUBSTR(SUBSTRING_INDEX(up.height, 'ft', -1), '[0-9]+'), ''), '0') AS UNSIGNED)) * 2.54)
          WHEN up.height REGEXP '^[0-9]+$' THEN
            CAST(up.height AS UNSIGNED)
          ELSE 0
        END
      ) <= ?)`);
      queryParams.push(parseInt(max_height));
    }
    if (blood_group_id) {
      whereConditions.push("up.blood_group_id = ?");
      queryParams.push(parseInt(blood_group_id));
    }
    if (diet_id) {
      whereConditions.push("up.diet_id = ?");
      queryParams.push(parseInt(diet_id));
    }
    if (disability_id) {
      whereConditions.push("up.disability_id = ?");
      queryParams.push(parseInt(disability_id));
    }

    // Family details filters
    if (family_type_id) {
      whereConditions.push("fd.family_type_id = ?");
      queryParams.push(parseInt(family_type_id));
    }
    if (family_status_id) {
      whereConditions.push("fd.family_status_id = ?");
      queryParams.push(parseInt(family_status_id));
    }
    if (family_values_id) {
      whereConditions.push("fd.family_values_id = ?");
      queryParams.push(parseInt(family_values_id));
    }
    if (father_occupation_id) {
      whereConditions.push("fd.father_occupation_id = ?");
      queryParams.push(parseInt(father_occupation_id));
    }
    if (mother_occupation_id) {
      whereConditions.push("fd.mother_occupation_id = ?");
      queryParams.push(parseInt(mother_occupation_id));
    }
    if (family_financial_status_id) {
      whereConditions.push("fd.family_financial_status_id = ?");
      queryParams.push(parseInt(family_financial_status_id));
    }

    // Astro details filters
    if (gothra_id) {
      whereConditions.push("astro.gothra_id = ?");
      queryParams.push(parseInt(gothra_id));
    }

    // Location details filters
    if (state_id) {
      whereConditions.push("ld.state_id = ?");
      queryParams.push(parseInt(state_id));
    }
    if (city_id) {
      whereConditions.push("ld.city_id = ?");
      queryParams.push(parseInt(city_id));
    }

    // Career details filters
    if (working_with_id) {
      whereConditions.push("cd.working_with_id = ?");
      queryParams.push(parseInt(working_with_id));
    }
    if (currency_id) {
      whereConditions.push("cd.currency_id = ?");
      queryParams.push(parseInt(currency_id));
    }
    if (income_type) {
      whereConditions.push("cd.income_type = ?");
      queryParams.push(income_type);
    }

    // Education details filters
    if (education_area_id) {
      whereConditions.push("ed.education_area_id = ?");
      queryParams.push(parseInt(education_area_id));
    }

    // Lifestyle filters
    if (smoking && smoking !== 'open_to_all') {
      // Map string values to IDs
      let smokingId;
      if (smoking === 'no' || smoking === 'never') {
        smokingId = 1; // 'never'
      } else if (smoking === 'occasionally') {
        smokingId = 2;
      } else if (smoking === 'socially') {
        smokingId = 3;
      } else if (smoking === 'regularly') {
        smokingId = 4;
      } else if (smoking === 'prefer_not_to_say') {
        smokingId = 5;
      } else {
        smokingId = parseInt(smoking);
      }
      
      if (!isNaN(smokingId)) {
        whereConditions.push("up.smoking_id = ?");
        queryParams.push(smokingId);
      }
    }
    if (drinking && drinking !== 'open_to_all') {
      // Map string values to IDs
      let drinkingId;
      if (drinking === 'no' || drinking === 'never') {
        drinkingId = 1; // 'never'
      } else if (drinking === 'occasionally') {
        drinkingId = 2;
      } else if (drinking === 'socially') {
        drinkingId = 3;
      } else if (drinking === 'regularly') {
        drinkingId = 4;
      } else if (drinking === 'prefer_not_to_say') {
        drinkingId = 5;
      } else {
        drinkingId = parseInt(drinking);
      }
      
      if (!isNaN(drinkingId)) {
        whereConditions.push("up.drinking_id = ?");
        queryParams.push(drinkingId);
      }
    }

    // Dosham filter (astro details)
    if (dosham && dosham !== 'open_to_all') {
      whereConditions.push("astro.dosham = ?");
      queryParams.push(dosham);
    }

    // Manglik status filter
    if (manglik_status && manglik_status !== 'open_to_all') {
      whereConditions.push("astro.manglik_status = ?");
      queryParams.push(manglik_status);
    }

    // Rasi and Nakshatra filters
    if (rasi_id) {
      whereConditions.push("astro.rasi_id = ?");
      queryParams.push(parseInt(rasi_id));
    }

    if (nakshatra_id) {
      whereConditions.push("astro.nakshatra_id = ?");
      queryParams.push(parseInt(nakshatra_id));
    }

    // Active members filter
    if (active_members && active_members !== 'open_to_all') {
      if (active_members === 'within_day') {
        whereConditions.push("u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)");
      } else if (active_members === 'within_week') {
        whereConditions.push("u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)");
      } else if (active_members === 'within_month') {
        whereConditions.push("u.updated_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)");
      }
    }

    // Eating habits filter (diet) - use array of IDs
    if (eating_habits && eating_habits !== 'open_to_all') {
      const eatingHabitsIds = parseArrayParam(eating_habits);
      if (eatingHabitsIds.length > 0) {
        whereConditions.push(`up.diet_id IN (${eatingHabitsIds.map(() => '?').join(',')})`);
        queryParams.push(...eatingHabitsIds);
      }
    }

    // Match type filter (2-way matches)
    if (match_type && match_type === '2_way_matches') {
      // This would require checking partner preferences compatibility
      // For now, we'll skip this complex filter
    }

    // Verification status filter
    if (verification_status && verification_status === 'blue_tick_profiles') {
      // This would require a verification status field
      // whereConditions.push("up.is_verified = TRUE");
    }

    // Photo settings filter
    if (photo_settings && photo_settings !== 'open_to_all') {
      if (photo_settings === 'visible_to_all') {
        whereConditions.push("up.profile_picture IS NOT NULL AND up.profile_picture != ''");
      } else if (photo_settings === 'protected_photo') {
        whereConditions.push("up.profile_picture IS NOT NULL AND EXISTS (SELECT 1 FROM user_photos WHERE user_id = u.id AND photo_type = 'protected')");
      }
    }

    // Subscription filter
    if (subscription_status) {
      if (subscription_status === 'premium') {
        whereConditions.push("us.subscription_status_id = 1 AND us.is_active = 1");
      } else if (subscription_status === 'free') {
        whereConditions.push("(us.subscription_status_id IS NULL OR us.subscription_status_id != 1)");
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const whereClause = whereConditions.join(" AND ");

    const searchQuery = `
      SELECT DISTINCT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
             up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
             up.height, up.weight, up.marital_status_id, up.religion_id, up.caste_id,
             up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
             up.about_myself, up.profile_picture, up.horoscope_match, up.lives_with_family,
             up.family_location, up.has_children, up.number_of_children, up.diet_id,
             up.blood_group_id, up.disability_id, up.health_info_id, up.drinking_id, up.smoking_id,
             rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
             mtm.language_name as mother_tongue, dm.diet_name, bg.blood_group,
             dis.disability_name, hi.health_condition, drm.drinking_type, sm.smoking_type,
             CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm2.profession_name, cd.occupation) ELSE cd.occupation END as occupation,
             cd.company_name, cd.annual_income, cd.income_type, cd.currency_id,
             COALESCE(cim5.city_name, cd.city_living_in) as city_living_in, COALESCE(stm5.state_name, cd.state_living_in_id) as state_living_in, cd.country_living_in_id,
             clc4.country_name as country_living,
             cur.currency_code, cur.symbol as currency_symbol,
             ad.city, ad.state, ad.country_id, ctm.country_name,
             ed.education_level_id, ed.institution_name, ed.institution_name_2,
             elm.level_name as education_level,
             us.plan_id, sp.plan_name, sp.price as plan_price, sp.duration_months,
             ssm.status_name as subscription_status, us.start_date as subscription_start,
             us.end_date as subscription_end,
             DATEDIFF(NOW(), u.created_at) as days_since_joined,
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
      LEFT JOIN drinking_master drm ON up.drinking_id = drm.id
      LEFT JOIN smoking_master sm ON up.smoking_id = sm.id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN cities_master cim5 ON cd.city_living_in = cim5.id
      LEFT JOIN states_master stm5 ON cd.state_living_in_id = stm5.id
      LEFT JOIN country_code_master clc4 ON cd.country_living_in_id = clc4.id
      LEFT JOIN currency_master cur ON cd.currency_id = cur.id
      LEFT JOIN address_details ad ON u.id = ad.user_id
      LEFT JOIN country_code_master ctm ON ad.country_id = ctm.id
      LEFT JOIN education_details ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      LEFT JOIN family_details fd ON u.id = fd.user_id
      LEFT JOIN astro_details astro ON u.id = astro.user_id
      LEFT JOIN location_details ld ON u.id = ld.user_id
      LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
      LEFT JOIN profession_master pm2 ON cd.occupation REGEXP '^[0-9]+$' AND pm2.id = CAST(cd.occupation AS UNSIGNED)
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const profiles = await query(searchQuery, queryParams);

    // Remove duplicates and filter out own profile
    const uniqueProfiles = profiles.reduce((acc, profile) => {
      if (profile.id !== userId && !acc.find(p => p.id === profile.id)) {
        acc.push(profile);
      }
      return acc;
    }, []);

    // Get additional details for each profile
    const enrichedProfiles = await Promise.all(uniqueProfiles.map(async (profile) => {
      // Get family details
      const [family] = await query(`
        SELECT fd.*, ftm.type_name as family_type, fsm.status_name as family_status,
               fvm.value_name as family_values, cm.country_name as family_country
        FROM family_details fd
        LEFT JOIN family_type_master ftm ON fd.family_type_id = ftm.id
        LEFT JOIN family_status_master fsm ON fd.family_status_id = fsm.id
        LEFT JOIN family_values_master fvm ON fd.family_values_id = fvm.id
        LEFT JOIN country_code_master cm ON fd.family_country_id = cm.id
        WHERE fd.user_id = ?`, [profile.id]);

      // Get astro details
      const [astro] = await query(`
        SELECT ad.*, g.gothra_name, c.country_name as birth_country, rm.rasi_name, nm.nakshatra_name
        FROM astro_details ad
        LEFT JOIN gothra_master g ON ad.gothra_id = g.id
        LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
        LEFT JOIN rasi_master rm ON ad.rasi_id = rm.id
        LEFT JOIN nakshatra_master nm ON ad.nakshatra_id = nm.id
        WHERE ad.user_id = ?`, [profile.id]);

      // Get location details
      const [location] = await query(`
        SELECT ld.*, c.city_name, s.state_name, co.country_name
        FROM location_details ld
        LEFT JOIN cities_master c ON ld.city_id = c.id
        LEFT JOIN states_master s ON ld.state_id = s.id
        LEFT JOIN country_code_master co ON ld.country_id = co.id
        WHERE ld.user_id = ?`, [profile.id]);

      // Get hobbies
      const hobbies = await query(`
        SELECT hm.hobby_name, hm.category
        FROM user_hobbies uh
        JOIN hobbies_master hm ON uh.hobby_id = hm.id
        WHERE uh.user_id = ?`, [profile.id]);

      // Get photos with full URLs
      const photos = await query(`
        SELECT id, photo_url, is_primary, photo_type, upload_date FROM user_photos 
        WHERE user_id = ? ORDER BY is_primary DESC, upload_date DESC`, [profile.id]);
      
      // Get audio files
      const audioFiles = await query(`
        SELECT * FROM user_audio_files WHERE user_id = ? ORDER BY created_at DESC`, [profile.id]);
      
      // Ensure profile_picture has full URL
      if (profile.profile_picture && !profile.profile_picture.startsWith('http')) {
        profile.profile_picture = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${profile.profile_picture}`;
      }

      // Get match actions (shortlist, block, don't show again)
      const matchActions = await query(`
        SELECT ua.action_type_id, atm.action_name
        FROM user_actions ua
        JOIN action_types_master atm ON ua.action_type_id = atm.id
        WHERE ua.user_id = ? AND ua.target_user_id = ?
      `, [userId, profile.id]);

      // Get report status
      const [reportAction] = await query(`
        SELECT ur.id, 'Report' as action_name, 4 as action_type_id
        FROM user_reports ur
        WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
      `, [userId, profile.id]);

      // Get connect status
      const [connectStatus] = await query(`
        SELECT status FROM connect_now_requests
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [userId, profile.id, profile.id, userId]);

      // Combine all actions
      const allActions = [...matchActions];
      if (reportAction) {
        allActions.push(reportAction);
      }

      return {
        ...profile,
        family: family || {},
        astro: astro || {},
        location: location || {},
        hobbies: hobbies || [],
        photos: photos || [],
        audio_files: audioFiles || [],
        match_actions: allActions,
        connect_status: connectStatus?.status || null
      };
    }));

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      LEFT JOIN address_details ad ON u.id = ad.user_id
      LEFT JOIN country_code_master ctm ON ad.country_id = ctm.id
      LEFT JOIN education_details ed ON u.id = ed.user_id
      LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
      LEFT JOIN family_details fd ON u.id = fd.user_id
      LEFT JOIN astro_details astro ON u.id = astro.user_id
      LEFT JOIN location_details ld ON u.id = ld.user_id
      LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
      WHERE ${whereClause}
    `;

    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const [{ total }] = await query(countQuery, countParams);

    // Apply privacy filter to all results
    const filteredProfiles = (await applyPrivacyFilterToMatches(enrichedProfiles, userId)).filter(p => !p.is_blocked);

    res.json({
      success: true,
      data: {
        profiles: filteredProfiles,
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_records: total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("Search Profiles Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Search Near Me Profiles
export async function searchNearMe(req, res) {
  try {
    const userId = req.user.user_id;
    const { radius = 50, page = 1, limit = 10 } = req.query;

    // Get current user's location
    const [currentUserLocation] = await query(
      "SELECT cd.latitude, cd.longitude FROM career_details cd WHERE cd.user_id = ?",
      [userId]
    );

    if (!currentUserLocation || !currentUserLocation.latitude || !currentUserLocation.longitude) {
      return res.status(400).json({
        success: false,
        message: "Your location is not set. Please update your profile with location details."
      });
    }

    const { latitude: userLat, longitude: userLng } = currentUserLocation;

    // Get current user's gender to show opposite gender profiles
    const [currentUser] = await query(
      "SELECT up.gender_id, up.profile_created_by FROM user_profiles up WHERE up.user_id = ?",
      [userId]
    );

    const oppositeGender = currentUser && currentUser.gender_id === 1 ? 2 : 1;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const nearbyQuery = `
      SELECT DISTINCT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.created_at, u.vivaaha_user_id,
             up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
             CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
             up.height, up.weight, up.marital_status_id, up.religion_id, up.caste_id,
             up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
             up.profile_picture, up.horoscope_match,
             rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
             cd.occupation, cd.company_name, cd.annual_income, cd.city_living_in,
             cd.latitude, cd.longitude,
             (
               6371 * acos(
                 cos(radians(?)) * cos(radians(cd.latitude)) *
                 cos(radians(cd.longitude) - radians(?)) +
                 sin(radians(?)) * sin(radians(cd.latitude))
               )
             ) AS distance_km
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN religion_master rm ON up.religion_id = rm.id
      LEFT JOIN caste_master cm ON up.caste_id = cm.id
      LEFT JOIN gender_master gm ON up.gender_id = gm.id
      LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      WHERE u.id != ?
        AND up.gender_id = ?
        AND cd.latitude IS NOT NULL
        AND cd.longitude IS NOT NULL
        AND u.status = 1
        AND up.aadhaar_verified = 1
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
        ${currentUser?.profile_created_by === 'parent' ? "AND up.profile_created_by = 'parent'" : ''}
        AND u.id NOT IN (
          SELECT target_user_id FROM user_actions
          WHERE user_id = ? AND action_type_id = 2
        )
        AND u.id NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
          UNION
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        )
      HAVING distance_km <= ?
      ORDER BY distance_km ASC
      LIMIT ? OFFSET ?
    `;

    const profiles = await query(nearbyQuery, [
      userLat, userLng, userLat, userId, oppositeGender, userId, userId, userId, parseInt(radius), parseInt(limit), offset
    ]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN user_profiles up ON u.id = up.user_id
      LEFT JOIN career_details cd ON u.id = cd.user_id
      WHERE u.id != ?
        AND up.gender_id = ?
        AND cd.latitude IS NOT NULL
        AND cd.longitude IS NOT NULL
        AND u.status = 1
        AND up.aadhaar_verified = 1
        -- 21-07-2026 - Profile complete condition
        AND ${profileCompleteCondition("u", "up")}
        ${currentUser?.profile_created_by === 'parent' ? "AND up.profile_created_by = 'parent'" : ''}
        AND (
          6371 * acos(
            cos(radians(?)) * cos(radians(cd.latitude)) *
            cos(radians(cd.longitude) - radians(?)) +
            sin(radians(?)) * sin(radians(cd.latitude))
          )
        ) <= ?
    `;

    const [{ total }] = await query(countQuery, [
      userId, oppositeGender, userLat, userLng, userLat, parseInt(radius)
    ]);

    // Apply privacy filter
    const filteredProfiles = (await applyPrivacyFilterToMatches(profiles, userId)).filter(p => !p.is_blocked);

    res.json({
      success: true,
      data: {
        profiles: filteredProfiles,
        user_location: {
          latitude: userLat,
          longitude: userLng
        },
        search_radius: parseInt(radius),
        pagination: {
          current_page: parseInt(page),
          per_page: parseInt(limit),
          total_records: total,
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error("Search Near Me Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Search Profile by Super sathi User ID
export async function searchByVivahaId(req, res) {
  try {
    const { vivaaha_user_id } = req.params;
    const userId = req.user.user_id;

    if (!vivaaha_user_id) {
      return res.status(400).json({
        success: false,
        message: "Super sathi User ID is required"
      });
    }

    // Get current user's profile for parent filter and gender filter
    const [currentUser] = await query(
      "SELECT profile_created_by, gender_id FROM user_profiles WHERE user_id = ?", [userId]
    );
    const parentFilter = currentUser?.profile_created_by === 'parent'
      ? `AND up.profile_created_by = 'parent'`
      : '';
    // Opposite gender filter: only show profiles of opposite gender
    const oppositeGender = currentUser?.gender_id === 1 ? 2 : 1;

    const [profile] = await query(
      `SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.vivaaha_user_id, u.created_at,
              up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
              up.height, up.weight, up.marital_status_id, up.religion_id, up.caste_id,
              up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
              up.about_myself, up.profile_picture, up.horoscope_match, up.lives_with_family,
              up.family_location, up.has_children, up.number_of_children, up.diet_id,
              up.blood_group_id, up.disability_id, up.health_info_id,
              CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
              rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
              mtm.language_name as mother_tongue, dm.diet_name, bg.blood_group,
              dis.disability_name, hi.health_condition,
              us.plan_id, sp.plan_name, sp.price as plan_price, sp.duration_months,
              ssm.status_name as subscription_status, us.start_date as subscription_start,
              us.end_date as subscription_end
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
       LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
       LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
       LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
       LEFT JOIN account_settings acs ON u.id = acs.user_id
       WHERE u.vivaaha_user_id = ? AND u.status = 1
         AND u.id != ?
         AND up.gender_id = ?
         ${parentFilter}
         AND (acs.profile_hidden IS NULL OR acs.profile_hidden = 0)
         -- 21-07-2026 - Profile complete condition
         AND ${profileCompleteCondition("u", "up")}
         AND u.id NOT IN (
           SELECT user_id FROM user_hide_profile WHERE is_active = TRUE AND hide_end_date > NOW()
         )`,
      [vivaaha_user_id, userId, oppositeGender]
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found with this Super sathi ID"
      });
    }

    // Get family details
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
      [profile.id]
    );

    // Get astro details
    const [astro] = await query(
      `SELECT ad.*, g.gothra_name, c.country_name as birth_country
       FROM astro_details ad
       LEFT JOIN gothra_master g ON ad.gothra_id = g.id
       LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
       WHERE ad.user_id = ?`,
      [profile.id]
    );

    // Get career details
    const [career] = await query(
      `SELECT cd.*, ww.working_type, c.country_name as country_living, cur.currency_name, cur.symbol,
              CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm.profession_name, cd.occupation) ELSE cd.occupation END as occupation
       FROM career_details cd
       LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
       LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
       LEFT JOIN currency_master cur ON cd.currency_id = cur.id
       LEFT JOIN profession_master pm ON cd.occupation REGEXP '^[0-9]+$' AND pm.id = CAST(cd.occupation AS UNSIGNED)
       WHERE cd.user_id = ?`,
      [profile.id]
    );

    // Get location details
    const [location] = await query(
      `SELECT ld.*, c.city_name, s.state_name, co.country_name
       FROM location_details ld
       LEFT JOIN cities_master c ON ld.city_id = c.id
       LEFT JOIN states_master s ON ld.state_id = s.id
       LEFT JOIN country_code_master co ON ld.country_id = co.id
       WHERE ld.user_id = ?`,
      [profile.id]
    );

    // Get education details
    const [education] = await query(
      `SELECT ed.*, elm.level_name, eam.area_name
       FROM education_details ed
       LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
       LEFT JOIN education_area_master eam ON ed.education_area_id = eam.id
       WHERE ed.user_id = ?`,
      [profile.id]
    );

    // Get hobbies
    const hobbies = await query(
      `SELECT hm.* FROM user_hobbies uh
       JOIN hobbies_master hm ON uh.hobby_id = hm.id
       WHERE uh.user_id = ?`,
      [profile.id]
    );

    // Get photos with full URLs
    const photos = await query(
      `SELECT id, photo_url, is_primary, photo_type, upload_date FROM user_photos 
       WHERE user_id = ? ORDER BY is_primary DESC, upload_date DESC`,
      [profile.id]
    );
    
    // Get audio files
    const audioFiles = await query(
      `SELECT * FROM user_audio_files WHERE user_id = ? ORDER BY created_at DESC`,
      [profile.id]
    );
    
    // Ensure profile_picture has full URL
    if (profile.profile_picture && !profile.profile_picture.startsWith('http')) {
      profile.profile_picture = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${profile.profile_picture}`;
    }

    // Get match actions
    const matchActions = await query(`
      SELECT ua.action_type_id, atm.action_name
      FROM user_actions ua
      JOIN action_types_master atm ON ua.action_type_id = atm.id
      WHERE ua.user_id = ? AND ua.target_user_id = ?
    `, [userId, profile.id]);

    // Get report status
    const [reportAction] = await query(`
      SELECT ur.id, 'Report' as action_name, 4 as action_type_id
      FROM user_reports ur
      WHERE ur.reporter_id = ? AND ur.reported_user_id = ?
    `, [userId, profile.id]);

    // Get connect status
    const [connectStatus] = await query(
      `SELECT status FROM connect_now_requests
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at DESC LIMIT 1`,
      [userId, profile.id, profile.id, userId]
    );

    // Combine all actions
    const allActions = [...matchActions];
    if (reportAction) {
      allActions.push(reportAction);
    }

    // Record profile view
    await query(
      "INSERT INTO profile_views (viewer_id, viewed_user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE view_date = CURRENT_TIMESTAMP",
      [userId, profile.id]
    );

    // Apply privacy filter — attach photos first so album_photo_privacy is enforced
    profile.photos = photos;
    const filteredProfile = await applyPrivacyFilter(profile, userId);

    if (!filteredProfile) {
      return res.status(403).json({ success: false, message: "This profile is not available" });
    }

    res.json({
      success: true,
      profile: {
        basic: filteredProfile,
        family: family || {},
        astro: astro || {},
        career: career || {},
        location: location || {},
        education: education || {},
        hobbies: hobbies || [],
        photos: filteredProfile.photos || [],
        audio_files: audioFiles || [],
        match_actions: allActions,
        connect_status: connectStatus?.status || null
      }
    });
  } catch (error) {
    console.error("Search by Super sathi ID Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get Profile Details by ID
export async function getProfileById(req, res) {
  try {
    const { profileId } = req.params;
    const userId = req.user.user_id;

    const [profile] = await query(
      `SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.vivaaha_user_id,
              up.first_name, up.middle_name, up.last_name, up.gender_id, up.date_of_birth, up.age, up.show_vivaaha_id,
              CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''''), ' ', up.last_name) END as display_name,
              up.height, up.weight, up.marital_status_id, up.religion_id, up.caste_id,
              up.mother_tongue_id, up.nationality, up.profile_created_by, up.about_me,
              up.profile_picture, up.horoscope_match,
              rm.religion_name, cm.caste_name, gm.gender_name, msm.status_name as marital_status,
              us.plan_id, sp.plan_name, sp.price as plan_price, sp.duration_months,
              ssm.status_name as subscription_status, us.start_date as subscription_start,
              us.end_date as subscription_end
       FROM users u
       LEFT JOIN user_profiles up ON u.id = up.user_id
       LEFT JOIN religion_master rm ON up.religion_id = rm.id
       LEFT JOIN caste_master cm ON up.caste_id = cm.id
       LEFT JOIN gender_master gm ON up.gender_id = gm.id
       LEFT JOIN marital_status_master msm ON up.marital_status_id = msm.id
       LEFT JOIN user_subscriptions us ON (u.id = us.user_id AND us.subscription_status_id = 1)
       LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
       LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
       WHERE u.id = ? AND u.id != ?
         -- 21-07-2026 - Profile complete condition
         AND ${profileCompleteCondition("u", "up")}`,
      [profileId, userId]
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found"
      });
    }

    // Get additional details
    const [education] = await query(
      `SELECT ed.*, elm.level_name FROM education_details ed
       LEFT JOIN education_level_master elm ON ed.education_level_id = elm.id
       WHERE ed.user_id = ?`,
      [profileId]
    );

    const [career] = await query(
      `SELECT cd.*, cm.currency_code,
              CASE WHEN cd.occupation REGEXP '^[0-9]+$' THEN COALESCE(pm.profession_name, cd.occupation) ELSE cd.occupation END as occupation
       FROM career_details cd
       LEFT JOIN currency_master cm ON cd.currency_id = cm.id
       LEFT JOIN profession_master pm ON cd.occupation REGEXP '^[0-9]+$' AND pm.id = CAST(cd.occupation AS UNSIGNED)
       WHERE cd.user_id = ?`,
      [profileId]
    );

    const [address] = await query(
      `SELECT ad.*, cm.country_name FROM address_details ad
       LEFT JOIN country_code_master cm ON ad.country_id = cm.id
       WHERE ad.user_id = ?`,
      [profileId]
    );

    // Get family details
    const [family_details] = await query(
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
      [profileId]
    );

    // Get hobbies
    const hobbies = await query(
      `SELECT hm.hobby_name, hm.category
       FROM user_hobbies uh
       JOIN hobbies_master hm ON uh.hobby_id = hm.id
       WHERE uh.user_id = ?`,
      [profileId]
    );

    // Get audio files
    const audioFiles = await query(
      `SELECT * FROM user_audio_files WHERE user_id = ? ORDER BY created_at DESC`,
      [profileId]
    );

    // Get photos — required for album_photo_privacy (Section 7)
    const photos = await query(
      `SELECT id, photo_url, is_primary, photo_type, upload_date
       FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC`,
      [profileId]
    );

    // Record profile view
    await query(
      "INSERT INTO profile_views (viewer_id, viewed_user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE view_date = CURRENT_TIMESTAMP",
      [userId, profileId]
    );

    // Get connect status between viewer and profile owner
    const [connectStatus] = await query(
      `SELECT status FROM connect_now_requests
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at DESC LIMIT 1`,
      [userId, profileId, profileId, userId]
    );

    // Attach photos BEFORE privacy filter so album_photo_privacy is enforced
    const filteredProfile = await applyPrivacyFilter(
      { ...profile, education, career, address, family_details: family_details || {}, hobbies: hobbies || [], audio_files: audioFiles || [], photos: photos || [], connect_status: connectStatus?.status || null },
      userId
    );

    if (!filteredProfile) {
      return res.status(403).json({ success: false, message: "This profile is not available" });
    }

    res.json({
      success: true,
      profile: filteredProfile
    });
  } catch (error) {
    console.error("Get Profile By ID Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
