// Utility functions for handling Express query parameters
import { ParsedQs } from 'qs';

/**
 * Safely extract string value from Express query parameter
 */
export function getStringParam(param: string | ParsedQs | (string | ParsedQs)[] | undefined): string | undefined {
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
export function getNumberParam(param: string | ParsedQs | (string | ParsedQs)[] | undefined, defaultValue?: number): number | undefined {
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
export function getBooleanParam(param: string | ParsedQs | (string | ParsedQs)[] | undefined): boolean | undefined {
  const stringValue = getStringParam(param);
  if (stringValue) {
    return stringValue.toLowerCase() === 'true' || stringValue === '1';
  }
  return undefined;
}