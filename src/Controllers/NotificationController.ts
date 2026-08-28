import { Request, Response } from 'express';
import * as utils from 'util';

const db = require('../database');
const query = utils.promisify(db.query).bind(db);

// ── Helper: insert a notification into user_alerts ──────────────────────────
export async function insertNotification({
  userId,
  alertTypeId,
  fromUserId,
  title,
  message,
  dataPayload = null,
}: {
  userId: number;
  alertTypeId: number;
  fromUserId: number | null;
  title: string;
  message: string;
  dataPayload?: object | null;
}) {
  await query(
    `INSERT INTO user_alerts (user_id, alert_type_id, from_user_id, title, message, data_payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, alertTypeId, fromUserId, title, message,
     dataPayload ? JSON.stringify(dataPayload) : null]
  );
}

// ── GET /api/notifications ───────────────────────────────────────────────────
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.user_id;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const notifications = await query(`
      SELECT
        ua.id,
        ua.alert_type_id,
        atm.type_name        AS type,
        atm.icon,
        ua.from_user_id,
        up.first_name        AS from_first_name,
        up.last_name         AS from_last_name,
        u.vivaaha_user_id    AS from_vivaaha_id,
        ph.photo_url         AS from_photo,
        ua.title,
        ua.message,
        ua.is_read,
        ua.read_at,
        ua.data_payload,
        ua.created_at
      FROM user_alerts ua
      LEFT JOIN alert_types_master atm ON ua.alert_type_id = atm.id
      LEFT JOIN users u               ON ua.from_user_id = u.id
      LEFT JOIN user_profiles up      ON u.id = up.user_id
      LEFT JOIN user_photos ph        ON u.id = ph.user_id
                                     AND ph.is_primary = TRUE
                                     AND ph.id = (
                                       SELECT id FROM user_photos
                                       WHERE user_id = u.id AND is_primary = TRUE
                                       ORDER BY upload_date DESC LIMIT 1
                                     )
      WHERE ua.user_id = ?
        AND (ua.from_user_id IS NULL OR ua.from_user_id NOT IN (
          SELECT target_user_id FROM user_actions WHERE user_id = ? AND action_type_id = 3
        ))
        AND (ua.from_user_id IS NULL OR ua.from_user_id NOT IN (
          SELECT user_id FROM user_actions WHERE target_user_id = ? AND action_type_id = 3
        ))
      ORDER BY ua.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, userId, userId, parseInt(limit as string), offset]);

    // Parse data_payload JSON string → object
    const parsed = notifications.map((n: any) => ({
      ...n,
      data_payload: n.data_payload
        ? (typeof n.data_payload === 'string' ? JSON.parse(n.data_payload) : n.data_payload)
        : null,
    }));

    // Unread count
    const [{ unread_count }] = await query(
      'SELECT COUNT(*) AS unread_count FROM user_alerts WHERE user_id = ? AND is_read = 0',
      [userId]
    );

    res.json({
      success: true,
      notifications: parsed,
      unread_count,
      total: parsed.length,
    });
  } catch (error) {
    console.error('getNotifications Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── GET /api/notifications/unread-count ─────────────────────────────────────
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.user_id;
    const [{ unread_count }] = await query(
      'SELECT COUNT(*) AS unread_count FROM user_alerts WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    res.json({ success: true, unread_count });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PUT /api/notifications/:id/read ─────────────────────────────────────────
export const markRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.user_id;
    const { id } = req.params;
    await query(
      'UPDATE user_alerts SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    res.json({ success: true, message: 'Marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── PUT /api/notifications/mark-all-read ────────────────────────────────────
export const markAllRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.user_id;
    await query(
      'UPDATE user_alerts SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ── POST /api/notifications/fcm-token ───────────────────────────────────────
export const saveFcmToken = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.user_id;
    const { fcm_token } = req.body;
    const token = typeof fcm_token === 'string' ? fcm_token.trim() : '';
    if (!token) {
      return res.status(400).json({ success: false, message: 'fcm_token is required' });
    }
    await query('UPDATE users SET fcm_token = ? WHERE id = ?', [token, userId]);
    console.log('[FCM] Token saved', { user_id: userId, token_suffix: token.slice(-8) });
    res.json({ success: true, message: 'FCM token saved' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
