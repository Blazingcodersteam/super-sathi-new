"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSms = sendSms;
exports.sendOtpSms = sendOtpSms;
const axios_1 = require("axios");
/**
 * SMS gateway integration (s91.in).
 *
 * Credentials and the DLT-approved sender/content id are read from the
 * environment so they can be rotated without a code change. The OTP template
 * text MUST match the DLT-registered content exactly (only the code varies),
 * otherwise the gateway rejects the message.
 */
const SMS_BASE_URL = process.env.SMS_BASE_URL || "https://app.s91.in/fe/api/v1/send";
const SMS_USERNAME = process.env.SMS_USERNAME || "";
const SMS_PASSWORD = process.env.SMS_PASSWORD || "";
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || "";
const SMS_OTP_DLT_CONTENT_ID = process.env.SMS_OTP_DLT_CONTENT_ID || "";
/**
 * Normalise a phone number to the bare 10-digit form the gateway expects.
 * Strips spaces, dashes, a leading "+", and an Indian country code (91).
 */
function normalizePhone(phone) {
    let digits = String(phone).replace(/\D/g, "");
    if (digits.length > 10 && digits.startsWith("91")) {
        digits = digits.slice(-10);
    }
    return digits;
}
/**
 * Low-level send. Delivers an already-built message to a single recipient.
 */
async function sendSms(to, text, dltContentId) {
    var _a;
    if (!SMS_USERNAME || !SMS_PASSWORD || !SMS_SENDER_ID) {
        return { success: false, error: "SMS gateway is not configured" };
    }
    const recipient = normalizePhone(to);
    if (recipient.length < 10) {
        return { success: false, error: "Invalid recipient phone number" };
    }
    try {
        const response = await axios_1.default.get(SMS_BASE_URL, {
            params: {
                username: SMS_USERNAME,
                password: SMS_PASSWORD,
                unicode: true,
                from: SMS_SENDER_ID,
                to: recipient,
                dltContentId,
                text,
            },
            timeout: 15000,
        });
        console.log(`✅ SMS sent to ${recipient}:`, response.data);
        return { success: true, data: response.data };
    }
    catch (error) {
        const message = ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data) || (error === null || error === void 0 ? void 0 : error.message) || "Unknown SMS gateway error";
        console.error(`❌ SMS send failed to ${recipient}:`, message);
        return { success: false, error: String(message) };
    }
}
/**
 * Send a login/verification OTP using the DLT-approved template.
 *
 * DLT template (must stay byte-for-byte identical apart from the code):
 *   "Your verification code is {otp}. Please do not share this code with
 *    anyone. - SeekingNames By Gonivia Pvt Ltd"
 */
async function sendOtpSms(phone, otp) {
    const text = `Your verification code is ${otp}. Please do not share this code with anyone. - SeekingNames By Gonivia Pvt Ltd`;
    return sendSms(phone, text, SMS_OTP_DLT_CONTENT_ID);
}
//# sourceMappingURL=SMSService.js.map