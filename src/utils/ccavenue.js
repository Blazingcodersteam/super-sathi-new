"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CCAvenue = void 0;
const crypto = require("crypto");
class CCAvenue {
    static encrypt(plainText) {
        const WORKING_KEY = process.env.CCAVENUE_WORKING_KEY;
        if (!WORKING_KEY) {
            throw new Error('CCAvenue Working Key is not configured');
        }
        const m = crypto.createHash('md5');
        m.update(WORKING_KEY);
        const key = m.digest();
        const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
        const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
        let encoded = cipher.update(plainText, 'utf8', 'hex');
        encoded += cipher.final('hex');
        return encoded;
    }
    static decrypt(encText) {
        const WORKING_KEY = process.env.CCAVENUE_WORKING_KEY;
        if (!WORKING_KEY) {
            throw new Error('CCAvenue Working Key is not configured');
        }
        const m = crypto.createHash('md5');
        m.update(WORKING_KEY);
        const key = m.digest();
        const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
        const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
        let decoded = decipher.update(encText, 'hex', 'utf8');
        decoded += decipher.final('utf8');
        return decoded;
    }
    static encryptRequest(data) {
        const queryString = Object.keys(data)
            .map(key => `${key}=${encodeURIComponent(data[key])}`)
            .join('&');
        return this.encrypt(queryString);
    }
    static decryptResponse(encryptedData) {
        const decrypted = this.decrypt(encryptedData);
        const params = {};
        decrypted.split('&').forEach(param => {
            const [key, value] = param.split('=');
            params[key] = decodeURIComponent(value || '');
        });
        return params;
    }
    static generateOrderId() {
        return `CCAV_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.CCAvenue = CCAvenue;
//# sourceMappingURL=ccavenue.js.map