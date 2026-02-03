"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCcw, MoreHorizontal, Pencil, Trash, MenuIcon } from "lucide-react";
import { ThemeToggle } from "@/components/custom/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

export default function MobileConversationSidebar({
  conversations,
  isLoadingConversations,
  conversationId,
  isSheetOpen,
  onSheetOpenChange,
  onSelectConversation,
  onRefresh,
  onNewChat,
  onRenameClick,
  onDeleteClick,
}) {
  return (
    <div className="lg:hidden">
      <Sheet open={isSheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon">
            <MenuIcon className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-full p-0 sm:w-[400px]">
          <Card className="flex h-full flex-col">
            <CardHeader className="border-b">
              <div className="close-btn">
                <div className="flex items-center justify-between">
                  <div className="text-start">
                    <h2 className="text-lg font-semibold dark:text-white">
                      Conversations
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <button onClick={onRefresh}>
                      <RefreshCcw className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-grow p-0">
              <ScrollArea className="h-[calc(100vh-240px)] p-2">
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
                          className={`group flex items-start gap-2 rounded-md px-2 py-2 ${isActive
                              ? "border border-gray-200 bg-gray-100 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                            }`}
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
                              className={`truncate text-xs ${isActive ? "text-gray-600" : "text-gray-500"
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
                                className="opacity-100 rounded flex items-center justify-center"
                                title="Options"
                                aria-label="Conversation options"
                              >
                                <MoreHorizontal className="mt-0.5" />
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
            <div className="border-t p-2">
              <Button className="w-full" onClick={onNewChat}>
                New Chat
              </Button>
            </div>
          </Card>
        </SheetContent>
      </Sheet>
    </div>
  );
}

