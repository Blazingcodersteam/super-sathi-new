import * as utils from "util";
import { sendPushNotification } from '../utils/fcm';
import { EmailService } from './EmailService';

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

// ── Alert Type IDs (matches alert_types_master) ──────────────────────────────
const ALERT = {
  PROFILE_LIKE:       1,
  PROFILE_MATCH:      2,
  PROFILE_VIEW:       3,
  INTEREST_RECEIVED:  4,
  CONTACT_REQUEST:    5,
  INCOMING_CALL:      6,
  CALL_ACCEPTED:      7,
  CALL_DECLINED:      8,
  CALL_ENDED:         9,
  CALL_MISSED:        10,
  INTEREST_ACCEPTED:  11,
  INTEREST_DECLINED:  12,
  CONNECT_REQUEST:    13,
  CONNECT_ACCEPTED:   14,
  CONNECT_DECLINED:   15,
  PROFILE_VIEW_NEW:   16,
  SHORTLIST_ADDED:    17,
};

// ── Translation helper ────────────────────────────────────────────────────────
async function getTranslation(textKey: string, lang: string = 'en'): Promise<string> {
  try {
    const [translation] = await query(
      `SELECT en FROM translations WHERE text_key = ? AND status = 1 LIMIT 1`,
      [textKey]
    );
    return translation?.en || textKey;
  } catch (error) {
    console.error('Translation error:', error);
    return textKey;
  }
}

// ── Reusable email helper ────────────────────────────────────────────────────
async function sendAlertEmail(
  userId: number,
  templateKey: string,
  variables: Record<string, any>,
  fallbackSubject: string,
  fallbackBody: string
) {
  try {
    const [userRow] = await query(
      `SELECT u.email, up.first_name FROM users u
       JOIN user_profiles up ON u.id = up.user_id WHERE u.id = ?`,
      [userId]
    );
    if (!userRow?.email) return;
    const vars = { user_name: userRow.first_name ?? 'User', ...variables };
    await EmailService.sendTemplateEmail(templateKey, userRow.email, vars, {
      fallbackSubject,
      fallbackHtml: defaultEmailHtml(fallbackSubject, fallbackBody),
      fallbackText: fallbackBody,
    });
  } catch (err) {
    console.error(`[Alert] Email error [${templateKey}]:`, err);
  }
}

function defaultEmailHtml(title: string, body: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px">
    <div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08)">
      <div style="background:{{color_code}};padding:24px;text-align:center">
        <img src="{{site_logo}}" alt="{{sitename}}" style="max-height:50px">
      </div>
      <div style="padding:30px">
        <h2 style="color:#333;margin:0 0 16px">${title}</h2>
        <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 24px">${body}</p>
        <div style="text-align:center">
          <a href="{{site_url}}" style="background:{{color_code}};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Open App</a>
        </div>
      </div>
      <div style="background:#f1f1f1;padding:16px;text-align:center;font-size:12px;color:#999">
        &copy; {{current_year}} {{sitename}}. All rights reserved.
      </div>
    </div>
  </div>`;
}

// ── Internal helper ───────────────────────────────────────────────────────────
async function createAlert(
  userId: number,
  alertTypeId: number,
  fromUserId: number | null,
  title: string,
  message: string,
  messageParams: object = {},
  dataPayload: object | null = null
) {
  try {
    
    await query(
      `INSERT INTO user_alerts (user_id, alert_type_id, from_user_id, title, message, data_payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, alertTypeId, fromUserId, title, message,
       dataPayload ? JSON.stringify(dataPayload) : null]
    );

    // Send FCM push notification (app background / killed)
    try {
      const [userRow] = await query('SELECT fcm_token FROM users WHERE id = ?', [userId]);
      if (userRow?.fcm_token) {
        await sendPushNotification({
          token: userRow.fcm_token,
          title,
          body: message,
          data: {
            type: 'alert',
            alert_type_id: String(alertTypeId),
            from_user_id: fromUserId ? String(fromUserId) : '',
            ...(dataPayload ? Object.fromEntries(
              Object.entries(dataPayload as object).map(([k, v]) => [k, String(v)])
            ) : {}),
          },
        });
      }
    } catch (fcmErr: any) {
      if (fcmErr?.invalidToken) {
        await query('UPDATE users SET fcm_token = NULL WHERE id = ?', [userId]);
      } else {
        console.error('[Alert] FCM push error:', fcmErr?.message ?? fcmErr);
      }
    }
  } catch (error) {
    console.error("createAlert Error:", error);
  }
}

