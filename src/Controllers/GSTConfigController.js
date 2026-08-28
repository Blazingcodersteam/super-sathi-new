"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGSTConfig = getGSTConfig;
exports.updateGSTConfig = updateGSTConfig;
exports.getStateGSTMapping = getStateGSTMapping;
exports.updateStateGSTMapping = updateStateGSTMapping;
exports.bulkUpdateStateGSTMapping = bulkUpdateStateGSTMapping;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Get GST Configuration (using gst_type_master)
async function getGSTConfig(req, res) {
    try {
        // Get all active GST types from GST Type Master
        const gstTypes = await query(`
      SELECT id, gst_type_name, gst_type_code, description, is_active, created_at, updated_at 
      FROM gst_type_master 
      WHERE is_active = 1 
      ORDER BY gst_type_code
    `);
        // Get state GST mapping with state and GST type details
        const stateMapping = await query(`
      SELECT 
        sgm.id,
        sgm.state_id,
        sgm.gst_type_id,
        sgm.percentage,
        sgm.is_active,
        sm.state_name,
        gtm.gst_type_name,
        gtm.gst_type_code
      FROM states_gst_mapping sgm
      LEFT JOIN states_master sm ON sgm.state_id = sm.id
      LEFT JOIN gst_type_master gtm ON sgm.gst_type_id = gtm.id
      WHERE sgm.is_active = 1
      ORDER BY sm.state_name, gtm.gst_type_code
    `);
        res.json({
            success: true,
            data: {
                gst_types: gstTypes,
                state_mapping: stateMapping,
                summary: {
                    total_gst_types: gstTypes.length,
                    active_gst_types: gstTypes.filter(type => type.is_active === 1).length,
                    total_mappings: stateMapping.length,
                    unique_states: [...new Set(stateMapping.map(m => m.state_id))].length
                }
            }
        });
    }
    catch (error) {
        console.error("Get GST Config Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update GST Configuration (this now manages GST types instead of static rates)
async function updateGSTConfig(req, res) {
    try {
        const { gst_types } = req.body;
        if (!gst_types || !Array.isArray(gst_types)) {
            return res.status(400).json({
                success: false,
                message: "gst_types array is required"
            });
        }
        // Validate each GST type
        for (const gstType of gst_types) {
            const { id, gst_type_name, gst_type_code, is_active } = gstType;
            if (!id || !gst_type_name || !gst_type_code) {
                return res.status(400).json({
                    success: false,
                    message: "Each GST type must have id, gst_type_name, and gst_type_code"
                });
            }
            // Update the GST type
            await query(`
        UPDATE gst_type_master 
        SET gst_type_name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND gst_type_code = ?
      `, [gst_type_name, is_active || 1, id, gst_type_code]);
        }
        res.json({
            success: true,
            message: "GST configuration updated successfully"
        });
    }
    catch (error) {
        console.error("Update GST Config Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get State GST Mapping
async function getStateGSTMapping(req, res) {
    try {
        const mappings = await query(`
      SELECT 
        sgm.id,
        sgm.state_id,
        sgm.gst_type_id,
        sgm.percentage,
        sgm.is_active,
        sgm.created_at,
        sgm.updated_at,
        sm.state_name,
        gtm.gst_type_name,
        gtm.gst_type_code
      FROM states_gst_mapping sgm
      LEFT JOIN states_master sm ON sgm.state_id = sm.id
      LEFT JOIN gst_type_master gtm ON sgm.gst_type_id = gtm.id
      WHERE sgm.is_active = 1
      ORDER BY sm.state_name, gtm.gst_type_code
    `);
        res.json({
            success: true,
            data: mappings,
            summary: {
                total_mappings: mappings.length,
                unique_states: [...new Set(mappings.map(m => m.state_id))].length,
                unique_gst_types: [...new Set(mappings.map(m => m.gst_type_id))].length
            }
        });
    }
    catch (error) {
        console.error("Get State GST Mapping Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Update State GST Mapping
async function updateStateGSTMapping(req, res) {
    try {
        const { state_id, gst_mappings } = req.body;
        if (!state_id || !gst_mappings || !Array.isArray(gst_mappings)) {
            return res.status(400).json({
                success: false,
                message: "state_id and gst_mappings array are required"
            });
        }
        // Validate state exists
        const [stateMaster] = await query(`
      SELECT id FROM states_master WHERE id = ?
    `, [state_id]);
        if (!stateMaster) {
            return res.status(404).json({
                success: false,
                message: "State not found"
            });
        }
        let updatedCount = 0;
        let createdCount = 0;
        for (const mapping of gst_mappings) {
            const { gst_type_id, percentage } = mapping;
            if (!gst_type_id || percentage === undefined)
                continue;
            // Check if mapping exists
            const [existing] = await query(`
        SELECT id FROM states_gst_mapping WHERE state_id = ? AND gst_type_id = ?
      `, [state_id, gst_type_id]);
            if (existing) {
                // Update existing mapping
                await query(`
          UPDATE states_gst_mapping 
          SET percentage = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE state_id = ? AND gst_type_id = ?
        `, [percentage, state_id, gst_type_id]);
                updatedCount++;
            }
            else {
                // Create new mapping
                await query(`
          INSERT INTO states_gst_mapping (state_id, gst_type_id, percentage, is_active)
          VALUES (?, ?, ?, 1)
        `, [state_id, gst_type_id, percentage]);
                createdCount++;
            }
        }
        res.json({
            success: true,
            message: "State GST mapping updated successfully",
            summary: {
                updated: updatedCount,
                created: createdCount,
                total_processed: updatedCount + createdCount
            }
        });
    }
    catch (error) {
        console.error("Update State GST Mapping Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Bulk Update State GST Mapping
async function bulkUpdateStateGSTMapping(req, res) {
    try {
        const { bulk_mappings } = req.body;
        if (!bulk_mappings || !Array.isArray(bulk_mappings)) {
            return res.status(400).json({
                success: false,
                message: "bulk_mappings array is required"
            });
        }
        let totalUpdated = 0;
        let totalCreated = 0;
        let processedStates = 0;
        for (const stateMapping of bulk_mappings) {
            const { state_id, gst_mappings } = stateMapping;
            if (!state_id || !gst_mappings || !Array.isArray(gst_mappings))
                continue;
            // Validate state exists
            const [stateMaster] = await query(`
        SELECT id FROM states_master WHERE id = ?
      `, [state_id]);
            if (!stateMaster)
                continue;
            let stateUpdated = 0;
            let stateCreated = 0;
            for (const mapping of gst_mappings) {
                const { gst_type_id, percentage } = mapping;
                if (!gst_type_id || percentage === undefined)
                    continue;
                // Check if mapping exists
                const [existing] = await query(`
          SELECT id FROM states_gst_mapping WHERE state_id = ? AND gst_type_id = ?
        `, [state_id, gst_type_id]);
                if (existing) {
                    // Update existing mapping
                    await query(`
            UPDATE states_gst_mapping 
            SET percentage = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE state_id = ? AND gst_type_id = ?
          `, [percentage, state_id, gst_type_id]);
                    stateUpdated++;
                }
                else {
                    // Create new mapping
                    await query(`
            INSERT INTO states_gst_mapping (state_id, gst_type_id, percentage, is_active)
            VALUES (?, ?, ?, 1)
          `, [state_id, gst_type_id, percentage]);
                    stateCreated++;
                }
            }
            totalUpdated += stateUpdated;
            totalCreated += stateCreated;
            processedStates++;
        }
        res.json({
            success: true,
            message: "Bulk state GST mappings updated successfully",
            summary: {
                processed_states: processedStates,
                total_updated: totalUpdated,
                total_created: totalCreated,
                total_processed: totalUpdated + totalCreated
            }
        });
    }
    catch (error) {
        console.error("Bulk Update State GST Mapping Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=GSTConfigController.js.map