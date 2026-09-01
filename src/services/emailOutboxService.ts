require("dotenv").config();

import * as utils from "util";

const db = require("../database");
const query = utils.promisify(db.query).bind(db);

export type EmailOutboxPayload = {
  kind: "alert-email";
  userId?: number;
  toEmail?: string;
  recipientName?: string;
  templateKey: string;
  variables: Record<string, any>;
  fallbackSubject: string;
  fallbackBody: string;
  fallbackHtml?: string;
  fallbackText?: string;
  meta?: {
    event?: string;
    senderUserId?: number;
    receiverUserId?: number;
    requestId?: string;
    connectionId?: number;
  };
};

export type EmailOutboxJob = {
  id: number;
  job_type: string;
  event_key: string;
  deduplication_key: string;
  payload: string;
  status: "PENDING" | "PROCESSING" | "SENT" | "FAILED";
  attempts: number;
  max_attempts: number;
};

function parseIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function dateBeforeNow(ms: number): Date {
  return new Date(Date.now() - ms);
}

export const EMAIL_OUTBOX_MAX_ATTEMPTS = parseIntEnv("EMAIL_OUTBOX_MAX_ATTEMPTS", 5);
export const EMAIL_OUTBOX_BASE_BACKOFF_MS = parseIntEnv("EMAIL_OUTBOX_BASE_BACKOFF_MS", 60000);
export const EMAIL_OUTBOX_POLL_INTERVAL_MS = parseIntEnv("EMAIL_OUTBOX_POLL_INTERVAL_MS", 2000);
export const EMAIL_OUTBOX_BATCH_SIZE = parseIntEnv("EMAIL_OUTBOX_BATCH_SIZE", 5);
export const EMAIL_OUTBOX_SENT_RETENTION_DAYS = parseIntEnv("EMAIL_OUTBOX_SENT_RETENTION_DAYS", 30);
export const EMAIL_OUTBOX_CLEANUP_INTERVAL_MS = parseIntEnv("EMAIL_OUTBOX_CLEANUP_INTERVAL_MS", 3600000);
export const EMAIL_OUTBOX_CLEANUP_BATCH_SIZE = parseIntEnv("EMAIL_OUTBOX_CLEANUP_BATCH_SIZE", 500);
export const EMAIL_OUTBOX_PROCESSING_TIMEOUT_MS = parseIntEnv("EMAIL_OUTBOX_PROCESSING_TIMEOUT_MS", 900000);

export function getConnectRequestEmailDeduplicationKey(connectionRequestId: number): string {
  return `connect-request-email:${connectionRequestId}`;
}

export function getAlertEmailDeduplicationKey(eventKey: string, alertId: number): string {
  return `${eventKey}-email:${alertId}`;
}

export async function enqueueEmailOutboxJob(params: {
  jobType: string;
  eventKey: string;
  deduplicationKey: string;
  payload: EmailOutboxPayload;
  maxAttempts?: number;
}) {
  const result = await query(
    `INSERT INTO email_outbox
       (job_type, event_key, deduplication_key, payload, status, attempts, max_attempts, next_attempt_at)
     VALUES (?, ?, ?, ?, 'PENDING', 0, ?, NOW())
     ON DUPLICATE KEY UPDATE updated_at = updated_at`,
    [
      params.jobType,
      params.eventKey,
      params.deduplicationKey,
      JSON.stringify(params.payload),
      params.maxAttempts || EMAIL_OUTBOX_MAX_ATTEMPTS,
    ]
  );

  const [row] = await query(
    "SELECT id, status, attempts, max_attempts FROM email_outbox WHERE deduplication_key = ? LIMIT 1",
    [params.deduplicationKey]
  );

  return {
    id: row?.id || result.insertId,
    status: row?.status,
    attempts: row?.attempts,
    maxAttempts: row?.max_attempts,
    duplicate: !result.insertId,
  };
}

function getConnection() {
  return new Promise<any>((resolve, reject) => {
    db.getConnection((error, connection) => {
      if (error) reject(error);
      else resolve(connection);
    });
  });
}

function connectionQuery(connection, sql: string, params: any[] = []) {
  return new Promise<any>((resolve, reject) => {
    connection.query(sql, params, (error, results) => {
      if (error) reject(error);
      else resolve(results);
    });
  });
}

