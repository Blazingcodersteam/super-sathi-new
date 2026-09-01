"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv").config();
const alertEmailService_1 = require("../services/alertEmailService");
const emailOutboxService_1 = require("../services/emailOutboxService");
let shuttingDown = false;
let shutdownStarted = false;
let currentJobPromise = null;
let lastMaintenanceAt = 0;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function jobMeta(job) {
    return `job=${job.id} type=${job.job_type} event=${job.event_key} dedupe=${job.deduplication_key} attempt=${job.attempts}/${job.max_attempts}`;
}
async function processOneJob() {
    const job = await (0, emailOutboxService_1.claimNextEmailOutboxJob)();
    if (!job)
        return false;
    const startedAt = performance.now();
    console.log(`[EMAIL-OUTBOX-WORKER] started ${jobMeta(job)}`);
    try {
        if (process.env.EMAIL_OUTBOX_FORCE_FAIL === "true") {
            throw new Error("EMAIL_OUTBOX_FORCE_FAIL=true forced email outbox failure");
        }
        const payload = (0, emailOutboxService_1.parseEmailOutboxPayload)(job);
        await (0, alertEmailService_1.processAlertEmailJob)(payload);
        await (0, emailOutboxService_1.markEmailOutboxJobSent)(job.id);
        console.log(`[EMAIL-OUTBOX-WORKER] sent ${jobMeta(job)} duration_ms=${Math.round(performance.now() - startedAt)}`);
        return true;
    }
    catch (error) {
        const retry = await (0, emailOutboxService_1.markEmailOutboxJobFailed)(job, error);
        const durationMs = Math.round(performance.now() - startedAt);
        if (retry.permanent) {
            console.error(`[EMAIL-OUTBOX-WORKER] permanently failed ${jobMeta(job)} duration_ms=${durationMs}`, {
                message: error === null || error === void 0 ? void 0 : error.message,
            });
        }
        else {
            console.warn(`[EMAIL-OUTBOX-WORKER] retry scheduled ${jobMeta(job)} duration_ms=${durationMs}`, {
                message: error === null || error === void 0 ? void 0 : error.message,
                next_attempt_delay_ms: retry.delayMs,
            });
        }
        return true;
    }
}
async function runMaintenance(reason) {
    lastMaintenanceAt = Date.now();
    try {
        const recovered = await (0, emailOutboxService_1.recoverStaleProcessingEmailOutboxJobs)();
        if (recovered > 0) {
            console.warn(`[EMAIL-OUTBOX-WORKER] recovered stale processing jobs count=${recovered}`);
        }
        const deleted = await (0, emailOutboxService_1.cleanupOldSentEmailOutboxJobs)();
        console.log(`[EMAIL-OUTBOX-WORKER] cleanup result reason=${reason} deleted_sent=${deleted}`);
    }
    catch (error) {
        console.error("[EMAIL-OUTBOX-WORKER] cleanup error", {
            reason,
            message: error === null || error === void 0 ? void 0 : error.message,
            stack: error === null || error === void 0 ? void 0 : error.stack,
        });
    }
}
async function pollLoop() {
    console.log(`[EMAIL-OUTBOX-WORKER] ready poll_interval_ms=${emailOutboxService_1.EMAIL_OUTBOX_POLL_INTERVAL_MS} batch_size=${emailOutboxService_1.EMAIL_OUTBOX_BATCH_SIZE} max_attempts=${emailOutboxService_1.EMAIL_OUTBOX_MAX_ATTEMPTS} cleanup_interval_ms=${emailOutboxService_1.EMAIL_OUTBOX_CLEANUP_INTERVAL_MS} cleanup_batch_size=${emailOutboxService_1.EMAIL_OUTBOX_CLEANUP_BATCH_SIZE} sent_retention_days=${emailOutboxService_1.EMAIL_OUTBOX_SENT_RETENTION_DAYS} processing_timeout_ms=${emailOutboxService_1.EMAIL_OUTBOX_PROCESSING_TIMEOUT_MS}`);
    await runMaintenance("startup");
    while (!shuttingDown) {
        let processed = 0;
        try {
            if (Date.now() - lastMaintenanceAt >= emailOutboxService_1.EMAIL_OUTBOX_CLEANUP_INTERVAL_MS) {
                await runMaintenance("interval");
            }
            for (let i = 0; i < emailOutboxService_1.EMAIL_OUTBOX_BATCH_SIZE && !shuttingDown; i++) {
                currentJobPromise = processOneJob();
                const didProcess = await currentJobPromise;
                currentJobPromise = null;
                if (!didProcess)
                    break;
                processed++;
            }
        }
        catch (error) {
            currentJobPromise = null;
            console.error("[EMAIL-OUTBOX-WORKER] polling error", {
                message: error === null || error === void 0 ? void 0 : error.message,
                stack: error === null || error === void 0 ? void 0 : error.stack,
            });
        }
        if (processed === 0) {
            await sleep(emailOutboxService_1.EMAIL_OUTBOX_POLL_INTERVAL_MS);
        }
    }
}
async function shutdown(signal) {
    if (shutdownStarted)
        return;
    shutdownStarted = true;
    shuttingDown = true;
    console.log(`[EMAIL-OUTBOX-WORKER] shutting down signal=${signal}`);
    if (currentJobPromise) {
        console.log("[EMAIL-OUTBOX-WORKER] waiting for active job before shutdown");
        await currentJobPromise.catch((error) => {
            console.error("[EMAIL-OUTBOX-WORKER] active job failed during shutdown", {
                message: error === null || error === void 0 ? void 0 : error.message,
            });
        });
    }
    await (0, emailOutboxService_1.closeEmailOutboxDbPool)();
    console.log("[EMAIL-OUTBOX-WORKER] shutdown complete");
    process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
pollLoop().catch((error) => {
    console.error("[EMAIL-OUTBOX-WORKER] fatal error", error);
    process.exit(1);
});
//# sourceMappingURL=emailOutboxWorker.js.map