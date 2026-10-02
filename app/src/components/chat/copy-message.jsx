"use client";
import { useState } from "react";
import { Button } from "@base-ui/react/button";
import { Check, Copy } from "lucide-react";
export function CopyMessage({ text }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  return <div className="flex items-center gap-2 text-xs text-muted-foreground">
    <Button type="button" className="flex min-h-9 items-center gap-1.5 rounded-md px-2 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setError(false); }
      catch { setError(true); }
    }}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy answer"}</Button>
    <span role="status">{error ? "Could not copy. Select the answer to copy it manually." : copied ? "Answer copied to clipboard" : ""}</span>
  </div>;
}
