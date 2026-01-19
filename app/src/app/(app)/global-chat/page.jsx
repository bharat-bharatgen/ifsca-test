"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Bot,
  FileText,
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { parseDocumentEntries } from "@/lib/chat-utils";
import { DOCUMENT_FORMATTING } from "@/lib/document-formatting";
import { getDocumentMarkdownComponents } from "@/lib/markdown";
import DesktopConversationSidebar from "@/components/desktop";
import MobileConversationSidebar from "@/components/mobile";
import { CHAT_ANIMATION_CHUNK_SIZE, CHAT_ANIMATION_DELAY_MS } from "@/config/chat";

const markdownComponents = getDocumentMarkdownComponents(DOCUMENT_FORMATTING);


export default function GlobalChatPage() {
  const [messages, setMessages] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameTitle, setRenameTitle] = useState("");
  const scrollAreaRef = useRef(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // State for the mobile menu sheet
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Mention/document targeting state
  const [contracts, setContracts] = useState([]);
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef(null);

  // Document pagination state - for "Load More Documents" functionality
  // Note: Pagination is stored per-message (msg.pagination) for contextual "Load More" buttons
  const [isLoadingMoreDocs, setIsLoadingMoreDocs] = useState(false);
  const [lastQuery, setLastQuery] = useState(""); // Store last query for pagination

  const handleRefresh = () => {
    setRefreshSignal((prev) => prev + 1);
  };

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Fetch conversations list (reusable)
  const fetchConversations = React.useCallback(async () => {
    try {
      setIsLoadingConversations(true);
      const res = await fetch("/api/v1/chat/global", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (e) {
      console.error("Failed to load conversations", e);
    } finally {
      setIsLoadingConversations(false);
    }
  }, []);

  // Initial load of conversations
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Soft refresh effect to update chats without page reload
  // Note: Does NOT run on conversation selection to avoid duplicate requests
  useEffect(() => {
    // Only run when refreshSignal changes (not on initial mount)
    if (refreshSignal > 0) {
      fetchConversations();
      if (conversationId) {
        loadConversationMessages(conversationId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Load documents for mentions
  useEffect(() => {
    const loadDocuments = async () => {
      try {
        const res = await fetch("/api/v1/documents", { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          const documents = Array.isArray(data.documents) ? data.documents : [];
          setContracts(documents);
          console.log("Loaded documents for mentions:", documents.length);
        } else {
          console.error("Failed to load documents:", res.status, res.statusText);
        }
      } catch (e) {
        console.error("Failed to load documents for mentions", e);
      }
    };
    loadDocuments();
  }, []);

  const loadConversationMessages = async (id) => {
    try {
      const res = await fetch(
        `/api/v1/chat/global/history?conversationId=${encodeURIComponent(id)}&limit=10`
      );
      if (res.ok) {
        const data = await res.json();
        const mappedDesc = (data.messages || []).map((m) => ({
          id: m.id,
          content: m.message,
          role: m.sender === "USER" ? "user" : "assistant",
          timestamp: m.createdAt,
        }));
        // API returns desc; render asc
        const mappedAsc = mappedDesc.slice().reverse();

        // Merge with existing messages, filtering out temporary user messages that have been replaced
        setMessages((prevMessages) => {
          // Keep only non-temporary messages (those with database IDs, not starting with 'user-')
          const nonTemporaryMessages = prevMessages.filter(msg => !msg.id.startsWith('user-'));

          // Add new messages from database that aren't already present
          const existingIds = new Set(nonTemporaryMessages.map(m => m.id));
          const newMessages = mappedAsc.filter(m => !existingIds.has(m.id));

          return [...nonTemporaryMessages, ...newMessages];
        });

        setNextBefore(data.nextBefore || null);
        setHasMore(Boolean(data.hasMore));
      }
    } catch (e) {
      console.error("Failed to load messages", e);
    }
  };

  const selectConversation = async (id) => {
    // Close mobile sheet when a conversation is selected
    setIsSheetOpen(false);
    setConversationId(id);
    setMessages([]);
    setNextBefore(null);
    // Do not enable loadMore until after first page arrives
    setHasMore(false);
    await loadConversationMessages(id);
  };

  const loadMore = async () => {
    if (!conversationId || !hasMore || isLoadingMore) return;
    try {
      setIsLoadingMore(true);
      const params = new URLSearchParams({ conversationId, limit: "10" });
      if (nextBefore) params.set("before", nextBefore);
      const res = await fetch(`/api/v1/chat/global/history?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const mappedDesc = (data.messages || []).map((m) => ({
          id: m.id,
          content: m.message,
          role: m.sender === "USER" ? "user" : "assistant",
          timestamp: m.createdAt,
        }));
        // Convert to asc and prepend to existing
        const mappedAsc = mappedDesc.slice().reverse();
        setMessages((prev) => {
          const allMessages = [...mappedAsc, ...prev];
          const seen = new Set();
          return allMessages.filter(msg => {
            if (seen.has(msg.id)) return false;
            seen.add(msg.id);
            return true;
          });
        });
        setNextBefore(data.nextBefore || null);
        setHasMore(Boolean(data.hasMore));
      }
    } catch (e) {
      console.error("Failed to load more messages", e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Helper function to extract JSON from marker in chunk

  const sendMessage = async (options = {}) => {
    const { offset = 0, isLoadMore = false } = options;
    const messageToSend = isLoadMore ? lastQuery : inputMessage;

    if (!messageToSend.trim() || isLoading || isLoadingMoreDocs) return;

    // For new messages, create user message; for load more, skip user message
    if (!isLoadMore) {
      const userMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        content: messageToSend,
        role: "user",
        timestamp: new Date().toISOString(),
      };

      // Add the user message to the state immediately for better UX
      setMessages((prev) => [...prev, userMessage]);
      setInputMessage("");
      // Note: lastQuery will be updated after successful response to avoid stale data on error
    }

    if (isLoadMore) {
      setIsLoadingMoreDocs(true);
    } else {
      setIsLoading(true);
    }

    // Clear selected doc after sending
    const targetDoc = selectedDoc;
    if (!isLoadMore) {
      setSelectedDoc(null);
    }

    // Create a placeholder for the streaming assistant message
    const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const assistantMessage = {
      id: assistantMessageId,
      content: "",
      role: "assistant",
      timestamp: new Date().toISOString(),
      isStreaming: true,
      isLoadMore: isLoadMore, // Flag to identify load more responses
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/v1/chat/global", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: messageToSend,
          conversationId: conversationId,
          target: targetDoc
            ? { id: targetDoc.id, title: targetDoc.title }
            : null,
          offset: offset,
          limit: 10,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check if response is a stream or JSON (for document-specific chat which still uses JSON)
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("text/event-stream")) {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";  // Start empty; prepend header only after successful first chunk
        let newConversationId = null;
        let newPaginationData = null;
        let hasReceivedContent = false;  // Track if we've received actual content

        // Helper to add delay for animation effect
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        // Function to animate text character by character
        const animateText = async (text) => {
          // For load more responses, prepend header before first actual content
          if (isLoadMore && !hasReceivedContent && text.trim()) {
            hasReceivedContent = true;
            fullText = "\n\n---\n\n**Additional Documents:**\n\n";
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: fullText }
                  : msg
              )
            );
          }

          // Split into smaller chunks for smoother animation
          for (let i = 0; i < text.length; i += CHAT_ANIMATION_CHUNK_SIZE) {
            const chars = text.slice(i, i + CHAT_ANIMATION_CHUNK_SIZE);
            fullText += chars;

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: fullText }
                  : msg
              )
            );

            // Small delay between character groups for typing effect
            await delay(CHAT_ANIMATION_DELAY_MS);
          }
        };

        let streamError = null;
        let streamSuccess = false;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Process the chunk, filtering out special markers while preserving formatting
            let processedChunk = chunk;

            // Extract conversation ID if present
            const convIdMatch = processedChunk.match(/__CONV_ID__:([^\n]+)/);
            if (convIdMatch) {
              newConversationId = convIdMatch[1].trim();
              processedChunk = processedChunk.replace(/__CONV_ID__:[^\n]*\n?/g, "");
            }

            // Extract pagination data if present
            const paginationMarker = "__PAGINATION__:";
            const paginationIdx = processedChunk.indexOf(paginationMarker);
            if (paginationIdx !== -1) {
              // Find the first '{' after the marker
              const startIdx = processedChunk.indexOf("{", paginationIdx);
              if (startIdx !== -1) {
                // Start brace count at 1 since we're at opening brace, loop from next char
                let braceCount = 1;
                let endIdx = -1;
                for (let i = startIdx + 1; i < processedChunk.length; i++) {
                  if (processedChunk[i] === "{") braceCount++;
                  else if (processedChunk[i] === "}") braceCount--;
                  if (braceCount === 0) {
                    endIdx = i;
                    break;
                  }
                }
                if (endIdx !== -1) {
                  const jsonString = processedChunk.slice(startIdx, endIdx + 1);
                  try {
                    newPaginationData = JSON.parse(jsonString);
                  } catch (e) {
                    console.error("Error parsing pagination data:", e);
                  }
                  // Remove the __PAGINATION__ marker and JSON from the chunk
                  const before = processedChunk.slice(0, paginationIdx);
                  const after = processedChunk.slice(endIdx + 1);
                  processedChunk = before + after;
                }
              }
            }

            // Remove token usage markers
            processedChunk = processedChunk.replace(/__TOKEN_USAGE__:[^\n]*\n?/g, "");

            // Animate the processed chunk
            if (processedChunk) {
              await animateText(processedChunk);
            }
          }
          streamSuccess = true;
        } catch (err) {
          streamError = err;
          // Optionally, show a toast or log the error
          toast.error("An error occurred while streaming the response.");
          console.error("Streaming error:", err);
        } finally {
          // Mark streaming as complete and attach pagination to this specific message
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, isStreaming: false, pagination: newPaginationData }
                : msg
            )
          );

          // Only update lastQuery after successful response (not on error)
          if (streamSuccess && !isLoadMore) {
            setLastQuery(messageToSend);
          }

          // Update conversation ID if new
          if (newConversationId && newConversationId !== conversationId) {
            setConversationId(newConversationId);
            // Refresh conversations list to show the new conversation
            fetchConversations();
          }
        }
      } else {
        // Handle JSON response (fallback for document-specific chat)
        const data = await response.json();

        // Remove the placeholder and reload from DB
        setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));

        if (data.conversationId) {
          setConversationId(data.conversationId);
          await loadConversationMessages(data.conversationId);
        } else if (conversationId) {
          await loadConversationMessages(conversationId);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message. Please try again.");

      // Update the placeholder message to show error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: "Sorry, I encountered an error. Please try again.", isStreaming: false }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setIsLoadingMoreDocs(false);
    }
  };

  // Load more documents function for pagination
  // Gets pagination data from the last assistant message that has it
  const loadMoreDocuments = (messageId) => {
    if (isLoadingMoreDocs) return;

    // Find the specific message's pagination data
    const targetMessage = messages.find(m => m.id === messageId);
    const pagination = targetMessage?.pagination;

    if (!pagination?.hasMore) return;

    // Clear pagination from this message to hide the button (prevents multiple clicks)
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, pagination: null }
          : msg
      )
    );

    sendMessage({
      offset: pagination.nextOffset,
      isLoadMore: true
    });
  };

  const handleKeyPress = (e) => {
    // Mention navigation when dropdown open
    if (showMention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => Math.min(prev + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const choice = filteredMentions[mentionIndex];
        if (choice) selectMention(choice);
        return;
      }
      if (e.key === "Escape") {
        setShowMention(false);
        setMentionQuery("");
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage({});
    }
  };

  // Handle input change to detect '@' and filter
  const onInputChange = (val) => {
    setInputMessage(val);
    const cursorAt = val.length; // simple approximation for single-line Input
    const uptoCursor = val.slice(0, cursorAt);
    // Match @ at start of string or after whitespace, with optional text after
    const mentionMatch = /(^|\s)@([^\s@]*)$/.exec(uptoCursor);
    if (mentionMatch) {
      setShowMention(true);
      setMentionQuery(mentionMatch[2] || "");
      setMentionIndex(0);
    } else {
      setShowMention(false);
      setMentionQuery("");
    }
  };

  const filteredMentions = (contracts || []).filter((c) => {
    const q = (mentionQuery || "").toLowerCase();
    if (!q) return true;
    return (
      (c.title || "").toLowerCase().includes(q) ||
      (c.documentName || "").toLowerCase().includes(q) ||
      (c.id || "").toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const replaceActiveMention = (text, replacement) => {
    return text.replace(/(^|\s)@([\w\- _]*)$/, (m, p1) => `${p1}${replacement} `);
  };

  const selectMention = (contract) => {
    setSelectedDoc({ id: contract.id, title: contract.title });
    setInputMessage((prev) => replaceActiveMention(prev, `@${contract.title}`));
    setShowMention(false);
    setMentionQuery("");
  };

  const clearSelected = () => setSelectedDoc(null);

  const deleteConversation = async (id) => {
    const prev = conversations;
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (conversationId === id) {
      setConversationId(null);
      setMessages([]);
    }
    try {
      const res = await fetch(
        `/api/v1/chat/global?conversationId=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );
      if (!res.ok) {
        throw new Error("Failed to delete conversation");
      }
    } catch (e) {
      console.error(e);
      setConversations(prev);
      toast.error("Failed to delete conversation");
    }
  };

  const renameConversation = async (id, title) => {
    const trimmed = (title || "").trim();
    if (!trimmed) {
      toast.error("Title cannot be empty");
      return;
    }
    const prev = conversations;
    setConversations((cs) =>
      cs.map((c) => (c.id === id ? { ...c, title: trimmed } : c))
    );
    try {
      const res = await fetch("/api/v1/chat/global", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id, title: trimmed }),
      });
      if (!res.ok) {
        throw new Error("Failed to rename conversation");
      }
    } catch (e) {
      console.error(e);
      setConversations(prev);
      toast.error("Failed to rename conversation");
    }
  };

  return (
    <div className="flex h-full w-full flex-row gap-4 px-4 py-4">
      {/* Main Chat Card */}
      <Card className="flex flex-1 flex-col min-w-0">
        <CardHeader className="border-b">
          <div className="flex items-center space-x-2">
            <MobileConversationSidebar
              conversations={conversations}
              isLoadingConversations={isLoadingConversations}
              conversationId={conversationId}
              isSheetOpen={isSheetOpen}
              onSheetOpenChange={setIsSheetOpen}
              onSelectConversation={selectConversation}
              onRefresh={handleRefresh}
              onNewChat={() => {
                setConversationId(null);
                setMessages([]);
                setIsSheetOpen(false);
                handleRefresh();
              }}
              onRenameClick={(id, title) => {
                setRenameId(id);
                setRenameTitle(title);
              }}
              onDeleteClick={(id) => setConfirmId(id)}
            />

            <div className="flex flex-col items-center justify-center text-center gap-2 md:flex-row md:gap-5">
              <h3>
                <Bot className="h-6 w-6 text-blue-600" />
              </h3>
              <h3 className="font-bold dark:text-white">Global Chat</h3>
              <h3 className="text-sm text-gray-500">
                Chat with AI across all your documents
              </h3>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col p-0 min-h-96">
          <ScrollArea
            ref={scrollAreaRef}
            className="flex-1 min-h-0 p-4 mt-5"
            onScrollCapture={(e) => {
              const el = e.currentTarget.querySelector(
                "[data-radix-scroll-area-viewport]"
              );
              if (!el) return;
              if (el.scrollTop <= 0 && hasMore && !isLoadingMore && messages.length > 0) {
                loadMore();
              }
            }}
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-gray-500 mt-5">
                <Bot className="mb-4 h-12 w-12" />
                <h3 className="mb-2 text-lg font-medium">
                  Welcome to Global Chat
                </h3>
                <p className="max-w-md text-center">
                  Ask me anything about your documents. I can search across all
                  your uploaded documents and provide relevant information.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {isLoadingMore && (
                  <div className="flex justify-center py-2 text-xs text-gray-500">
                    Loading older messages…
                  </div>
                )}
                {messages.map((m, index) => (
                  <React.Fragment key={`${conversationId || 'new'}-${m.id}`}>
                    <ChatMessage
                      message={m.content}
                      sender={m.role === "assistant" ? "AGENT" : "USER"}
                      timestamp={m.timestamp}
                      isStreaming={m.isStreaming}
                    />

                    {/* Per-message Load More Documents Button - shows after assistant messages with pagination */}
                    {m.role === "assistant" && m.pagination?.hasMore && !m.isStreaming && !isLoading && !isLoadingMoreDocs && (
                      <div className="flex justify-center py-4">
                        <Button
                          variant="outline"
                          onClick={() => loadMoreDocuments(m.id)}
                          className="gap-2"
                        >
                          <FileText className="h-4 w-4" />
                          Load More Documents ({m.pagination.remaining} remaining)
                        </Button>
                      </div>
                    )}
                  </React.Fragment>
                ))}

                {/* Loading more documents indicator */}
                {isLoadingMoreDocs && (
                  <div className="flex justify-center py-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                      Loading more documents...
                    </div>
                  </div>
                )}
              </div>
            )}
            {isLoading && !messages.some(m => m.isStreaming) && (
              <div className="flex justify-start p-4 pt-0">
                <div className="mr-4 rounded-lg bg-gray-100 p-3 text-gray-900 dark:bg-gray-900 dark:text-foreground">
                  <div className="flex items-center space-x-2">
                    <Bot className="h-5 w-5" />
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400"></div>
                      <div
                        className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>

          <div className={cn(
            "w-full transition-all duration-300",
            messages.length === 0
              ? "flex-1 flex flex-col items-center justify-center pb-24"
              : "mt-auto p-4"
          )}>
            {messages.length === 0 && (
              <p className="font-bold dark:text-white text-center mb-4 text-xl">What would you like to find in your documents?</p>
            )}
            <div className={cn(
              "flex items-center space-x-2 mx-auto",
              messages.length === 0 ? "w-full max-w-2xl" : "max-w-full w-full"
            )}>
              <div className="relative flex-1">
                {selectedDoc && (
                  <div className="absolute -top-7 left-0 flex items-center gap-2 text-xs rounded bg-muted px-2 py-1">
                    <FileText className="h-3 w-3" />
                    <span className="truncate max-w-[220px]">{selectedDoc.title} ({selectedDoc.id})</span>
                    <button className="text-red-500" onClick={clearSelected}>×</button>
                  </div>
                )}
                <Input
                  ref={inputRef}
                  value={inputMessage}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Type @ to target a specific document..."
                  disabled={isLoading}
                  className="flex-1 h-14 px-5 w-full rounded-full"
                />
                {showMention && (
                  <div className="absolute bottom-10 left-0 z-50 w-full rounded-md border bg-background shadow-md">
                    <div className="max-h-64 overflow-auto py-1">
                      {filteredMentions.length > 0 ? (
                        filteredMentions.map((c, idx) => (
                          <button
                            key={c.id}
                            onClick={() => selectMention(c)}
                            className={cn(
                              "w-full px-3 py-2 text-left hover:bg-accent",
                              idx === mentionIndex ? "bg-accent" : ""
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{c.title || "Untitled"}</div>
                                <div className="truncate text-[11px] text-muted-foreground">
                                  {c.documentName || c.id}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-sm text-muted-foreground">
                          {contracts.length === 0 ? "No documents available" : "No documents found"}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Button
                onClick={() => sendMessage({})}
                disabled={isLoading || !inputMessage.trim()}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Desktop conversation sidebar - Right side */}
      <DesktopConversationSidebar
        conversations={conversations}
        isLoadingConversations={isLoadingConversations}
        conversationId={conversationId}
        onSelectConversation={selectConversation}
        onRefresh={handleRefresh}
        onNewChat={() => {
          setConversationId(null);
          setMessages([]);
          setLastQuery("");
          setIsSheetOpen(false);
          handleRefresh();
        }}
        onRenameClick={(id, title) => {
          setRenameId(id);
          setRenameTitle(title);
        }}
        onDeleteClick={(id) => setConfirmId(id)}
      />

      {/* Dialogs */}
      <Dialog open={Boolean(confirmId)}>
        <DialogContent blurOverlay={true} className="sm:max-w-[420px]">
          <DialogTitle>Delete conversation</DialogTitle>
          <p className="text-sm text-gray-500">
            Are you sure you want to delete this conversation?
          </p>
          <DialogFooter>
            <div className="flex w-full gap-2">
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => setConfirmId(null)}
              >
                Cancel
              </Button>
              <Button
                className="w-full bg-red-600 text-white hover:bg-red-700"
                onClick={async () => {
                  if (confirmId) {
                    await deleteConversation(confirmId);
                  }
                  setConfirmId(null);
                }}
              >
                Delete
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(renameId)}>
        <DialogContent blurOverlay={true} className="sm:max-w-[420px]">
          <DialogTitle>Rename conversation</DialogTitle>
          <div className="space-y-2">
            <Input
              autoFocus
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Enter a new title"
            />
          </div>
          <DialogFooter>
            <div className="flex w-full gap-2">
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => {
                  setRenameId(null);
                  setRenameTitle("");
                }}
              >
                Cancel
              </Button>
              <Button
                className="w-full"
                onClick={async () => {
                  if (renameId) {
                    await renameConversation(renameId, renameTitle);
                  }
                  setRenameId(null);
                  setRenameTitle("");
                }}
              >
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChatMessage({ message, sender, timestamp, isStreaming = false }) {
  const [visibleDocuments, setVisibleDocuments] = useState(10);

  // Parse document entries for AGENT messages
  const parsed = sender === "AGENT" ? parseDocumentEntries(message) : null;
  const isDocumentList = parsed?.isDocumentList;
  const documents = parsed?.documents || [];

  const handleReadMore = () => {
    setVisibleDocuments(prev => Math.min(prev + 10, documents.length));
  };

  const handleReadLess = () => {
    setVisibleDocuments(10);
  };

  // For AGENT messages with document lists, render with pagination
  if (isDocumentList && documents.length > 0) {
    const visibleDocs = documents.slice(0, visibleDocuments);
    const hasMore = documents.length > visibleDocuments;

    return (
      <div
        className={cn(
          "flex items-start space-x-2",
          sender === "AGENT" ? "flex-row-reverse" : "flex-row"
        )}
        style={{ justifyContent: sender === "AGENT" ? "start" : "end" }}
      >
        <div className="p-3 text-sm bg-gray-100 rounded-lg dark:bg-gray-900 text-foreground max-w-[90%]">
          <div className="document-response prose-sm max-w-none">
            {/* Render header */}
            {parsed.header && (
              <Markdown components={markdownComponents}>
                {parsed.header}
              </Markdown>
            )}

            {/* Render visible documents */}
            {visibleDocs.map((doc, index) => (
              <div key={index} className="mt-4">
                <Markdown components={markdownComponents}>
                  {doc.content}
                </Markdown>
              </div>
            ))}

            {/* View More / View Less buttons */}
            {hasMore && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReadMore}
                >
                  View More ({documents.length - visibleDocuments} more)
                </Button>
              </div>
            )}
            {visibleDocuments > 10 && (
              <div className="flex justify-center mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReadLess}
                >
                  View Less
                </Button>
              </div>
            )}
          </div>
          {timestamp && (
            <p className="text-xs opacity-70 mt-1">{new Date(timestamp).toLocaleTimeString()}</p>
          )}
        </div>
        <Avatar>
          <AvatarImage src={sender === "AGENT" ? "/icon.png" : undefined} />
          <AvatarFallback>{sender === "AGENT" ? "AI" : "U"}</AvatarFallback>
        </Avatar>
      </div>
    );
  }

  // For regular messages (USER or AGENT without document list), render normally
  return (
    <div
      className={cn(
        "flex items-start space-x-2",
        sender === "AGENT" ? "flex-row-reverse" : "flex-row"
      )}
      style={{ justifyContent: sender === "AGENT" ? "start" : "end" }}
    >
      <div className="p-3 text-sm bg-gray-100 rounded-lg dark:bg-gray-900 text-foreground max-w-[90%]">
        <div className="document-response  prose-sm max-w-none">
          <Markdown components={markdownComponents}>
            {message}
          </Markdown>
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
          )}
        </div>
        {timestamp && !isStreaming && (
          <p className="text-xs opacity-70 mt-1">{new Date(timestamp).toLocaleTimeString()}</p>
        )}
      </div>
      <Avatar>
        <AvatarImage src={sender === "AGENT" ? "/icon.png" : undefined} />
        <AvatarFallback>{sender === "AGENT" ? "AI" : "U"}</AvatarFallback>
      </Avatar>
    </div>
  );
}
