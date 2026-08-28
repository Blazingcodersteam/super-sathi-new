import { Request, Response } from "express";
import * as utils from "util";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// ============ ADMIN VENDOR SUBSCRIPTION PLANS MANAGEMENT ============

// Get all vendor subscription plans (Admin)
export const getAllVendorSubscriptionPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = 'all',
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];

    // Search filter
    if (search) {
      whereClause += ' AND (plan_name LIKE ? OR plan_description LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    // Status filter
    if (status !== 'all') {
      whereClause += ' AND is_active = ?';
      queryParams.push(status === 'active' ? 1 : 0);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM vendor_subscription_plans ${whereClause}`;
    const countResult: any[] = await query(countQuery, queryParams);
    const total = countResult[0].total;

    // Get plans with pagination
    const plansQuery = `
      SELECT 
        vsp.*,
        (SELECT COUNT(*) FROM vendors WHERE current_plan_id = vsp.id AND subscription_status = 'active') as active_subscribers,
        (SELECT COUNT(*) FROM vendor_payments WHERE plan_id = vsp.id AND payment_status = 'success') as total_payments
      FROM vendor_subscription_plans vsp
      ${whereClause}
      ORDER BY ${sort_by} ${sort_order}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(Number(limit), offset);
    const plans: any[] = await query(plansQuery, queryParams);

    // Parse JSON features
    const formattedPlans = plans.map(plan => ({
      ...plan,
      features: plan.features ? JSON.parse(plan.features) : [],
      active_subscribers: Number(plan.active_subscribers),
      total_payments: Number(plan.total_payments)
    }));

    res.json({
      success: true,
      data: {
        plans: formattedPlans,
        pagination: {
          current_page: Number(page),
          per_page: Number(limit),
          total: total,
          total_pages: Math.ceil(total / Number(limit))
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching vendor subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get vendor subscription plan by ID (Admin)
export const getVendorSubscriptionPlanById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const planQuery = `
      SELECT 
        vsp.*,
        (SELECT COUNT(*) FROM vendors WHERE current_plan_id = vsp.id AND subscription_status = 'active') as active_subscribers,
        (SELECT COUNT(*) FROM vendor_payments WHERE plan_id = vsp.id AND payment_status = 'success') as total_payments,
        (SELECT SUM(total_amount) FROM vendor_payments WHERE plan_id = vsp.id AND payment_status = 'success') as total_revenue
      FROM vendor_subscription_plans vsp
      WHERE vsp.id = ?
    `;

    const plans: any[] = await query(planQuery, [id]);

    if (plans.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Vendor subscription plan not found'
      });
      return;
    }

    const plan = {
      ...plans[0],
      features: plans[0].features ? JSON.parse(plans[0].features) : [],
      active_subscribers: Number(plans[0].active_subscribers),
      total_payments: Number(plans[0].total_payments),
      total_revenue: Number(plans[0].total_revenue) || 0
    };

    res.json({
      success: true,
      data: plan
    });

  } catch (error: any) {
    console.error('Error fetching vendor subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Create vendor subscription plan (Admin)
export const createVendorSubscriptionPlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      plan_name,
      plan_description,
      duration_months = 1,
      monthly_price,
      setup_fee = 0,
      features = [],
      max_services,
      max_consultations_per_month,
      commission_rate = 0,
      is_popular = false,
      sort_order = 0,
      is_active = true
    } = req.body;

    // Validation
    if (!plan_name || !monthly_price || !duration_months) {
      res.status(400).json({
        success: false,
        message: 'Plan name, monthly price, and duration are required'
      });
      return;
    }

    if (monthly_price < 0 || setup_fee < 0 || commission_rate < 0) {
      res.status(400).json({
        success: false,
        message: 'Prices and commission rate cannot be negative'
      });
      return;
    }

    // Check if plan name already exists
    const existingPlan: any[] = await query(
      'SELECT id FROM vendor_subscription_plans WHERE plan_name = ?',
      [plan_name]
    );

    if (existingPlan.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Plan name already exists'
      });
      return;
    }

    const insertQuery = `
      INSERT INTO vendor_subscription_plans (
        plan_name, plan_description, duration_months, monthly_price, setup_fee, features,
        max_services, max_consultations_per_month, commission_rate,
        is_popular, sort_order, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const result: any = await query(insertQuery, [
      plan_name,
      plan_description,
      duration_months,
      monthly_price,
      setup_fee,
      JSON.stringify(features),
      max_services,
      max_consultations_per_month,
      commission_rate,
      is_popular ? 1 : 0,
      sort_order,
      is_active ? 1 : 0
    ]);

    res.status(201).json({
      success: true,
      message: 'Vendor subscription plan created successfully',
      data: {
        id: result.insertId,
        plan_name,
        plan_description,
        duration_months,
        monthly_price,
        setup_fee,
        features,
        max_services,
        max_consultations_per_month,
        commission_rate,
        is_popular,
        sort_order,
        is_active
      }
    });

  } catch (error: any) {
    console.error('Error creating vendor subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update vendor subscription plan (Admin)
export const updateVendorSubscriptionPlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      plan_name,
      plan_description,
      duration_months,
      monthly_price,
      setup_fee,
      features,
      max_services,
      max_consultations_per_month,
      commission_rate,
      is_popular,
      sort_order,
      is_active
    } = req.body;

    // Check if plan exists
    const existingPlan: any[] = await query(
      'SELECT id FROM vendor_subscription_plans WHERE id = ?',
      [id]
    );

    if (existingPlan.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Vendor subscription plan not found'
      });
      return;
    }

    // Check if plan name already exists (excluding current plan)
    if (plan_name) {
      const duplicatePlan: any[] = await query(
        'SELECT id FROM vendor_subscription_plans WHERE plan_name = ? AND id != ?',
        [plan_name, id]
      );

      if (duplicatePlan.length > 0) {
        res.status(400).json({
          success: false,
          message: 'Plan name already exists'
        });
        return;
      }
    }

    // Validation for numeric fields
    if (monthly_price !== undefined && monthly_price < 0) {
      res.status(400).json({
        success: false,
        message: 'Monthly price cannot be negative'
      });
      return;
    }

    const updateQuery = `
      UPDATE vendor_subscription_plans SET
        plan_name = COALESCE(?, plan_name),
        plan_description = COALESCE(?, plan_description),
        duration_months = COALESCE(?, duration_months),
        monthly_price = COALESCE(?, monthly_price),
        setup_fee = COALESCE(?, setup_fee),
        features = COALESCE(?, features),
        max_services = COALESCE(?, max_services),
        max_consultations_per_month = COALESCE(?, max_consultations_per_month),
        commission_rate = COALESCE(?, commission_rate),
        is_popular = COALESCE(?, is_popular),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    await query(updateQuery, [
      plan_name,
      plan_description,
      duration_months,
      monthly_price,
      setup_fee,
      features ? JSON.stringify(features) : null,
      max_services,
      max_consultations_per_month,
      commission_rate,
      is_popular !== undefined ? (is_popular ? 1 : 0) : null,
      sort_order,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      id
    ]);

    // Get updated plan
    const updatedPlan: any[] = await query(
      'SELECT * FROM vendor_subscription_plans WHERE id = ?',
      [id]
    );

    const plan = {
      ...updatedPlan[0],
      features: updatedPlan[0].features ? JSON.parse(updatedPlan[0].features) : []
    };

    res.json({
      success: true,
      message: 'Vendor subscription plan updated successfully',
      data: plan
    });

  } catch (error: any) {
    console.error('Error updating vendor subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete vendor subscription plan (Admin)
export const deleteVendorSubscriptionPlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if plan exists
    const existingPlan: any[] = await query(
      'SELECT id, plan_name FROM vendor_subscription_plans WHERE id = ?',
      [id]
    );

    if (existingPlan.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Vendor subscription plan not found'
      });
      return;
    }

    // Check if plan has active subscribers
    const activeSubscribers: any[] = await query(
      'SELECT COUNT(*) as count FROM vendors WHERE current_plan_id = ? AND subscription_status = ?',
      [id, 'active']
    );

    if (activeSubscribers[0].count > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete plan. ${activeSubscribers[0].count} vendors are currently subscribed to this plan.`
      });
      return;
    }

    // Soft delete - set as inactive
    await query(
      'UPDATE vendor_subscription_plans SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: `Vendor subscription plan '${existingPlan[0].plan_name}' deleted successfully`
    });

  } catch (error: any) {
    console.error('Error deleting vendor subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// ============ PUBLIC VENDOR SUBSCRIPTION PLANS API ============

// Get active vendor subscription plans (Public - for registration)
export const getActiveVendorSubscriptionPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const plansQuery = `
      SELECT 
        id, plan_name, plan_description, duration_months, monthly_price, setup_fee, 
        features, max_services, max_consultations_per_month, 
        commission_rate, is_popular, sort_order
      FROM vendor_subscription_plans
      WHERE is_active = 1
      ORDER BY sort_order ASC, monthly_price ASC
    `;

    const plans: any[] = await query(plansQuery, []);

    // Parse JSON features and format response
    const formattedPlans = plans.map(plan => ({
      ...plan,
      features: plan.features ? JSON.parse(plan.features) : [],
      monthly_price: Number(plan.monthly_price),
      setup_fee: Number(plan.setup_fee),
      commission_rate: Number(plan.commission_rate),
      is_popular: Boolean(plan.is_popular)
    }));

    res.json({
      success: true,
      data: formattedPlans
    });

  } catch (error: any) {
    console.error('Error fetching active vendor subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get vendor subscription plan details by ID (Public)
export const getVendorSubscriptionPlanDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const planQuery = `
      SELECT 
        id, plan_name, plan_description, duration_months, monthly_price, setup_fee, 
        features, max_services, max_consultations_per_month, 
        commission_rate, is_popular
      FROM vendor_subscription_plans
      WHERE id = ? AND is_active = 1
    `;

    const plans: any[] = await query(planQuery, [id]);

    if (plans.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Vendor subscription plan not found or inactive'
      });
      return;
    }

    const plan = {
      ...plans[0],
      features: plans[0].features ? JSON.parse(plans[0].features) : [],
      monthly_price: Number(plans[0].monthly_price),
      setup_fee: Number(plans[0].setup_fee),
      commission_rate: Number(plans[0].commission_rate),
      is_popular: Boolean(plans[0].is_popular)
    };

    res.json({
      success: true,
      data: plan
    });

  } catch (error: any) {
    console.error('Error fetching vendor subscription plan details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};