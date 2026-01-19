/**
 * Map step numbers to progress percentages and messages
 * Steps match the Celery task steps:
 * 1: Extracting, 2: Classifying, 3: Embeddings, 4: Saving, 5: Finalizing, 7: Success
 * @param {number} step - Step number from the task
 * @returns {Object} Object with progress percentage and message
 */
export const stepToProgress = (step) => {
  const stepMap = {
    1: { progress: 20, message: "Extracting Document Information" },
    2: { progress: 40, message: "Classifying Document" },
    3: { progress: 60, message: "Generating Embeddings" },
    4: { progress: 80, message: "Saving Document Data" },
    5: { progress: 90, message: "Finalizing" },
    7: { progress: 100, message: "Successfully Uploaded" },
  };
  return stepMap[step] || { progress: 0, message: "Processing..." };
};

