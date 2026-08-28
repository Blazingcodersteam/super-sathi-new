"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const alertsController = require("../Controllers/AlertsController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Get user alerts with pagination
router.get("/", auth_1.authenticateToken, alertsController.getAlerts);
// Mark specific alert as read
router.put("/:alert_id/read", auth_1.authenticateToken, alertsController.markAlertRead);
// Mark all alerts as read
router.put("/mark-all-read", auth_1.authenticateToken, alertsController.markAllAlertsRead);
// Delete specific alert
router.delete("/:alert_id", auth_1.authenticateToken, alertsController.deleteAlert);
// Get alert statistics
router.get("/stats", auth_1.authenticateToken, alertsController.getAlertStats);
exports.default = router;
//# sourceMappingURL=alertRoutes.js.map