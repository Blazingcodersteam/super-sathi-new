import { Router } from "express";
import * as alertsController from "../Controllers/AlertsController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Get user alerts with pagination
router.get("/", authenticateToken, alertsController.getAlerts);

// Mark specific alert as read
router.put("/:alert_id/read", authenticateToken, alertsController.markAlertRead);

// Mark all alerts as read
router.put("/mark-all-read", authenticateToken, alertsController.markAllAlertsRead);

// Delete specific alert
router.delete("/:alert_id", authenticateToken, alertsController.deleteAlert);

// Get alert statistics
router.get("/stats", authenticateToken, alertsController.getAlertStats);

export default router;