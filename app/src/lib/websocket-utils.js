/**
 * WebSocket utilities for managing task progress updates.
 * Uses a single WebSocket connection to poll multiple tasks from IndexedDB.
 */

import { getTasksFromStorage } from "./indexeddb-utils";
import { env } from "@/env.mjs";

// Global WebSocket instance
let globalWebSocket = null;
let websocketReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds
const POLL_INTERVAL = 1000; // 1 second - matches backend polling (with 3s heartbeat for active tasks)

// Subscribed task IDs
const subscribedTasks = new Set();

// Message handlers: taskId -> handler function
const messageHandlers = new Map();

// Connection state
let isConnecting = false;
let shouldReconnect = true;
let connectionPromise = null; // Track ongoing connection attempt to prevent duplicates
let idleTimeout = null; // Track idle timeout
const IDLE_TIMEOUT = 25 * 60 * 1000; // 25 minutes (between 20-30 min as requested)
let lastActivityTime = null; // Track last activity to detect idle

/**
 * Get WebSocket URL with authentication token
 * First fetches a token from Next.js API route (validates session)
 * Then connects to FastAPI with the token
 */
async function getWebSocketUrl() {
  try {
    // Get authentication token from Next.js API route
    const response = await fetch("/api/v1/websocket/token");
    
    if (!response.ok) {
      throw new Error(`Failed to get WebSocket token: ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      url: `${data.wsUrl}?token=${encodeURIComponent(data.token)}`,
      token: data.token
    };
  } catch (error) {
    console.error("[WebSocket] Error getting token:", error);
    throw error;
  }
}

// Debounce subscription updates to batch them together
let subscriptionUpdateTimeout = null;
const SUBSCRIPTION_UPDATE_DEBOUNCE = 100; // 100ms debounce

/**
 * Subscribe to task updates
 * @param {string} taskId - Task identifier
 * @param {Function} handler - Callback function to handle updates
 * 
 * This reuses the existing persistent connection - no new connection is created
 */
export function subscribeToTask(taskId, handler) {
  // Prevent duplicate subscriptions
  if (messageHandlers.has(taskId)) {
    console.log(`[WebSocket] Task ${taskId} already subscribed, updating handler`);
    messageHandlers.set(taskId, handler);
    return;
  }
  
  subscribedTasks.add(taskId);
  messageHandlers.set(taskId, handler);
  
  console.log(`[WebSocket] Subscribed to task ${taskId}. Total subscriptions: ${subscribedTasks.size}`);
  
  // Ensure persistent WebSocket connection exists (reuses existing if available)
  ensureWebSocketConnection()
    .then(() => {
      // Debounce subscription updates to batch multiple subscriptions
      if (subscriptionUpdateTimeout) {
        clearTimeout(subscriptionUpdateTimeout);
      }
      subscriptionUpdateTimeout = setTimeout(() => {
        sendSubscriptionUpdate();
        subscriptionUpdateTimeout = null;
      }, SUBSCRIPTION_UPDATE_DEBOUNCE);
    })
    .catch(err => {
      console.error("[WebSocket] Error ensuring connection:", err);
    });
  
  // Send subscription update to server if already connected (with debounce)
  if (globalWebSocket && globalWebSocket.readyState === WebSocket.OPEN) {
    if (subscriptionUpdateTimeout) {
      clearTimeout(subscriptionUpdateTimeout);
    }
    subscriptionUpdateTimeout = setTimeout(() => {
      sendSubscriptionUpdate();
      subscriptionUpdateTimeout = null;
    }, SUBSCRIPTION_UPDATE_DEBOUNCE);
  }
}

/**
 * Unsubscribe from task updates
 * @param {string} taskId - Task identifier
 * 
 * Note: Connection stays open even if all tasks unsubscribe.
 * It will close automatically after idle timeout (25 min) if no activity.
 */
export function unsubscribeFromTask(taskId) {
  subscribedTasks.delete(taskId);
  messageHandlers.delete(taskId);
  
  console.log(`[WebSocket] Unsubscribed from task ${taskId}. Remaining subscriptions: ${subscribedTasks.size}`);
  
  // Send subscription update to server
  if (globalWebSocket && globalWebSocket.readyState === WebSocket.OPEN) {
    sendSubscriptionUpdate();
  }
  
  // DON'T close connection immediately - let it stay open for reuse
  // It will close automatically after idle timeout if no more tasks subscribe
  // This allows the connection to be reused for future batches
}

/**
 * Send subscription update to server
 */
function sendSubscriptionUpdate() {
  if (globalWebSocket && globalWebSocket.readyState === WebSocket.OPEN) {
    try {
      // Update activity time when sending messages
      lastActivityTime = Date.now();
      resetIdleTimeout();
      
      globalWebSocket.send(JSON.stringify({
        action: "update",
        task_ids: Array.from(subscribedTasks)
      }));
    } catch (error) {
      console.error("[WebSocket] Error sending subscription update:", error);
    }
  }
}

/**
 * Reset idle timeout - connection stays alive as long as there's activity
 */
function resetIdleTimeout() {
  // Clear existing timeout
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  
  // Only set timeout if we have an active connection
  if (globalWebSocket && globalWebSocket.readyState === WebSocket.OPEN) {
    idleTimeout = setTimeout(() => {
      const idleDuration = Date.now() - (lastActivityTime || Date.now());
      console.log(`[WebSocket] Connection idle for ${Math.floor(idleDuration / 1000 / 60)} minutes. Closing connection.`);
      
      // Close the connection due to idle timeout
      if (globalWebSocket) {
        globalWebSocket.close(1000, "Idle timeout");
      }
      
      // Will reconnect automatically if there are subscribed tasks
    }, IDLE_TIMEOUT);
  }
}

/**
 * Ensure WebSocket connection is established
 * Returns a promise that resolves when connection is ready
 * Prevents multiple simultaneous connection attempts
 * 
 * This maintains ONE persistent connection that is reused for all tasks
 */
async function ensureWebSocketConnection() {
  // If already connected, reset idle timeout and return immediately
  if (globalWebSocket && globalWebSocket.readyState === WebSocket.OPEN) {
    resetIdleTimeout();
    return Promise.resolve();
  }
  
  // If connection is in progress, return the existing promise
  if (connectionPromise) {
    return connectionPromise;
  }
  
  // Start new connection attempt (even if no tasks yet - persistent connection)
  const promise = connectWebSocket();
  connectionPromise = promise;
  
  // Clear promise when connection completes (success or failure)
  promise.finally(() => {
    // Only clear if this is still the current promise
    if (connectionPromise === promise) {
      connectionPromise = null;
    }
  });
  
  return promise;
}

/**
 * Connect to WebSocket server
 * This function ensures only ONE connection is created
 * Returns a promise that resolves when connection is established
 */
async function connectWebSocket() {
  // CRITICAL: Double-check to prevent race conditions
  // Check if already connected or connecting BEFORE setting isConnecting
  if (globalWebSocket) {
    if (globalWebSocket.readyState === WebSocket.OPEN) {
      console.log(`[WebSocket] Already connected, reusing existing connection`);
      return Promise.resolve();
    }
    if (globalWebSocket.readyState === WebSocket.CONNECTING) {
      console.log(`[WebSocket] Connection already in progress, waiting...`);
      // Wait for connection to complete
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (globalWebSocket.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve();
          } else if (globalWebSocket.readyState === WebSocket.CLOSED) {
            clearInterval(checkInterval);
            reject(new Error("Connection closed"));
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error("Connection timeout"));
        }, 10000);
      });
    }
  }
  
  // Check if another connection attempt is in progress
  if (isConnecting) {
    console.log(`[WebSocket] Connection attempt already in progress, waiting...`);
    // Return the existing promise if available
    if (connectionPromise) {
      return connectionPromise;
    }
    // Otherwise wait a bit and retry
    await new Promise(resolve => setTimeout(resolve, 100));
    return connectWebSocket(); // Retry
  }
  
  // ATOMIC: Set connecting flag BEFORE any async operations
  isConnecting = true;
  console.log(`[WebSocket] Starting new connection attempt...`);
  
  try {
    // Get authenticated WebSocket URL (only once per connection)
    const { url: wsUrl } = await getWebSocketUrl();
    
    console.log(`[WebSocket] Creating single WebSocket connection to ${wsUrl.substring(0, 50)}...`);
    
    const ws = new WebSocket(wsUrl);
    
    // Create the promise BEFORE setting up handlers
    const promise = new Promise((resolve, reject) => {
      
      ws.onopen = () => {
        // CRITICAL: Check if another connection was created while we were connecting
        if (globalWebSocket && globalWebSocket !== ws) {
          console.warn(`[WebSocket] ⚠️ Another connection exists! Closing duplicate.`);
          ws.close();
          // Resolve with the existing connection
          if (globalWebSocket.readyState === WebSocket.OPEN) {
            resolve();
          } else {
            reject(new Error("Duplicate connection detected"));
          }
          return;
        }
        
        console.log(`[WebSocket] ✅ Persistent connection established. Subscribed to ${subscribedTasks.size} task(s)`);
        isConnecting = false;
        websocketReconnectAttempts = 0;
        
        // Store the connection globally (only if not already set)
        if (!globalWebSocket) {
          globalWebSocket = ws;
        }
        
        // Initialize activity tracking
        lastActivityTime = Date.now();
        resetIdleTimeout();
        
        // Load tasks from IndexedDB and subscribe to them
        loadTasksFromIndexedDB();
        
        // Send initial subscription with all current tasks
        sendSubscriptionUpdate();
        
        // Resolve the promise
        resolve();
      };
      
      ws.onmessage = (event) => {
        try {
          // Update activity time on any message
          lastActivityTime = Date.now();
          resetIdleTimeout();
          
          const payload = JSON.parse(event.data);
          
          // Handle connection confirmation message
          if (payload.type === "connected") {
            console.log(`[WebSocket] ${payload.message || "Connection confirmed by server"}`);
            return;
          }
          
          const { task_id } = payload;
          
          if (task_id && messageHandlers.has(task_id)) {
            const handler = messageHandlers.get(task_id);
            handler(payload);
          } else if (task_id) {
            console.warn(`[WebSocket] Received update for unsubscribed task: ${task_id}`);
          }
        } catch (error) {
          console.error("[WebSocket] Error parsing message:", error);
        }
      };
      
      ws.onerror = (error) => {
        console.error("[WebSocket] Connection error:", error);
        console.error("[WebSocket] Error details:", {
          readyState: ws.readyState,
          url: ws.url,
          error: error
        });
        isConnecting = false;
        // Don't reject immediately - let onclose handle it
        // This prevents premature promise rejection
      };
      
      ws.onclose = (event) => {
        console.log(`[WebSocket] Persistent connection closed. Code: ${event.code}, Reason: ${event.reason || "No reason provided"}`);
        console.log(`[WebSocket] Close event details:`, {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          readyState: ws.readyState
        });
        isConnecting = false;
        
        // Clear idle timeout
        if (idleTimeout) {
          clearTimeout(idleTimeout);
          idleTimeout = null;
        }
        lastActivityTime = null;
        
        // Only clear globalWebSocket if this is the current connection
        if (globalWebSocket === ws) {
          globalWebSocket = null;
        }
        connectionPromise = null; // Clear connection promise on close
        
        // Reject the promise if connection closed before opening
        if (ws.readyState === WebSocket.CLOSED && !event.wasClean && event.code !== 1000) {
          reject(new Error(`Connection closed unexpectedly: ${event.reason || `Code ${event.code}`}`));
        }
        
        // Attempt to reconnect if we should (only if connection broke, not if it was closed intentionally)
        // Don't reconnect if it was an idle timeout and there are no active tasks
        const wasIdleTimeout = event.reason === "Idle timeout";
        const wasNormalClose = event.code === 1000; // Normal closure
        const hasActiveTasks = subscribedTasks.size > 0;
        
        if (shouldReconnect && hasActiveTasks && !wasNormalClose && websocketReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          websocketReconnectAttempts++;
          console.log(`[WebSocket] Connection closed unexpectedly. Reconnecting (${websocketReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
          setTimeout(() => {
            ensureWebSocketConnection();
          }, RECONNECT_DELAY);
        } else if (wasIdleTimeout && !hasActiveTasks) {
          console.log(`[WebSocket] Connection closed due to idle timeout. No active tasks. Will reconnect when needed.`);
        } else if (wasNormalClose) {
          console.log(`[WebSocket] Connection closed normally.`);
        } else if (websocketReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error("[WebSocket] Max reconnection attempts reached. Giving up.");
          // Notify all handlers of connection failure
          messageHandlers.forEach((handler, taskId) => {
            try {
              handler({
                task_id: taskId,
                state: "FAILURE",
                error: "WebSocket connection failed after multiple attempts",
                message: "failure"
              });
            } catch (err) {
              console.error(`[WebSocket] Error notifying handler for task ${taskId}:`, err);
            }
          });
        }
      };
    });
    
    // Store the promise globally so other calls can wait for it
    connectionPromise = promise;
    
    return promise;
  } catch (error) {
    console.error("[WebSocket] Error creating WebSocket:", error);
    isConnecting = false;
    connectionPromise = null; // Clear connection promise on error
    // Notify all handlers of connection failure
    messageHandlers.forEach((handler, taskId) => {
      try {
        handler({
          task_id: taskId,
          state: "FAILURE",
          error: "Failed to authenticate WebSocket connection",
          message: "failure"
        });
      } catch (err) {
        console.error(`[WebSocket] Error notifying handler for task ${taskId}:`, err);
      }
    });
    throw error; // Re-throw to reject the promise
  }
}

