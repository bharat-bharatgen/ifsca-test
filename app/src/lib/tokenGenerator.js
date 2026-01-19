import { randomBytes } from "crypto";

export const generateToken = (size = 32) => {
  return randomBytes(size).toString("hex");
};

/**
 * Generates a 6-digit OTP code
 * @returns {string} A 6-digit OTP code as a string
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
