"use client";

import { useEffect, useRef } from "react";
import { useProgressTracker } from "@/components/progress-tracker";
import { getTasksFromStorage } from "@/lib/indexeddb-utils";
import { isWebSocketConnected } from "@/lib/websocket-utils";
import { trackTaskProgress as trackTaskProgressUtil } from "@/lib/task-progress";

/**
 * Component that restores pending tasks from IndexedDB on mount
 * This should be mounted at the page level so it always runs, even when dialogs are closed
 */
export const TaskRestore = () => {
  const { addTask, updateTask, removeTask } = useProgressTracker();
  const trackTaskProgressRef = useRef(null);
  
  useEffect(() => {
    // Store the function reference with progress tracker
    const progressTracker = { addTask, updateTask, removeTask };
    trackTaskProgressRef.current = (taskInfo, total, completedRef, firstDocumentIdRef, skipSave = false) => {
      return trackTaskProgressUtil({
        taskInfo,
        completedRef,
        skipSave,
        progressTracker,
      }).then((result) => {
        if (result.success && taskInfo.index === 1 && firstDocumentIdRef && !firstDocumentIdRef.current) {
          firstDocumentIdRef.current = result.documentId;
        }
        return result;
      });
    };
    
    const restorePendingTasks = async () => {
      try {
        // Step 1: Fetch task IDs from IndexedDB
        const pendingTasks = await getTasksFromStorage();
        
        if (pendingTasks.length === 0) {
          console.log("[WebSocket] No pending tasks found in IndexedDB");
          return;
        }

        console.log(`[WebSocket] Found ${pendingTasks.length} pending task(s) in IndexedDB, restoring...`);

        const completedRef = { current: 0 };
        const firstDocumentIdRef = { current: null };
        
        // Small delay to ensure component is fully mounted
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!trackTaskProgressRef.current) {
          console.error("[WebSocket] trackTaskProgress not available for restore");
          return;
        }
        
        // Step 2: Subscribe to each task via WebSocket
        // trackTaskProgressUtil will handle WebSocket subscription
        pendingTasks.forEach((taskInfo) => {
          console.log(`[WebSocket] Restoring task: ${taskInfo.taskId} (file: ${taskInfo.fileName})`);
          trackTaskProgressRef.current(taskInfo, pendingTasks.length, completedRef, firstDocumentIdRef, true);
        });
        
        console.log(`[WebSocket] Successfully restored ${pendingTasks.length} task(s)`);
      } catch (error) {
        console.error("[WebSocket] Error restoring pending tasks from IndexedDB:", error);
      }
    };

    // Delay restoration slightly to ensure component is fully mounted
    const timeoutId = setTimeout(restorePendingTasks, 300);
    return () => {
      clearTimeout(timeoutId);
      // WebSocket cleanup is handled globally in websocket-utils.js
      // No need for component-level cleanup
    };
  }, [addTask, updateTask, removeTask]);

  // Note: WebSocket cleanup is handled globally in websocket-utils.js
  // No need for component-level cleanup handlers

  // This component doesn't render anything
  return null;
};

