"use client";

import React, { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { Button } from "@/components/chat/primitives";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatMessage } from "@/components/chat/chat-message";
import { createChatStreamParser } from "@/lib/chat-stream.mjs";
import { ChatComposer } from "@/components/chat/chat-composer";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/chat/primitives";
import { toast } from "sonner";
import DesktopConversationSidebar from "@/components/desktop";
import MobileConversationSidebar from "@/components/mobile";


export default function GlobalChatPage() {
  const [messages, setMessages] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const prependRef = useRef(null);
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
  const sendLockRef = useRef(false);
  const activeConversationRef = useRef(null);
  useEffect(() => { activeConversationRef.current = conversationId; }, [conversationId]);
  const abortRef = useRef(null);
  const followRef = useRef(true);
  const historyRequestRef = useRef(0);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  useEffect(() => () => abortRef.current?.abort(), []);
  const scrollToLatest = () => {
    const el = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (el) el.scrollTop = el.scrollHeight;
    followRef.current = true;
    setAwayFromBottom(false);
  };

  // State for the mobile menu sheet
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Mention/document targeting state
  const { data: documentData, error: documentError } = useSWR("/api/v1/documents", async url => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load documents");
    return res.json();
  });
  const contracts = Array.isArray(documentData?.documents) ? documentData.documents : [];
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef(null);
  const mentionCursorRef = useRef(0);

  // Document pagination state - for "Load More Documents" functionality
  // Note: Pagination is stored per-message (msg.pagination) for contextual "Load More" buttons
  const [isLoadingMoreDocs, setIsLoadingMoreDocs] = useState(false);
  const [lastQuery, setLastQuery] = useState(""); // Store last query for pagination

  const normalizeMessageContent = (content) =>
    (content || "").replace(/\s+/g, " ").trim();

  const isTempMessage = (msg) =>
    msg?.id?.startsWith("user-") || msg?.id?.startsWith("assistant-");

  const isSameMessage = (a, b) => {
    if (!a || !b) return false;
    if (a.role !== b.role) return false;
    const aText = normalizeMessageContent(a.content);
    const bText = normalizeMessageContent(b.content);
    if (!aText || !bText || aText !== bText) return false;
    const aTime = new Date(a.timestamp || 0).getTime();
    const bTime = new Date(b.timestamp || 0).getTime();
    return Math.abs(aTime - bTime) <= 15000;
  };

  const handleRefresh = () => {
    setRefreshSignal((prev) => prev + 1);
  };

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (prependRef.current) {
      const el = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
      if (el) el.scrollTop += el.scrollHeight - prependRef.current;
      prependRef.current = null;
      return;
    }
    if (scrollAreaRef.current && followRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
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

  const loadConversationMessages = async (id) => {
    const request = ++historyRequestRef.current;
    setIsLoadingHistory(true);
    setHistoryError("");
    try {
      const res = await fetch(
        `/api/v1/chat/global/history?conversationId=${encodeURIComponent(id)}&limit=10`,
      );
      if (!res.ok) throw new Error("Could not load conversation");
      if (res.ok) {
        const data = await res.json();
        if (request !== historyRequestRef.current) return;
        const mappedDesc = (data.messages || []).map((m) => ({
          id: m.id,
          content: m.message,
          role: m.sender === "USER" ? "user" : "assistant",
          timestamp: m.createdAt,
        }));
        // API returns desc; render asc
        const mappedAsc = mappedDesc.slice().reverse();

        // Merge with existing messages, filtering out temporary messages that have DB equivalents
        setMessages((prevMessages) => {
          const streamingMessages = prevMessages.filter((m) => m.isStreaming);

          // Skip DB messages that would duplicate an in-flight streaming message
          const dbMessagesFiltered = mappedAsc.filter(
            (dbMsg) => !streamingMessages.some((sm) => isSameMessage(sm, dbMsg)),
          );

          // Remove temporary messages that already exist in DB (after stream completes)
          const prunedPrev = prevMessages.filter((msg) => {
            if (!isTempMessage(msg)) return true;
            if (msg.isStreaming) return true;
            return !dbMessagesFiltered.some((dbMsg) => isSameMessage(msg, dbMsg));
          });

          const existingIds = new Set(prunedPrev.map((m) => m.id));
          const newMessages = dbMessagesFiltered.filter(
            (m) => !existingIds.has(m.id),
          );

          return [...prunedPrev, ...newMessages];
        });

        setNextBefore(data.nextBefore || null);
        setHasMore(Boolean(data.hasMore));
      }
    } catch (e) {
      if (request === historyRequestRef.current) setHistoryError("Could not load this conversation. Select it again to retry.");
    } finally {
      if (request === historyRequestRef.current) setIsLoadingHistory(false);
    }
  };

  const selectConversation = async (id) => {
    if (sendLockRef.current) return;
    followRef.current = true;
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
    const request = historyRequestRef.current;
    try {
      setIsLoadingMore(true);
      const params = new URLSearchParams({ conversationId, limit: "10" });
      if (nextBefore) params.set("before", nextBefore);
      const res = await fetch(
        `/api/v1/chat/global/history?${params.toString()}`,
      );
      if (res.ok) {
        const data = await res.json();
        const mappedDesc = (data.messages || []).map((m) => ({
          id: m.id,
          content: m.message,
          role: m.sender === "USER" ? "user" : "assistant",
          timestamp: m.createdAt,
        }));
        if (request !== historyRequestRef.current) return;
        const el = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
        prependRef.current = el?.scrollHeight || null;
        // Convert to asc and prepend to existing
        const mappedAsc = mappedDesc.slice().reverse();
        setMessages((prev) => {
          const allMessages = [...mappedAsc, ...prev];
          const seenIds = new Set();
          const deduped = allMessages.filter((msg) => {
            if (seenIds.has(msg.id)) return false;
            seenIds.add(msg.id);
            return true;
          });

          // Remove temp duplicates if DB versions exist in the merged list
          return deduped.filter((msg) => {
            if (!isTempMessage(msg)) return true;
            if (msg.isStreaming) return true;
            return !deduped.some(
              (dbMsg) => !isTempMessage(dbMsg) && isSameMessage(msg, dbMsg),
            );
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

    if (!messageToSend.trim() || isLoading || isLoadingMoreDocs || isLoadingHistory) return;
    if (sendLockRef.current) return;
    sendLockRef.current = true;
    followRef.current = true;
    abortRef.current = new AbortController();

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
      status: "Thinking...",
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/v1/chat/global", {
        method: "POST",
        signal: abortRef.current.signal,
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
        let fullText = ""; // Start empty; prepend header only after successful first chunk
        let newConversationId = null;
        let newPaginationData = null;
        let hasReceivedContent = false; // Track if we've received actual content

        let streamSuccess = false;
        const parser = createChatStreamParser((text) => {
          if (isLoadMore && !hasReceivedContent && text.trim()) {
            fullText += "\n\n---\n\n**Additional Documents:**\n\n";
          }
          hasReceivedContent ||= Boolean(text.trim());
          fullText += text;
          setMessages(prev => prev.map(msg => msg.id === assistantMessageId
            ? { ...msg, content: fullText, status: hasReceivedContent ? null : msg.status } : msg));
        }, (key, value) => {
          if (key === "CONV_ID") newConversationId = value;
          if (key === "STATUS") setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, status: value } : msg));
          if (key === "PAGINATION") {
            try { newPaginationData = JSON.parse(value); } catch { /* Incomplete upstream metadata cannot change pagination. */ }
          }
        });
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            parser.push(decoder.decode(value, { stream: true }));
          }
          parser.push(decoder.decode());
          parser.finish();
          streamSuccess = true;
        } catch (err) {
          // Optionally, show a toast or log the error
          setMessages(prev => prev.map(msg => msg.id === assistantMessageId
            ? { ...msg, error: err.name === "AbortError" ? "Response stopped." : "Connection interrupted. Your partial response is kept." } : msg));
          if (err.name !== "AbortError") console.error("Streaming error:", err);
        } finally {
          // Mark streaming as complete and attach pagination to this specific message
          setMessages((prev) => {
            const updated = prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                  ...msg,
                  isStreaming: false,
                  pagination: newPaginationData,
                  status: null,
                }
                : msg,
            );

            // Remove any non-temp duplicates of the streamed message (can happen if history loads mid-stream)
            const streamed = updated.find((m) => m.id === assistantMessageId);
            if (!streamed) return updated;
            return updated.filter((msg) => {
              if (msg.id === assistantMessageId) return true;
              if (isTempMessage(msg)) return true;
              return !isSameMessage(msg, streamed);
            });
          });

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
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== assistantMessageId),
        );

        if (data.conversationId) {
          setConversationId(data.conversationId);
          await loadConversationMessages(data.conversationId);
        } else if (conversationId) {
          await loadConversationMessages(conversationId);
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") console.error("Error sending message:", error);
      if (error.name !== "AbortError") toast.error("Failed to send message. Please try again.");

      // Update the placeholder message to show error
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
              ...msg,
              content: msg.content,
              error: error.name === "AbortError" ? "Response stopped." : "Could not send your message. Please try again.",
              isStreaming: false,
            }
            : msg,
        ),
      );
    } finally {
      setIsLoading(false);
      setIsLoadingMoreDocs(false);
      sendLockRef.current = false;
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  // Load more documents function for pagination
  // Gets pagination data from the last assistant message that has it
  const loadMoreDocuments = (messageId) => {
    if (isLoadingMoreDocs) return;

    // Find the specific message's pagination data
    const targetMessage = messages.find((m) => m.id === messageId);
    const pagination = targetMessage?.pagination;

    if (!pagination?.hasMore) return;

    // Clear pagination from this message to hide the button (prevents multiple clicks)
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, pagination: null } : msg,
      ),
    );

    sendMessage({
      offset: pagination.nextOffset,
      isLoadMore: true,
    });
  };

  const handleKeyPress = (e) => {
    if (e.nativeEvent.isComposing) return;
    // Mention navigation when dropdown open
    if (showMention) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) =>
          Math.min(prev + 1, filteredMentions.length - 1),
        );
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
    const cursorAt = inputRef.current?.selectionStart ?? val.length;
    mentionCursorRef.current = cursorAt;
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

  const filteredMentions = (contracts || [])
    .filter((c) => {
      const q = (mentionQuery || "").toLowerCase();
      if (!q) return true;
      return (
        (c.title || "").toLowerCase().includes(q) ||
        (c.documentName || "").toLowerCase().includes(q) ||
        (c.id || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 8);

  const replaceActiveMention = (text, replacement) => {
    return text.replace(
      /(^|\s)@([\w\- _]*)$/,
      (m, p1) => `${p1}${replacement} `,
    );
  };

  const selectMention = (contract) => {
    const title = contract.title || contract.documentName || "Untitled";
    setSelectedDoc({ id: contract.id, title });
    setInputMessage(prev => replaceActiveMention(prev.slice(0, mentionCursorRef.current), `@${title}`) + prev.slice(mentionCursorRef.current));
    setShowMention(false);
    setMentionQuery("");
  };

  const clearSelected = () => {
    if (selectedDoc) setInputMessage(text => text.replace(`@${selectedDoc.title}`, "").trimStart());
    setSelectedDoc(null);
  };

  const deleteConversation = async (id) => {
    if (sendLockRef.current) { toast.error("Stop the response before deleting a conversation."); return; }
    try {
      const res = await fetch(`/api/v1/chat/global?conversationId=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete conversation");
      setConversations(cs => cs.filter(c => c.id !== id));
      if (activeConversationRef.current === id) {
        historyRequestRef.current++;
        setIsLoadingHistory(false); setHistoryError("");
        setConversationId(null); setMessages([]); setHasMore(false); setLastQuery("");
      }
    } catch (e) {
      toast.error("Failed to delete conversation. Your chat is kept.");
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
      cs.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
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
    <div className="chat-workspace flex w-full h-full min-h-0 overflow-hidden">
      {/* Main Chat Card */}
      <Card className="order-2 flex flex-col flex-1 min-w-0 min-h-0 rounded-none border-0 shadow-none bg-background">
        <CardHeader className="shrink-0 border-b px-4 py-3 md:px-6">
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
                if (sendLockRef.current) return;
                historyRequestRef.current++; setIsLoadingHistory(false); setHistoryError("");
                setConversationId(null);
                setMessages([]);
                setIsSheetOpen(false);
                handleRefresh();
              }}
              onRenameClick={(id, title) => {
                setIsSheetOpen(false);
                setRenameId(id);
                setRenameTitle(title);
              }}
              onDeleteClick={id => { setIsSheetOpen(false); setConfirmId(id); }}
            />

            <div className="flex-1 min-w-0">
              <h1 className="truncate text-sm font-semibold">{conversations.find(c => c.id === conversationId)?.title || "Document assistant"}</h1>

            </div>
            <Button variant="outline" size="sm" disabled={isLoading || isLoadingMoreDocs} onClick={() => {
              historyRequestRef.current++; setIsLoadingHistory(false); setHistoryError("");
              setConversationId(null); setMessages([]); setLastQuery(""); setSelectedDoc(null); setHasMore(false);
            }}>New chat</Button>
          </div>
        </CardHeader>

        <CardContent className="relative flex flex-col flex-1 p-0 min-h-0">
          <ScrollArea
            ref={scrollAreaRef}
            className="flex-1 min-h-0 chat-transcript"
            onScrollCapture={(e) => {
              const el = e.currentTarget.querySelector(
                "[data-radix-scroll-area-viewport]",
              );
              if (!el) return;
              followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              setAwayFromBottom(!followRef.current);
              if (
                el.scrollTop <= 0 &&
                hasMore &&
                !isLoadingMore &&
                messages.length > 0
              ) {
                loadMore();
              }
            }}
          >
            {isLoadingHistory && messages.length === 0 ? <p role="status" className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">Loading conversation…</p> : historyError && messages.length === 0 ? <p role="alert" className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">{historyError}</p> : messages.length === 0 ? (
              <div className="chat-welcome mx-auto flex max-w-2xl flex-col justify-center px-4 py-12 md:px-8">
                <h2 className="chat-heading text-3xl sm:text-4xl">What would you like to know?</h2>
                <div className="mt-6 flex flex-wrap gap-2">
                  {["Summarize a document", "Compare documents", "Find a policy"].map(prompt => (
                    <Button key={prompt} variant="outline" className="h-auto rounded-full px-4 py-2 text-sm font-normal" onClick={() => { setInputMessage(prompt); inputRef.current?.focus(); }}>{prompt}</Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 md:px-8">
                {isLoadingMore && (
                  <div className="flex justify-center py-2 text-xs text-gray-500">
                    Loading older messages…
                  </div>
                )}
                {messages.map((m, index) => (
                  <React.Fragment key={`${conversationId || "new"}-${m.id}`}>
                    <ChatMessage
                      message={m.content}
                      sender={m.role === "assistant" ? "AGENT" : "USER"}
                      timestamp={m.timestamp}
                      isStreaming={m.isStreaming}
                      status={m.status}
                      error={m.error}
                    />

                    {/* Per-message Load More Documents Button - shows after assistant messages with pagination */}
                    {m.role === "assistant" &&
                      m.pagination?.hasMore &&
                      !m.isStreaming &&
                      !isLoading &&
                      !isLoadingMoreDocs && (
                        <div className="flex justify-center py-4">
                          <Button
                            variant="outline"
                            onClick={() => loadMoreDocuments(m.id)}
                            className="gap-2"
                          >
                            <FileText className="w-4 h-4" />
                            Load More Documents ({m.pagination.remaining}{" "}
                            remaining)
                          </Button>
                        </div>
                      )}
                  </React.Fragment>
                ))}

                {/* Loading more documents indicator */}
                {isLoadingMoreDocs && (
                  <div className="flex justify-center py-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-4 h-4 border-2 rounded-full animate-spin border-primary border-t-transparent"></div>
                      Loading more documents...
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {awayFromBottom && <Button variant="secondary" size="sm" className="absolute bottom-40 left-1/2 -translate-x-1/2 shadow-sm" onClick={scrollToLatest}>Jump to latest ↓</Button>}
          <div className="chat-composer-dock shrink-0 px-3 pt-3 sm:px-6">
            <div className="mx-auto max-w-3xl">
              {selectedDoc && <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><FileText className="size-4" /><span className="truncate">{selectedDoc.title}</span><Button variant="ghost" size="sm" aria-label="Remove selected document" onClick={clearSelected}>×</Button></div>}
              <div className="relative">
                {showMention && <div className="absolute bottom-full mb-2 z-30 w-full rounded-xl border bg-popover p-1 shadow-lg" id="chat-mentions" role="listbox" aria-label="Documents">
                  {filteredMentions.length ? filteredMentions.map((c, idx) => <button id={`chat-mention-${idx}`} type="button" role="option" aria-selected={idx === mentionIndex} key={c.id} className={cn("flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm hover:bg-accent", idx === mentionIndex && "bg-accent")} onClick={() => selectMention(c)}><FileText className="size-4 shrink-0" /><span className="truncate">{c.title || c.documentName || "Untitled"}</span></button>) : <p className="p-3 text-sm text-muted-foreground">{documentError ? "Could not load documents. Try again shortly." : "No matching documents"}</p>}
                </div>}
                <ChatComposer mentionOpen={showMention} mentionActiveId={filteredMentions.length ? `chat-mention-${mentionIndex}` : undefined} ref={inputRef} value={inputMessage} onChange={onInputChange} onKeyDown={handleKeyPress} onSend={() => sendMessage({})} busy={isLoading || isLoadingMoreDocs} disabled={isLoadingHistory} onStop={() => abortRef.current?.abort()} />
              </div>
              <p className="pb-3 pt-2 text-center text-xs text-muted-foreground">Use @ to choose a document <span className="hidden sm:inline">· Shift + Enter for a new line</span></p>

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
          if (sendLockRef.current) return;
          historyRequestRef.current++; setIsLoadingHistory(false); setHistoryError("");
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
      <Dialog open={Boolean(confirmId)} onOpenChange={open => !open && setConfirmId(null)}>
        <DialogContent role="alertdialog" blurOverlay={true} className="sm:max-w-[420px]">
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
                className="w-full text-white bg-red-600 hover:bg-red-700"
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
      <Dialog open={Boolean(renameId)} onOpenChange={open => !open && setRenameId(null)}>
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
