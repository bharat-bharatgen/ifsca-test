"""
Database connection pool management for asyncpg.
Provides a shared connection pool per event loop to prevent connection exhaustion.
Each event loop gets its own pool, which is important for Celery workers that create new loops per task.
"""
import os
import logging
import asyncio
import asyncpg
from typing import Optional, Dict

LOGGER = logging.getLogger(__name__)

# Store pools per event loop; pools are explicitly removed when closed to avoid memory leaks
_pools: Dict[int, asyncpg.Pool] = {}
_pool_locks: Dict[int, asyncio.Lock] = {}


async def get_pool() -> asyncpg.Pool:
    """
    Get or create a database connection pool for the current event loop.
    Each event loop gets its own pool, which is important for Celery workers.
    
    Pool configuration:
    - min_size: 2 (minimum connections to keep alive)
    - max_size: 5 (maximum connections per worker process)
    - max_queries: 50000 (connections are recycled after this many queries)
    - max_inactive_connection_lifetime: 300 (close idle connections after 5 minutes)
    """
    loop = asyncio.get_event_loop()
    loop_id = id(loop)
    
    # Check if we already have a pool for this loop
    if loop_id in _pools:
        pool = _pools[loop_id]
        if pool and not pool.is_closing():
            return pool
        # Pool is closing, remove it
        del _pools[loop_id]
    
    # Get or create lock for this loop (must be created in the current loop)
    if loop_id not in _pool_locks:
        _pool_locks[loop_id] = asyncio.Lock()
    
    lock = _pool_locks[loop_id]
    
    # Create new pool for this loop
    async with lock:
        # Double-check after acquiring lock
        if loop_id in _pools:
            pool = _pools[loop_id]
            if pool and not pool.is_closing():
                return pool
        
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL environment variable is not set")
        
        LOGGER.info(f"Creating new database connection pool for event loop {loop_id}")
        
        # Create pool with conservative limits to prevent connection exhaustion
        # With 2 workers and max_size=5, we'll have at most 10 connections per loop
        # This is well below typical PostgreSQL limits (usually 100+)
        pool = await asyncpg.create_pool(
            database_url,
            min_size=2,  # Keep at least 2 connections ready
            max_size=5,  # Maximum 5 connections per event loop
            max_queries=50000,  # Recycle connections after 50k queries
            max_inactive_connection_lifetime=300.0,  # Close idle connections after 5 minutes
            command_timeout=60,  # 60 second timeout for queries
        )
        
        _pools[loop_id] = pool
        LOGGER.info(f"Database connection pool created for loop {loop_id} (min_size=2, max_size=5)")
        
        return pool


async def close_pool(loop_id: Optional[int] = None):
    """
    Close the connection pool for a specific event loop.
    If loop_id is None, closes the pool for the current event loop.
    """
    if loop_id is None:
        loop = asyncio.get_event_loop()
        loop_id = id(loop)
    
    if loop_id in _pools:
        pool = _pools[loop_id]
        if pool and not pool.is_closing():
            LOGGER.info(f"Closing database connection pool for event loop {loop_id}")
            await pool.close()
        del _pools[loop_id]
    
    if loop_id in _pool_locks:
        del _pool_locks[loop_id]


async def close_all_pools():
    """Close all connection pools. Useful for cleanup."""
    loop_ids = list(_pools.keys())
    for loop_id in loop_ids:
        await close_pool(loop_id)


async def acquire_connection():
    """
    Acquire a connection from the pool.
    Use with async context manager:
        async with acquire_connection() as conn:
            await conn.execute(...)
    """
    pool = await get_pool()
    return pool.acquire()
