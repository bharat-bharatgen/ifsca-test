import { createDateRangeFilter } from "./date-utils";

/**
 * Creates a customer name filter function
 * @param {string} searchTerm - The search term to filter by
 * @returns {Function} - Filter function that takes a contract and returns boolean
 */
export const createCustomerNameFilter = (searchTerm) => {
  if (!searchTerm.trim()) return () => true;
  
  const normalizedTerm = searchTerm.toLowerCase();
  
  return (contract) => {
    const customerName = (contract.promisee || '').toLowerCase();
    return customerName.includes(normalizedTerm);
  };
};

/**
 * Creates a combined filter function for contracts
 * @param {Object} filters - Filter configuration object
 * @param {string} filters.customerName - Customer name search term
 * @param {Date|null} filters.fromDate - Start date for date range
 * @param {Date|null} filters.toDate - End date for date range
 * @returns {Function} - Combined filter function
 */
export const createContractFilter = ({ customerName, fromDate, toDate }) => {
  const customerFilter = createCustomerNameFilter(customerName);
  const dateRangeFilter = createDateRangeFilter(fromDate, toDate);
  
  return (contract) => {
    return customerFilter(contract) && dateRangeFilter(contract);
  };
};

/**
 * Applies multiple filters to a list of contracts
 * @param {Array} contracts - Array of contracts to filter
 * @param {Object} filters - Filter configuration object
 * @returns {Array} - Filtered array of contracts
 */
export const applyFilters = (contracts, filters) => {
  const filterFn = createContractFilter(filters);
  return contracts.filter(filterFn);
};
