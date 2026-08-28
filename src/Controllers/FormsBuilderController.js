"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFormBuilder = createFormBuilder;
exports.getFormBuilderByUser = getFormBuilderByUser;
exports.getFormBuilderByEvent = getFormBuilderByEvent;
exports.updateFormBuilder = updateFormBuilder;
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
const dotenv = require("dotenv");
const FormData = require("form-data");
const JWT_SECRET = process.env.JWT_SECRET_KEY;
async function createFormBuilder(req, res) {
    try {
        const user_id = req.user.user_id;
        const { event_id, form_type, form_id, fileds, form_title, form_description } = req.body;
        console.log(req.body);
        const created_at = new Date();
        const insertResult = await query(`INSERT INTO forms (
        user_id, event_id, form_type, form_id, fileds, form_title, form_description, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            user_id,
            event_id,
            form_type,
            form_id,
            JSON.stringify(fileds),
            form_title,
            form_description,
            1,
            created_at
        ]);
        const [createdForms] = await query(`SELECT * FROM forms WHERE id = ?`, [
            insertResult.insertId,
        ]);
        res.status(200).json({ success: true, forms: createdForms });
    }
    catch (err) {
        console.error("Create Form Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
async function getFormBuilderByUser(req, res) {
    try {
        const user_id = req.user.user_id;
        const { event_id, status } = req.body;
        const allStatuses = [
            "1",
            "2",
            "3",
            "4",
        ];
        let forms;
        if (status !== undefined) {
            forms = await query("SELECT * FROM forms WHERE event_id = ? AND status = ?", [user_id, status]);
        }
        else {
            forms = await query("SELECT * FROM forms WHERE event_id = ?", [
                event_id,
            ]);
        }
        // Get actual counts from DB
        const dbStatusCounts = await query(`SELECT status, COUNT(*) as count
      FROM forms
      WHERE event_id = ?
      GROUP BY status`, [event_id]);
        // Map DB results into an object
        const countMap = {};
        dbStatusCounts.forEach((row) => {
            countMap[row.status] = row.count;
        });
        // Build final status summary with all statuses accounted for
        const statusSummary = allStatuses.map((status_data) => ({
            status: status_data,
            count: countMap[status_data] || 0,
        }));
        res.status(200).json({
            success: true,
            forms,
            statusSummary,
        });
    }
    catch (err) {
        console.error("Get Tickets Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
async function getFormBuilderByEvent(req, res) {
    try {
        const user_id = req.user.user_id;
        const { event_id, status } = req.body;
        const allStatuses = [
            "1",
            "2",
            "3",
            "4",
        ];
        let forms;
        if (status !== undefined) {
            forms = await query("SELECT * FROM forms WHERE event_id = ? AND status = ?", [user_id, status]);
        }
        else {
            forms = await query("SELECT * FROM forms WHERE event_id = ?", [
                event_id,
            ]);
        }
        // Get actual counts from DB
        const dbStatusCounts = await query(`SELECT status, COUNT(*) as count
   FROM forms
   WHERE event_id = ?
   GROUP BY status`, [event_id]);
        // Map DB results into an object
        const countMap = {};
        dbStatusCounts.forEach((row) => {
            countMap[row.status] = row.count;
        });
        // Build final status summary with all statuses accounted for
        const statusSummary = allStatuses.map((status_data) => ({
            status: status_data,
            count: countMap[status_data] || 0,
        }));
        res.status(200).json({
            success: true,
            forms,
            statusSummary,
        });
    }
    catch (err) {
        console.error("Get Tickets By Event Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
async function updateFormBuilder(req, res) {
    try {
        const user_id = req.user.user_id;
        const { id, event_id, form_type, form_id, fileds, form_title, form_description, status } = req.body;
        const [existing] = await query("SELECT * FROM forms WHERE id = ? AND event_id = ?", [id, event_id]);
        if (!existing) {
            return res
                .status(404)
                .json({ success: false, message: "Ticket not found" });
        }
        await query(`UPDATE forms SET
      form_type = ?, form_id = ?, fileds = ?, form_title = ?, form_description = ?, status = ?
      WHERE id = ? AND event_id = ?`, [
            form_type,
            form_id,
            JSON.stringify(fileds),
            form_title,
            form_description,
            status,
            id,
            event_id,
        ]);
        const [updatedForms] = await query("SELECT * FROM forms WHERE id = ?", [
            id,
        ]);
        res.status(200).json({
            success: true,
            message: "Forms updated",
            ticket: updatedForms,
        });
    }
    catch (err) {
        console.error("Update Ticket Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
//# sourceMappingURL=FormsBuilderController.js.map