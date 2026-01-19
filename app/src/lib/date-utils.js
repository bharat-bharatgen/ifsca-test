import { parseISO, isValid, addDays } from "date-fns";

/**
 * Normalizes a date to start of day (00:00:00) for consistent date-only comparisons
 * @param {Date|null} date - The date to normalize
 * @returns {Date|null} - Normalized date or null
 */
export const normalizeToDateOnly = (date) => {
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

/**
 * Parses a contract date string to a normalized date-only value
 * Handles various date formats and returns null for invalid dates
 * @param {string|Date|number} rawDate - The raw date value from contract
 * @returns {Date|null} - Normalized date or null if invalid
 */
export const parseContractDateOnly = (rawDate) => {
  if (!rawDate) return null;
  
  // Try parsing as ISO string first
  const parsed = parseISO(String(rawDate));
  if (isValid(parsed)) return normalizeToDateOnly(parsed);
  
  // Fallback to Date constructor
  const fallback = new Date(rawDate);
  return isValid(fallback) ? normalizeToDateOnly(fallback) : null;
};

/**
 * Checks if a contract date falls within the specified date range (inclusive)
 * @param {Date} contractDate - The contract date to check
 * @param {Date|null} fromDate - Start date (inclusive)
 * @param {Date|null} toDate - End date (inclusive)
 * @returns {boolean} - True if date is within range
 */
export const isDateInRange = (contractDate, fromDate, toDate) => {
  if (!contractDate) return false;
  
  const fromOnly = normalizeToDateOnly(fromDate);
  const toOnly = normalizeToDateOnly(toDate);
  const toNext = toOnly ? addDays(toOnly, 1) : null; // Make upper bound inclusive
  
  if (fromOnly && contractDate < fromOnly) return false;
  if (toNext && contractDate >= toNext) return false;
  
  return true;
};

/**
 * Creates a date range filter function for contracts
 * @param {Date|null} fromDate - Start date (inclusive)
 * @param {Date|null} toDate - End date (inclusive)
 * @returns {Function} - Filter function that takes a contract and returns boolean
 */
export const createDateRangeFilter = (fromDate, toDate) => {
  if (!fromDate && !toDate) return () => true;
  
  return (contract) => {
    const contractDate = parseContractDateOnly(contract.date);
    return isDateInRange(contractDate, fromDate, toDate);
  };
};
