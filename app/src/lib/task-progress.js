import { ensureTaskInStorage, removeTaskFromStorageWithRetry } from "@/lib/indexeddb-utils";
import {
  subscribeToTask,
  unsubscribeFromTask,
} from "@/lib/websocket-utils";
import { stepToProgress } from "@/lib/progress-utils";

const noop = () => {};

const normalizeProgressTracker = (progressTracker = {}) => ({
  add: progressTracker.addTask ?? noop,
  update: progressTracker.updateTask ?? noop,
  remove: progressTracker.removeTask ?? noop,
});

const handleTaskCompletion = ({
  taskId,
  completedRef,
  status,
  message,
  progressTracker,
}) => {
  completedRef.current += 1;
  removeTaskFromStorageWithRetry(taskId);

  progressTracker.update(taskId, {
    progress: 100,
    message,
    status,
  });

  unsubscribeFromTask(taskId);
};

const handleSuccessMessage = (params) => {
  const {
    payload,
    documentId,
    taskId,
    completedRef,
    resolve,
    fileName,
    index,
    progressTracker,
  } = params;

  const finalDocumentId = payload.document?.id || documentId;
  handleTaskCompletion({
    taskId,
    completedRef,
    status: "success",
    message: "✓ Successfully processed",
    progressTracker,
  });

  resolve({ success: true, documentId: finalDocumentId, fileName, index });
};

const handleFailureMessage = (params) => {
  const {
    payload,
    taskId,
    completedRef,
    resolve,
    fileName,
    index,
    progressTracker,
  } = params;

  const errorMessage = payload.error || "Processing failed";
  handleTaskCompletion({
    taskId,
    completedRef,
    status: "error",
    message: `✗ ${errorMessage}`,
    progressTracker,
  });
  resolve({ success: false, error: errorMessage, fileName, index });
};

/**
 * Setup WebSocket message handler for a task
 */
const setupWebSocketHandler = (params) => {
  const {
    taskId,
    documentId,
    fileName,
    index,
    skipSave,
    completedRef,
    resolve,
    progressTracker,
  } = params;

  // Create message handler function
  const messageHandler = (payload) => {
    try {
      console.log(`[WebSocket] Received message for task ${taskId}:`, payload);

      if (payload.message === "step" && typeof payload.step === "number") {
        const { progress, message } = stepToProgress(payload.step);
        progressTracker.update(taskId, {
          progress,
          message,
          status: "processing",
        });
        console.log(`[WebSocket] Updated progress for ${taskId}: step ${payload.step}, progress ${progress}%`);
      } else if (payload.message === "success") {
        handleSuccessMessage({
          payload,
          taskId,
          documentId,
          completedRef,
          resolve,
          fileName,
          index,
          progressTracker,
        });
      } else if (payload.message === "failure") {
        handleFailureMessage({
          payload,
          taskId,
          completedRef,
          resolve,
          fileName,
          index,
          progressTracker,
        });
      }
    } catch (parseError) {
      console.error("Error handling WebSocket message:", parseError);
    }
  };

  // Subscribe to task updates via WebSocket
  subscribeToTask(taskId, messageHandler);

  // Update progress if reconnecting
  if (skipSave) {
    progressTracker.update(taskId, {
      progress: 0,
      message: "Processing...",
      status: "processing",
    });
  }
};

export const trackTaskProgress = ({
  taskInfo,
  completedRef,
  skipSave = false,
  progressTracker: progressTrackerInput,
  toast,
}) => {
  const progressTracker = normalizeProgressTracker(progressTrackerInput);

  return new Promise(async (resolve) => {
    const { taskId, documentId, fileName, index } = taskInfo;

    await ensureTaskInStorage(taskInfo, skipSave);

    console.log(`[WebSocket] Subscribing to task: ${taskId}, fileName: ${fileName}`);

    const initialMessage = skipSave ? "Reconnecting..." : "Uploading...";
    progressTracker.add(taskId, fileName);
    progressTracker.update(taskId, {
      progress: 0,
      message: initialMessage,
      status: "processing",
    });

    // Setup WebSocket handler
    setupWebSocketHandler({
      taskId,
      documentId,
      fileName,
      index,
      skipSave,
      completedRef,
      resolve,
      progressTracker,
    });
  });
};

