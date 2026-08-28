import { Request, Response } from "express";
import * as utils from "util";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// ============ GET ALL STATES ============

export const getAllStates = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      search = '',
      status = 'active',
      page = 1,
      limit = 100
    } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    let whereConditions = [];
    let queryParams: any[] = [];

    // Status filter
    if (status === 'active') {
      whereConditions.push('status = 1');
    } else if (status === 'inactive') {
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

    queryParams.push(parseInt(limit as string), offset);
    const states: any[] = await query(statesQuery, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM states_master
      ${whereClause}
    `;

    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const totalResult: any[] = await query(countQuery, countParams);
    const total = totalResult[0].total;

    res.json({
      success: true,
      data: {
        states: states,
        pagination: {
          current_page: parseInt(page as string),
          per_page: parseInt(limit as string),
          total: total,
          total_pages: Math.ceil(total / parseInt(limit as string))
        }
      }
    });

  } catch (error: any) {
    console.error("Error fetching states:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============ GET STATE BY ID ============

export const getStateById = async (req: Request, res: Response): Promise<void> => {
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

    const state: any[] = await query(stateQuery, [id]);

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

  } catch (error: any) {
    console.error("Error fetching state:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============ GET STATES BY COUNTRY ============

export const getStatesByCountry = async (req: Request, res: Response): Promise<void> => {
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

    const states: any[] = await query(statesQuery, [country_id]);

    res.json({
      success: true,
      data: states
    });

  } catch (error: any) {
    console.error("Error fetching states by country:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============ GET CITIES BY STATE ============

export const getCitiesByState = async (req: Request, res: Response): Promise<void> => {
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

    let queryParams: any[] = [state_id];

    if (search) {
      citiesQuery += ' AND city_name LIKE ?';
      queryParams.push(`%${search}%`);
    }

    citiesQuery += ' ORDER BY city_name ASC LIMIT ?';
    queryParams.push(parseInt(limit as string));

    const cities: any[] = await query(citiesQuery, queryParams);

    res.json({
      success: true,
      data: cities
    });

  } catch (error: any) {
    console.error("Error fetching cities by state:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// ============ GET VENDOR REGISTRATION FORM DATA ============

export const getVendorRegistrationFormData = async (req: Request, res: Response): Promise<void> => {
  try {
    // Get states
    const states: any[] = await query(
      "SELECT id, state_name, state_code FROM states_master WHERE status = 1 ORDER BY state_name ASC"
    );

    // Get vendor categories
    const categories: any[] = await query(
      "SELECT id, category_name, description FROM vendor_categories WHERE status = 1 ORDER BY category_name ASC"
    );

    // Get subscription plans
    const plans: any[] = await query(
      "SELECT id, plan_name, plan_description, monthly_price, features, is_popular FROM vendor_subscription_plans WHERE is_active = 1 ORDER BY sort_order ASC"
    );

    // Format plans with parsed features
    const formattedPlans = plans.map(plan => ({
      ...plan,
      features: plan.features ? JSON.parse(plan.features) : []
    }));

    res.json({
      success: true,
      data: {
        states: states,
        categories: categories,
        subscription_plans: formattedPlans
      }
    });

  } catch (error: any) {
    console.error("Error fetching vendor registration form data:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};