"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPartnerPreferences = getPartnerPreferences;
exports.upsertPartnerPreferences = upsertPartnerPreferences;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Get Partner Preferences
async function getPartnerPreferences(req, res) {
    try {
        const userId = req.user.user_id;
        const [preferences] = await query(`SELECT * FROM partner_preferences WHERE user_id = ?`, [userId]);
        if (!preferences) {
            return res.json({
                success: true,
                preferences: {
                    min_age: 18,
                    max_age: 45,
                    min_height: "4ft 0in",
                    max_height: "7ft 0in",
                    marital_status_ids: [],
                    religion_ids: [],
                    community_ids: [],
                    mother_tongue_ids: [],
                    education_level_ids: [],
                    working_with_ids: [],
                    profession_ids: [],
                    currency_id: 1,
                    min_income: 0,
                    max_income: 0,
                    show_profiles_with_hidden_income: false,
                    country_ids: [],
                    state_ids: [],
                    profile_managed_by_ids: [],
                    diet_ids: []
                }
            });
        }
        // Parse JSON fields
        const parsedPreferences = Object.assign(Object.assign({}, preferences), { marital_status_ids: preferences.marital_status_ids ? JSON.parse(preferences.marital_status_ids) : [], religion_ids: preferences.religion_ids ? JSON.parse(preferences.religion_ids) : [], community_ids: preferences.community_ids ? JSON.parse(preferences.community_ids) : [], mother_tongue_ids: preferences.mother_tongue_ids ? JSON.parse(preferences.mother_tongue_ids) : [], education_level_ids: preferences.education_level_ids ? JSON.parse(preferences.education_level_ids) : [], working_with_ids: preferences.working_with_ids ? JSON.parse(preferences.working_with_ids) : [], profession_ids: preferences.profession_ids ? JSON.parse(preferences.profession_ids) : [], country_ids: preferences.country_ids ? JSON.parse(preferences.country_ids) : [], state_ids: preferences.state_ids ? JSON.parse(preferences.state_ids) : [], profile_managed_by_ids: preferences.profile_managed_by_ids ? JSON.parse(preferences.profile_managed_by_ids) : [], diet_ids: preferences.diet_ids ? JSON.parse(preferences.diet_ids) : [] });
        res.json({
            success: true,
            preferences: parsedPreferences
        });
    }
    catch (error) {
        console.error("Get Partner Preferences Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Create or Update Partner Preferences
async function upsertPartnerPreferences(req, res) {
    try {
        const userId = req.user.user_id;
        const { min_age, max_age, min_height, max_height, marital_status_ids, religion_ids, community_ids, mother_tongue_ids, education_level_ids, working_with_ids, profession_ids, currency_id, min_income, max_income, show_profiles_with_hidden_income, country_ids, state_ids, profile_managed_by_ids, diet_ids } = req.body;
        // Check if preferences exist
        const [existing] = await query(`SELECT id FROM partner_preferences WHERE user_id = ?`, [userId]);
        // Empty array or null means "Open to All" - no filter applied
        const jsonFields = {
            marital_status_ids: (marital_status_ids && marital_status_ids.length > 0) ? JSON.stringify(marital_status_ids) : null,
            religion_ids: (religion_ids && religion_ids.length > 0) ? JSON.stringify(religion_ids) : null,
            community_ids: (community_ids && community_ids.length > 0) ? JSON.stringify(community_ids) : null,
            education_level_ids: (education_level_ids && education_level_ids.length > 0) ? JSON.stringify(education_level_ids) : null,
            working_with_ids: (working_with_ids && working_with_ids.length > 0) ? JSON.stringify(working_with_ids) : null,
            profession_ids: (profession_ids && profession_ids.length > 0) ? JSON.stringify(profession_ids) : null,
            country_ids: (country_ids && country_ids.length > 0) ? JSON.stringify(country_ids) : null,
            state_ids: (state_ids && state_ids.length > 0) ? JSON.stringify(state_ids) : null,
            profile_managed_by_ids: (profile_managed_by_ids && profile_managed_by_ids.length > 0) ? JSON.stringify(profile_managed_by_ids) : null,
            diet_ids: (diet_ids && diet_ids.length > 0) ? JSON.stringify(diet_ids) : null,
            mother_tongue_ids: (mother_tongue_ids && mother_tongue_ids.length > 0) ? JSON.stringify(mother_tongue_ids) : null
        };
        if (existing) {
            await query(`UPDATE partner_preferences SET
         min_age = ?, max_age = ?, min_height = ?, max_height = ?, marital_status_ids = ?,
         religion_ids = ?, community_ids = ?, mother_tongue_ids = ?,
         education_level_ids = ?, working_with_ids = ?, profession_ids = ?,
         currency_id = ?, min_income = ?, max_income = ?, show_profiles_with_hidden_income = ?,
         country_ids = ?, state_ids = ?,
         profile_managed_by_ids = ?, diet_ids = ?
         WHERE user_id = ?`, [
                min_age, max_age, min_height, max_height, jsonFields.marital_status_ids,
                jsonFields.religion_ids, jsonFields.community_ids, jsonFields.mother_tongue_ids,
                jsonFields.education_level_ids, jsonFields.working_with_ids, jsonFields.profession_ids,
                currency_id || 1, min_income, max_income, show_profiles_with_hidden_income || false,
                jsonFields.country_ids, jsonFields.state_ids,
                jsonFields.profile_managed_by_ids, jsonFields.diet_ids,
                userId
            ]);
        }
        else {
            await query(`INSERT INTO partner_preferences (
         user_id, min_age, max_age, min_height, max_height, marital_status_ids,
         religion_ids, community_ids, mother_tongue_ids,
         education_level_ids, working_with_ids, profession_ids,
         currency_id, min_income, max_income, show_profiles_with_hidden_income,
         country_ids, state_ids,
         profile_managed_by_ids, diet_ids
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                userId, min_age, max_age, min_height, max_height, jsonFields.marital_status_ids,
                jsonFields.religion_ids, jsonFields.community_ids, jsonFields.mother_tongue_ids,
                jsonFields.education_level_ids, jsonFields.working_with_ids, jsonFields.profession_ids,
                currency_id || 1, min_income, max_income, show_profiles_with_hidden_income || false,
                jsonFields.country_ids, jsonFields.state_ids,
                jsonFields.profile_managed_by_ids, jsonFields.diet_ids
            ]);
        }
        // Fetch and return updated preferences
        const [updatedPrefs] = await query(`SELECT * FROM partner_preferences WHERE user_id = ?`, [userId]);
        const parsedUpdatedPrefs = Object.assign(Object.assign({}, updatedPrefs), { marital_status_ids: updatedPrefs.marital_status_ids ? JSON.parse(updatedPrefs.marital_status_ids) : [], religion_ids: updatedPrefs.religion_ids ? JSON.parse(updatedPrefs.religion_ids) : [], community_ids: updatedPrefs.community_ids ? JSON.parse(updatedPrefs.community_ids) : [], mother_tongue_ids: updatedPrefs.mother_tongue_ids ? JSON.parse(updatedPrefs.mother_tongue_ids) : [], education_level_ids: updatedPrefs.education_level_ids ? JSON.parse(updatedPrefs.education_level_ids) : [], working_with_ids: updatedPrefs.working_with_ids ? JSON.parse(updatedPrefs.working_with_ids) : [], profession_ids: updatedPrefs.profession_ids ? JSON.parse(updatedPrefs.profession_ids) : [], country_ids: updatedPrefs.country_ids ? JSON.parse(updatedPrefs.country_ids) : [], state_ids: updatedPrefs.state_ids ? JSON.parse(updatedPrefs.state_ids) : [], profile_managed_by_ids: updatedPrefs.profile_managed_by_ids ? JSON.parse(updatedPrefs.profile_managed_by_ids) : [], diet_ids: updatedPrefs.diet_ids ? JSON.parse(updatedPrefs.diet_ids) : [] });
        res.json({
            success: true,
            message: "Partner preferences saved successfully",
            preferences: parsedUpdatedPrefs
        });
    }
    catch (error) {
        console.error("Upsert Partner Preferences Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=PartnerPreferenceController.js.map