function beginTransaction(connection) {
  return new Promise<void>((resolve, reject) => {
    connection.beginTransaction((error) => error ? reject(error) : resolve());
  });
}

function commit(connection) {
  return new Promise<void>((resolve, reject) => {
    connection.commit((error) => error ? reject(error) : resolve());
  });
}

function rollback(connection) {
  return new Promise<void>((resolve) => {
    connection.rollback(() => resolve());
  });
}

export async function claimNextEmailOutboxJob(): Promise<EmailOutboxJob | null> {
  const connection = await getConnection();
  try {
    await beginTransaction(connection);
    const rows = await connectionQuery(
      connection,
      `SELECT id
       FROM email_outbox
       WHERE status IN ('PENDING', 'FAILED')
         AND attempts < max_attempts
         AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC, id ASC
       LIMIT 1`
    );

    if (!rows.length) {
      await commit(connection);
      return null;
    }

    const candidateId = rows[0].id;
    const updateResult = await connectionQuery(
      connection,
      `UPDATE email_outbox
       SET status = 'PROCESSING', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND status IN ('PENDING', 'FAILED')
         AND attempts < max_attempts
         AND next_attempt_at <= NOW()`,
      [candidateId]
    );

    if (updateResult.affectedRows !== 1) {
      await commit(connection);
      return null;
    }

    const claimedRows = await connectionQuery(
      connection,
      `SELECT id, job_type, event_key, deduplication_key, payload, status, attempts, max_attempts
       FROM email_outbox
       WHERE id = ?`,
      [candidateId]
    );
    await commit(connection);
    return claimedRows[0] || null;
  } catch (error) {
    await rollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

export async function markEmailOutboxJobSent(jobId: number) {
  await query(
    "UPDATE email_outbox SET status = 'SENT', processed_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [jobId]
  );
}

export function getNextAttemptDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return EMAIL_OUTBOX_BASE_BACKOFF_MS * Math.pow(2, exponent);
}

export async function markEmailOutboxJobFailed(job: EmailOutboxJob, error: any) {
  const message = String(error?.message || error || "Unknown email outbox worker error").slice(0, 4000);
  const permanent = job.attempts >= job.max_attempts;
  const delayMs = permanent ? 0 : getNextAttemptDelayMs(job.attempts);

  await query(
    `UPDATE email_outbox
     SET status = 'FAILED',
         last_error = ?,
         next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MICROSECOND),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [message, delayMs * 1000, job.id]
  );

  return { permanent, delayMs };
}

export async function cleanupOldSentEmailOutboxJobs(batchSize = EMAIL_OUTBOX_CLEANUP_BATCH_SIZE) {
  const cutoff = dateBeforeNow(EMAIL_OUTBOX_SENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await query(
    `DELETE FROM email_outbox
     WHERE status = 'SENT'
       AND processed_at IS NOT NULL
       AND processed_at < ?
     ORDER BY processed_at ASC, id ASC
     LIMIT ?`,
    [cutoff, batchSize]
  );

  return result?.affectedRows || 0;
}

export async function recoverStaleProcessingEmailOutboxJobs(batchSize = EMAIL_OUTBOX_CLEANUP_BATCH_SIZE) {
  const cutoff = dateBeforeNow(EMAIL_OUTBOX_PROCESSING_TIMEOUT_MS);
  const result = await query(
    `UPDATE email_outbox
     SET status = 'FAILED',
         last_error = CONCAT('Recovered stale PROCESSING job after worker timeout. Previous error: ', COALESCE(last_error, '')),
         next_attempt_at = CASE WHEN attempts < max_attempts THEN NOW() ELSE next_attempt_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'PROCESSING'
       AND updated_at < ?
     ORDER BY updated_at ASC, id ASC
     LIMIT ?`,
    [cutoff, batchSize]
  );

  return result?.affectedRows || 0;
}

export function closeEmailOutboxDbPool(): Promise<void> {
  return new Promise((resolve) => {
    if (!db?.end) return resolve();
    db.end((error) => {
      if (error) console.error("[EMAIL-OUTBOX-WORKER] DB pool close error", { message: error?.message });
      resolve();
    });
  });
}

export function parseEmailOutboxPayload(job: EmailOutboxJob): EmailOutboxPayload {
  return typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
}



