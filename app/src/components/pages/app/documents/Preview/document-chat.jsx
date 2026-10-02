"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { ChatComposer } from "@/components/chat/chat-composer";
import { CopyMessage } from "@/components/chat/copy-message";
import { createChatStreamParser } from "@/lib/chat-stream.mjs";
import { useDocumentContext } from "./context";
import { Button } from "@/components/ui/button";

export const DocumentChat = () => {
  const context = useDocumentContext();
  return <DocumentChatSession key={context.document.id} {...context} />;
};
function DocumentChatSession({ document, documentChats, setSendMessageToAI }) {
  const [chats, setChats] = useState(() => (documentChats || []).map(chat => ({ ...chat, id: chat.id || crypto.randomUUID() })));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [away, setAway] = useState(false);
  const viewport = useRef(null);
  const input = useRef(null);
  const abort = useRef(null);
  const locked = useRef(false);
  const follow = useRef(true);
  const initialChats = useRef(documentChats);
  const sent = useRef(false);
  const latest = () => { if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight; follow.current = true; setAway(false); };
  useEffect(() => {
    if (follow.current && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [chats]);
  useEffect(() => {
    const controller = new AbortController();
    setChats((initialChats.current || []).map(chat => ({ ...chat, id: chat.id || crypto.randomUUID() })));
    fetch(`/api/v1/chat/history?documentId=${encodeURIComponent(document.id)}`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Could not load chat history"); return response.json(); })
      .then(data => { if (!controller.signal.aborted && !sent.current) setChats((data.chats || []).map(chat => ({ ...chat, id: chat.id || crypto.randomUUID() }))); })
      .catch(error => { if (error.name !== "AbortError") setChats(prev => [...prev, { id: crypto.randomUUID(), sender: "AGENT", error: "Could not load history. Try reopening this document." }]); });
    return () => { controller.abort(); abort.current?.abort(); };
  }, [document.id]);
  const send = useCallback(async (content) => {
    if (!content.trim() || locked.current) return;
    locked.current = true;
    sent.current = true;
    setBusy(true); setMessage(""); follow.current = true;
    const id = crypto.randomUUID();
    const controller = new AbortController(); abort.current = controller;
    setChats(prev => [...prev, { id: `${id}-user`, sender: "USER", message: content }, { id, sender: "AGENT", message: "", status: "Searching document…", isStreaming: true }]);
    let fullText = "";
    const update = patch => { if (!controller.signal.aborted) setChats(prev => prev.map(chat => chat.id === id ? { ...chat, ...patch } : chat)); };
    try {
      const response = await fetch("/api/v1/chat/document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content, documentId: document.id }), signal: controller.signal });
      if (!response.ok || !response.body) throw new Error("Request failed");
      const parser = createChatStreamParser(text => { fullText += text; update({ message: fullText, status: null }); }, (key, value) => { if (key === "STATUS") update({ status: value }); });
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      while (true) { const { done, value } = await reader.read(); if (done) break; parser.push(decoder.decode(value, { stream: true })); }
      parser.push(decoder.decode()); parser.finish();
    } catch (error) {
      setChats(prev => prev.map(chat => chat.id === id ? { ...chat, error: error.name === "AbortError" ? "Response stopped." : "Connection interrupted. Your partial response is kept." } : chat));
    } finally {
      setChats(prev => prev.map(chat => chat.id === id ? { ...chat, isStreaming: false, status: null } : chat));
      locked.current = false; setBusy(false); abort.current = null; input.current?.focus();
    }
  }, [document.id]);
  useEffect(() => {
    setSendMessageToAI({ caller: send });
    return () => setSendMessageToAI({ caller: async () => {} });
  }, [send, setSendMessageToAI]);
  return <section id="ai-chat-box" className="chat-workspace flex min-w-0 flex-col rounded-2xl border lg:col-span-2">
    <header className="border-b px-5 py-4"><h2 className="font-semibold">Chat with this document</h2><p className="mt-1 truncate text-xs text-muted-foreground">{document.title || "Ask a question, summarize, or explore a detail."}</p></header>
    <div className="relative">
      <div ref={viewport} className="h-[25rem] overflow-y-auto overflow-x-hidden px-4 py-6" onScroll={e => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100; setAway(!follow.current); }}>
        {!chats.length && <p className="py-12 text-center text-sm text-muted-foreground">What would you like to understand about this document?</p>}
        <div className="space-y-6">{chats.map((chat) => <article key={chat.id} className={chat.sender === "USER" ? "ml-auto w-fit max-w-[90%] rounded-2xl bg-muted px-4 py-3 text-sm whitespace-pre-wrap" : "document-response min-w-0 text-sm leading-7"}>
          {chat.sender === "USER" ? chat.message : <Streamdown mode={chat.isStreaming ? "streaming" : "static"} isAnimating={chat.isStreaming}>{chat.message || ""}</Streamdown>}
          {chat.status && <p role="status" className="text-xs text-muted-foreground">{chat.status}</p>}
          {chat.error && <p role="status" className="text-sm text-muted-foreground">{chat.error}</p>}
          {chat.sender === "AGENT" && chat.message && !chat.isStreaming && <CopyMessage text={chat.message} />}
        </article>)}</div>
      </div>
      {away && <Button size="sm" variant="secondary" className="absolute bottom-2 left-1/2 -translate-x-1/2" onClick={latest}>Jump to latest ↓</Button>}
    </div>
    <div className="p-3"><ChatComposer ref={input} value={message} onChange={setMessage} busy={busy} onStop={() => abort.current?.abort()} onSend={() => send(message)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(message); } }} /><p className="pt-2 text-center text-xs text-muted-foreground">Check important details against your document.</p></div>
  </section>;
};
