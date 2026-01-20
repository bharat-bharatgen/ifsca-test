"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Markdown from "react-markdown";
import { LoaderIcon } from "lucide-react";
import { useDocumentContext } from "./context";
import { env } from "@/env.mjs";

export const DocumentChat = () => {
  const { document, documentChats, session, setSendMessageToAI } =
    useDocumentContext();
  const [chats, setChats] = useState([
    {
      message: `Hi! I'm ${env.NEXT_PUBLIC_APP_NAME}, your AI assistant. I can help you with any questions you have about your document.`,
      sender: "AGENT",
    },
    ...documentChats,
  ]);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState("");
  const messageListRef = useRef();
  const sendButtonRef = useRef();

  const scrollToBottom = (event) => {
    if (!event) {
      messageListRef.current.scroll({
        top: messageListRef.current.scrollHeight,
        behavior: "smooth",
      });
      return;
    }

    const { currentTarget: target } = event;
    target.scroll({ top: target.scrollHeight, behavior: "smooth" });
  };

  const sendMessageToAI = async () => {
    try {
      const body = JSON.stringify({
        message,
        documentId: document.id,
      });
      const response = await fetch("/api/v1/chat/document", {
        method: "POST",
        body: body,
        headers: {
          "Content-Type": "application/json",
        },
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      let fullText = "";
      const timeStart = Date.now();

      setStatus("Thinking...");

      // Add placeholder for streaming message
      setChats((prevChats) => [
        ...prevChats,
        {
          message: "",
          sender: "AGENT",
          id: timeStart,
          isStreaming: true,
          status: "Thinking...",
        },
      ]);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          let processedChunk = chunk;
          let currentStatus = null;

          // Check for Status updates
          const statusMatch = processedChunk.match(/__STATUS__:([^\n]+)/);
          if (statusMatch) {
            currentStatus = statusMatch[1].trim();
            setStatus(currentStatus);
            processedChunk = processedChunk.replace(
              /__STATUS__:[^\n]*\n?/g,
              "",
            );
          }

          // Filter out token usage markers while preserving formatting
          processedChunk = processedChunk.replace(
            /__TOKEN_USAGE__:[^\n]*\n?/g,
            "",
          );

          if (processedChunk && processedChunk.trim()) {
            fullText += processedChunk;
            // Clear status when actual content starts streaming
            setChats((prevChats) =>
              prevChats.map((chat) =>
                chat.id === timeStart
                  ? { ...chat, message: fullText, status: null }
                  : chat,
              ),
            );
          } else if (currentStatus) {
            // Only status update, no content yet
            setChats((prevChats) =>
              prevChats.map((chat) =>
                chat.id === timeStart
                  ? { ...chat, status: currentStatus }
                  : chat,
              ),
            );
          }
        }
      } catch (error) {
        // Optionally log or handle the error here if needed
        throw error;
      } finally {
        // Mark streaming as complete
        setStatus("");
        setChats((prevChats) =>
          prevChats.map((chat) =>
            chat.id === timeStart
              ? { ...chat, isStreaming: false, status: null }
              : chat,
          ),
        );
      }
    } catch (error) {
      console.log(error);
    } finally {
      setMessage("");
      setIsSending(false);
      setStatus("");
    }
  };

  useEffect(() => {
    if (messageListRef) {
      messageListRef.current.addEventListener("DOMNodeInserted", (event) => {
        scrollToBottom(event);
      });
    }
  }, []);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const response = await fetch(
          `/api/v1/chat/history?documentId=${document.id}`,
        );
        if (response.ok) {
          const data = await response.json();
          setChats((prev) => [...prev, ...data.chats]);
        }
      } catch (error) {
        console.error("Error fetching chat history:", error);
      } finally {
        setIsSending(false);
      }
    };

    if (document?.id) {
      fetchChats();
    }
  }, [document?.id]);

  const stimulateMessageToAI = async (message) => {
    setMessage(message);
    setTimeout(async () => {
      sendButtonRef.current.click();
    }, 1000);
  };

  useEffect(() => {
    setSendMessageToAI({
      caller: async (message) => await stimulateMessageToAI(message),
    });
  }, []);

  const submitMessage = async () => {
    if (isSending) return;
    if (message.trim() === "") return;
    setIsSending(true);
    setChats((prevChats) => [
      ...prevChats,
      { message: message, sender: "USER" },
    ]);
    await sendMessageToAI();
  };

  return (
    <Card id="ai-chat-box" className="p-0 space-y-4 rounded-lg lg:col-span-2">
      <CardHeader>
        <CardTitle>Chat About Document</CardTitle>
        <CardDescription>
          Ask any questions you have about your document
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 py-4 md:p-6">
        <div className="flex flex-col justify-between h-[25rem] overflow-hidden">
          <div
            ref={messageListRef}
            id="chat-container"
            className="h-full py-4 space-y-4 overflow-y-scroll md:p-4"
            style={{
              overflowAnchor: "auto",
            }}
          >
            {chats.map((chat, index) => (
              <ChatMessage
                key={index}
                message={chat.message}
                sender={chat.sender}
                user={session.user}
                isStreaming={chat.isStreaming}
                status={chat.status}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center mx-4 mt-4 space-x-2 md:mx-0">
          <Input
            disabled={isSending}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                await submitMessage();
              }
            }}
            placeholder="Send your questions"
            className="flex-1"
          />
          <Button
            ref={sendButtonRef}
            disabled={isSending || message.trim() === ""}
            onClick={submitMessage}
          >
            {isSending ? (
              <LoaderIcon className="w-5 h-5 animate-spin" />
            ) : (
              <ArrowUpIcon className="w-5 h-5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const ChatMessage = ({
  message,
  sender,
  user,
  isStreaming = false,
  status = null,
}) => {
  // Show typing indicator when streaming starts before content arrives
  const showTypingIndicator = isStreaming && !message && !status;
  // Show status indicator when there's an active status
  const showStatusIndicator = isStreaming && status;
  // Show message bubble only if there's content
  const showMessageBubble = message || showTypingIndicator;

  return (
    <div
      className={cn(
        "flex items-start space-x-2",
        sender === "AGENT" ? "flex-row-reverse" : "flex-row",
      )}
      style={{
        justifyContent: sender === "AGENT" ? "start" : "end",
        transform: "translateZ(0)",
      }}
    >
      <div className="flex flex-col gap-1 max-w-[80%]">
        {/* Status indicator - shown above message bubble during processing */}
        {showStatusIndicator && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs duration-200 rounded-lg text-muted-foreground bg-muted/50 animate-in fade-in">
            <div className="flex gap-1">
              <span
                className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              ></span>
              <span
                className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></span>
              <span
                className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></span>
            </div>
            <span className="animate-pulse">{status}</span>
          </div>
        )}

        {/* Message bubble - shown when there's content or typing */}
        {showMessageBubble && (
          <div className="p-3 text-sm bg-gray-100 rounded-lg dark:bg-gray-900 text-foreground">
            <Markdown>{message}</Markdown>
            {showTypingIndicator && (
              <div className="flex items-center h-4 gap-1">
                <span
                  className="w-2 h-2 bg-current rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                ></span>
                <span
                  className="w-2 h-2 bg-current rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                ></span>
                <span
                  className="w-2 h-2 bg-current rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                ></span>
              </div>
            )}
            {/* Streaming cursor when content is being added */}
            {isStreaming && message && (
              <span className="inline-block w-0.5 h-4 ml-0.5 bg-primary animate-pulse" />
            )}
          </div>
        )}
      </div>
      <Avatar>
        <AvatarImage src={sender === "AGENT" ? "/icon.png" : user.image} />
        <AvatarFallback>
          {sender === "AGENT" ? "AI" : user.name[0]}
        </AvatarFallback>
      </Avatar>
    </div>
  );
};

function ArrowUpIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  );
}
