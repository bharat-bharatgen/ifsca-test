import { parseISO, format } from "date-fns";

/**
 * Creates a reusable URL parameter updater function
 * @param {URLSearchParams} searchParams - Current search parameters
 * @param {Function} routerPush - Router push function
 * @returns {Function} - Function that updates URL with new parameters
 */
export const createUrlUpdater = (searchParams, routerPush) => {
  return (updates) => {
    const params = new URLSearchParams(searchParams);
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || String(value).trim() === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    
    routerPush(`?${params.toString()}`, { scroll: false });
  };
};

/**
 * Parses date parameters from URL search params
 * @param {URLSearchParams} searchParams - Current search parameters
 * @returns {Object} - Object with parsed fromDate and toDate
 */
export const parseDateParams = (searchParams) => {
  const fromDateParam = searchParams.get('fromDate');
  const toDateParam = searchParams.get('toDate');
  
  return {
    fromDate: fromDateParam ? parseISO(fromDateParam) : null,
    toDate: toDateParam ? parseISO(toDateParam) : null,
  };
};

/**
 * Creates filter change handlers for common filter types
 * @param {Function} urlUpdater - URL updater function
 * @returns {Object} - Object with common filter handlers
 */
export const createFilterHandlers = (urlUpdater) => ({
  handleCustomerNameChange: (value) => {
    urlUpdater({ customerName: value.trim() || null });
  },
  
  handleDateRangeChange: (fromDate, toDate) => {
    urlUpdater({
      fromDate: fromDate ? format(fromDate, 'yyyy-MM-dd') : null,
      toDate: toDate ? format(toDate, 'yyyy-MM-dd') : null,
    });
  },
});
