"use client";
import { useState } from "react";
import Link from "next/link";
import { FolderInput, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/chat/primitives";
export default function Integrations() {
  const [provider, setProvider] = useState("drive");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  async function importDocument(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setFeedback(null);
    try {
      const parsed = new URL(url);
      const host = provider === "drive" ? "drive.google.com" : "dropbox.com";
      if (parsed.protocol !== "https:" || !(parsed.hostname === host || provider === "dropbox" && parsed.hostname === "www.dropbox.com")) throw new Error(`Enter a ${provider === "drive" ? "Google Drive" : "Dropbox"} shared file link.`);
      const response = await fetch("/api/v1/public/documents/process", {method:"POST", headers:{"Content-Type":"application/json", "X-API-Key":apiKey.trim()}, body:JSON.stringify({documentUrl:url.trim()})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not import this file. Try again.");
      setFeedback({success:true, text:"Import started. You can follow the document in your library."}); setApiKey(""); setUrl("");
    } catch(error) { setFeedback({success:false, text:error.message}); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto w-full max-w-4xl p-4 sm:p-8"><h1 className="chat-heading text-3xl">Integrations</h1><p className="mt-3 text-sm text-muted-foreground">Import a shared file from Google Drive or Dropbox.</p><div className="mt-8 grid gap-4 sm:grid-cols-2">{[["drive","Google Drive"],["dropbox","Dropbox"]].map(([id,name])=><Button key={id} variant="outline" aria-pressed={provider===id} onClick={()=>{setProvider(id);setFeedback(null);setUrl("");}} className={`h-auto justify-start gap-3 p-5 ${provider===id?"bg-accent border-ring":""}`}><FolderInput className="size-5" /><span>{name}</span></Button>)}</div><form onSubmit={importDocument} className="mt-8 space-y-5"><div><label htmlFor="import-url" className="text-sm font-medium">Shared file link</label><input id="import-url" required type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder={provider==="drive"?"https://drive.google.com/file/d/…":"https://www.dropbox.com/…"} className="mt-2 block w-full rounded-lg border bg-card px-3 py-3 text-base focus-visible:outline focus-visible:outline-ring" /><p className="mt-2 text-xs text-muted-foreground">The file must be accessible through its shared link. This imports one file; account sync is not available.</p></div><div><label htmlFor="import-key" className="text-sm font-medium">Workspace API key</label><input id="import-key" required type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} className="mt-2 block w-full rounded-lg border bg-card px-3 py-3 text-base focus-visible:outline focus-visible:outline-ring" /><Link href="/api-keys" className="mt-2 inline-flex items-center gap-1 text-xs text-primary">Manage API keys <ArrowUpRight className="size-3" /></Link></div>{feedback&&<p role={feedback.success?"status":"alert"} className="text-sm">{feedback.text}{feedback.success&&<Link href="/ui-dashboard" className="ml-2 underline">View documents</Link>}</p>}<Button type="submit" disabled={busy}>{busy?"Importing…":"Import file"}</Button></form></div>;
}
