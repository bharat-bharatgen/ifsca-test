"""WebSocket handler for task status polling."""
import asyncio
import logging
import time
from typing import Set, Dict, Any

from fastapi import WebSocket, WebSocketDisconnect
from celery.result import AsyncResult

from celery_app import celery_app
from utils.redis_utils import get_task_state_from_redis

LOGGER = logging.getLogger("documents_api")

# Constants
HEARTBEAT_INTERVAL = 3  # Send heartbeat update every 3 seconds
POLL_INTERVAL = 1.0     # Poll tasks every 1 second


class TaskPoller:
    """Handles polling of Celery tasks via WebSocket."""
    
    def __init__(self, websocket: WebSocket, user_id: str):
        self.websocket = websocket
        self.user_id = user_id
        self.subscribed_tasks: Set[str] = set()
        self.last_states: Dict[str, str] = {}
        self.last_update_times: Dict[str, float] = {}
        self.connection_open = True
    
    def is_connection_open(self) -> bool:
        """Check if WebSocket connection is still open."""
        if not self.connection_open:
            return False
        try:
            return self.websocket.client_state.name == "CONNECTED"
        except (AttributeError, RuntimeError):
            return False
    
    async def send_initial_message(self) -> bool:
        """Send initial connection message. Returns True if successful."""
        try:
            await self.websocket.send_json({
                "type": "connected", 
                "message": "WebSocket connection established"
            })
            LOGGER.debug("[WebSocket] Connection verified - initial message sent successfully")
            return True
        except Exception as e:
            LOGGER.error(f"[WebSocket] Connection not properly established: {e}")
            return False
    
    async def handle_message(self, data: Dict[str, Any]) -> None:
        """Handle incoming WebSocket message."""
        action = data.get("action", "subscribe")
        task_ids = data.get("task_ids", [])
        
        if action == "subscribe":
            self.subscribed_tasks.update(task_ids)
            LOGGER.info(f"[WebSocket] Subscribed to {len(task_ids)} task(s): {task_ids}")
        elif action == "unsubscribe":
            self.subscribed_tasks.difference_update(task_ids)
            for task_id in task_ids:
                self.last_states.pop(task_id, None)
                self.last_update_times.pop(task_id, None)
            LOGGER.info(f"[WebSocket] Unsubscribed from {len(task_ids)} task(s): {task_ids}")
        elif action == "update":
            self.subscribed_tasks.update(task_ids)
            LOGGER.info(f"[WebSocket] Updated subscription to {len(task_ids)} task(s)")
    
    async def message_handler(self) -> None:
        """Handle incoming WebSocket messages in a separate task."""
        while self.connection_open:
            try:
                data = await self.websocket.receive_json()
                await self.handle_message(data)
            except WebSocketDisconnect:
                LOGGER.info("[WebSocket] Client disconnected (message handler)")
                self.connection_open = False
                break
            except RuntimeError as e:
                error_str = str(e).lower()
                if "not connected" in error_str or "accept" in error_str or "close" in error_str:
                    LOGGER.info(f"[WebSocket] Connection closed in message handler: {e}")
                    self.connection_open = False
                    break
                else:
                    LOGGER.error(f"[WebSocket] Runtime error in message handler: {e}", exc_info=True)
            except Exception as e:
                error_str = str(e).lower()
                if "close" in error_str or "disconnect" in error_str or "not connected" in error_str:
                    LOGGER.info(f"[WebSocket] Connection error in message handler: {e}")
                    self.connection_open = False
                    break
                LOGGER.error(f"[WebSocket] Error in message handler: {e}", exc_info=True)
    
    async def poll_single_task(self, task_id: str) -> bool:
        """
        Poll a single task and send update if needed.
        
        Returns:
            bool: True if task reached terminal state and should be removed
        """
        if not self.is_connection_open():
            return False
        
        try:
            # Get task state from Redis/Celery
            state, info = await self._get_task_state(task_id)
            
            # Check if we should send an update
            if not self._should_send_update(task_id, state, info):
                return False
            
            # Build and send payload
            payload = await self._build_payload(task_id, state, info)
            
            if not self.is_connection_open():
                return False
            
            try:
                await self.websocket.send_json(payload)
            except (WebSocketDisconnect, RuntimeError) as send_error:
                error_str = str(send_error).lower()
                if "close" in error_str or "disconnect" in error_str or "not connected" in error_str:
                    LOGGER.info(f"[WebSocket] Connection closed while sending update for task {task_id}")
                    return False
                raise
            
            # Return True if task should be removed (terminal state)
            return state in ("SUCCESS", "FAILURE", "REVOKED")
            
        except (WebSocketDisconnect, RuntimeError) as e:
            error_str = str(e).lower()
            if "close" in error_str or "disconnect" in error_str or "not connected" in error_str:
                LOGGER.info(f"[WebSocket] Connection closed while polling task {task_id}")
                return False
            LOGGER.error(f"[WebSocket] Error polling task {task_id}: {e}", exc_info=True)
            return False
        except Exception as e:
            LOGGER.error(f"[WebSocket] Error polling task {task_id}: {e}", exc_info=True)
            if self.is_connection_open():
                try:
                    await self.websocket.send_json({
                        "task_id": task_id,
                        "state": "FAILURE",
                        "error": str(e),
                        "message": "failure"
                    })
                except (WebSocketDisconnect, RuntimeError):
                    # Ignore disconnect errors when sending error message; connection is already closed.
                    pass
            return False
    
    async def _get_task_state(self, task_id: str) -> tuple[str, Dict[str, Any]]:
        """Get task state from Redis or Celery."""
        redis_state = await get_task_state_from_redis(task_id)
        
        if redis_state:
            return redis_state.get("state", "PENDING"), redis_state.get("meta", {})
        
        # Fallback to Celery
        result = AsyncResult(task_id, app=celery_app)
        state = result.state
        
        if state == "SUCCESS" and result.ready():
            try:
                result_data = result.result
                if result_data is None:
                    result_data = result.info if isinstance(result.info, dict) else {}
                return state, result_data if isinstance(result_data, dict) else {}
            except Exception as e:
                LOGGER.warning(f"[WebSocket] Error getting result for task {task_id}: {e}")
        
        return state, result.info if isinstance(result.info, dict) else {}
    
    def _should_send_update(self, task_id: str, state: str, info: Dict[str, Any]) -> bool:
        """Determine if an update should be sent for this task."""
        current_step = info.get("step", None)
        current_message = info.get("message", None)
        last_state_key = f"{task_id}_{state}_{current_step}_{current_message}"
        
        current_time = time.time()
        last_update_time = self.last_update_times.get(task_id, 0)
        time_since_last_update = current_time - last_update_time
        
        # Send update if state changed OR heartbeat interval exceeded for PROCESSING
        should_send = (
            self.last_states.get(task_id) != last_state_key or
            (state == "PROCESSING" and time_since_last_update >= HEARTBEAT_INTERVAL)
        )
        
        if should_send:
            self.last_states[task_id] = last_state_key
            self.last_update_times[task_id] = current_time
        
        return should_send
    
    async def _build_payload(self, task_id: str, state: str, info: Dict[str, Any]) -> Dict[str, Any]:
        """Build the WebSocket payload for a task update."""
        payload = {"task_id": task_id}
        
        if state == "PENDING":
            payload["message"] = "step"
            payload["step"] = 1
        elif state == "PROCESSING":
            payload["message"] = "step"
            payload["step"] = info.get("step", 1)
        elif state == "SUCCESS":
            payload["message"] = "success"
            payload["step"] = 7
            payload.update(await self._build_success_payload(task_id, info))
        elif state == "FAILURE":
            payload["message"] = "failure"
            payload["error"] = str(info.get("error") or info.get("message") or "Task failed")
        elif state == "REVOKED":
            payload["message"] = "failure"
            payload["error"] = "Task was cancelled"
        
        return payload
    
    async def _build_success_payload(self, task_id: str, info: Dict[str, Any]) -> Dict[str, Any]:
        """Build the success-specific payload fields."""
        try:
            redis_state = await get_task_state_from_redis(task_id)
        except Exception as e:
            LOGGER.warning(f"[WebSocket] Failed to get Redis state for task {task_id}: {e}")
            redis_state = None
        
        try:
            if redis_state and redis_state.get("result"):
                result_data = redis_state.get("result", {})
            else:
                result = AsyncResult(task_id, app=celery_app)
                result_data = result.result if hasattr(result, 'result') else None
                if result_data is None:
                    result_data = info
                result_data = result_data if isinstance(result_data, dict) else {}
            
            payload = {"result": result_data}
            document_id = result_data.get("document_id") or result_data.get("documentId")
            if document_id:
                payload["document"] = {
                    "id": document_id,
                    "redirectUrl": f"/documents/{document_id}"
                }
            return payload
        except Exception as e:
            LOGGER.error(f"[WebSocket] Error preparing SUCCESS payload for task {task_id}: {e}")
            return {"result": {}, "document": {}}
    
    def remove_task(self, task_id: str) -> None:
        """Remove a task from subscriptions and tracking."""
        self.subscribed_tasks.discard(task_id)
        self.last_states.pop(task_id, None)
        self.last_update_times.pop(task_id, None)
        LOGGER.info(f"[WebSocket] Task {task_id} reached terminal state. Removed from subscription.")
    
    async def run_polling_loop(self) -> None:
        """Main polling loop that runs every POLL_INTERVAL seconds."""
        message_task = asyncio.create_task(self.message_handler())
        
        try:
            next_poll_time = time.time()
            while self.connection_open:
                if not self.is_connection_open():
                    LOGGER.info("[WebSocket] Connection closed, stopping polling loop")
                    break
                
                # Poll all subscribed tasks in parallel
                if self.subscribed_tasks:
                    task_list = list(self.subscribed_tasks)
                    results = await asyncio.gather(
                        *[self.poll_single_task(task_id) for task_id in task_list],
                        return_exceptions=True
                    )
                    
                    # Remove tasks that reached terminal state
                    for task_id, result in zip(task_list, results):
                        if isinstance(result, Exception):
                            LOGGER.error(f"[WebSocket] Exception polling task {task_id}: {result}")
                            continue
                        if result is True:
                            self.remove_task(task_id)
                
                # Maintain consistent polling interval
                next_poll_time += POLL_INTERVAL
                current_time = time.time()
                sleep_duration = max(0, next_poll_time - current_time)
                
                if sleep_duration > 0:
                    await asyncio.sleep(sleep_duration)
                else:
                    LOGGER.warning(f"[WebSocket] Polling behind schedule by {current_time - next_poll_time:.2f}s")
                    next_poll_time = current_time
                    
        except WebSocketDisconnect:
            LOGGER.info("[WebSocket] Client disconnected")
            self.connection_open = False
        except RuntimeError as e:
            error_str = str(e).lower()
            if "close" in error_str or "disconnect" in error_str or "not connected" in error_str:
                LOGGER.info(f"[WebSocket] Connection closed: {e}")
            else:
                LOGGER.error(f"[WebSocket] Runtime error: {e}", exc_info=True)
            self.connection_open = False
        except Exception as e:
            LOGGER.error(f"[WebSocket] Error in polling loop: {e}", exc_info=True)
            self.connection_open = False
        finally:
            self.connection_open = False
            if not message_task.done():
                message_task.cancel()
                try:
                    await message_task
                except asyncio.CancelledError:
                    # Suppress CancelledError since task cancellation is expected during cleanup
                    pass
            LOGGER.info(f"[WebSocket] Connection closed. Was polling {len(self.subscribed_tasks)} task(s)")
