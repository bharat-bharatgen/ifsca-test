/**
 * IndexedDB utilities for storing and retrieving document upload tasks
 * This allows tasks to persist across page reloads
 */

import { openDB } from "idb";

const DB_NAME = "DocumentManagementDB";
const DB_VERSION = 1;
const STORE_NAME = "uploadTasks";

/**
 * Initialize and return the database instance
 * @returns {Promise<IDBPDatabase>}
 */
async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "taskId" });
        // Create index for faster lookups if needed
        objectStore.createIndex("taskId", "taskId", { unique: true });
      }
    },
  });
}

/**
 * Save a task to IndexedDB
 * @param {Object} taskInfo - Task information object
 * @param {string} taskInfo.taskId - Unique task identifier
 * @param {string} taskInfo.documentId - Document ID
 * @param {string} taskInfo.fileName - File name
 * @param {number} taskInfo.index - File index
 * @returns {Promise<void>}
 */
export async function saveTaskToStorage(taskInfo) {
  try {
    const db = await getDB();
    
    // Store the task with taskId as the key
    const taskData = {
      taskId: taskInfo.taskId,
      documentId: taskInfo.documentId,
      fileName: taskInfo.fileName,
      index: taskInfo.index,
      timestamp: Date.now(), // Add timestamp for potential cleanup
    };
    
    await db.put(STORE_NAME, taskData);
    console.log(`Task ${taskInfo.taskId} saved to IndexedDB`);
  } catch (error) {
    console.error("Error saving task to IndexedDB:", error);
    throw error;
  }
}

/**
 * Get a single task from IndexedDB by taskId
 * @param {string} taskId - Task identifier
 * @returns {Promise<Object|undefined>} Task object or undefined if not found
 */
export async function getTaskFromStorage(taskId) {
  try {
    const db = await getDB();
    const task = await db.get(STORE_NAME, taskId);
    return task || null;
  } catch (error) {
    console.error("Error getting task from IndexedDB:", error);
    throw error;
  }
}

/**
 * Get all tasks from IndexedDB
 * @returns {Promise<Array>} Array of all tasks
 */
export async function getTasksFromStorage() {
  try {
    const db = await getDB();
    const tasks = await db.getAll(STORE_NAME);
    return tasks || [];
  } catch (error) {
    console.error("Error getting tasks from IndexedDB:", error);
    throw error;
  }
}

/**
 * Remove a task from IndexedDB
 * @param {string} taskId - Task identifier
 * @returns {Promise<void>}
 */
export async function removeTaskFromStorage(taskId) {
  try {
    const db = await getDB();
    await db.delete(STORE_NAME, taskId);
    console.log(`Task ${taskId} removed from IndexedDB`);
  } catch (error) {
    console.error("Error removing task from IndexedDB:", error);
    throw error;
  }
}

/**
 * Clear all tasks from IndexedDB
 * @returns {Promise<void>}
 */
export async function clearAllTasks() {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
    console.log("All tasks cleared from IndexedDB");
  } catch (error) {
    console.error("Error clearing tasks from IndexedDB:", error);
    throw error;
  }
}

/**
 * Ensure task is saved to IndexedDB (saves if missing)
 * @param {Object} taskInfo - Task information object
 * @param {boolean} skipSave - If true, skip saving
 * @returns {Promise<void>}
 */
export async function ensureTaskInStorage(taskInfo, skipSave = false) {
  if (skipSave) return;
  
  try {
    const existing = await getTaskFromStorage(taskInfo.taskId);
    if (!existing) {
      console.warn(`Task ${taskInfo.taskId} not found in IndexedDB, saving now as backup`);
      await saveTaskToStorage(taskInfo);
    }
  } catch (err) {
    console.error("Error ensuring task in IndexedDB:", err);
  }
}

/**
 * Remove task from IndexedDB with retry logic
 * @param {string} taskId - Task identifier
 * @returns {Promise<void>}
 */
export async function removeTaskFromStorageWithRetry(taskId) {
  try {
    await removeTaskFromStorage(taskId);
    console.log(`Successfully removed task ${taskId} from IndexedDB`);
  } catch (err) {
    console.error(`Failed to remove task ${taskId} from IndexedDB:`, err);
    // Retry once after a short delay
    setTimeout(() => {
      removeTaskFromStorage(taskId).catch(retryErr =>
        console.error(`Retry failed to remove task ${taskId} from IndexedDB:`, retryErr)
      );
    }, 1000);
  }
}


