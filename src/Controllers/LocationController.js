"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCitiesByState = getCitiesByState;
exports.getAllCities = getAllCities;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
// Get Cities by State
async function getCitiesByState(req, res) {
    try {
        const { state_id } = req.params;
        if (!state_id) {
            return res.status(400).json({
                success: false,
                message: "State ID is required"
            });
        }
        const cities = await query(`
      SELECT * FROM cities_master 
      WHERE state_id = ? AND status = 1 
      ORDER BY city_name
    `, [state_id]);
        res.json({
            success: true,
            cities
        });
    }
    catch (error) {
        console.error("Get Cities by State Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
// Get All Cities
async function getAllCities(req, res) {
    try {
        const cities = await query(`
      SELECT c.*, s.state_name, co.country_name
      FROM cities_master c
      LEFT JOIN states_master s ON c.state_id = s.id
      LEFT JOIN country_code_master co ON c.country_id = co.id
      WHERE c.status = 1
      ORDER BY c.city_name
    `);
        res.json({
            success: true,
            cities
        });
    }
    catch (error) {
        console.error("Get All Cities Error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=LocationController.js.map