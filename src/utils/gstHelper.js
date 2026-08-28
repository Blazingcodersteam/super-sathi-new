"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GSTHelper = void 0;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
class GSTHelper {
    // Calculate GST based on user state (Rajasthan = CGST+SGST, Others = IGST)
    static async calculateGST(baseAmount, userStateId) {
        // Check if state ID is provided
        if (userStateId === null || userStateId === undefined) {
            throw new Error('Please update your location details to calculate GST');
        }
        // Rajasthan state_id = 33 (from database)
        const RAJASTHAN_STATE_ID = 33;
        // Get GST rates from database with tax_percentage
        const gstTypes = await query(`
      SELECT gst_type_code, gst_type_name,
             COALESCE(tax_percentage, 0.00) as tax_percentage
      FROM gst_type_master
      WHERE is_active = 1
      ORDER BY gst_type_code
    `);
        // Default rates if no GST types found in database
        let cgstRate = 9.00;
        let sgstRate = 9.00;
        let igstRate = 18.00;
        // Update rates from database if available
        if (gstTypes && gstTypes.length > 0) {
            const cgstType = gstTypes.find(g => g.gst_type_code === 'CGST');
            const sgstType = gstTypes.find(g => g.gst_type_code === 'SGST');
            const igstType = gstTypes.find(g => g.gst_type_code === 'IGST');
            if (cgstType)
                cgstRate = parseFloat(cgstType.tax_percentage) || 9.00;
            if (sgstType)
                sgstRate = parseFloat(sgstType.tax_percentage) || 9.00;
            if (igstType)
                igstRate = parseFloat(igstType.tax_percentage) || 18.00;
        }
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;
        let gstType;
        // GST Logic: Rajasthan = CGST + SGST, Other states = IGST
        if (userStateId === RAJASTHAN_STATE_ID) {
            // Rajasthan: Apply CGST + SGST
            cgstAmount = Math.round((baseAmount * cgstRate) / 100 * 100) / 100;
            sgstAmount = Math.round((baseAmount * sgstRate) / 100 * 100) / 100;
            gstType = 'CGST_SGST';
        }
        else {
            // All other states: Apply IGST
            igstAmount = Math.round((baseAmount * igstRate) / 100 * 100) / 100;
            gstType = 'IGST';
        }
        const totalGstAmount = cgstAmount + sgstAmount + igstAmount;
        const totalAmount = baseAmount + totalGstAmount;
        return {
            baseAmount,
            cgstAmount,
            sgstAmount,
            igstAmount,
            totalGstAmount,
            totalAmount,
            gstType,
            cgstRate,
            sgstRate,
            igstRate,
            gstTypes: gstTypes || []
        };
    }
    // Format GST breakdown for display
    static formatGSTBreakdown(gstCalc) {
        return Object.assign(Object.assign({ base_amount: gstCalc.baseAmount.toFixed(2), gst_type: gstCalc.gstType }, (gstCalc.gstType === 'CGST_SGST' ? {
            cgst: {
                rate: `${parseFloat(gstCalc.cgstRate.toString()).toFixed(2)}%`,
                amount: gstCalc.cgstAmount.toFixed(2)
            },
            sgst: {
                rate: `${parseFloat(gstCalc.sgstRate.toString()).toFixed(2)}%`,
                amount: gstCalc.sgstAmount.toFixed(2)
            }
        } : {
            igst: {
                rate: `${parseFloat(gstCalc.igstRate.toString()).toFixed(2)}%`,
                amount: gstCalc.igstAmount.toFixed(2)
            }
        })), { total_gst: gstCalc.totalGstAmount.toFixed(2), total_amount: gstCalc.totalAmount.toFixed(2), available_gst_types: gstCalc.gstTypes });
    }
}
exports.GSTHelper = GSTHelper;
//# sourceMappingURL=gstHelper.js.map