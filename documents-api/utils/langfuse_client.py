"""
Langfuse Client - Observability and tracing for LLM calls.
Reads configuration from environment variables:
- LANGFUSE_SECRET_KEY
- LANGFUSE_PUBLIC_KEY
- LANGFUSE_HOST or LANGFUSE_BASE_URL (optional, defaults to cloud)

The `@observe` decorator from this module automatically traces function calls
and sends data to Langfuse.
"""

import logging
import os
import atexit

from dotenv import load_dotenv

load_dotenv()

LOGGER = logging.getLogger(__name__)

# Langfuse configuration from environment
LANGFUSE_SECRET_KEY = os.getenv("LANGFUSE_SECRET_KEY", "")
LANGFUSE_PUBLIC_KEY = os.getenv("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_HOST = os.getenv("LANGFUSE_HOST", "") or os.getenv("LANGFUSE_BASE_URL", "")

# Check if Langfuse is configured
_langfuse_enabled = bool(LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY)

# Initialize Langfuse if configured
if _langfuse_enabled:
    try:
        # Import observe directly from langfuse (SDK v3 API)
        from langfuse import observe as _langfuse_observe
        from langfuse import Langfuse, get_client
        
        # Initialize the Langfuse client - this enables the @observe decorator
        _langfuse_client = Langfuse(
            secret_key=LANGFUSE_SECRET_KEY,
            public_key=LANGFUSE_PUBLIC_KEY,
            host=LANGFUSE_HOST if LANGFUSE_HOST else None,
        )
        
        # Register flush on exit to ensure all traces are sent
        atexit.register(_langfuse_client.flush)
        
        LOGGER.info(
            f"🔍 Langfuse tracing enabled (host: {LANGFUSE_HOST or 'cloud'})"
        )
        
        # Export the actual observe decorator
        def observe(name=None, as_type=None, capture_output=None, capture_input=None, transform_to_string=None):
            """Wrapper for langfuse @observe decorator."""
            return _langfuse_observe(
                name=name, 
                as_type=as_type, 
                capture_output=capture_output,
                capture_input=capture_input,
                transform_to_string=transform_to_string
            )
        
        def flush():
            """Flush pending Langfuse events."""
            try:
                _langfuse_client.flush()
            except Exception as e:
                LOGGER.warning(f"Failed to flush Langfuse: {e}")
        
        def get_langfuse():
            """Get the Langfuse client instance."""
            return _langfuse_client
        
        def update_current_span(output=None, metadata=None, **kwargs):
            """Update the current span with output or metadata."""
            try:
                _langfuse_client.update_current_span(output=output, metadata=metadata, **kwargs)
            except Exception as e:
                LOGGER.debug(f"Failed to update current span: {e}")
        
        def update_current_generation(usage_details=None, model=None, **kwargs):
            """Update the current generation span with token usage and model info."""
            try:
                _langfuse_client.update_current_generation(
                    usage_details=usage_details,
                    model=model,
                    **kwargs
                )
            except Exception as e:
                LOGGER.debug(f"Failed to update current generation: {e}")
            
    except ImportError as e:
        LOGGER.warning(f"Langfuse package not installed: {e}")
        _langfuse_enabled = False
    except Exception as e:
        LOGGER.error(f"Failed to initialize Langfuse: {e}")
        _langfuse_enabled = False

# Fallback no-op implementations if Langfuse is not available
if not _langfuse_enabled:
    LOGGER.debug("Langfuse tracing disabled (missing API keys or package)")
    
    def observe(name=None, as_type=None, capture_output=None, capture_input=None, transform_to_string=None):
        """No-op decorator when Langfuse is disabled."""
        def decorator(func):
            return func
        return decorator
    
    def flush():
        """No-op flush when Langfuse is disabled."""
        pass
    
    def get_langfuse():
        """Returns None when Langfuse is disabled."""
        return None
    
    def update_current_span(output=None, metadata=None, **kwargs):
        """No-op update when Langfuse is disabled."""
        pass
    
    def update_current_generation(usage_details=None, model=None, **kwargs):
        """No-op update when Langfuse is disabled."""
        pass
