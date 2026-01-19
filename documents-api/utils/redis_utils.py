"""
Redis utilities for task state storage.
Provides stateless WebSocket by storing task state in Redis as the canonical source of truth.
"""
import os
import json
import time
import logging
import asyncio
from typing import Optional, Dict, Any

try:
    import redis.asyncio as redis
    import redis as redis_sync
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

LOGGER = logging.getLogger(__name__)

# Redis URL from environment
REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

# Global async Redis client (for FastAPI)
redis_client = None
# Lock to prevent duplicate client creation under concurrent access
redis_client_lock = asyncio.Lock()


async def get_redis_client():
    """Get or create async Redis client connection for FastAPI."""
    global redis_client
    if not REDIS_AVAILABLE:
        LOGGER.warning("Redis library not available")
        return None
    if redis_client is None:
        async with redis_client_lock:
            if redis_client is None:
                redis_client = await redis.from_url(REDIS_URL, decode_responses=True)
    return redis_client


def get_redis_client_sync():
    """Get synchronous Redis client for use in Celery workers."""
    if not REDIS_AVAILABLE:
        LOGGER.warning("Redis library not available for sync operations")
        return None
    try:
        return redis_sync.from_url(REDIS_URL, decode_responses=True)
    except Exception as e:
        LOGGER.warning(f"Error creating sync Redis client: {e}")
        return None


def get_task_state_key(task_id: str) -> str:
    """Get Redis key for task state."""
    return f"task:state:{task_id}"


async def get_task_state_from_redis(task_id: str) -> Optional[Dict[str, Any]]:
    """
    Get task state from Redis. Returns None if not found.
    This is the canonical source of truth for task state.
    """
    if not REDIS_AVAILABLE:
        return None
    try:
        client = await get_redis_client()
        if client is None:
            return None
        state_json = await client.get(get_task_state_key(task_id))
        if state_json:
            return json.loads(state_json)
    except Exception as e:
        LOGGER.warning(f"Error reading task state from Redis for {task_id}: {e}")
    return None


def set_task_state_in_redis(
    task_id: str, 
    state: str, 
    meta: Dict[str, Any], 
    result: Optional[Dict[str, Any]] = None
) -> None:
    """
    Store task state in Redis. Used by Celery workers.
    This makes WebSocket stateless - browser reloads can reconnect and get current state.
    """
    if not REDIS_AVAILABLE:
        return
    try:
        client = get_redis_client_sync()
        if client is None:
            return
        state_data = {
            "state": state,
            "meta": meta,
            "task_id": task_id,
            "timestamp": time.time()
        }
        # Include result if provided (for SUCCESS state)
        if result:
            state_data["result"] = result
        client.setex(
            get_task_state_key(task_id),
            3600,  # Expire after 1 hour
            json.dumps(state_data)
        )
        LOGGER.debug(f"[REDIS] Stored state for task {task_id}: {state}")
    except Exception as e:
        LOGGER.warning(f"Error writing task state to Redis for {task_id}: {e}")

