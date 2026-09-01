import * as utils from "util";
import { EmailOutboxPayload } from "./emailOutboxService";
import { EmailService } from "../Controllers/EmailService";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

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

export async function processAlertEmailJob(data: EmailOutboxPayload) {
  const startedAt = performance.now();
  const meta = data.meta || {};
  const logMeta = `event=${meta.event || "unknown"} receiver=${data.userId || "external"} sender=${meta.senderUserId ?? "n/a"} request=${meta.requestId || "n/a"}`;

  if (process.env.EMAIL_WORKER_FORCE_FAIL === "true") {
    throw new Error("EMAIL_WORKER_FORCE_FAIL=true forced email job failure");
  }

  let targetEmail = data.toEmail;
  let recipientName = data.recipientName || "User";

  if (!targetEmail && data.userId) {
    const [userRow] = await query(
      `SELECT u.email, up.first_name FROM users u
       JOIN user_profiles up ON u.id = up.user_id WHERE u.id = ?`,
      [data.userId]
    );
    targetEmail = userRow?.email;
    recipientName = userRow?.first_name ?? "User";
  }

  if (!targetEmail) {
    console.warn(`[EMAIL-OUTBOX-WORKER] alert email skipped: no recipient email/profile ${logMeta}`);
    return { skipped: true, reason: "missing-recipient-email-or-profile" };
  }

  const variables = {
    user_name: recipientName,
    ...data.variables,
  };

  const result = await EmailService.sendTemplateEmail(data.templateKey, targetEmail, variables, {
    fallbackSubject: data.fallbackSubject,
    fallbackHtml: data.fallbackHtml || defaultEmailHtml(data.fallbackSubject, data.fallbackBody),
    fallbackText: data.fallbackText || data.fallbackBody,
  });

  console.log(`[EMAIL-OUTBOX-WORKER] alert email processed ${logMeta} to=${data.toEmail ? "external" : data.userId} duration_ms=${Math.round(performance.now() - startedAt)}`);
  return result;
}