async function getSenderInfo(senderId: number): Promise<{name: string, displayName: string}> {
  const [p] = await query(
    `SELECT up.first_name, up.show_vivaaha_id, u.vivaaha_user_id,
            CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id 
                 ELSE CONCAT(up.first_name, ' ', COALESCE(up.last_name, '')) 
            END as display_name
     FROM user_profiles up 
     JOIN users u ON up.user_id = u.id 
     WHERE up.user_id = ?`, 
    [senderId]
  );
  return {
    name: p?.first_name ?? "Someone",
    displayName: p?.display_name ?? "Someone"
  };
}

// ── Chat alerts (used by chatRoutes) ─────────────────────────────────────────
export async function getAlerts(req, res) {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const alerts = await query(`
      SELECT
        ua.id,
        ua.title,
        ua.message,
        ua.is_read,
        ua.created_at,
        ua.data_payload,
        atm.type_name,
        atm.icon,
        up.first_name AS from_user_name,
        up.profile_picture AS from_user_picture,
        u.vivaaha_user_id AS from_user_vivaaha_id,
        CASE WHEN up.show_vivaaha_id = 1 THEN u.vivaaha_user_id 
             ELSE CONCAT(up.first_name, ' ', COALESCE(up.last_name, '')) 
        END as from_user_display_name,
        TIMESTAMPDIFF(MINUTE, ua.created_at, NOW()) AS minutes_ago
      FROM user_alerts ua
      LEFT JOIN alert_types_master atm ON ua.alert_type_id = atm.id
      LEFT JOIN user_profiles up ON ua.from_user_id = up.user_id
      LEFT JOIN users u ON ua.from_user_id = u.id
      WHERE ua.user_id = ?
      ORDER BY ua.created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, parseInt(limit), offset]);

    // Parse data_payload for each alert
    const processedAlerts = alerts.map(alert => ({
      ...alert,
      data_payload: alert.data_payload ? JSON.parse(alert.data_payload) : null
    }));

    const [{ count: unread_count }] = await query(
      "SELECT COUNT(*) AS count FROM user_alerts WHERE user_id = ? AND is_read = FALSE",
      [userId]
    );

    res.json({ success: true, alerts: processedAlerts, unread_count });
  } catch (error) {
    console.error("getAlerts Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

export async function markAlertRead(req, res) {
  try {
    const userId = req.user.user_id;
    const { alert_id } = req.params;
    await query(
      "UPDATE user_alerts SET is_read = TRUE, read_at = NOW() WHERE id = ? AND user_id = ?",
      [alert_id, userId]
    );
    res.json({ success: true, message: "Alert marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Mark all alerts as read
export async function markAllAlertsRead(req, res) {
  try {
    const userId = req.user.user_id;
    await query(
      "UPDATE user_alerts SET is_read = TRUE, read_at = NOW() WHERE user_id = ? AND is_read = FALSE",
      [userId]
    );
    res.json({ success: true, message: "All alerts marked as read" });
  } catch (error) {
    console.error("markAllAlertsRead Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Delete alert
export async function deleteAlert(req, res) {
  try {
    const userId = req.user.user_id;
    const { alert_id } = req.params;
    await query(
      "DELETE FROM user_alerts WHERE id = ? AND user_id = ?",
      [alert_id, userId]
    );
    res.json({ success: true, message: "Alert deleted successfully" });
  } catch (error) {
    console.error("deleteAlert Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// Get alert statistics
export async function getAlertStats(req, res) {
  try {
    const userId = req.user.user_id;
    
    const stats = await query(`
      SELECT 
        COUNT(*) as total_alerts,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_alerts,
        SUM(CASE WHEN alert_type_id = 4 THEN 1 ELSE 0 END) as interest_alerts,
        SUM(CASE WHEN alert_type_id = 13 THEN 1 ELSE 0 END) as connect_alerts,
        SUM(CASE WHEN alert_type_id = 3 THEN 1 ELSE 0 END) as profile_view_alerts,
        SUM(CASE WHEN alert_type_id = 1 THEN 1 ELSE 0 END) as profile_like_alerts
      FROM user_alerts 
      WHERE user_id = ?
    `, [userId]);
    
    res.json({ success: true, data: stats[0] });
  } catch (error) {
    console.error("getAlertStats Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ── Notification creators (called from other controllers) ─────────────────────

export async function createProfileLikeAlert(likedUserId: number, likerUserId: number) {
  const senderInfo = await getSenderInfo(likerUserId);
  await createAlert(
    likedUserId,
    ALERT.PROFILE_LIKE,
    likerUserId,
    `${senderInfo.displayName} liked your profile`,
    `${senderInfo.displayName} has liked your profile.`,
    {},
    { action: 'profile_like', sender_id: likerUserId }
  );
  await sendAlertEmail(
    likedUserId, 'profile_like',
    { sender_name: senderInfo.displayName },
    `${senderInfo.displayName} liked your profile`,
    `{{user_name}}, <strong>${senderInfo.displayName}</strong> has liked your profile. Check out their profile and see if it's a match!`
  );
}

