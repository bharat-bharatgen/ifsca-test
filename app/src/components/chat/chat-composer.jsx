"use client";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { Button } from "@base-ui/react/button";
import { ArrowUp, Square } from "lucide-react";

export const ChatComposer = forwardRef(function ChatComposer({ value, onChange, onKeyDown, onSend, busy, mentionOpen = false, mentionActiveId, disabled = false, onStop, placeholder = "Ask a question…" }, ref) {
  const textarea = useRef(null);
  useImperativeHandle(ref, () => textarea.current);
  useLayoutEffect(() => {
    const el = textarea.current;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);
  return <form className="chat-composer flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/30" onSubmit={e => { e.preventDefault(); if (!busy && !disabled && value.trim()) onSend(); }}>
    <textarea ref={textarea} aria-label="Message" aria-controls={mentionOpen ? "chat-mentions" : undefined} aria-activedescendant={mentionOpen ? mentionActiveId : undefined} aria-autocomplete={mentionOpen ? "list" : "none"} value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} rows={1} className="max-h-44 min-h-12 flex-1 min-w-0 resize-none bg-transparent px-3 py-3 text-base leading-6 outline-none placeholder:text-muted-foreground" />
    <Button type={busy ? "button" : "submit"} onClick={busy ? onStop : undefined} disabled={disabled || (!busy && !value.trim())} aria-label={busy ? "Stop response" : "Send message"} className="mb-1 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {busy ? <Square className="size-4" /> : <ArrowUp className="size-5" />}
    </Button>
  </form>;
});
