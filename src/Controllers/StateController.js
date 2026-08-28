"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVendorRegistrationFormData = exports.getCitiesByState = exports.getStatesByCountry = exports.getStateById = exports.getAllStates = void 0;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// ============ GET ALL STATES ============
const getAllStates = async (req, res) => {
    try {
        const { search = '', status = 'active', page = 1, limit = 100 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let whereConditions = [];
        let queryParams = [];
        // Status filter
        if (status === 'active') {
            whereConditions.push('status = 1');
        }
        else if (status === 'inactive') {
            whereConditions.push('status = 0');
        }
        // Search filter
        if (search) {
            whereConditions.push('state_name LIKE ?');
            queryParams.push(`%${search}%`);
        }
        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
        // Get states
        const statesQuery = `
      SELECT 
        id,
        state_name,
        state_code,
        country_id,
        status,
        created_at,
        updated_at
      FROM states_master
      ${whereClause}
      ORDER BY state_name ASC
      LIMIT ? OFFSET ?
    `;
        queryParams.push(parseInt(limit), offset);
        const states = await query(statesQuery, queryParams);
        // Get total count
        const countQuery = `
      SELECT COUNT(*) as total
      FROM states_master
      ${whereClause}
    `;
        const countParams = queryParams.slice(0, -2); // Remove limit and offset
        const totalResult = await query(countQuery, countParams);
        const total = totalResult[0].total;
        res.json({
            success: true,
            data: {
                states: states,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total: total,
                    total_pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    }
    catch (error) {
        console.error("Error fetching states:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getAllStates = getAllStates;
// ============ GET STATE BY ID ============
const getStateById = async (req, res) => {
    try {
        const { id } = req.params;
        const stateQuery = `
      SELECT 
        sm.id,
        sm.state_name,
        sm.state_code,
        sm.country_id,
        sm.status,
        sm.created_at,
        sm.updated_at,
        cm.country_name
      FROM states_master sm
      LEFT JOIN country_master cm ON sm.country_id = cm.id
      WHERE sm.id = ?
    `;
        const state = await query(stateQuery, [id]);
        if (state.length === 0) {
            res.status(404).json({
                success: false,
                message: "State not found"
            });
            return;
        }
        res.json({
            success: true,
            data: state[0]
        });
    }
    catch (error) {
        console.error("Error fetching state:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getStateById = getStateById;
// ============ GET STATES BY COUNTRY ============
const getStatesByCountry = async (req, res) => {
    try {
        const { country_id } = req.params;
        const statesQuery = `
      SELECT 
        id,
        state_name,
        state_code,
        country_id,
        status
      FROM states_master
      WHERE country_id = ? AND status = 1
      ORDER BY state_name ASC
    `;
        const states = await query(statesQuery, [country_id]);
        res.json({
            success: true,
            data: states
        });
    }
    catch (error) {
        console.error("Error fetching states by country:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getStatesByCountry = getStatesByCountry;
// ============ GET CITIES BY STATE ============
const getCitiesByState = async (req, res) => {
    try {
        const { state_id } = req.params;
        const { search = '', limit = 100 } = req.query;
        let citiesQuery = `
      SELECT 
        id,
        city_name,
        state_id,
        status
      FROM cities_master
      WHERE state_id = ? AND status = 1
        AND city_name REGEXP '^[A-Za-z]'
        AND LENGTH(city_name) >= 3
        AND city_name NOT REGEXP '^[0-9]+$'
    `;
        let queryParams = [state_id];
        if (search) {
            citiesQuery += ' AND city_name LIKE ?';
            queryParams.push(`%${search}%`);
        }
        citiesQuery += ' ORDER BY city_name ASC LIMIT ?';
        queryParams.push(parseInt(limit));
        const cities = await query(citiesQuery, queryParams);
        res.json({
            success: true,
            data: cities
        });
    }
    catch (error) {
        console.error("Error fetching cities by state:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getCitiesByState = getCitiesByState;
// ============ GET VENDOR REGISTRATION FORM DATA ============
const getVendorRegistrationFormData = async (req, res) => {
    try {
        // Get states
        const states = await query("SELECT id, state_name, state_code FROM states_master WHERE status = 1 ORDER BY state_name ASC");
        // Get vendor categories
        const categories = await query("SELECT id, category_name, description FROM vendor_categories WHERE status = 1 ORDER BY category_name ASC");
        // Get subscription plans
        const plans = await query("SELECT id, plan_name, plan_description, monthly_price, features, is_popular FROM vendor_subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC");
        // Format plans with parsed features
        const formattedPlans = plans.map(plan => (Object.assign(Object.assign({}, plan), { features: plan.features ? JSON.parse(plan.features) : [] })));
        res.json({
            success: true,
            data: {
                states: states,
                categories: categories,
                subscription_plans: formattedPlans
            }
        });
    }
    catch (error) {
        console.error("Error fetching vendor registration form data:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
exports.getVendorRegistrationFormData = getVendorRegistrationFormData;
//# sourceMappingURL=StateController.js.map