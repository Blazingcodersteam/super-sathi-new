"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStringParam = getStringParam;
exports.getNumberParam = getNumberParam;
exports.getBooleanParam = getBooleanParam;
/**
 * Safely extract string value from Express query parameter
 */
function getStringParam(param) {
    if (typeof param === 'string') {
        return param;
    }
    if (Array.isArray(param) && param.length > 0 && typeof param[0] === 'string') {
        return param[0];
    }
    return undefined;
}
/**
 * Safely extract number value from Express query parameter
 */
function getNumberParam(param, defaultValue) {
    const stringValue = getStringParam(param);
    if (stringValue) {
        const numValue = parseInt(stringValue, 10);
        return isNaN(numValue) ? defaultValue : numValue;
    }
    return defaultValue;
}
/**
 * Safely extract boolean value from Express query parameter
 */
function getBooleanParam(param) {
    const stringValue = getStringParam(param);
    if (stringValue) {
        return stringValue.toLowerCase() === 'true' || stringValue === '1';
    }
    return undefined;
}
//# sourceMappingURL=queryHelpers.js.map