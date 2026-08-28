"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccountReasonsMaster = exports.hideProfileDurationMaster = exports.reportReasonsMaster = exports.alertTypesMaster = exports.actionTypesMaster = exports.governmentIdTypeMaster = exports.subscriptionAddonsMaster = exports.subscriptionFeaturesMaster = exports.educationAreaMaster = exports.smokingMaster = exports.drinkingMaster = exports.citiesMaster = exports.statesMaster = exports.hobbiesMaster = exports.ethnicOriginMaster = exports.profileManagedByMaster = exports.parentOccupationMaster = exports.workingWithMaster = exports.professionMaster = exports.motherTongueMaster = exports.nakshatraMaster = exports.rasiMaster = exports.gothraMaster = exports.healthInfoMaster = exports.disabilityMaster = exports.dietMaster = exports.bloodGroupMaster = exports.maritalStatusMaster = exports.religionMaster = exports.subscriptionStatusMaster = exports.subscriptionPlanFeatures = exports.subscriptionPlans = exports.generalStatusMaster = exports.genderMaster = exports.familyFinancialStatusMaster = exports.familyValuesMaster = exports.familyTypeMaster = exports.familyStatusMaster = exports.educationLevelMaster = exports.currencyMaster = exports.countryCodeMaster = exports.countryMaster = exports.communityMaster = exports.casteMaster = exports.AdminMasterController = void 0;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Generic CRUD operations for master tables
class AdminMasterController {
    // Get all records
    static async getAll(tableName, req, res) {
        try {
            const { page = 1, limit = 10, search = "" } = req.query;
            const offset = (page - 1) * limit;
            let whereConditions = [];
            let params = [];
            // Add status filter for active records only
            const statusColumn = AdminMasterController.getStatusColumn(tableName);
            if (statusColumn) {
                whereConditions.push(`${statusColumn} = 1`);
            }
            if (search) {
                const searchFields = AdminMasterController.getSearchFields(tableName);
                whereConditions.push(`(${searchFields.map(field => `${field} LIKE ?`).join(' OR ')})`);
                params = [...params, ...searchFields.map(() => `%${search}%`)];
            }
            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : "";
            const records = await query(`SELECT * FROM ${tableName} ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
            const [{ total }] = await query(`SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`, params);
            res.json({
                success: true,
                data: records,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit),
                },
            });
        }
        catch (error) {
            console.error(`Get ${tableName} Error:`, error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
    // Get by ID
    static async getById(tableName, req, res) {
        try {
            const { id } = req.params;
            const [record] = await query(`SELECT * FROM ${tableName} WHERE id = ?`, [id]);
            if (!record) {
                return res.status(404).json({
                    success: false,
                    message: "Record not found",
                });
            }
            res.json({
                success: true,
                data: record,
            });
        }
        catch (error) {
            console.error(`Get ${tableName} by ID Error:`, error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
    // Get field max lengths from DB schema
    static getFieldLimits(tableName) {
        const limits = {
            'religion_master': { religion_name: 50, description: 255 },
            'caste_master': { caste_name: 100 },
            'community_master': { community_name: 100 },
            'gothra_master': { gothra_name: 100 },
            'rasi_master': { rasi_name: 50 },
            'nakshatra_master': { nakshatra_name: 50 },
            'mother_tongue_master': { language_name: 50 },
            'diet_master': { diet_name: 50 },
            'disability_master': { disability_name: 100 },
            'health_info_master': { health_condition: 100 },
            'blood_group_master': { blood_group: 10 },
            'gender_master': { gender_name: 20 },
            'family_values_master': { value_name: 20 },
            'family_status_master': { status_name: 50 },
            'family_type_master': { type_name: 50 },
            'family_financial_status_master': { status_name: 50 },
            'marital_status_master': { status_name: 50 },
            'general_status_master': { status_name: 30 },
            'subscription_status_master': { status_name: 50 },
            'education_level_master': { level_name: 50 },
            'education_area_master': { area_name: 100 },
            'ethnic_origin_master': { origin_name: 100 },
            'hobbies_master': { hobby_name: 100, category: 50 },
            'cities_master': { city_name: 100 },
            'states_master': { state_name: 100, state_code: 10 },
            'drinking_master': { drinking_type: 50 },
            'smoking_master': { smoking_type: 50 },
            'government_id_type_master': { id_type_name: 50 },
            'action_types_master': { action_name: 50, description: 255 },
            'alert_types_master': { type_name: 50, description: 255 },
            'report_reasons_master': { reason_name: 100 },
            'delete_account_reasons_master': { reason_name: 100 },
            'hide_profile_duration_master': { duration_name: 50 },
            'parent_occupation_master': { occupation_name: 50 },
            'profile_managed_by_master': { managed_by_name: 50 },
            'working_with_master': { working_type: 50 },
            'profession_master': { profession_name: 100 },
            'subscription_addons_master': { addon_name: 100, addon_description: 500 },
            'subscription_features_master': { feature_name: 100, feature_description: 500 },
            'subscription_plans': { plan_name: 100 },
        };
        return limits[tableName] || {};
    }
    // Validate field lengths against DB schema
    static validateFieldLengths(tableName, data) {
        const limits = AdminMasterController.getFieldLimits(tableName);
        for (const [field, value] of Object.entries(data)) {
            if (typeof value === 'string' && limits[field] && value.length > limits[field]) {
                return `${field} must not exceed ${limits[field]} characters (got ${value.length})`;
            }
        }
        return null;
    }
    // Create record
    static async create(tableName, req, res) {
        try {
            const data = req.body;
            const lengthError = AdminMasterController.validateFieldLengths(tableName, data);
            if (lengthError) {
                return res.status(400).json({ success: false, message: lengthError });
            }
            const fields = Object.keys(data);
            // Handle JSON fields that need to be stringified
            const values = Object.values(data).map((value, index) => {
                const fieldName = fields[index];
                if (AdminMasterController.isJsonField(tableName, fieldName) && Array.isArray(value)) {
                    return JSON.stringify(value);
                }
                return value;
            });
            // --- Option A: Restore soft-deleted row if same name exists ---
            const statusColumn = AdminMasterController.getStatusColumn(tableName);
            if (statusColumn) {
                const nameField = AdminMasterController.getSearchFields(tableName)[0];
                const nameValue = data[nameField];
                if (nameField && nameValue !== undefined) {
                    const [softDeleted] = await query(`SELECT id FROM ${tableName} WHERE ${nameField} = ? AND ${statusColumn} = 0`, [nameValue]);
                    if (softDeleted) {
                        // Reactivate the soft-deleted row and apply all submitted fields
                        const setClause = fields.map(f => `${f} = ?`).join(', ');
                        await query(`UPDATE ${tableName} SET ${setClause}, ${statusColumn} = 1 WHERE id = ?`, [...values, softDeleted.id]);
                        return res.status(201).json({
                            success: true,
                            message: "Record created successfully",
                            id: softDeleted.id,
                        });
                    }
                }
            }
            // --- End restore logic ---
            const placeholders = fields.map(() => '?').join(', ');
            const result = await query(`INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`, values);
            res.status(201).json({
                success: true,
                message: "Record created successfully",
                id: result.insertId,
            });
        }
        catch (error) {
            console.error(`Create ${tableName} Error:`, error);
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ success: false, message: "Record already exists" });
            }
            if (error.code === 'ER_DATA_TOO_LONG') {
                return res.status(400).json({ success: false, message: "One or more fields exceed the maximum allowed length" });
            }
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
    // Update record
    static async update(tableName, req, res) {
        try {
            const { id } = req.params;
            const data = req.body;
            const lengthError = AdminMasterController.validateFieldLengths(tableName, data);
            if (lengthError) {
                return res.status(400).json({ success: false, message: lengthError });
            }
            const [existing] = await query(`SELECT id FROM ${tableName} WHERE id = ?`, [id]);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: "Record not found",
                });
            }
            const fields = Object.keys(data);
            // Handle JSON fields that need to be stringified
            const values = Object.values(data).map((value, index) => {
                const fieldName = fields[index];
                // Check if this field needs JSON conversion
                if (AdminMasterController.isJsonField(tableName, fieldName) && Array.isArray(value)) {
                    return JSON.stringify(value);
                }
                return value;
            });
            const setClause = fields.map(field => `${field} = ?`).join(', ');
            await query(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`, [...values, id]);
            res.json({
                success: true,
                message: "Record updated successfully",
            });
        }
        catch (error) {
            console.error(`Update ${tableName} Error:`, error);
            if (error.code === 'ER_DATA_TOO_LONG') {
                return res.status(400).json({ success: false, message: "One or more fields exceed the maximum allowed length" });
            }
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
    // Soft Delete record
    static async delete(tableName, req, res) {
        try {
            const { id } = req.params;
            const [existing] = await query(`SELECT id FROM ${tableName} WHERE id = ?`, [id]);
            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: "Record not found",
                });
            }
            // Check if table has user_status_id or status column for soft delete
            const hasUserStatusId = AdminMasterController.hasSoftDeleteColumn(tableName, 'user_status_id');
            const hasStatus = AdminMasterController.hasSoftDeleteColumn(tableName, 'status');
            if (hasUserStatusId) {
                await query(`UPDATE ${tableName} SET user_status_id = 0 WHERE id = ?`, [id]);
            }
            else if (hasStatus) {
                await query(`UPDATE ${tableName} SET status = 0 WHERE id = ?`, [id]);
            }
            else {
                // Hard delete if no soft delete column
                await query(`DELETE FROM ${tableName} WHERE id = ?`, [id]);
            }
            res.json({
                success: true,
                message: "Record deleted successfully",
            });
        }
        catch (error) {
            console.error(`Delete ${tableName} Error:`, error);
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
    // Get status column name for a table
    static getStatusColumn(tableName) {
        const tablesWithUserStatusId = [
            'religion_master', 'community_master', 'caste_master',
            'subscription_plans', 'subscription_features_master'
        ];
        // All master tables now have status column
        const tablesWithStatus = [
            'states_master', 'cities_master', 'country_master',
            'country_code_master', 'currency_master', 'education_level_master',
            'education_area_master', 'family_status_master', 'family_type_master',
            'family_values_master', 'family_financial_status_master', 'gender_master',
            'general_status_master', 'marital_status_master', 'blood_group_master',
            'diet_master', 'disability_master', 'health_info_master', 'gothra_master',
            'rasi_master', 'nakshatra_master', 'mother_tongue_master', 'profession_master',
            'working_with_master', 'parent_occupation_master', 'profile_managed_by_master',
            'ethnic_origin_master', 'hobbies_master', 'drinking_master', 'smoking_master',
            'government_id_type_master', 'action_types_master', 'alert_types_master',
            'report_reasons_master', 'hide_profile_duration_master', 'delete_account_reasons_master',
            'subscription_status_master', 'subscription_addons_master'
        ];
        if (tablesWithUserStatusId.includes(tableName)) {
            return 'user_status_id';
        }
        if (tablesWithStatus.includes(tableName)) {
            return 'status';
        }
        return null;
    }
    // Check if table has soft delete column
    static hasSoftDeleteColumn(tableName, columnName) {
        const tablesWithUserStatusId = [
            'religion_master', 'community_master', 'caste_master',
            'subscription_plans', 'subscription_features_master'
        ];
        const tablesWithStatus = [
            'states_master', 'cities_master', 'country_master',
            'country_code_master', 'currency_master', 'education_level_master',
            'education_area_master', 'family_status_master', 'family_type_master',
            'family_values_master', 'family_financial_status_master', 'gender_master',
            'general_status_master', 'marital_status_master', 'blood_group_master',
            'diet_master', 'disability_master', 'health_info_master', 'gothra_master',
            'rasi_master', 'nakshatra_master', 'mother_tongue_master', 'profession_master',
            'working_with_master', 'parent_occupation_master', 'profile_managed_by_master',
            'ethnic_origin_master', 'hobbies_master', 'drinking_master', 'smoking_master',
            'government_id_type_master', 'action_types_master', 'alert_types_master',
            'report_reasons_master', 'hide_profile_duration_master', 'delete_account_reasons_master',
            'subscription_status_master', 'subscription_addons_master'
        ];
        if (columnName === 'user_status_id') {
            return tablesWithUserStatusId.includes(tableName);
        }
        if (columnName === 'status') {
            return tablesWithStatus.includes(tableName);
        }
        return false;
    }
    // Check if field requires JSON conversion
    static isJsonField(tableName, fieldName) {
        var _a;
        const jsonFields = {
            'family_financial_status_master': ['description']
        };
        return ((_a = jsonFields[tableName]) === null || _a === void 0 ? void 0 : _a.includes(fieldName)) || false;
    }
    // Get search fields for each table
    static getSearchFields(tableName) {
        const searchFieldsMap = {
            'caste_master': ['caste_name'],
            'community_master': ['community_name'],
            'country_master': ['country_name', 'country_code'],
            'country_code_master': ['country_name', 'country_code', 'dial_code'],
            'currency_master': ['currency_code', 'currency_name'],
            'education_level_master': ['level_name'],
            'education_area_master': ['area_name'],
            'family_status_master': ['status_name'],
            'family_financial_status_master': ['status_name'],
            'family_type_master': ['type_name'],
            'family_values_master': ['value_name'],
            'gender_master': ['gender_name'],
            'general_status_master': ['status_name'],
            'subscription_plans': ['plan_name'],
            'subscription_plan_features': ['feature_value'],
            'subscription_features_master': ['feature_name'],
            'subscription_status_master': ['status_name'],
            'subscription_addons_master': ['addon_name'],
            'religion_master': ['religion_name'],
            'marital_status_master': ['status_name'],
            'blood_group_master': ['blood_group'],
            'diet_master': ['diet_name'],
            'disability_master': ['disability_name'],
            'health_info_master': ['health_condition'],
            'gothra_master': ['gothra_name'],
            'rasi_master': ['rasi_name'],
            'nakshatra_master': ['nakshatra_name'],
            'mother_tongue_master': ['language_name'],
            'profession_master': ['profession_name'],
            'working_with_master': ['working_type'],
            'parent_occupation_master': ['occupation_name'],
            'profile_managed_by_master': ['managed_by_name'],
            'ethnic_origin_master': ['origin_name'],
            'hobbies_master': ['hobby_name', 'category'],
            'states_master': ['state_name', 'state_code'],
            'cities_master': ['city_name'],
            'drinking_master': ['drinking_type'],
            'smoking_master': ['smoking_type'],
            'government_id_type_master': ['id_type_name'],
            'action_types_master': ['action_name'],
            'alert_types_master': ['type_name'],
            'report_reasons_master': ['reason_name'],
            'hide_profile_duration_master': ['duration_name'],
            'delete_account_reasons_master': ['reason_name'],
        };
        return searchFieldsMap[tableName] || ['id'];
    }
}
exports.AdminMasterController = AdminMasterController;
// Individual controller functions for each master table
exports.casteMaster = {
    getAll: (req, res) => AdminMasterController.getAll('caste_master', req, res),
    getById: (req, res) => AdminMasterController.getById('caste_master', req, res),
    create: (req, res) => AdminMasterController.create('caste_master', req, res),
    update: (req, res) => AdminMasterController.update('caste_master', req, res),
    delete: (req, res) => AdminMasterController.delete('caste_master', req, res),
};
exports.communityMaster = {
    getAll: (req, res) => AdminMasterController.getAll('community_master', req, res),
    getById: (req, res) => AdminMasterController.getById('community_master', req, res),
    create: (req, res) => AdminMasterController.create('community_master', req, res),
    update: (req, res) => AdminMasterController.update('community_master', req, res),
    delete: (req, res) => AdminMasterController.delete('community_master', req, res),
};
exports.countryMaster = {
    getAll: (req, res) => AdminMasterController.getAll('country_master', req, res),
    getById: (req, res) => AdminMasterController.getById('country_master', req, res),
    create: (req, res) => AdminMasterController.create('country_master', req, res),
    update: (req, res) => AdminMasterController.update('country_master', req, res),
    delete: (req, res) => AdminMasterController.delete('country_master', req, res),
};
exports.countryCodeMaster = {
    getAll: (req, res) => AdminMasterController.getAll('country_code_master', req, res),
    getById: (req, res) => AdminMasterController.getById('country_code_master', req, res),
    create: (req, res) => AdminMasterController.create('country_code_master', req, res),
    update: (req, res) => AdminMasterController.update('country_code_master', req, res),
    delete: (req, res) => AdminMasterController.delete('country_code_master', req, res),
};
exports.currencyMaster = {
    getAll: (req, res) => AdminMasterController.getAll('currency_master', req, res),
    getById: (req, res) => AdminMasterController.getById('currency_master', req, res),
    create: (req, res) => AdminMasterController.create('currency_master', req, res),
    update: (req, res) => AdminMasterController.update('currency_master', req, res),
    delete: (req, res) => AdminMasterController.delete('currency_master', req, res),
};
exports.educationLevelMaster = {
    getAll: (req, res) => AdminMasterController.getAll('education_level_master', req, res),
    getById: (req, res) => AdminMasterController.getById('education_level_master', req, res),
    create: (req, res) => AdminMasterController.create('education_level_master', req, res),
    update: (req, res) => AdminMasterController.update('education_level_master', req, res),
    delete: (req, res) => AdminMasterController.delete('education_level_master', req, res),
};
exports.familyStatusMaster = {
    getAll: (req, res) => AdminMasterController.getAll('family_status_master', req, res),
    getById: (req, res) => AdminMasterController.getById('family_status_master', req, res),
    create: (req, res) => AdminMasterController.create('family_status_master', req, res),
    update: (req, res) => AdminMasterController.update('family_status_master', req, res),
    delete: (req, res) => AdminMasterController.delete('family_status_master', req, res),
};
exports.familyTypeMaster = {
    getAll: (req, res) => AdminMasterController.getAll('family_type_master', req, res),
    getById: (req, res) => AdminMasterController.getById('family_type_master', req, res),
    create: (req, res) => AdminMasterController.create('family_type_master', req, res),
    update: (req, res) => AdminMasterController.update('family_type_master', req, res),
    delete: (req, res) => AdminMasterController.delete('family_type_master', req, res),
};
exports.familyValuesMaster = {
    getAll: (req, res) => AdminMasterController.getAll('family_values_master', req, res),
    getById: (req, res) => AdminMasterController.getById('family_values_master', req, res),
    create: (req, res) => AdminMasterController.create('family_values_master', req, res),
    update: (req, res) => AdminMasterController.update('family_values_master', req, res),
    delete: (req, res) => AdminMasterController.delete('family_values_master', req, res),
};
exports.familyFinancialStatusMaster = {
    getAll: (req, res) => AdminMasterController.getAll('family_financial_status_master', req, res),
    getById: (req, res) => AdminMasterController.getById('family_financial_status_master', req, res),
    create: (req, res) => AdminMasterController.create('family_financial_status_master', req, res),
    update: (req, res) => AdminMasterController.update('family_financial_status_master', req, res),
    delete: (req, res) => AdminMasterController.delete('family_financial_status_master', req, res),
};
exports.genderMaster = {
    getAll: (req, res) => AdminMasterController.getAll('gender_master', req, res),
    getById: (req, res) => AdminMasterController.getById('gender_master', req, res),
    create: (req, res) => AdminMasterController.create('gender_master', req, res),
    update: (req, res) => AdminMasterController.update('gender_master', req, res),
    delete: (req, res) => AdminMasterController.delete('gender_master', req, res),
};
exports.generalStatusMaster = {
    getAll: (req, res) => AdminMasterController.getAll('general_status_master', req, res),
    getById: (req, res) => AdminMasterController.getById('general_status_master', req, res),
    create: (req, res) => AdminMasterController.create('general_status_master', req, res),
    update: (req, res) => AdminMasterController.update('general_status_master', req, res),
    delete: (req, res) => AdminMasterController.delete('general_status_master', req, res),
};
exports.subscriptionPlans = {
    getAll: (req, res) => AdminMasterController.getAll('subscription_plans', req, res),
    getById: (req, res) => AdminMasterController.getById('subscription_plans', req, res),
    create: (req, res) => AdminMasterController.create('subscription_plans', req, res),
    update: (req, res) => AdminMasterController.update('subscription_plans', req, res),
    delete: (req, res) => AdminMasterController.delete('subscription_plans', req, res),
};
exports.subscriptionPlanFeatures = {
    getAll: (req, res) => AdminMasterController.getAll('subscription_plan_features', req, res),
    getById: (req, res) => AdminMasterController.getById('subscription_plan_features', req, res),
    create: (req, res) => AdminMasterController.create('subscription_plan_features', req, res),
    update: (req, res) => AdminMasterController.update('subscription_plan_features', req, res),
    delete: (req, res) => AdminMasterController.delete('subscription_plan_features', req, res),
};
exports.subscriptionStatusMaster = {
    getAll: (req, res) => AdminMasterController.getAll('subscription_status_master', req, res),
    getById: (req, res) => AdminMasterController.getById('subscription_status_master', req, res),
    create: (req, res) => AdminMasterController.create('subscription_status_master', req, res),
    update: (req, res) => AdminMasterController.update('subscription_status_master', req, res),
    delete: (req, res) => AdminMasterController.delete('subscription_status_master', req, res),
};
// Religion Master
exports.religionMaster = {
    getAll: (req, res) => AdminMasterController.getAll('religion_master', req, res),
    getById: (req, res) => AdminMasterController.getById('religion_master', req, res),
    create: (req, res) => AdminMasterController.create('religion_master', req, res),
    update: (req, res) => AdminMasterController.update('religion_master', req, res),
    delete: (req, res) => AdminMasterController.delete('religion_master', req, res),
};
// Marital Status Master
exports.maritalStatusMaster = {
    getAll: (req, res) => AdminMasterController.getAll('marital_status_master', req, res),
    getById: (req, res) => AdminMasterController.getById('marital_status_master', req, res),
    create: (req, res) => AdminMasterController.create('marital_status_master', req, res),
    update: (req, res) => AdminMasterController.update('marital_status_master', req, res),
    delete: (req, res) => AdminMasterController.delete('marital_status_master', req, res),
};
// Blood Group Master
exports.bloodGroupMaster = {
    getAll: (req, res) => AdminMasterController.getAll('blood_group_master', req, res),
    getById: (req, res) => AdminMasterController.getById('blood_group_master', req, res),
    create: (req, res) => AdminMasterController.create('blood_group_master', req, res),
    update: (req, res) => AdminMasterController.update('blood_group_master', req, res),
    delete: (req, res) => AdminMasterController.delete('blood_group_master', req, res),
};
// Diet Master
exports.dietMaster = {
    getAll: (req, res) => AdminMasterController.getAll('diet_master', req, res),
    getById: (req, res) => AdminMasterController.getById('diet_master', req, res),
    create: (req, res) => AdminMasterController.create('diet_master', req, res),
    update: (req, res) => AdminMasterController.update('diet_master', req, res),
    delete: (req, res) => AdminMasterController.delete('diet_master', req, res),
};
// Disability Master
exports.disabilityMaster = {
    getAll: (req, res) => AdminMasterController.getAll('disability_master', req, res),
    getById: (req, res) => AdminMasterController.getById('disability_master', req, res),
    create: (req, res) => AdminMasterController.create('disability_master', req, res),
    update: (req, res) => AdminMasterController.update('disability_master', req, res),
    delete: (req, res) => AdminMasterController.delete('disability_master', req, res),
};
// Health Info Master
exports.healthInfoMaster = {
    getAll: (req, res) => AdminMasterController.getAll('health_info_master', req, res),
    getById: (req, res) => AdminMasterController.getById('health_info_master', req, res),
    create: (req, res) => AdminMasterController.create('health_info_master', req, res),
    update: (req, res) => AdminMasterController.update('health_info_master', req, res),
    delete: (req, res) => AdminMasterController.delete('health_info_master', req, res),
};
// Gothra Master
exports.gothraMaster = {
    getAll: (req, res) => AdminMasterController.getAll('gothra_master', req, res),
    getById: (req, res) => AdminMasterController.getById('gothra_master', req, res),
    create: (req, res) => AdminMasterController.create('gothra_master', req, res),
    update: (req, res) => AdminMasterController.update('gothra_master', req, res),
    delete: (req, res) => AdminMasterController.delete('gothra_master', req, res),
};
// Rasi Master
exports.rasiMaster = {
    getAll: (req, res) => AdminMasterController.getAll('rasi_master', req, res),
    getById: (req, res) => AdminMasterController.getById('rasi_master', req, res),
    create: (req, res) => AdminMasterController.create('rasi_master', req, res),
    update: (req, res) => AdminMasterController.update('rasi_master', req, res),
    delete: (req, res) => AdminMasterController.delete('rasi_master', req, res),
};
// Nakshatra Master
exports.nakshatraMaster = {
    getAll: (req, res) => AdminMasterController.getAll('nakshatra_master', req, res),
    getById: (req, res) => AdminMasterController.getById('nakshatra_master', req, res),
    create: (req, res) => AdminMasterController.create('nakshatra_master', req, res),
    update: (req, res) => AdminMasterController.update('nakshatra_master', req, res),
    delete: (req, res) => AdminMasterController.delete('nakshatra_master', req, res),
};
// Mother Tongue Master
exports.motherTongueMaster = {
    getAll: (req, res) => AdminMasterController.getAll('mother_tongue_master', req, res),
    getById: (req, res) => AdminMasterController.getById('mother_tongue_master', req, res),
    create: (req, res) => AdminMasterController.create('mother_tongue_master', req, res),
    update: (req, res) => AdminMasterController.update('mother_tongue_master', req, res),
    delete: (req, res) => AdminMasterController.delete('mother_tongue_master', req, res),
};
// Profession Master
exports.professionMaster = {
    getAll: (req, res) => AdminMasterController.getAll('profession_master', req, res),
    getById: (req, res) => AdminMasterController.getById('profession_master', req, res),
    create: (req, res) => AdminMasterController.create('profession_master', req, res),
    update: (req, res) => AdminMasterController.update('profession_master', req, res),
    delete: (req, res) => AdminMasterController.delete('profession_master', req, res),
};
// Working With Master
exports.workingWithMaster = {
    getAll: (req, res) => AdminMasterController.getAll('working_with_master', req, res),
    getById: (req, res) => AdminMasterController.getById('working_with_master', req, res),
    create: (req, res) => AdminMasterController.create('working_with_master', req, res),
    update: (req, res) => AdminMasterController.update('working_with_master', req, res),
    delete: (req, res) => AdminMasterController.delete('working_with_master', req, res),
};
// Parent Occupation Master
exports.parentOccupationMaster = {
    getAll: (req, res) => AdminMasterController.getAll('parent_occupation_master', req, res),
    getById: (req, res) => AdminMasterController.getById('parent_occupation_master', req, res),
    create: (req, res) => AdminMasterController.create('parent_occupation_master', req, res),
    update: (req, res) => AdminMasterController.update('parent_occupation_master', req, res),
    delete: (req, res) => AdminMasterController.delete('parent_occupation_master', req, res),
};
// Profile Managed By Master
exports.profileManagedByMaster = {
    getAll: (req, res) => AdminMasterController.getAll('profile_managed_by_master', req, res),
    getById: (req, res) => AdminMasterController.getById('profile_managed_by_master', req, res),
    create: (req, res) => AdminMasterController.create('profile_managed_by_master', req, res),
    update: (req, res) => AdminMasterController.update('profile_managed_by_master', req, res),
    delete: (req, res) => AdminMasterController.delete('profile_managed_by_master', req, res),
};
// Ethnic Origin Master
exports.ethnicOriginMaster = {
    getAll: (req, res) => AdminMasterController.getAll('ethnic_origin_master', req, res),
    getById: (req, res) => AdminMasterController.getById('ethnic_origin_master', req, res),
    create: (req, res) => AdminMasterController.create('ethnic_origin_master', req, res),
    update: (req, res) => AdminMasterController.update('ethnic_origin_master', req, res),
    delete: (req, res) => AdminMasterController.delete('ethnic_origin_master', req, res),
};
// Hobbies Master
exports.hobbiesMaster = {
    getAll: (req, res) => AdminMasterController.getAll('hobbies_master', req, res),
    getById: (req, res) => AdminMasterController.getById('hobbies_master', req, res),
    create: (req, res) => AdminMasterController.create('hobbies_master', req, res),
    update: (req, res) => AdminMasterController.update('hobbies_master', req, res),
    delete: (req, res) => AdminMasterController.delete('hobbies_master', req, res),
};
// States Master
exports.statesMaster = {
    getAll: (req, res) => AdminMasterController.getAll('states_master', req, res),
    getById: (req, res) => AdminMasterController.getById('states_master', req, res),
    create: (req, res) => AdminMasterController.create('states_master', req, res),
    update: (req, res) => AdminMasterController.update('states_master', req, res),
    delete: (req, res) => AdminMasterController.delete('states_master', req, res),
};
// Cities Master
exports.citiesMaster = {
    getAll: (req, res) => AdminMasterController.getAll('cities_master', req, res),
    getById: (req, res) => AdminMasterController.getById('cities_master', req, res),
    create: (req, res) => AdminMasterController.create('cities_master', req, res),
    update: (req, res) => AdminMasterController.update('cities_master', req, res),
    delete: (req, res) => AdminMasterController.delete('cities_master', req, res),
};
// Drinking Master
exports.drinkingMaster = {
    getAll: (req, res) => AdminMasterController.getAll('drinking_master', req, res),
    getById: (req, res) => AdminMasterController.getById('drinking_master', req, res),
    create: (req, res) => AdminMasterController.create('drinking_master', req, res),
    update: (req, res) => AdminMasterController.update('drinking_master', req, res),
    delete: (req, res) => AdminMasterController.delete('drinking_master', req, res),
};
// Smoking Master
exports.smokingMaster = {
    getAll: (req, res) => AdminMasterController.getAll('smoking_master', req, res),
    getById: (req, res) => AdminMasterController.getById('smoking_master', req, res),
    create: (req, res) => AdminMasterController.create('smoking_master', req, res),
    update: (req, res) => AdminMasterController.update('smoking_master', req, res),
    delete: (req, res) => AdminMasterController.delete('smoking_master', req, res),
};
// Education Area Master
exports.educationAreaMaster = {
    getAll: (req, res) => AdminMasterController.getAll('education_area_master', req, res),
    getById: (req, res) => AdminMasterController.getById('education_area_master', req, res),
    create: (req, res) => AdminMasterController.create('education_area_master', req, res),
    update: (req, res) => AdminMasterController.update('education_area_master', req, res),
    delete: (req, res) => AdminMasterController.delete('education_area_master', req, res),
};
// Subscription Features Master
exports.subscriptionFeaturesMaster = {
    getAll: (req, res) => AdminMasterController.getAll('subscription_features_master', req, res),
    getById: (req, res) => AdminMasterController.getById('subscription_features_master', req, res),
    create: (req, res) => AdminMasterController.create('subscription_features_master', req, res),
    update: (req, res) => AdminMasterController.update('subscription_features_master', req, res),
    delete: (req, res) => AdminMasterController.delete('subscription_features_master', req, res),
};
// Subscription Addons Master
exports.subscriptionAddonsMaster = {
    getAll: (req, res) => AdminMasterController.getAll('subscription_addons_master', req, res),
    getById: (req, res) => AdminMasterController.getById('subscription_addons_master', req, res),
    create: (req, res) => AdminMasterController.create('subscription_addons_master', req, res),
    update: (req, res) => AdminMasterController.update('subscription_addons_master', req, res),
    delete: (req, res) => AdminMasterController.delete('subscription_addons_master', req, res),
};
// Government ID Type Master
exports.governmentIdTypeMaster = {
    getAll: (req, res) => AdminMasterController.getAll('government_id_type_master', req, res),
    getById: (req, res) => AdminMasterController.getById('government_id_type_master', req, res),
    create: (req, res) => AdminMasterController.create('government_id_type_master', req, res),
    update: (req, res) => AdminMasterController.update('government_id_type_master', req, res),
    delete: (req, res) => AdminMasterController.delete('government_id_type_master', req, res),
};
// Action Types Master
exports.actionTypesMaster = {
    getAll: (req, res) => AdminMasterController.getAll('action_types_master', req, res),
    getById: (req, res) => AdminMasterController.getById('action_types_master', req, res),
    create: (req, res) => AdminMasterController.create('action_types_master', req, res),
    update: (req, res) => AdminMasterController.update('action_types_master', req, res),
    delete: (req, res) => AdminMasterController.delete('action_types_master', req, res),
};
// Alert Types Master
exports.alertTypesMaster = {
    getAll: (req, res) => AdminMasterController.getAll('alert_types_master', req, res),
    getById: (req, res) => AdminMasterController.getById('alert_types_master', req, res),
    create: (req, res) => AdminMasterController.create('alert_types_master', req, res),
    update: (req, res) => AdminMasterController.update('alert_types_master', req, res),
    delete: (req, res) => AdminMasterController.delete('alert_types_master', req, res),
};
// Report Reasons Master
exports.reportReasonsMaster = {
    getAll: (req, res) => AdminMasterController.getAll('report_reasons_master', req, res),
    getById: (req, res) => AdminMasterController.getById('report_reasons_master', req, res),
    create: (req, res) => AdminMasterController.create('report_reasons_master', req, res),
    update: (req, res) => AdminMasterController.update('report_reasons_master', req, res),
    delete: (req, res) => AdminMasterController.delete('report_reasons_master', req, res),
};
// Hide Profile Duration Master
exports.hideProfileDurationMaster = {
    getAll: (req, res) => AdminMasterController.getAll('hide_profile_duration_master', req, res),
    getById: (req, res) => AdminMasterController.getById('hide_profile_duration_master', req, res),
    create: (req, res) => AdminMasterController.create('hide_profile_duration_master', req, res),
    update: (req, res) => AdminMasterController.update('hide_profile_duration_master', req, res),
    delete: (req, res) => AdminMasterController.delete('hide_profile_duration_master', req, res),
};
// Delete Account Reasons Master
exports.deleteAccountReasonsMaster = {
    getAll: (req, res) => AdminMasterController.getAll('delete_account_reasons_master', req, res),
    getById: (req, res) => AdminMasterController.getById('delete_account_reasons_master', req, res),
    create: (req, res) => AdminMasterController.create('delete_account_reasons_master', req, res),
    update: (req, res) => AdminMasterController.update('delete_account_reasons_master', req, res),
    delete: (req, res) => AdminMasterController.delete('delete_account_reasons_master', req, res),
};
//# sourceMappingURL=AdminMasterController.js.map