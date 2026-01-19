/**
 * Retry utility for handling rate limit errors (429) with exponential backoff
 */

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY = 1000; // milliseconds
const DEFAULT_MAX_DELAY = 60000; // milliseconds
const DEFAULT_BACKOFF_MULTIPLIER = 2.0;

/**
 * Check if an error is a rate limit error (429)
 * @param {Error|Object} error - The error to check
 * @returns {boolean} - True if it's a rate limit error
 */
function isRateLimitError(error) {
  // Check for axios error with 429 status
  if (error?.response?.status === 429) {
    return true;
  }
  
  // Check for HTTPException with 429 status
  if (error?.status === 429 || error?.statusCode === 429) {
    return true;
  }
  
  // Check error message for rate limit indicators
  const errorMessage = error?.message?.toLowerCase() || String(error).toLowerCase();
  if (errorMessage.includes('429') || 
      errorMessage.includes('rate limit') || 
      errorMessage.includes('quota') ||
      errorMessage.includes('too many requests')) {
    return true;
  }
  
  return false;
}

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff for rate limit errors
 * @param {Function} fn - The async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 60000)
 * @param {number} options.backoffMultiplier - Backoff multiplier (default: 2.0)
 * @param {Function} options.retryOn - Function to determine if error should be retried (default: isRateLimitError)
 * @returns {Promise<any>} - The result of the function
 */
export async function retryWithBackoff(
  fn,
  {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelay = DEFAULT_INITIAL_DELAY,
    maxDelay = DEFAULT_MAX_DELAY,
    backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
    retryOn = isRateLimitError,
  } = {}
) {
  let lastError = null;
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry this error
      if (!retryOn(error)) {
        console.debug(`Error is not retryable: ${error.message || error}`);
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt >= maxRetries) {
        console.error(
          `Max retries (${maxRetries}) exceeded. Last error: ${error.message || error}`
        );
        throw error;
      }
      
      // Log retry attempt
      const statusCode = error?.response?.status || error?.status || 'unknown';
      console.warn(
        `Retryable error detected (attempt ${attempt + 1}/${maxRetries + 1}). ` +
        `Status: ${statusCode}. Retrying in ${(delay / 1000).toFixed(2)} seconds... ` +
        `Error: ${error.message || error}`
      );
      
      // Wait before retrying
      await sleep(delay);
      
      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }
  
  // Should never reach here, but just in case
  if (lastError) {
    throw lastError;
  }
}

/**
 * Wrapper for axios requests with automatic retry on 429 errors
 * @param {Function} axiosCall - Function that returns an axios promise
 * @param {Object} retryOptions - Retry options (same as retryWithBackoff)
 * @returns {Promise<any>} - The axios response
 */
export async function axiosWithRetry(axiosCall, retryOptions = {}) {
  return retryWithBackoff(axiosCall, retryOptions);
}