export async function createProfileViewAlert(viewedUserId: number, viewerUserId: number) {
  const senderInfo = await getSenderInfo(viewerUserId);
  await createAlert(
    viewedUserId,
    ALERT.PROFILE_VIEW,
    viewerUserId,
    `${senderInfo.displayName} viewed your profile`,
    `${senderInfo.displayName} has viewed your profile.`,
    {},
    { action: 'profile_view', sender_id: viewerUserId }
  );
  await sendAlertEmail(
    viewedUserId, 'profile_view',
    { viewer_name: senderInfo.displayName },
    `${senderInfo.displayName} viewed your profile`,
    `{{user_name}}, <strong>${senderInfo.displayName}</strong> has viewed your profile. Visit their profile to see if you're a match!`
  );
}

// Interest received (alert_type_id = 4)
export async function createInterestAlert(receiverUserId: number, senderUserId: number) {
  const senderInfo = await getSenderInfo(senderUserId);
  await createAlert(
    receiverUserId,
    ALERT.INTEREST_RECEIVED,
    senderUserId,
    `${senderInfo.displayName} sent you an interest`,
    `${senderInfo.displayName} is interested in your profile. Check it out!`,
    {},
    { action: 'interest_received', sender_id: senderUserId }
  );
  await sendAlertEmail(
    receiverUserId, 'interest_received',
    { sender_name: senderInfo.displayName },
    `${senderInfo.displayName} sent you an interest`,
    `{{user_name}}, <strong>${senderInfo.displayName}</strong> is interested in your profile. Accept their interest to start connecting!`
  );
}

// Interest accepted (alert_type_id = 11) — notify original sender
export async function createInterestAcceptedAlert(senderUserId: number, acceptorUserId: number) {
  const acceptorInfo = await getSenderInfo(acceptorUserId);
  await createAlert(
    senderUserId,
    ALERT.INTEREST_ACCEPTED,
    acceptorUserId,
    `${acceptorInfo.displayName} accepted your interest`,
    `Great news! ${acceptorInfo.displayName} has accepted your interest.`,
    {},
    { action: 'interest_accepted', acceptor_id: acceptorUserId }
  );
  await sendAlertEmail(
    senderUserId, 'interest_accepted',
    { acceptor_name: acceptorInfo.displayName },
    `${acceptorInfo.displayName} accepted your interest! 🎉`,
    `Great news, {{user_name}}! <strong>${acceptorInfo.displayName}</strong> has accepted your interest. You can now send a connect request!`
  );
}

// Interest declined (alert_type_id = 12) — notify original sender
export async function createInterestDeclinedAlert(senderUserId: number, declinerUserId: number) {
  const declinerInfo = await getSenderInfo(declinerUserId);
  await createAlert(
    senderUserId,
    ALERT.INTEREST_DECLINED,
    declinerUserId,
    `${declinerInfo.displayName} declined your interest`,
    `${declinerInfo.displayName} has declined your interest request.`,
    {},
    { action: 'interest_declined', decliner_id: declinerUserId }
  );
  await sendAlertEmail(
    senderUserId, 'interest_declined',
    { decliner_name: declinerInfo.displayName },
    `Your interest was declined`,
    `{{user_name}}, <strong>${declinerInfo.displayName}</strong> has declined your interest. Don't give up — there are many more profiles waiting for you!`
  );
}

