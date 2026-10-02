"use client";

import React, { useState } from "react";
import { Button } from "@/components/chat/primitives";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCcw, MoreHorizontal, Pencil, Trash, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/chat/primitives";
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

  const [query, setQuery] = useState("");
  const filtered = conversations.filter(c => (c.title || "Untitled conversation").toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="order-1 hidden lg:flex h-full relative border-r bg-muted/30">
      {/* Toggle Button - Always visible on the left edge */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 z-10 flex h-8 w-6 items-center justify-center rounded-l-md border bg-background shadow-md hover:bg-accent transition-opacity duration-150",
          "right-0"
        )}
        title={isCollapsed ? "Show conversations" : "Hide conversations"}
        aria-expanded={!isCollapsed}
        aria-controls="conversations-panel"
        aria-label={isCollapsed ? "Show conversations" : "Hide conversations"}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      {/* Sliding Panel Container */}
      <div
        id="conversations-panel"
        inert={isCollapsed ? true : undefined}
        className={cn(
          "h-full flex-shrink-0 transition-opacity duration-150 ease-in-out overflow-hidden",
          isCollapsed ? "w-0" : "w-72"
        )}
      >
        <div
          className={cn(
            "h-full w-72 transition-opacity duration-150 ease-in-out",
            isCollapsed ? "opacity-0 translate-x-full" : "opacity-100 translate-x-0"
          )}
        >
          <Card className="flex h-full w-full flex-col overflow-hidden rounded-none border-0 shadow-none bg-transparent">
            <CardHeader className="border-b py-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <h2 className="text-sm font-medium ">
                    Conversations
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={onRefresh}
                    title="Refresh" aria-label="Refresh conversations"
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col p-0 overflow-hidden">
              <div className="px-3 py-2"><input aria-label="Search conversations" placeholder="Search conversations…" value={query} onChange={e => setQuery(e.target.value)} className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
              <ScrollArea className="flex-1 min-h-0 p-2">
                {isLoadingConversations && (
                  <div className="p-2 text-sm text-muted-foreground">Loading...</div>
                )}
                {!isLoadingConversations && conversations.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground">
                    No conversations yet
                  </div>
                )}
                <div className="space-y-1">
                  {filtered.map((c) => {
                    const isActive = conversationId === c.id;
                    return (
                      <div key={c.id} className="px-2">
                        <div
                          className={cn(
                            "group flex items-start gap-2 rounded-md px-2 py-2 transition-colors",
                            isActive
                              ? "border border-border bg-accent text-accent-foreground"
                              : "text-foreground hover:bg-accent"
                          )}
                          title={c.title || "Untitled conversation"}
                        >
                          <button
                            aria-current={isActive ? "page" : undefined} className="flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                            onClick={() => onSelectConversation(c.id)}
                          >
                            <div className="truncate text-sm font-medium ">
                              {c.title || "Untitled conversation"}
                            </div>
                            <div
                              className={`truncate text-xs ${isActive ? "text-muted-foreground" : "text-muted-foreground"
                                }`}
                            >
                              {new Date(
                                c.lastMessageAt || c.createdAt
                              ).toLocaleDateString()}
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

          </Card>
        </div>
      </div>
    </div>
  );
}

