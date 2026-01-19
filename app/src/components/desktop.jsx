"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCcw, MoreHorizontal, Pencil, Trash, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function DesktopConversationSidebar({
  conversations,
  isLoadingConversations,
  conversationId,
  onSelectConversation,
  onRefresh,
  onNewChat,
  onRenameClick,
  onDeleteClick,
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="hidden lg:flex h-full relative">
      {/* Toggle Button - Always visible on the left edge */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 z-10 flex h-8 w-6 items-center justify-center rounded-r-md border bg-background shadow-md hover:bg-accent transition-all duration-300",
          isCollapsed ? "left-0" : "-left-3"
        )}
        title={isCollapsed ? "Show conversations" : "Hide conversations"}
        aria-expanded={!isCollapsed}
        aria-controls="conversations-panel"
        aria-label={isCollapsed ? "Show conversations" : "Hide conversations"}
      >
        {isCollapsed ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {/* Sliding Panel Container */}
      <div
        id="conversations-panel"
        className={cn(
          "h-full flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden",
          isCollapsed ? "w-0" : "w-96"
        )}
      >
        <div
          className={cn(
            "h-full w-96 transition-all duration-300 ease-in-out",
            isCollapsed ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0"
          )}
        >
          <Card className="flex h-full w-full flex-col overflow-hidden">
            <CardHeader className="border-b py-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                  <h2 className="text-lg font-semibold dark:text-white">
                    Conversations
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={onRefresh} 
                    title="Refresh"
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <ScrollArea className="h-full p-2">
                {isLoadingConversations && (
                  <div className="p-2 text-sm text-gray-500">Loading...</div>
                )}
                {!isLoadingConversations && conversations.length === 0 && (
                  <div className="p-2 text-sm text-gray-500">
                    No conversations yet
                  </div>
                )}
                <div className="space-y-1">
                  {conversations.map((c) => {
                    const isActive = conversationId === c.id;
                    return (
                      <div key={c.id} className="px-2">
                        <div
                          className={cn(
                            "group flex items-start gap-2 rounded-md px-2 py-2 transition-colors",
                            isActive
                              ? "border border-blue-200 bg-blue-50 text-gray-900 dark:border-blue-800 dark:bg-blue-900/30 dark:text-white"
                              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                          )}
                          title={c.title || "Untitled conversation"}
                        >
                          <button
                            className="flex-1 text-left w-20"
                            onClick={() => onSelectConversation(c.id)}
                          >
                            <div className="truncate text-sm font-medium dark:text-white">
                              {c.title || "Untitled conversation"}
                            </div>
                            <div
                              className={`truncate text-xs ${
                                isActive ? "text-gray-600 dark:text-gray-400" : "text-gray-500"
                              }`}
                            >
                              {new Date(
                                c.lastMessageAt || c.createdAt
                              ).toLocaleString()}
                            </div>
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="opacity-100 rounded flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 p-1 transition-colors"
                                title="Options"
                                aria-label="Conversation options"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  onRenameClick(c.id, c.title || "");
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => onDeleteClick(c.id)}
                              >
                                <Trash className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
            <div className="border-t p-2 flex-shrink-0">
              <Button className="w-full" onClick={onNewChat}>
                New Chat
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

