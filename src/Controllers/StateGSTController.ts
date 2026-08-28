import * as utils from "util";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// Get all states with their GST configurations
export async function getAllStatesWithGST(req, res) {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = "WHERE 1=1";
    let searchParams = [];

    if (search) {
      whereClause += " AND sm.state_name LIKE ?";
      searchParams.push(`%${search}%`);
    }

    // Get states with their GST mappings
    const states = await query(`
      SELECT DISTINCT
        sm.id as state_id,
        sm.state_name,
        sm.state_code
      FROM states_master sm
      ${whereClause}
      ORDER BY sm.state_name
      LIMIT ? OFFSET ?
    `, [...searchParams, parseInt(limit), offset]);

    // Get GST mappings for these states
    const stateIds = states.map(s => s.state_id);
    let gstMappings = [];
    
    if (stateIds.length > 0) {
      gstMappings = await query(`
        SELECT 
          sgm.state_id,
          sgm.gst_type_id,
          sgm.percentage,
          sgm.is_active,
          gtm.gst_type_name,
          gtm.gst_type_code
        FROM states_gst_mapping sgm
        LEFT JOIN gst_type_master gtm ON sgm.gst_type_id = gtm.id
        WHERE sgm.state_id IN (${stateIds.map(() => '?').join(',')}) 
        AND sgm.is_active = 1
        ORDER BY gtm.gst_type_code
      `, stateIds);
    }

    // Combine states with their GST mappings
    const statesWithGST = states.map(state => ({
      ...state,
      gst_mappings: gstMappings.filter(mapping => mapping.state_id === state.state_id)
    }));

    // Get total count for pagination
    const [{ total }] = await query(`
      SELECT COUNT(DISTINCT sm.id) as total
      FROM states_master sm
      ${whereClause}
    `, searchParams);

    res.json({
      success: true,
      data: statesWithGST,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total_records: total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Get All States with GST Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get specific state GST configuration
export async function getStateGSTConfig(req, res) {
  try {
    const { state_id } = req.params;

    // Get state details
    const [state] = await query(`
      SELECT id, state_name, state_code
      FROM states_master 
      WHERE id = ?
    `, [state_id]);

    if (!state) {
      return res.status(404).json({
        success: false,
        message: "State not found"
      });
    }

    // Get all GST types
    const gstTypes = await query(`
      SELECT id, gst_type_name, gst_type_code, description
      FROM gst_type_master 
      WHERE is_active = 1
      ORDER BY gst_type_code
    `);

    // Get existing GST mappings for this state
    const existingMappings = await query(`
      SELECT 
        sgm.gst_type_id,
        sgm.percentage,
        sgm.is_active,
        gtm.gst_type_name,
        gtm.gst_type_code
      FROM states_gst_mapping sgm
      LEFT JOIN gst_type_master gtm ON sgm.gst_type_id = gtm.id
      WHERE sgm.state_id = ? AND sgm.is_active = 1
      ORDER BY gtm.gst_type_code
    `, [state_id]);

    // Create complete GST configuration (existing + missing types with 0%)
    const gstConfig = gstTypes.map(gstType => {
      const existing = existingMappings.find(m => m.gst_type_id === gstType.id);
      return {
        gst_type_id: gstType.id,
        gst_type_name: gstType.gst_type_name,
        gst_type_code: gstType.gst_type_code,
        description: gstType.description,
        percentage: existing ? existing.percentage : 0.00,
        is_configured: !!existing
      };
    });

    res.json({
      success: true,
      data: {
        state: state,
        gst_configuration: gstConfig
      }
    });
  } catch (error) {
    console.error("Get State GST Config Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Create/Update complete GST configuration for a state
export async function createOrUpdateStateGST(req, res) {
  try {
    const { state_id } = req.params;
    const { gst_configurations } = req.body;

    if (!gst_configurations || !Array.isArray(gst_configurations)) {
      return res.status(400).json({
        success: false,
        message: "gst_configurations array is required"
      });
    }

    // Validate state exists
    const [state] = await query(`
      SELECT id FROM states_master WHERE id = ?
    `, [state_id]);

    if (!state) {
      return res.status(404).json({
        success: false,
        message: "State not found"
      });
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const config of gst_configurations) {
      const { gst_type_id, percentage } = config;
      
      if (!gst_type_id || percentage === undefined || percentage === null) {
        skippedCount++;
        continue;
      }

      // Validate GST type exists
      const [gstType] = await query(`
        SELECT id FROM gst_type_master WHERE id = ? AND is_active = 1
      `, [gst_type_id]);

      if (!gstType) {
        skippedCount++;
        continue;
      }

      // Check if mapping already exists (including soft-deleted ones)
      const [existing] = await query(`
        SELECT id, is_active FROM states_gst_mapping 
        WHERE state_id = ? AND gst_type_id = ?
      `, [state_id, gst_type_id]);

      if (existing) {
        // Update existing mapping (reactivate if soft-deleted)
        await query(`
          UPDATE states_gst_mapping 
          SET percentage = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP, updated_by = ?
          WHERE state_id = ? AND gst_type_id = ?
        `, [percentage, req.admin?.id || null, state_id, gst_type_id]);
        updatedCount++;
      } else {
        // Create new mapping
        await query(`
          INSERT INTO states_gst_mapping 
          (state_id, gst_type_id, percentage, is_active, created_by)
          VALUES (?, ?, ?, 1, ?)
        `, [state_id, gst_type_id, percentage, req.admin?.id || null]);
        createdCount++;
      }
    }

    res.json({
      success: true,
      message: "State GST configuration updated successfully",
      summary: {
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        total_processed: createdCount + updatedCount
      }
    });
  } catch (error) {
    console.error("Create/Update State GST Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Bulk create/update GST configurations for multiple states
export async function bulkCreateOrUpdateStatesGST(req, res) {
  try {
    const { states_configurations } = req.body;

    if (!states_configurations || !Array.isArray(states_configurations)) {
      return res.status(400).json({
        success: false,
        message: "states_configurations array is required"
      });
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let processedStates = 0;

    for (const stateConfig of states_configurations) {
      const { state_id, gst_configurations } = stateConfig;
      
      if (!state_id || !gst_configurations || !Array.isArray(gst_configurations)) {
        continue;
      }

      // Validate state exists
      const [state] = await query(`
        SELECT id FROM states_master WHERE id = ?
      `, [state_id]);

      if (!state) continue;

      let stateCreated = 0;
      let stateUpdated = 0;
      let stateSkipped = 0;

      for (const config of gst_configurations) {
        const { gst_type_id, percentage } = config;
        
        if (!gst_type_id || percentage === undefined || percentage === null) {
          stateSkipped++;
          continue;
        }

        // Validate GST type exists
        const [gstType] = await query(`
          SELECT id FROM gst_type_master WHERE id = ? AND is_active = 1
        `, [gst_type_id]);

        if (!gstType) {
          stateSkipped++;
          continue;
        }

        // Check if mapping already exists (including soft-deleted ones)
        const [existing] = await query(`
          SELECT id, is_active FROM states_gst_mapping 
          WHERE state_id = ? AND gst_type_id = ?
        `, [state_id, gst_type_id]);

        if (existing) {
          // Update existing mapping (reactivate if soft-deleted)
          await query(`
            UPDATE states_gst_mapping 
            SET percentage = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP, updated_by = ?
            WHERE state_id = ? AND gst_type_id = ?
          `, [percentage, req.admin?.id || null, state_id, gst_type_id]);
          stateUpdated++;
        } else {
          // Create new mapping
          await query(`
            INSERT INTO states_gst_mapping 
            (state_id, gst_type_id, percentage, is_active, created_by)
            VALUES (?, ?, ?, 1, ?)
          `, [state_id, gst_type_id, percentage, req.admin?.id || null]);
          stateCreated++;
        }
      }

      totalCreated += stateCreated;
      totalUpdated += stateUpdated;
      totalSkipped += stateSkipped;
      processedStates++;
    }

    res.json({
      success: true,
      message: "Bulk state GST configurations updated successfully",
      summary: {
        processed_states: processedStates,
        total_created: totalCreated,
        total_updated: totalUpdated,
        total_skipped: totalSkipped,
        total_processed: totalCreated + totalUpdated
      }
    });
  } catch (error) {
    console.error("Bulk Create/Update States GST Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Delete GST configuration for a state (soft delete)
export async function deleteStateGSTConfig(req, res) {
  try {
    const { state_id } = req.params;
    const { gst_type_id } = req.body;

    if (gst_type_id) {
      // Delete specific GST type mapping for the state
      const result = await query(`
        UPDATE states_gst_mapping 
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE state_id = ? AND gst_type_id = ? AND is_active = 1
      `, [req.admin?.id || null, state_id, gst_type_id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "GST mapping not found or already deleted"
        });
      }

      res.json({
        success: true,
        message: "GST type mapping deleted successfully"
      });
    } else {
      // Delete all GST mappings for the state
      const result = await query(`
        UPDATE states_gst_mapping 
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE state_id = ? AND is_active = 1
      `, [req.admin?.id || null, state_id]);

      res.json({
        success: true,
        message: `All GST mappings for the state deleted successfully (${result.affectedRows} records affected)`
      });
    }
  } catch (error) {
    console.error("Delete State GST Config Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Debug function to check all GST mappings for a state (including soft-deleted)
export async function debugStateGSTMappings(req, res) {
  try {
    const { state_id } = req.params;

    const allMappings = await query(`
      SELECT 
        sgm.id,
        sgm.state_id,
        sgm.gst_type_id,
        sgm.percentage,
        sgm.is_active,
        sgm.created_at,
        sgm.updated_at,
        gtm.gst_type_name,
        gtm.gst_type_code
      FROM states_gst_mapping sgm
      LEFT JOIN gst_type_master gtm ON sgm.gst_type_id = gtm.id
      WHERE sgm.state_id = ?
      ORDER BY gtm.gst_type_code, sgm.created_at DESC
    `, [state_id]);

    res.json({
      success: true,
      data: {
        state_id: parseInt(state_id),
        all_mappings: allMappings,
        active_mappings: allMappings.filter(m => m.is_active === 1),
        inactive_mappings: allMappings.filter(m => m.is_active === 0),
        summary: {
          total: allMappings.length,
          active: allMappings.filter(m => m.is_active === 1).length,
          inactive: allMappings.filter(m => m.is_active === 0).length
        }
      }
    });
  } catch (error) {
    console.error("Debug State GST Mappings Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}