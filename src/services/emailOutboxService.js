"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_OUTBOX_PROCESSING_TIMEOUT_MS = exports.EMAIL_OUTBOX_CLEANUP_BATCH_SIZE = exports.EMAIL_OUTBOX_CLEANUP_INTERVAL_MS = exports.EMAIL_OUTBOX_SENT_RETENTION_DAYS = exports.EMAIL_OUTBOX_BATCH_SIZE = exports.EMAIL_OUTBOX_POLL_INTERVAL_MS = exports.EMAIL_OUTBOX_BASE_BACKOFF_MS = exports.EMAIL_OUTBOX_MAX_ATTEMPTS = void 0;
exports.getConnectRequestEmailDeduplicationKey = getConnectRequestEmailDeduplicationKey;
exports.getAlertEmailDeduplicationKey = getAlertEmailDeduplicationKey;
exports.enqueueEmailOutboxJob = enqueueEmailOutboxJob;
exports.claimNextEmailOutboxJob = claimNextEmailOutboxJob;
exports.markEmailOutboxJobSent = markEmailOutboxJobSent;
exports.getNextAttemptDelayMs = getNextAttemptDelayMs;
exports.markEmailOutboxJobFailed = markEmailOutboxJobFailed;
exports.cleanupOldSentEmailOutboxJobs = cleanupOldSentEmailOutboxJobs;
exports.recoverStaleProcessingEmailOutboxJobs = recoverStaleProcessingEmailOutboxJobs;
exports.closeEmailOutboxDbPool = closeEmailOutboxDbPool;
exports.parseEmailOutboxPayload = parseEmailOutboxPayload;
require("dotenv").config();
const utils = require("util");
const db = require("../database");
const query = utils.promisify(db.query).bind(db);
function parseIntEnv(name, fallback) {
    const value = Number.parseInt(process.env[name] || "", 10);
    return Number.isFinite(value) ? value : fallback;
}
function dateBeforeNow(ms) {
    return new Date(Date.now() - ms);
}
exports.EMAIL_OUTBOX_MAX_ATTEMPTS = parseIntEnv("EMAIL_OUTBOX_MAX_ATTEMPTS", 5);
exports.EMAIL_OUTBOX_BASE_BACKOFF_MS = parseIntEnv("EMAIL_OUTBOX_BASE_BACKOFF_MS", 60000);
exports.EMAIL_OUTBOX_POLL_INTERVAL_MS = parseIntEnv("EMAIL_OUTBOX_POLL_INTERVAL_MS", 2000);
exports.EMAIL_OUTBOX_BATCH_SIZE = parseIntEnv("EMAIL_OUTBOX_BATCH_SIZE", 5);
exports.EMAIL_OUTBOX_SENT_RETENTION_DAYS = parseIntEnv("EMAIL_OUTBOX_SENT_RETENTION_DAYS", 30);
exports.EMAIL_OUTBOX_CLEANUP_INTERVAL_MS = parseIntEnv("EMAIL_OUTBOX_CLEANUP_INTERVAL_MS", 3600000);
exports.EMAIL_OUTBOX_CLEANUP_BATCH_SIZE = parseIntEnv("EMAIL_OUTBOX_CLEANUP_BATCH_SIZE", 500);
exports.EMAIL_OUTBOX_PROCESSING_TIMEOUT_MS = parseIntEnv("EMAIL_OUTBOX_PROCESSING_TIMEOUT_MS", 900000);
function getConnectRequestEmailDeduplicationKey(connectionRequestId) {
    return `connect-request-email:${connectionRequestId}`;
}
function getAlertEmailDeduplicationKey(eventKey, alertId) {
    return `${eventKey}-email:${alertId}`;
}
async function enqueueEmailOutboxJob(params) {
    const result = await query(`INSERT INTO email_outbox
       (job_type, event_key, deduplication_key, payload, status, attempts, max_attempts, next_attempt_at)
     VALUES (?, ?, ?, ?, 'PENDING', 0, ?, NOW())
     ON DUPLICATE KEY UPDATE updated_at = updated_at`, [
        params.jobType,
        params.eventKey,
        params.deduplicationKey,
        JSON.stringify(params.payload),
        params.maxAttempts || exports.EMAIL_OUTBOX_MAX_ATTEMPTS,
    ]);
    const [row] = await query("SELECT id, status, attempts, max_attempts FROM email_outbox WHERE deduplication_key = ? LIMIT 1", [params.deduplicationKey]);
    return {
        id: (row === null || row === void 0 ? void 0 : row.id) || result.insertId,
        status: row === null || row === void 0 ? void 0 : row.status,
        attempts: row === null || row === void 0 ? void 0 : row.attempts,
        maxAttempts: row === null || row === void 0 ? void 0 : row.max_attempts,
        duplicate: !result.insertId,
    };
}
function getConnection() {
    return new Promise((resolve, reject) => {
        db.getConnection((error, connection) => {
            if (error)
                reject(error);
            else
                resolve(connection);
        });
    });
}
function connectionQuery(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, params, (error, results) => {
            if (error)
                reject(error);
            else
                resolve(results);
        });
    });
}
function beginTransaction(connection) {
    return new Promise((resolve, reject) => {
        connection.beginTransaction((error) => error ? reject(error) : resolve());
    });
}
function commit(connection) {
    return new Promise((resolve, reject) => {
        connection.commit((error) => error ? reject(error) : resolve());
    });
}
function rollback(connection) {
    return new Promise((resolve) => {
        connection.rollback(() => resolve());
    });
}
async function claimNextEmailOutboxJob() {
    const connection = await getConnection();
    try {
        await beginTransaction(connection);
        const rows = await connectionQuery(connection, `SELECT id
       FROM email_outbox
       WHERE status IN ('PENDING', 'FAILED')
         AND attempts < max_attempts
         AND next_attempt_at <= NOW()
       ORDER BY next_attempt_at ASC, id ASC
       LIMIT 1`);
        if (!rows.length) {
            await commit(connection);
            return null;
        }
        const candidateId = rows[0].id;
        const updateResult = await connectionQuery(connection, `UPDATE email_outbox
       SET status = 'PROCESSING', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND status IN ('PENDING', 'FAILED')
         AND attempts < max_attempts
         AND next_attempt_at <= NOW()`, [candidateId]);
        if (updateResult.affectedRows !== 1) {
            await commit(connection);
            return null;
        }
        const claimedRows = await connectionQuery(connection, `SELECT id, job_type, event_key, deduplication_key, payload, status, attempts, max_attempts
       FROM email_outbox
       WHERE id = ?`, [candidateId]);
        await commit(connection);
        return claimedRows[0] || null;
    }
    catch (error) {
        await rollback(connection);
        throw error;
    }
    finally {
        connection.release();
    }
}
async function markEmailOutboxJobSent(jobId) {
    await query("UPDATE email_outbox SET status = 'SENT', processed_at = CURRENT_TIMESTAMP, last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [jobId]);
}
function getNextAttemptDelayMs(attempts) {
    const exponent = Math.max(0, attempts - 1);
    return exports.EMAIL_OUTBOX_BASE_BACKOFF_MS * Math.pow(2, exponent);
}
async function markEmailOutboxJobFailed(job, error) {
    const message = String((error === null || error === void 0 ? void 0 : error.message) || error || "Unknown email outbox worker error").slice(0, 4000);
    const permanent = job.attempts >= job.max_attempts;
    const delayMs = permanent ? 0 : getNextAttemptDelayMs(job.attempts);
    await query(`UPDATE email_outbox
     SET status = 'FAILED',
         last_error = ?,
         next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MICROSECOND),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`, [message, delayMs * 1000, job.id]);
    return { permanent, delayMs };
}
async function cleanupOldSentEmailOutboxJobs(batchSize = exports.EMAIL_OUTBOX_CLEANUP_BATCH_SIZE) {
    const cutoff = dateBeforeNow(exports.EMAIL_OUTBOX_SENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await query(`DELETE FROM email_outbox
     WHERE status = 'SENT'
       AND processed_at IS NOT NULL
       AND processed_at < ?
     ORDER BY processed_at ASC, id ASC
     LIMIT ?`, [cutoff, batchSize]);
    return (result === null || result === void 0 ? void 0 : result.affectedRows) || 0;
}
async function recoverStaleProcessingEmailOutboxJobs(batchSize = exports.EMAIL_OUTBOX_CLEANUP_BATCH_SIZE) {
    const cutoff = dateBeforeNow(exports.EMAIL_OUTBOX_PROCESSING_TIMEOUT_MS);
    const result = await query(`UPDATE email_outbox
     SET status = 'FAILED',
         last_error = CONCAT('Recovered stale PROCESSING job after worker timeout. Previous error: ', COALESCE(last_error, '')),
         next_attempt_at = CASE WHEN attempts < max_attempts THEN NOW() ELSE next_attempt_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'PROCESSING'
       AND updated_at < ?
     ORDER BY updated_at ASC, id ASC
     LIMIT ?`, [cutoff, batchSize]);
    return (result === null || result === void 0 ? void 0 : result.affectedRows) || 0;
}
function closeEmailOutboxDbPool() {
    return new Promise((resolve) => {
        if (!(db === null || db === void 0 ? void 0 : db.end))
            return resolve();
        db.end((error) => {
            if (error)
                console.error("[EMAIL-OUTBOX-WORKER] DB pool close error", { message: error === null || error === void 0 ? void 0 : error.message });
            resolve();
        });
    });
}
function parseEmailOutboxPayload(job) {
    return typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
}
//# sourceMappingURL=emailOutboxService.js.map