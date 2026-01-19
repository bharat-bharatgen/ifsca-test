"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ProgressTrackerContext = createContext(null);

export function ProgressTrackerProvider({ children }) {
  const [tasks, setTasks] = useState(new Map());
  const [isOpen, setIsOpen] = useState(false);

  const addTask = useCallback((taskId, fileName) => {
    setTasks(prev => {
      const newTasks = new Map(prev);
      newTasks.set(taskId, {
        id: taskId,
        fileName,
        progress: 0,
        message: "Uploading...",
        status: "processing", // processing, success, error
      });
      return newTasks;
    });
  }, []);

  const updateTask = useCallback((taskId, updates) => {
    setTasks(prev => {
      const newTasks = new Map(prev);
      const existing = newTasks.get(taskId);
      if (existing) {
        newTasks.set(taskId, { ...existing, ...updates });
      }
      return newTasks;
    });
  }, []);

  const removeTask = useCallback((taskId) => {
    setTasks(prev => {
      const newTasks = new Map(prev);
      newTasks.delete(taskId);
      return newTasks;
    });
  }, []);

  const value = {
    tasks,
    addTask,
    updateTask,
    removeTask,
    isOpen,
    setIsOpen,
  };

  return (
    <ProgressTrackerContext.Provider value={value}>
      {children}
      <ProgressTrackerBadge />
      <ProgressTrackerSheet />
    </ProgressTrackerContext.Provider>
  );
}

function ProgressTrackerBadge() {
  const { tasks, setIsOpen } = useContext(ProgressTrackerContext);
  const activeTasks = Array.from(tasks.values()).filter(
    t => t.status === "processing"
  );

  if (activeTasks.length === 0) {
    return null;
  }

  return (
    <Button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg"
      size="icon"
      variant="default"
    >
      <div className="relative">
        <Upload className="h-5 w-5" />
        {activeTasks.length > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
          >
            {activeTasks.length}
          </Badge>
        )}
      </div>
    </Button>
  );
}

function ProgressTrackerSheet() {
  const { tasks, isOpen, setIsOpen } = useContext(ProgressTrackerContext);
  const taskList = Array.from(tasks.values());

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Upload Progress</SheetTitle>
          <SheetDescription>
            {taskList.length === 0
              ? "No active uploads"
              : `${taskList.filter(t => t.status === "processing").length} file(s) processing`}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-120px)] mt-4">
          <div className="space-y-3 pr-4">
            {taskList.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No uploads in progress
              </div>
            ) : (
              taskList.map((task) => (
                <TaskProgressItem key={task.id} task={task} />
              ))
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function TaskProgressItem({ task }) {
  const { fileName, progress, message, status } = task;

  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium break-words whitespace-normal">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-1 break-words whitespace-normal">
            {message}
          </p>
        </div>
        <div className="flex-shrink-0">
          {status === "processing" && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          {status === "success" && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {status === "error" && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
      </div>
      {status === "processing" && (
        <div className="space-y-1">
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className={cn(
                "h-2 rounded-full transition-all duration-300 min-w-0",
                status === "success" ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {progress}%
          </p>
        </div>
      )}
      {status === "success" && (
        <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
          <div className="bg-green-500 h-2 rounded-full min-w-0" style={{ width: "100%" }} />
        </div>
      )}
    </div>
  );
}

export function useProgressTracker() {
  const context = useContext(ProgressTrackerContext);
  if (!context) {
    throw new Error(
      "useProgressTracker must be used within a ProgressTrackerProvider. " +
      "Make sure your component tree is wrapped in <ProgressTrackerProvider>."
    );
  }
  return context;
}

