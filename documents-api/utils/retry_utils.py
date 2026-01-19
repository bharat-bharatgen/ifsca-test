import logging
import time
import asyncio
from typing import Callable, Any, Optional
from functools import wraps

LOGGER = logging.getLogger(__name__)

# Default retry configuration
DEFAULT_MAX_RETRIES = 3
DEFAULT_INITIAL_DELAY = 1.0  # seconds
DEFAULT_MAX_DELAY = 60.0  # seconds
DEFAULT_BACKOFF_MULTIPLIER = 2.0


def is_rate_limit_error(exception: Exception) -> bool:
    """
    Check if an exception is a rate limit error (429).
    Handles both HTTPException and Google API errors.
    """
    # Check for HTTPException with 429 status
    if hasattr(exception, 'status_code') and exception.status_code == 429:
        return True
    
    # Check for Google API rate limit errors
    error_str = str(exception).lower()
    if '429' in error_str or 'rate limit' in error_str or 'quota' in error_str:
        return True
    
    # Check for specific Google API error types
    
    # Check for Google API client errors
    if hasattr(exception, 'code') and exception.code == 429:
        return True
    
    return False


def retry_with_backoff(
    max_retries: int = DEFAULT_MAX_RETRIES,
    initial_delay: float = DEFAULT_INITIAL_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
    backoff_multiplier: float = DEFAULT_BACKOFF_MULTIPLIER,
    retry_on: Optional[Callable[[Exception], bool]] = None,
):
    """
    Decorator for retrying functions with exponential backoff.
    
    Args:
        max_retries: Maximum number of retry attempts (default: 3)
        initial_delay: Initial delay in seconds before first retry (default: 1.0)
        max_delay: Maximum delay in seconds between retries (default: 60.0)
        backoff_multiplier: Multiplier for exponential backoff (default: 2.0)
        retry_on: Optional function to determine if an exception should be retried.
                  If None, defaults to checking for rate limit errors (429).
    
    Usage:
        @retry_with_backoff(max_retries=5, initial_delay=2.0)
        def my_function():
            # function code
    """
    if retry_on is None:
        retry_on = is_rate_limit_error
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            last_exception = None
            delay = initial_delay
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    
                    # Check if we should retry this error
                    if not retry_on(e):
                        LOGGER.debug(f"Error is not retryable: {e}")
                        raise
                    
                    # If this was the last attempt, raise the exception
                    if attempt >= max_retries:
                        LOGGER.error(
                            f"Max retries ({max_retries}) exceeded for {func.__name__}. "
                            f"Last error: {e}"
                        )
                        raise
                    
                    # Log retry attempt
                    LOGGER.warning(
                        f"Retryable error ({type(e).__name__}) in {func.__name__} (attempt {attempt + 1}/{max_retries + 1}). "
                        f"Retrying in {delay:.2f} seconds... Error: {e}"
                    )
                    
                    # Wait before retrying
                    time.sleep(delay)
                    
                    # Calculate next delay with exponential backoff
                    delay = min(delay * backoff_multiplier, max_delay)
            
            # Should never reach here, but just in case
            if last_exception:
                raise last_exception
            # Explicit return None if somehow we reach here without an exception
            return None
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            last_exception = None
            delay = initial_delay
            
            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    
                    # Check if we should retry this error
                    if not retry_on(e):
                        LOGGER.debug(f"Error is not retryable: {e}")
                        raise
                    
                    # If this was the last attempt, raise the exception
                    if attempt >= max_retries:
                        LOGGER.error(
                            f"Max retries ({max_retries}) exceeded for {func.__name__}. "
                            f"Last error: {e}"
                        )
                        raise
                    
                    # Log retry attempt
                    LOGGER.warning(
                        f"Retryable error ({type(e).__name__}) in {func.__name__} (attempt {attempt + 1}/{max_retries + 1}). "
                        f"Retrying in {delay:.2f} seconds... Error: {e}"
                    )
                    
                    # Wait before retrying
                    await asyncio.sleep(delay)
                    
                    # Calculate next delay with exponential backoff
                    delay = min(delay * backoff_multiplier, max_delay)
            
            # Should never reach here, but just in case
            if last_exception:
                raise last_exception
            # Explicit return None if somehow we reach here without an exception
            return None
        
        # Return appropriate wrapper based on whether function is async
        import inspect
        if inspect.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

