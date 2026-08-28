import * as utils from "util";
import { Request, Response } from "express";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

export class GoogleAnalyticsController {
  // Get Google Analytics settings
  static async getSettings(req: Request, res: Response) {
    try {
      const settingsQuery = `
        SELECT 
          id,
          is_active,
          analytics_key,
          status,
          created_at,
          updated_at
        FROM google_analytics_settings 
        WHERE status = 'active'
        ORDER BY created_at DESC 
        LIMIT 1
      `;

      const settings = await query(settingsQuery);

      if (settings.length === 0) {
        // Create default settings if none exist
        const defaultSettings = await GoogleAnalyticsController.createDefaultSettings();
        return res.json({
          success: true,
          data: defaultSettings
        });
      }

      res.json({
        success: true,
        data: settings[0]
      });
    } catch (error) {
      console.error("Error fetching Google Analytics settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch Google Analytics settings",
        error: error.message
      });
    }
  }

  // Update Google Analytics settings
  static async updateSettings(req: Request, res: Response) {
    try {
      const {
        is_active,
        analytics_key
      } = req.body;

      // Validation
      if (typeof is_active !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: "is_active must be a boolean value"
        });
      }

      if (!analytics_key || typeof analytics_key !== 'string') {
        return res.status(400).json({
          success: false,
          message: "analytics_key is required and must be a string"
        });
      }

      // Validate Google Analytics key format (basic validation)
      const gaKeyPattern = /^(G-[A-Z0-9]{10}|UA-\d{4,9}-\d{1,4}|GT-[A-Z0-9]{7,12})$/;
      if (analytics_key.trim() && !gaKeyPattern.test(analytics_key.trim())) {
        return res.status(400).json({
          success: false,
          message: "Invalid Google Analytics key format. Expected formats: G-XXXXXXXXXX, UA-XXXXXXXX-X, or GT-XXXXXXXX"
        });
      }

      // Get current settings
      const currentSettings = await query(
        "SELECT id FROM google_analytics_settings WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
      );

      let settingsId;

      if (currentSettings.length === 0) {
        // Create new settings if none exist
        const insertQuery = `
          INSERT INTO google_analytics_settings 
          (is_active, analytics_key, status)
          VALUES (?, ?, 'active')
        `;

        const result = await query(insertQuery, [
          is_active,
          analytics_key.trim()
        ]);

        settingsId = result.insertId;
      } else {
        // Update existing settings
        settingsId = currentSettings[0].id;

        const updateQuery = `
          UPDATE google_analytics_settings 
          SET 
            is_active = ?,
            analytics_key = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;

        await query(updateQuery, [
          is_active,
          analytics_key.trim(),
          settingsId
        ]);
      }

      // Get updated settings
      const updatedSettings = await query(
        "SELECT * FROM google_analytics_settings WHERE id = ?",
        [settingsId]
      );

      res.json({
        success: true,
        message: "Google Analytics settings updated successfully",
        data: updatedSettings[0]
      });
    } catch (error) {
      console.error("Error updating Google Analytics settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update Google Analytics settings",
        error: error.message
      });
    }
  }

  // Toggle Google Analytics activation
  static async toggleActivation(req: Request, res: Response) {
    try {
      // Get current settings
      const currentSettings = await query(
        "SELECT id, is_active FROM google_analytics_settings WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
      );

      if (currentSettings.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Google Analytics settings not found"
        });
      }

      const newStatus = !currentSettings[0].is_active;

      // Update activation status
      await query(
        "UPDATE google_analytics_settings SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [newStatus, currentSettings[0].id]
      );

      // Get updated settings
      const updatedSettings = await query(
        "SELECT * FROM google_analytics_settings WHERE id = ?",
        [currentSettings[0].id]
      );

      res.json({
        success: true,
        message: `Google Analytics ${newStatus ? 'activated' : 'deactivated'} successfully`,
        data: updatedSettings[0]
      });
    } catch (error) {
      console.error("Error toggling Google Analytics activation:", error);
      res.status(500).json({
        success: false,
        message: "Failed to toggle Google Analytics activation",
        error: error.message
      });
    }
  }

  // Get Google Analytics status for frontend
  static async getStatus(req: Request, res: Response) {
    try {
      const statusQuery = `
        SELECT 
          is_active,
          analytics_key,
          CASE 
            WHEN is_active = 1 AND analytics_key != '' THEN 'enabled'
            WHEN is_active = 0 THEN 'disabled'
            ELSE 'not_configured'
          END as configuration_status
        FROM google_analytics_settings 
        WHERE status = 'active'
        ORDER BY created_at DESC 
        LIMIT 1
      `;

      const status = await query(statusQuery);

      if (status.length === 0) {
        return res.json({
          success: true,
          data: {
            is_active: false,
            analytics_key: '',
            configuration_status: 'not_configured'
          }
        });
      }

      res.json({
        success: true,
        data: status[0]
      });
    } catch (error) {
      console.error("Error fetching Google Analytics status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch Google Analytics status",
        error: error.message
      });
    }
  }

  // Reset Google Analytics settings
  static async resetSettings(req: Request, res: Response) {
    try {
      // Get current settings
      const currentSettings = await query(
        "SELECT id FROM google_analytics_settings WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
      );

      if (currentSettings.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Google Analytics settings not found"
        });
      }

      // Reset to default values
      await query(
        "UPDATE google_analytics_settings SET is_active = 0, analytics_key = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [currentSettings[0].id]
      );

      // Get updated settings
      const updatedSettings = await query(
        "SELECT * FROM google_analytics_settings WHERE id = ?",
        [currentSettings[0].id]
      );

      res.json({
        success: true,
        message: "Google Analytics settings reset successfully",
        data: updatedSettings[0]
      });
    } catch (error) {
      console.error("Error resetting Google Analytics settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to reset Google Analytics settings",
        error: error.message
      });
    }
  }

  // Get Google Analytics history/logs
  static async getHistory(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM google_analytics_settings 
        WHERE status = 'active'
      `;
      const countResult = await query(countQuery);
      const total = countResult[0].total;

      // Get history with pagination
      const historyQuery = `
        SELECT 
          id,
          is_active,
          analytics_key,
          status,
          created_at,
          updated_at
        FROM google_analytics_settings 
        WHERE status = 'active'
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `;

      const history = await query(historyQuery, [limit, offset]);

      res.json({
        success: true,
        data: {
          history,
          pagination: {
            current_page: page,
            per_page: limit,
            total,
            total_pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error("Error fetching Google Analytics history:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch Google Analytics history",
        error: error.message
      });
    }
  }

  // Validate Google Analytics key
  static async validateKey(req: Request, res: Response) {
    try {
      const { analytics_key } = req.body;

      if (!analytics_key || typeof analytics_key !== 'string') {
        return res.status(400).json({
          success: false,
          message: "analytics_key is required"
        });
      }

      // Validate Google Analytics key format
      const gaKeyPattern = /^(G-[A-Z0-9]{10}|UA-\d{4,9}-\d{1,4}|GT-[A-Z0-9]{7,12})$/;
      const isValid = gaKeyPattern.test(analytics_key.trim());

      let keyType = 'unknown';
      if (analytics_key.startsWith('G-')) {
        keyType = 'Google Analytics 4 (GA4)';
      } else if (analytics_key.startsWith('UA-')) {
        keyType = 'Universal Analytics (Legacy)';
      } else if (analytics_key.startsWith('GT-')) {
        keyType = 'Google Tag Manager';
      }

      res.json({
        success: true,
        data: {
          analytics_key: analytics_key.trim(),
          is_valid: isValid,
          key_type: keyType,
          message: isValid 
            ? `Valid ${keyType} key` 
            : 'Invalid Google Analytics key format. Expected formats: G-XXXXXXXXXX, UA-XXXXXXXX-X, or GT-XXXXXXXX'
        }
      });
    } catch (error) {
      console.error("Error validating Google Analytics key:", error);
      res.status(500).json({
        success: false,
        message: "Failed to validate Google Analytics key",
        error: error.message
      });
    }
  }

  // Helper method to create default settings
  private static async createDefaultSettings() {
    const insertQuery = `
      INSERT INTO google_analytics_settings 
      (is_active, analytics_key, status)
      VALUES (0, '', 'active')
    `;

    const result = await query(insertQuery);

    const newSettings = await query(
      "SELECT * FROM google_analytics_settings WHERE id = ?",
      [result.insertId]
    );

    return newSettings[0];
  }
}