export async function createPhotoRequestAlert(receiverUserId: number, senderUserId: number) {
  const senderInfo = await getSenderInfo(senderUserId);
  await createAlert(
    receiverUserId,
    ALERT.CONTACT_REQUEST,
    senderUserId,
    `${senderInfo.displayName} sent a photo request`,
    `${senderInfo.displayName} has requested to view your photos.`,
    {},
    { action: 'photo_request', sender_id: senderUserId }
  );
  await sendAlertEmail(
    receiverUserId, 'photo_request',
    { sender_name: senderInfo.displayName },
    `${senderInfo.displayName} requested to view your photos`,
    `{{user_name}}, <strong>${senderInfo.displayName}</strong> has requested to view your photos. Open the app to approve or decline.`
  );
}

export async function createShortlistAlert(shortlistedUserId: number, shortlisterUserId: number) {
  const shortlisterInfo = await getSenderInfo(shortlisterUserId);
  await createAlert(
    shortlistedUserId,
    ALERT.SHORTLIST_ADDED,
    shortlisterUserId,
    `${shortlisterInfo.displayName} shortlisted you`,
    `${shortlisterInfo.displayName} has added you to their shortlist.`,
    {},
    { action: 'shortlist_added', shortlister_id: shortlisterUserId }
  );
  await sendAlertEmail(
    shortlistedUserId, 'shortlist_added',
    { shortlister_name: shortlisterInfo.displayName },
    `${shortlisterInfo.displayName} added you to their shortlist`,
    `{{user_name}}, <strong>${shortlisterInfo.displayName}</strong> has added you to their shortlist. This could be the beginning of something special!`
  );
}

// Connect request received (alert_type_id = 13)
export async function createConnectNowAlert(receiverUserId: number, senderUserId: number) {
  const senderInfo = await getSenderInfo(senderUserId);
  await createAlert(
    receiverUserId,
    ALERT.CONNECT_REQUEST,
    senderUserId,
    `${senderInfo.displayName} wants to connect`,
    `${senderInfo.displayName} has sent you a connect request.`,
    {},
    { action: 'connect_request', sender_id: senderUserId }
  );
  await sendAlertEmail(
    receiverUserId, 'connect_request',
    { sender_name: senderInfo.displayName },
    `${senderInfo.displayName} wants to connect with you`,
    `{{user_name}}, <strong>${senderInfo.displayName}</strong> has sent you a connect request. Accept to start chatting!`
  );
}

// Connect accepted (alert_type_id = 14) — notify original sender
export async function createConnectAcceptedAlert(senderUserId: number, acceptorUserId: number) {
  const acceptorInfo = await getSenderInfo(acceptorUserId);
  await createAlert(
    senderUserId,
    ALERT.CONNECT_ACCEPTED,
    acceptorUserId,
    `${acceptorInfo.displayName} accepted your connect request`,
    `You are now connected with ${acceptorInfo.displayName}. Start chatting!`,
    {},
    { action: 'connect_accepted', acceptor_id: acceptorUserId }
  );
  await sendAlertEmail(
    senderUserId, 'connect_accepted',
    { acceptor_name: acceptorInfo.displayName },
    `${acceptorInfo.displayName} accepted your connect request! 🎉`,
    `{{user_name}}, you are now connected with <strong>${acceptorInfo.displayName}</strong>. Open the app and start chatting!`
  );
}

// Connect declined (alert_type_id = 15) — notify original sender
export async function createConnectDeclinedAlert(senderUserId: number, declinerUserId: number) {
  const declinerInfo = await getSenderInfo(declinerUserId);
  await createAlert(
    senderUserId,
    ALERT.CONNECT_DECLINED,
    declinerUserId,
    `${declinerInfo.displayName} declined your connect request`,
    `${declinerInfo.displayName} has declined your connect request.`,
    {},
    { action: 'connect_declined', decliner_id: declinerUserId }
  );
  await sendAlertEmail(
    senderUserId, 'connect_declined',
    { decliner_name: declinerInfo.displayName },
    `Your connect request was declined`,
    `{{user_name}}, <strong>${declinerInfo.displayName}</strong> has declined your connect request. Keep exploring — your perfect match is out there!`
  );
}

// Call alerts (alert_type_ids 6-10) — called from CallController
export async function createCallAlert(
  userId: number,
  alertTypeId: number,
  fromUserId: number,
  title: string,
  message: string,
  messageParams: object = {},
  payload: object | null = null
) {
  await createAlert(userId, alertTypeId, fromUserId, title, message, {}, payload);
}
