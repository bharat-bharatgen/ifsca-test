import os
import asyncio
import logging
from celery import Celery
from celery.signals import worker_process_init, worker_process_shutdown
from dotenv import load_dotenv

load_dotenv()

LOGGER = logging.getLogger(__name__)

# Create Celery instance
celery_app = Celery(
    "documents_api",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0"),
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes
    task_soft_time_limit=480,  # 8 minutes
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    imports=["tasks.document_processing"],
)


@worker_process_init.connect
def init_worker_process(**kwargs):
    """
    Initialize worker process.
    Note: We don't pre-initialize the pool here because each task creates its own event loop.
    The pool will be created lazily when first needed in each task's event loop.
    """
    LOGGER.info("Worker process initialized. Database pools will be created on first use per event loop.")


@worker_process_shutdown.connect
def shutdown_worker_process(**kwargs):
    """
    Clean up database connection pools when worker process shuts down.
    """
    try:
        from database import close_all_pools
        # Try to get the current loop, but don't create one if it doesn't exist
        try:
            loop = asyncio.get_event_loop()
            if loop and not loop.is_closed():
                loop.run_until_complete(close_all_pools())
        except RuntimeError:
            # No event loop exists, create a temporary one for cleanup
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(close_all_pools())
            finally:
                loop.close()
        LOGGER.info("Database connection pools closed for worker process")
    except Exception as e:
        LOGGER.warning(f"Error closing database pools during shutdown: {e}")

