"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@radix-ui/react-dropdown-menu";
import {
  UploadCloud,
  Folder,
  X,
  Loader as LoaderIcon
} from "lucide-react"; 
import { toast } from "@/components/ui/use-toast";
import { useProgressTracker } from "@/components/progress-tracker";
import { cn } from "@/lib/utils";
import { Celebrate } from "@/components/celebrate";
import { getSession } from "next-auth/react";
import { DuplicateUploadDialog } from "@/components/ui/duplicate-upload-dialog";
import {
  saveTaskToStorage, 
  getTasksFromStorage, 
  getTaskFromStorage, 
  removeTaskFromStorage,
} from "@/lib/indexeddb-utils";
import { trackTaskProgress as trackTaskProgressUtil } from "@/lib/task-progress";

// Re-export for backward compatibility (no longer needed with WebSocket, but kept for safety)
export { saveTaskToStorage, getTasksFromStorage, removeTaskFromStorage };

export const ContractUploadCard = ({ onUploadComplete }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [folderName, setFolderName] = useState("");
  const folderInputRef = useRef(null);
  const [inputDragged, setInputDragged] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [session, setSession] = useState(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState(null);
  const fileInputRef = useRef(null);
  const { addTask, updateTask, removeTask: removeProgressTask } = useProgressTracker();
  const trackTaskProgressRef = useRef(null); // Ref to store trackTaskProgress function
  const duplicateResolveRef = useRef(null);

  useEffect(() => {
    (async () => {
      const sessionData = await getSession();
      if (!sessionData) {
        toast({
          title: "Authentication Required",
          description: "You need to be logged in to upload a document",
          variant: "destructive",
        });
      } else {
        setSession(sessionData);
      }
    })();
  }, []);

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    
    const validFiles = files.filter(file => validTypes.includes(file.type));
    const invalidFiles = files.filter(file => !validTypes.includes(file.type));
    
    if (invalidFiles.length > 0) {
      toast({
        title: "Some files were skipped",
        description: `${invalidFiles.length} file(s) were skipped due to invalid file type. Only PDF and images are supported.`,
      });
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => {
        const newFiles = [...prev, ...validFiles];
        return newFiles;
      });
      if (event.target.webkitRelativePath) {
        setFolderName(event.target.webkitRelativePath.split('/')[0]);
      }
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setInputDragged(false);
    const files = Array.from(event.dataTransfer.files);
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    
    const validFiles = files.filter(file => validTypes.includes(file.type));
    const invalidFiles = files.filter(file => !validTypes.includes(file.type));
    
    if (invalidFiles.length > 0) {
      toast({
        title: "Some files were skipped",
        description: `${invalidFiles.length} file(s) were skipped due to invalid file type. Only PDF and images are supported.`,
      });
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => {
        const newFiles = [...prev, ...validFiles];
        return newFiles;
      });
    }
  };

  const handleFolderSelect = () => {
    folderInputRef.current.click();
  };

  const handleAnalyzeContractClick = async () => {
    await uploadContract();
  };

  // Show a non-blocking React dialog instead of blocking window.confirm
  const askDuplicateConfirmation = (fileName, existingName) => {
    return new Promise((resolve) => {
      duplicateResolveRef.current = (answer) => {
        resolve(answer);
        duplicateResolveRef.current = null;
        setDuplicatePrompt(null);
      };
      setDuplicatePrompt({
        fileName,
        existingName,
      });
    });
  };

  const uploadSingleFile = async (file, index, total) => {
    const makeRequest = async (forceUpload = false) => {
      const formData = new FormData();
      formData.append("documentFile", file);
      if (forceUpload) {
        formData.append("forceUpload", "true");
      }

      const response = await fetch("/api/v1/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      return response.json();
    };

    try {
      let data = await makeRequest(false);

      // Handle duplicate detection from backend
      if (data.message === "duplicate_found") {
        const existingName =
          data.existingDocument?.name || "an existing document";
        const shouldUpload = await askDuplicateConfirmation(file.name, existingName);

        if (!shouldUpload) {
          return {
            success: false,
            skipped: true,
            reason: "duplicate_skipped",
            fileName: file.name,
            index,
          };
        }

        // User chose to upload anyway - retry with forceUpload flag
        data = await makeRequest(true);
      }
      
      if (data.message === "failure") {
        return {
          success: false,
          error: data.error || "Upload failed",
          fileName: file.name,
          index,
        };
      }
      
      if (data.message === "task_started" && data.task_id) {
        // Immediately persist the task to IndexedDB so it survives page reloads,
        // even if the overall upload flow hasn't finished yet
        try {
          await saveTaskToStorage({
            taskId: data.task_id,
            documentId: data.document.id,
            fileName: file.name,
            index,
          });
        } catch (storageError) {
          console.error(
            `Failed to save task ${data.task_id} to IndexedDB in uploadSingleFile:`,
            storageError
          );
          // Do not fail the upload if IndexedDB save fails
        }

        return {
          success: true,
          documentId: data.document.id,
          taskId: data.task_id,
          fileName: file.name,
          index,
        };
      }
      
      return {
        success: false,
        error: "Unknown response format",
        fileName: file.name,
        index,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || "Upload failed",
        fileName: file.name,
        index,
      };
    }
  };


  const trackTaskProgress = (taskInfo, total, completedRef, skipSave = false) => {
    return trackTaskProgressUtil({
      taskInfo,
      completedRef,
      skipSave,
      progressTracker: {
        addTask,
        updateTask,
        removeTask: removeProgressTask,
      },
      toast,
    });
  };

  // Store trackTaskProgress in ref (kept for potential future use, but restore is handled by TaskRestore component)
  trackTaskProgressRef.current = trackTaskProgress;

  // Cleanup: WebSocket connection is managed globally
  // DO NOT close on component unmount - let WebSocket continue running even when dialog closes
  // Tasks are saved to IndexedDB, so they can be restored if needed
  // WebSocket subscriptions will be cleaned up when tasks complete or on page unload
  useEffect(() => {
    // No cleanup on component unmount - let WebSocket continue
    // This allows uploads to continue tracking even after dialog closes
    return () => {
      // Only log, don't close WebSocket
      console.log('ContractUploadCard unmounting, but keeping WebSocket active');
    };
  }, []);

  // Note: Global cleanup is handled by the module-level event listeners in websocket-utils.js
  // No need for component-level beforeunload handler since we use global WebSocket connection

  const uploadContract = async () => {
    try {
      setIsLoading(true);
      document.body.style.pointerEvents = "none";
      if (selectedFiles.length === 0) return;
      
      const total = selectedFiles.length;
      const completedRef = { current: 0 };
      
      // Upload all files (duplicate detection happens per-file in uploadSingleFile)
      const uploadResults = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        // index is 1-based for user-friendly messaging
        // eslint-disable-next-line no-await-in-loop
        const result = await uploadSingleFile(file, i + 1, selectedFiles.length);
        uploadResults.push(result);
      }
      
      // Separate successful, skipped (user-cancelled), and failed uploads
      const successfulUploads = uploadResults.filter(r => r.success && r.taskId);
      const skippedUploads = uploadResults.filter(r => r.skipped);
      const failedUploads = uploadResults.filter(r => !r.success && !r.skipped);
      
      // Show errors only for real failed uploads (not user-cancelled ones)
      failedUploads.forEach((result) => {
        toast({
          title: `Error uploading ${result.fileName}`,
          description: result.error || "Upload failed",
          variant: "destructive",
        });
      });
      
      if (successfulUploads.length === 0) {
        // If everything was skipped (e.g., user rejected all duplicates), don't show error toasts
        if (failedUploads.length === 0 && skippedUploads.length > 0) {
          toast({
            title: "No new files uploaded",
            description: "You chose not to upload the selected duplicate files.",
          });
        } else {
          toast({
            title: "Upload failed",
            description: "No files were successfully uploaded.",
            variant: "destructive",
          });
        }
        // Close the dialog if no uploads are going to be processed
        if (onUploadComplete) {
          onUploadComplete();
        }
        return;
      }
      
      // Step 2: Start tracking all tasks in parallel FIRST (toasts are created inside trackTaskProgress)
      // This ensures WebSocket subscriptions are created before the dialog closes
      const trackingPromises = successfulUploads.map((taskInfo) => {
        try {
          const promise = trackTaskProgress(taskInfo, total, completedRef);
          // Promise resolves when task completes
          promise.then(() => {
            // Task completed
          }).catch((err) => {
            console.error(`Tracking promise error for task ${taskInfo.taskId}:`, err);
          });
          return promise;
        } catch (error) {
          console.error(`Error starting tracking for task ${taskInfo.taskId}:`, error);
          return Promise.resolve({ 
            success: false, 
            error: error.message || "Failed to start tracking", 
            fileName: taskInfo.fileName, 
            index: taskInfo.index 
          });
        }
      });
      
      // Wait a moment for WebSocket subscriptions to initialize, then close dialog
      // This ensures WebSocket is connected and subscriptions are registered before component might unmount
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log(`Subscribed to ${successfulUploads.length} task(s) via WebSocket`);
      
      // Close the dialog AFTER WebSocket subscriptions are created
      if (onUploadComplete) {
        onUploadComplete();
      }
      
      // Redirect disabled - user stays on current page after upload
      // Wait for all tasks to complete
      const allResults = await Promise.all(trackingPromises);
      const successCount = allResults.filter(r => r.success).length;
      
      // Show summary toast
      if (successCount === total) {
        toast({
          title: "All files processed!",
          description: `${successCount}/${total} files processed successfully.`,
        });
      } else {
        toast({
          title: "Processing complete",
          description: `${successCount}/${total} files processed successfully.`,
        });
      }
      
    } catch (error) {
      toast({
        title: "Upload Error",
        description: error.message || "There was an error while uploading your documents. Please try again.",
        variant: "destructive",
      });
      console.error("Error while uploading documents: ", error);
    } finally {
      document.body.style.pointerEvents = "auto";
      setIsLoading(false);
      setSelectedFiles([]);
    }
  };

  return (
    <>
      <Card>
        <Celebrate celebrate={celebrate} />
        <CardHeader>
          <CardTitle>Document Assessment</CardTitle>
          <CardDescription>
            Submit your documents for summarization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            id="contract-upload-card"
            className="flex flex-col gap-4 max-h-[70vh]"
          >
            <div className="flex-1 min-h-0 overflow-hidden">
              <div className="flex items-center gap-4 mb-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleFolderSelect}
                  disabled={session?.user?.isGuest}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Upload Folder
                </Button>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault();
                  setInputDragged(true);
                }}
                onDragEnd={() => setInputDragged(false)}
                onDragLeave={() => setInputDragged(false)}
                onDragExit={() => setInputDragged(false)}
                className={cn(
                  "w-full h-40 flex items-center justify-center gap-4 border-2 border-dashed rounded-lg hover:border-primary hover:text-primary dark:hover:border-primary dark:hover:text-primary ease-in-out duration-200 text-center cursor-pointer",
                  inputDragged
                    ? "border-primary text-primary"
                    : "border-gray-300 text-gray-500"
                )}
                onClick={() => fileInputRef.current.click()}
              >
                <div className="text-center">
                  <UploadCloud className="w-8 h-8 mx-auto mb-2" />
                  <p>Drag and drop files or folders here</p>
                  <p className="text-sm text-muted-foreground">
                    Supports PDF, JPG, JPEG, PNG
                  </p>
                  {/* Unlimited uploads enabled */}
                </div>
              </div>

              <input
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                className="hidden"
              />
              
              <input
                onChange={handleFileChange}
                ref={folderInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                webkitdirectory="true"
                directory="true"
                multiple
                className="hidden"
              />

              {selectedFiles.length > 0 && (
                <div className="mt-4 flex flex-col max-h-[40vh]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">
                      Selected Files ({selectedFiles.length})
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFiles([])}
                    >
                      Clear All
                    </Button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto border rounded-lg divide-y md:w-full w-72">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2"
                      >
                        <span className="text-sm text-muted-foreground">
                          {file.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedFiles(files => 
                              files.filter((_, i) => i !== index)
                            );
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleAnalyzeContractClick}
              disabled={selectedFiles.length === 0 || isLoading}
            >
              {isLoading ? (
                <>
                  <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
                  Uploading {selectedFiles.length} file(s)...
                </>
              ) : (
                `Analyze ${selectedFiles.length} Document(s)`
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Duplicate confirmation dialog (reusable component) */}
      <DuplicateUploadDialog
        open={!!duplicatePrompt}
        fileName={duplicatePrompt?.fileName || ""}
        existingName={duplicatePrompt?.existingName || ""}
        onCancel={() => {
          if (duplicateResolveRef.current) {
            duplicateResolveRef.current(false);
          }
        }}
        onConfirm={() => {
          if (duplicateResolveRef.current) {
            duplicateResolveRef.current(true);
          }
        }}
      />
    </>
  );
};