/**
 * Load tasks from IndexedDB and subscribe to them
 */
async function loadTasksFromIndexedDB() {
  try {
    const tasks = await getTasksFromStorage();
    console.log(`[WebSocket] Loaded ${tasks.length} task(s) from IndexedDB`);
    
    // Subscribe to all tasks found in IndexedDB
    // Note: Individual handlers should be registered via subscribeToTask()
    // This just ensures the WebSocket knows about them
    // DON'T clear subscribedTasks here - it will remove active subscriptions!
    if (tasks.length > 0 && globalWebSocket && globalWebSocket.readyState === WebSocket.OPEN) {
      const taskIds = tasks.map(t => t.taskId);
      // Add tasks from IndexedDB to subscribedTasks (don't clear existing ones)
      taskIds.forEach(id => subscribedTasks.add(id));
      sendSubscriptionUpdate();
    }
  } catch (error) {
    console.error("[WebSocket] Error loading tasks from IndexedDB:", error);
  }
}

/**
 * Close WebSocket connection
 */
export function closeWebSocket() {
  shouldReconnect = false;
  connectionPromise = null; // Clear any pending connection
  
  // Clear idle timeout
  if (idleTimeout) {
    clearTimeout(idleTimeout);
    idleTimeout = null;
  }
  lastActivityTime = null;
  
  if (globalWebSocket) {
    globalWebSocket.close();
    globalWebSocket = null;
  }
  subscribedTasks.clear();
  messageHandlers.clear();
  isConnecting = false;
  websocketReconnectAttempts = 0;
  console.log("[WebSocket] Persistent connection closed and cleaned up");
}

/**
 * Get current WebSocket connection state
 */
export function getWebSocketState() {
  if (!globalWebSocket) {
    return "CLOSED";
  }
  const states = {
    [WebSocket.CONNECTING]: "CONNECTING",
    [WebSocket.OPEN]: "OPEN",
    [WebSocket.CLOSING]: "CLOSING",
    [WebSocket.CLOSED]: "CLOSED"
  };
  return states[globalWebSocket.readyState] || "UNKNOWN";
}

/**
 * Check if WebSocket is connected
 */
export function isWebSocketConnected() {
  return globalWebSocket && globalWebSocket.readyState === WebSocket.OPEN;
}

// Set up page unload handler
if (typeof window !== 'undefined' && !window.__websocketCleanupSetup) {
  window.addEventListener('beforeunload', () => {
    closeWebSocket();
  });
  
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) {
      closeWebSocket();
    }
  });
  
  window.__websocketCleanupSetup = true;
}

