import { hash, compare } from "bcryptjs";
import crypto from "crypto";

const API_KEY_PREFIX = "dms_";
const API_KEY_LENGTH = 32; // Length of random part after prefix

/**
 * Generate a secure random API key
 * Format: dms_<32 random hex characters>
 * @returns {string} Generated API key
 */
export function generateApiKey() {
  const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
  const randomPart = randomBytes.toString("hex");
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Hash an API key for storage
 * @param {string} key - The API key to hash
 * @returns {Promise<string>} Hashed key
 */
export async function hashApiKey(key) {
  return hash(key, 10);
}

/**
 * Verify an API key against a hashed key
 * @param {string} providedKey - The API key provided by user
 * @param {string} hashedKey - The stored hashed key
 * @returns {Promise<boolean>} True if keys match
 */
export async function verifyApiKey(providedKey, hashedKey) {
  return compare(providedKey, hashedKey);
}

/**
 * Validate API key format
 * @param {string} key - The API key to validate
 * @returns {boolean} True if format is valid
 */
export function validateApiKey(key) {
  if (!key || typeof key !== "string") {
    return false;
  }
  
  // Check prefix
  if (!key.startsWith(API_KEY_PREFIX)) {
    return false;
  }
  
  // Check length (prefix + hex characters)
  const expectedLength = API_KEY_PREFIX.length + API_KEY_LENGTH * 2; // *2 because hex encoding
  if (key.length !== expectedLength) {
    return false;
  }
  
  // Check that the random part is valid hex
  const randomPart = key.slice(API_KEY_PREFIX.length);
  return /^[0-9a-f]+$/i.test(randomPart);
}

