import * as utils from "util";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// Get Complete User Profile
export async function getCompleteProfile(req, res) {
  try {
    const userId = req.user.user_id;
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║         GET COMPLETE PROFILE (View/Edit Profile)             ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("👤 user_id:", userId);

    // Get basic profile with all new fields
    const [profile] = await query(
      `SELECT u.vivaaha_user_id, u.email, u.phone, u.email_verified, u.phone_verified,
              up.id, up.user_id, up.first_name, up.middle_name, up.last_name,
              up.date_of_birth, up.age, up.height, up.gender_id, up.marital_status_id,
              up.has_children, up.number_of_children, up.lives_with_family,
              up.blood_group_id, up.profile_managed_by_id, up.diet_id, up.religion_id, up.caste_id, up.community_id, up.mother_tongue_id,
              up.health_info_id, up.disability_id, up.smoking_id, up.drinking_id,
              up.about_myself, up.nationality, up.profile_picture, u.vivaaha_user_id as profile_vivaaha_id,
              up.show_vivaaha_id, up.profile_created_by,
              up.created_at, up.updated_at,
              bg.blood_group, dis.disability_name, hi.health_condition,
              r.religion_name, c.caste_name, cm.community_name, mt.language_name as mother_tongue,
              g.gender_name, ms.status_name as marital_status, dr.drinking_type, sm.smoking_type,
              CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id ELSE CONCAT(up.first_name, ' ', COALESCE(up.middle_name, ''), ' ', up.last_name) END as display_name
       FROM user_profiles up
       LEFT JOIN users u ON up.user_id = u.id
       LEFT JOIN blood_group_master bg ON up.blood_group_id = bg.id
       LEFT JOIN disability_master dis ON up.disability_id = dis.id
       LEFT JOIN health_info_master hi ON up.health_info_id = hi.id
       LEFT JOIN religion_master r ON up.religion_id = r.id
       LEFT JOIN caste_master c ON up.caste_id = c.id
       LEFT JOIN community_master cm ON up.community_id = cm.id
       LEFT JOIN mother_tongue_master mt ON up.mother_tongue_id = mt.id
       LEFT JOIN gender_master g ON up.gender_id = g.id
       LEFT JOIN marital_status_master ms ON up.marital_status_id = ms.id
       LEFT JOIN drinking_master dr ON up.drinking_id = dr.id
       LEFT JOIN smoking_master sm ON up.smoking_id = sm.id
       WHERE up.user_id = ?`,
      [userId]
    );

    // Get diet names for diet_id (stored as plain integer or JSON array string)
    let diet_names = [];
    if (profile && profile.diet_id) {
      let dietIds = [];
      try {
        const parsed = JSON.parse(profile.diet_id);
        dietIds = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        const numVal = Number(profile.diet_id);
        if (!isNaN(numVal) && numVal > 0) dietIds = [numVal];
      }
      if (dietIds.length > 0) {
        const dietResults = await query(
          `SELECT diet_name FROM diet_master WHERE id IN (${dietIds.map(() => '?').join(',')})`,
          dietIds
        );
        diet_names = dietResults.map(d => d.diet_name);
      }
    }
    if (profile) {
      profile.diet_names = diet_names;
    }

    // Get astro details
    const [astro] = await query(
      `SELECT ad.*, g.gothra_name, c.country_name
       FROM astro_details ad
       LEFT JOIN gothra_master g ON ad.gothra_id = g.id
       LEFT JOIN country_code_master c ON ad.country_of_birth_id = c.id
       WHERE ad.user_id = ?`,
      [userId]
    );

    // Get family details
    const [family] = await query(
      `SELECT fd.*, po1.occupation_name as father_occupation_name, po2.occupation_name as mother_occupation_name,
              ffs.status_name as financial_status, c.country_name as family_country
       FROM family_details fd
       LEFT JOIN parent_occupation_master po1 ON fd.father_occupation_id = po1.id
       LEFT JOIN parent_occupation_master po2 ON fd.mother_occupation_id = po2.id
       LEFT JOIN family_financial_status_master ffs ON fd.family_financial_status_id = ffs.id
       LEFT JOIN country_code_master c ON fd.family_country_id = c.id
       WHERE fd.user_id = ?`,
      [userId]
    );

    // Get career details
    const [career] = await query(
      `SELECT cd.*, ww.working_type, c.country_name as country_living
       FROM career_details cd
       LEFT JOIN working_with_master ww ON cd.working_with_id = ww.id
       LEFT JOIN country_code_master c ON cd.country_living_in_id = c.id
       WHERE cd.user_id = ?`,
      [userId]
    );

    // Get location details with grew_up_in and ethnic_origin from career_details
    const [location] = await query(
      `SELECT ld.*, c.city_name, s.state_name, co.country_name, cd.grew_up_in_ids, cd.ethnic_origin_id, eo.origin_name as ethnic_origin_name
       FROM location_details ld
       LEFT JOIN cities_master c ON ld.city_id = c.id
       LEFT JOIN states_master s ON ld.state_id = s.id
       LEFT JOIN country_code_master co ON ld.country_id = co.id
       LEFT JOIN career_details cd ON ld.user_id = cd.user_id
       LEFT JOIN ethnic_origin_master eo ON cd.ethnic_origin_id = eo.id
       WHERE ld.user_id = ?`,
      [userId]
    );

    // Parse grew_up_in_ids JSON string to array, then resolve to country names
    if (location && location.grew_up_in_ids) {
      try {
        const ids: number[] = JSON.parse(location.grew_up_in_ids);
        location.grew_up_in_ids = ids;
        if (ids.length > 0) {
          const uniqueIds = [...new Set(ids)];
          const countryRows = await query(
            `SELECT id, country_name FROM country_code_master WHERE id IN (${uniqueIds.map(() => '?').join(',')})`,
            uniqueIds
          );
          const countryMap: Record<number, string> = {};
          for (const row of countryRows) countryMap[row.id] = row.country_name;
          location.grew_up_in_names = uniqueIds
            .map((id: number) => countryMap[id])
            .filter(Boolean);
        } else {
          location.grew_up_in_names = [];
        }
      } catch (e) {
        location.grew_up_in_ids = [];
        location.grew_up_in_names = [];
      }
    }

    // Get hobbies
    const hobbies = await query(
      `SELECT hm.* FROM user_hobbies uh
       JOIN hobbies_master hm ON uh.hobby_id = hm.id
       WHERE uh.user_id = ?`,
      [userId]
    );

    // Get education details
    const [education] = await query(
      `SELECT ed.*, el.level_name, ea.area_name
       FROM education_details ed
       LEFT JOIN education_level_master el ON ed.education_level_id = el.id
       LEFT JOIN education_area_master ea ON ed.education_area_id = ea.id
       WHERE ed.user_id = ?`,
      [userId]
    );

    // Get photos
    const photos = await query(
      `SELECT * FROM user_photos WHERE user_id = ? ORDER BY is_primary DESC, upload_date DESC`,
      [userId]
    );

    // Get audio files
    const audioFiles = await query(
      `SELECT * FROM user_audio_files WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    // Get match actions for current user
    const matchActions = await query(`
      SELECT ua.action_type_id, atm.action_name, ua.target_user_id, ua.created_at
      FROM user_actions ua
      JOIN action_types_master atm ON ua.action_type_id = atm.id
      WHERE ua.user_id = ?
      ORDER BY ua.created_at DESC
    `, [userId]);

    // Get user reports
    const reportActions = await query(`
      SELECT ur.id, ur.reported_user_id as target_user_id, 'Report' as action_name, 4 as action_type_id, ur.created_at
      FROM user_reports ur
      WHERE ur.reporter_id = ?
      ORDER BY ur.created_at DESC
    `, [userId]);

    // Get connect requests
    const connectRequests = await query(`
      SELECT cnr.receiver_id as target_user_id, cnr.status, cnr.created_at, 'Connect' as action_name
      FROM connect_now_requests cnr
      WHERE cnr.sender_id = ?
      ORDER BY cnr.created_at DESC
    `, [userId]);

    // Get interests sent
    const interestsSent = await query(`
      SELECT ui.receiver_id as target_user_id, ui.status, ui.created_at, 'Interest' as action_name
      FROM user_interests ui
      WHERE ui.sender_id = ?
      ORDER BY ui.created_at DESC
    `, [userId]);

    // Combine all actions
    const allActions = [
      ...matchActions.map(action => ({
        action_type_id: action.action_type_id,
        action_name: action.action_name,
        target_user_id: action.target_user_id,
        created_at: action.created_at
      })),
      ...reportActions.map(action => ({
        action_type_id: action.action_type_id,
        action_name: action.action_name,
        target_user_id: action.target_user_id,
        created_at: action.created_at
      })),
      ...connectRequests.map(action => ({
        action_type_id: 5, // Connect action type
        action_name: action.action_name,
        target_user_id: action.target_user_id,
        status: action.status,
        created_at: action.created_at
      })),
      ...interestsSent.map(action => ({
        action_type_id: 6, // Interest action type
        action_name: action.action_name,
        target_user_id: action.target_user_id,
        status: action.status,
        created_at: action.created_at
      }))
    ];

    // Get government ID details
    const [governmentId] = await query(
      `SELECT ugiv.*, gitm.id_type_name
       FROM user_government_id_verification ugiv
       LEFT JOIN government_id_type_master gitm ON ugiv.id_type_id = gitm.id
       WHERE ugiv.user_id = ?`,
      [userId]
    );

    // Get Aadhaar DigiLocker verification status
    const [aadhaarVerification] = await query(
      `SELECT verification_status, verified_at, verified_name
       FROM document_verification
       WHERE user_id = ? AND document_type = 'aadhaar'
       ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );

    // Get subscription details
    const [subscription] = await query(
      `SELECT us.*, sp.plan_name, sp.price, sp.duration_months,
              ssm.status_name as subscription_status, cm.currency_code, cm.symbol,
              CASE WHEN us.end_date > CURRENT_DATE THEN 1 ELSE 0 END as is_active
       FROM user_subscriptions us
       LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
       LEFT JOIN subscription_status_master ssm ON us.subscription_status_id = ssm.id
       LEFT JOIN currency_master cm ON sp.currency_id = cm.id
       WHERE us.user_id = ?
       ORDER BY us.created_at DESC LIMIT 1`,
      [userId]
    );

    const responseProfile = {
      basic: profile || {},
      astro: astro || {},
      family: family || {},
      career: career || {},
      location: location || {},
      education: education || {},
      hobbies: hobbies || [],
      photos: photos || [],
      audio_files: audioFiles || [],
      government_id: governmentId || {},
      aadhaar_verification: aadhaarVerification || null,
      subscription: subscription || null,
      match_actions: allActions || []
    };

    console.log("\n📤 GET COMPLETE PROFILE RESPONSE for user_id:", userId);
    console.log("   ── BASIC ──");
    console.log("   first_name:", profile?.first_name || "❌ NULL");
    console.log("   last_name:", profile?.last_name || "❌ NULL");
    console.log("   date_of_birth:", profile?.date_of_birth || "❌ NULL");
    console.log("   age:", profile?.age || "❌ NULL");
    console.log("   height:", profile?.height || "❌ NULL");
    console.log("   gender_id:", profile?.gender_id || "❌ NULL");
    console.log("   religion_id:", profile?.religion_id || "❌ NULL", "→", profile?.religion_name || "");
    console.log("   community_id:", profile?.community_id || "❌ NULL", "→", profile?.community_name || "");
    console.log("   caste_id:", profile?.caste_id || "❌ NULL", "→", profile?.caste_name || "");
    console.log("   mother_tongue_id:", profile?.mother_tongue_id || "❌ NULL", "→", profile?.mother_tongue || "");
    console.log("   marital_status_id:", profile?.marital_status_id || "❌ NULL", "→", profile?.marital_status || "");
    console.log("   diet_id:", profile?.diet_id || "❌ NULL");
    console.log("   about_myself:", profile?.about_myself ? "✅ (" + profile.about_myself.length + " chars)" : "❌ NULL");
    console.log("   ── CAREER ──");
    console.log("   occupation:", career?.occupation || "❌ NULL");
    console.log("   company_name:", career?.company_name || "❌ NULL");
    console.log("   annual_income:", career?.annual_income || "❌ NULL");
    console.log("   income_type:", career?.income_type || "❌ NULL");
    console.log("   grew_up_in_ids:", career?.grew_up_in_ids || "❌ NULL");
    console.log("   ethnic_origin_id:", career?.ethnic_origin_id || "❌ NULL");
    console.log("   country_living_in_id:", career?.country_living_in_id || "❌ NULL");
    console.log("   city_living_in:", career?.city_living_in || "❌ NULL");
    console.log("   ── LOCATION ──");
    console.log("   city_id:", location?.city_id || "❌ NULL", "→", location?.city_name || "");
    console.log("   state_id:", location?.state_id || "❌ NULL", "→", location?.state_name || "");
    console.log("   country_id:", location?.country_id || "❌ NULL", "→", location?.country_name || "");
    console.log("   ── EDUCATION ──");
    console.log("   education_level_id:", education?.education_level_id || "❌ NULL", "→", education?.level_name || "");
    console.log("   institution_name:", education?.institution_name || "❌ NULL");
    console.log("   ── FAMILY ──");
    console.log("   family:", family ? "✅ exists" : "❌ NULL (not created)");
    console.log("   ── ASTRO ──");
    console.log("   astro:", astro ? "✅ exists" : "❌ NULL (not created)");
    console.log("   ── PHOTOS ──");
    console.log("   photos count:", photos?.length || 0);
    console.log("   ── HOBBIES ──");
    console.log("   hobbies count:", hobbies?.length || 0);
    console.log("══════════════════════════════════════════════════════════════\n");

    res.json({
      success: true,
      profile: responseProfile
    });
  } catch (error) {
    console.error("Get Complete Profile Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Basic Details
export async function updateBasic(req, res) {
  try {
    const userId = req.user.user_id;
    console.log("\n✏️  UPDATE BASIC - user_id:", userId);
    console.log("📥 Request Body:", JSON.stringify(req.body, null, 2));
    const { first_name, middle_name, last_name, date_of_birth, height, weight, marital_status_id, has_children, number_of_children,
            lives_with_family, blood_group_id, profile_managed_by_id, diet_id, health_info_id,
            disability_id, smoking_id, drinking_id } = req.body;

    if (req.body.email) {
      // Check if the email is already registered by another user
      const [existingUser] = await query(
        `SELECT id
        FROM users
        WHERE email = ?
          AND id != ?
        LIMIT 1`,
        [req.body.email, userId]
      );

      if (existingUser) {
        return res.status(400).json({
          status: false,
          message: "This email address is already registered. Please use a different email address."
        });
      }

      // Update email
      await query(
        `UPDATE users
        SET email = ?
        WHERE id = ?`,
        [req.body.email, userId]
      );
    }

    const updates = [];
    const values = [];

    if (first_name) {
      updates.push('first_name = ?');
      values.push(first_name);
    }
    if (middle_name !== undefined) {
      updates.push('middle_name = ?');
      values.push(middle_name || null);
    }
    if (last_name) {
      updates.push('last_name = ?');
      values.push(last_name);
    }
    if (date_of_birth) {
      const birthDate = new Date(date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 18) {
        return res.status(400).json({ success: false, message: "User must be at least 18 years old" });
      }
      updates.push('date_of_birth = ?');
      values.push(date_of_birth);
      updates.push('age = ?');
      values.push(age);
    }
    if (height) {
      updates.push('height = ?');
      values.push(height);
    }
    if (weight) {
      updates.push('weight = ?');
      values.push(weight);
    }
    if (marital_status_id) {
      updates.push('marital_status_id = ?');
      values.push(marital_status_id);
    }
    if (has_children) {
      updates.push('has_children = ?');
      values.push(has_children);
    }
    if (number_of_children) {
      updates.push('number_of_children = ?');
      values.push(number_of_children);
    }
    if (lives_with_family !== undefined) {
      updates.push('lives_with_family = ?');
      values.push(lives_with_family);
    }
    if (blood_group_id) {
      updates.push('blood_group_id = ?');
      values.push(blood_group_id);
    }
    if (profile_managed_by_id) {
      updates.push('profile_managed_by_id = ?');
      values.push(profile_managed_by_id);
    }
    if (diet_id) {
      updates.push('diet_id = ?');
      values.push(Array.isArray(diet_id) ? diet_id[0] : diet_id);
    }
    if (health_info_id) {
      updates.push('health_info_id = ?');
      values.push(health_info_id);
    }
    if (disability_id) {
      updates.push('disability_id = ?');
      values.push(disability_id);
    }
    if (smoking_id) {
      updates.push('smoking_id = ?');
      values.push(smoking_id);
    }
    if (drinking_id) {
      updates.push('drinking_id = ?');
      values.push(drinking_id);
    }

    if (updates.length > 0) {
      values.push(userId);
      await query(
        `UPDATE user_profiles SET ${updates.join(', ')} WHERE user_id = ?`,
        values
      );
    }

    res.json({ success: true, message: "Basic details updated successfully" });
  } catch (error) {
    console.error("Update Basic Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update About Section
export async function updateAbout(req, res) {
  try {
    const userId = req.user.user_id;
    console.log("\n✏️  UPDATE ABOUT - user_id:", userId);
    console.log("📥 Request Body:", JSON.stringify(req.body, null, 2));
    const { about_myself, disability_id, blood_group_id, diet_id, health_info_id } = req.body;

    if (about_myself && about_myself.length > 8000) {
      return res.status(400).json({ success: false, message: "About section cannot exceed 8000 characters" });
    }

    // Build dynamic update query — only update fields that are provided
    const updates = [];
    const values = [];

    if (about_myself !== undefined) {
      updates.push('about_myself = ?');
      values.push(about_myself);
    }
    if (disability_id !== undefined && disability_id !== null) {
      updates.push('disability_id = ?');
      values.push(disability_id);
    }
    if (blood_group_id !== undefined && blood_group_id !== null) {
      updates.push('blood_group_id = ?');
      values.push(blood_group_id);
    }
    if (diet_id !== undefined && diet_id !== null) {
      const dietIdValue = Array.isArray(diet_id) ? diet_id[0] : diet_id;
      updates.push('diet_id = ?');
      values.push(dietIdValue);
    }
    if (health_info_id !== undefined && health_info_id !== null) {
      updates.push('health_info_id = ?');
      values.push(health_info_id);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: "No fields to update" });
    }

    values.push(userId);
    await query(
      `UPDATE user_profiles SET ${updates.join(', ')} WHERE user_id = ?`,
      values
    );

    res.json({ success: true, message: "About section updated successfully" });
  } catch (error) {
    console.error("Update About Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Astro Details
export async function updateAstro(req, res) {
  try {
    const userId = req.user.user_id;
    console.log("\n✏️  UPDATE ASTRO - user_id:", userId);
    console.log("📥 Request Body:", JSON.stringify(req.body, null, 2));
    const { country_of_birth_id, state_of_birth, city_of_birth, birth_time,
            birth_time_type, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id } = req.body;

    // Validate birth_time_type - convert to acceptable values
    let validBirthTimeType = null;
    if (birth_time_type) {
      const timeType = birth_time_type.toLowerCase();
      if (timeType === 'am' || timeType === 'pm' || timeType === 'morning' || timeType === 'evening') {
        validBirthTimeType = 'approximate';
      } else if (timeType === 'exact') {
        validBirthTimeType = 'exact';
      } else {
        validBirthTimeType = 'approximate'; // Default to approximate
      }
    }

    const [existing] = await query(`SELECT id FROM astro_details WHERE user_id = ?`, [userId]);

    if (existing) {
      await query(
        `UPDATE astro_details SET country_of_birth_id = ?, state_of_birth = ?, city_of_birth = ?,
         birth_time = ?, birth_time_type = ?, manglik_status = ?, dosham = ?, gothra_id = ?,
         rasi_id = ?, nakshatra_id = ? WHERE user_id = ?`,
        [country_of_birth_id, state_of_birth, city_of_birth, birth_time,
         validBirthTimeType, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id, userId]
      );
    } else {
      await query(
        `INSERT INTO astro_details (user_id, country_of_birth_id, state_of_birth, city_of_birth,
         birth_time, birth_time_type, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, country_of_birth_id, state_of_birth, city_of_birth, birth_time,
         validBirthTimeType, manglik_status, dosham, gothra_id, rasi_id, nakshatra_id]
      );
    }

    res.json({ success: true, message: "Astro details updated successfully" });
  } catch (error) {
    console.error("Update Astro Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Family Details
export async function updateFamily(req, res) {
  try {
    const userId = req.user.user_id;
    console.log("\n✏️  UPDATE FAMILY - user_id:", userId);
    console.log("📥 Request Body:", JSON.stringify(req.body, null, 2));
    const { father_name, father_occupation_id, mother_name, mother_occupation_id,
            no_of_sisters, no_of_brothers, family_country_id, family_state,
            family_financial_status_id, family_type_id, family_values_id } = req.body;

    const [existing] = await query(`SELECT id FROM family_details WHERE user_id = ?`, [userId]);

    if (existing) {
      await query(
        `UPDATE family_details SET father_name = ?, father_occupation_id = ?, mother_name = ?,
         mother_occupation_id = ?, no_of_sisters = ?, no_of_brothers = ?, family_country_id = ?,
         family_state = ?, family_financial_status_id = ?, family_type_id = ?, family_values_id = ?
         WHERE user_id = ?`,
        [father_name, father_occupation_id, mother_name, mother_occupation_id, no_of_sisters,
         no_of_brothers, family_country_id, family_state, family_financial_status_id,
         family_type_id, family_values_id, userId]
      );
    } else {
      await query(
        `INSERT INTO family_details (user_id, father_name, father_occupation_id, mother_name,
         mother_occupation_id, no_of_sisters, no_of_brothers, family_country_id, family_state,
         family_financial_status_id, family_type_id, family_values_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, father_name, father_occupation_id, mother_name, mother_occupation_id, no_of_sisters,
         no_of_brothers, family_country_id, family_state, family_financial_status_id,
         family_type_id, family_values_id]
      );
    }

    res.json({ success: true, message: "Family details updated successfully" });
  } catch (error) {
    console.error("Update Family Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Career Details
export async function updateCareer(req, res) {
  try {
    const userId = req.user.user_id;
    console.log("\n✏️  UPDATE CAREER - user_id:", userId);
    console.log("📥 Request Body:", JSON.stringify(req.body, null, 2));
    const { highest_qualification, college_attended, college_attended_2, working_with_id,
            working_as, employer_name, annual_income, income_type, keep_income_private } = req.body;

    const [existing] = await query(`SELECT id FROM career_details WHERE user_id = ?`, [userId]);

    if (existing) {
      await query(
        `UPDATE career_details SET highest_qualification = ?, college_attended = ?,
         working_with_id = ?, working_as = ?, employer_name = ?, annual_income = ?, income_type = ?,
         keep_income_private = ? WHERE user_id = ?`,
        [highest_qualification || null, college_attended || null, working_with_id || null, working_as || null, employer_name || null,
         annual_income || null, income_type || null, keep_income_private !== undefined ? keep_income_private : false, userId]
      );
    } else {
      await query(
        `INSERT INTO career_details (user_id, highest_qualification, college_attended,
         working_with_id, working_as, employer_name, annual_income, income_type, keep_income_private, currency_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [userId, highest_qualification || null, college_attended || null, working_with_id || null, working_as || null,
         employer_name || null, annual_income || null, income_type || null, keep_income_private !== undefined ? keep_income_private : false]
      );
    }

    // Update education_details with college information
    if (college_attended || college_attended_2) {
      const [eduExists] = await query(`SELECT id FROM education_details WHERE user_id = ?`, [userId]);

      if (eduExists) {
        await query(
          `UPDATE education_details SET institution_name = ?, institution_name_2 = ? WHERE user_id = ?`,
          [college_attended, college_attended_2, userId]
        );
      } else {
        await query(
          `INSERT INTO education_details (user_id, institution_name, institution_name_2, education_level_id) VALUES (?, ?, ?, 1)`,
          [userId, college_attended, college_attended_2]
        );
      }
    }

    res.json({ success: true, message: "Career details updated successfully" });
  } catch (error) {
    console.error("Update Career Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Location Details
export async function updateLocation(req, res) {
  try {
    const userId = req.user.user_id;
    console.log("\n✏️  UPDATE LOCATION - user_id:", userId);
    console.log("📥 Request Body:", JSON.stringify(req.body, null, 2));
    const { current_residence, residency_status, state_living_in, state_id, city_id, country_id, zip_code, latitude, longitude, grew_up_in, ethnic_origin_id } = req.body;

    const [existing] = await query(`SELECT id FROM location_details WHERE user_id = ?`, [userId]);

    if (existing) {
      await query(
        `UPDATE location_details SET current_residence = ?, residency_status = ?,
         state_living_in = ?, state_id = ?, city_id = ?, country_id = ?, zip_code = ?, latitude = ?, longitude = ? WHERE user_id = ?`,
        [current_residence || null, residency_status || null, state_living_in || null, state_id || null, city_id || null, country_id || null, zip_code || null, latitude || null, longitude || null, userId]
      );
    } else {
      await query(
        `INSERT INTO location_details (user_id, current_residence, residency_status,
         state_living_in, state_id, city_id, country_id, zip_code, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, current_residence || null, residency_status || null, state_living_in || null, state_id || null, city_id || null, country_id || null, zip_code || null, latitude || null, longitude || null]
      );
    }

    // Update grew_up_in and ethnic_origin_id in career_details
    if (grew_up_in !== undefined || ethnic_origin_id !== undefined) {
      const [careerExists] = await query(`SELECT id FROM career_details WHERE user_id = ?`, [userId]);

      if (careerExists) {
        const updates = [];
        const values = [];

        if (grew_up_in !== undefined) {
          updates.push('grew_up_in_ids = ?');
          values.push(JSON.stringify(grew_up_in));
        }
        if (ethnic_origin_id !== undefined) {
          updates.push('ethnic_origin_id = ?');
          values.push(ethnic_origin_id);
        }

        if (updates.length > 0) {
          values.push(userId);
          await query(
            `UPDATE career_details SET ${updates.join(', ')} WHERE user_id = ?`,
            values
          );
        }
      } else {
        await query(
          `INSERT INTO career_details (user_id, grew_up_in_ids, ethnic_origin_id, currency_id) VALUES (?, ?, ?, 1)`,
          [userId, JSON.stringify(grew_up_in || []), ethnic_origin_id || null]
        );
      }
    }

    res.json({ success: true, message: "Location details updated successfully" });
  } catch (error) {
    console.error("Update Location Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Update Hobbies
export async function updateHobbies(req, res) {
  try {
    const userId = req.user.user_id;
    console.log("\n✏️  UPDATE HOBBIES - user_id:", userId);
    console.log("📥 Request Body:", JSON.stringify(req.body, null, 2));
    const { hobby_ids } = req.body;

    // Delete existing hobbies
    await query(`DELETE FROM user_hobbies WHERE user_id = ?`, [userId]);

    // Insert new hobbies
    if (hobby_ids && hobby_ids.length > 0) {
      const values = hobby_ids.map(hobbyId => [userId, hobbyId]);
      await query(`INSERT INTO user_hobbies (user_id, hobby_id) VALUES ?`, [values]);
    }

    res.json({ success: true, message: "Hobbies updated successfully" });
  } catch (error) {
    console.error("Update Hobbies Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}
