"use client";

import React, { useState } from "react";
import { Button } from "@/components/chat/primitives";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCcw, MoreHorizontal, Pencil, Trash, MenuIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/chat/primitives";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/chat/primitives";

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
  const [query, setQuery] = useState("");
  const filtered = conversations.filter(c => (c.title || "Untitled conversation").toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="lg:hidden">
      <Sheet open={isSheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open conversations">
            <MenuIcon className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <Card className="flex h-full flex-col rounded-none border-0 bg-transparent shadow-none">
            <CardHeader className="border-b pt-14 pb-4 px-4">
              <div className="close-btn">
                <div className="flex items-center justify-between">
                  <div className="text-start">
                    <SheetTitle className="text-lg font-semibold">
                      Conversations
                    </SheetTitle>
                  </div>
                  <div className="flex items-center gap-2">
                      <button aria-label="Refresh conversations" onClick={onRefresh}>
                      <RefreshCcw className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col p-0">
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
                          className={`group flex items-start gap-2 rounded-md px-2 py-2 ${isActive
                              ? "border border-border bg-accent text-accent-foreground "
                              : "text-foreground hover:bg-accent"
                            }`}
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

