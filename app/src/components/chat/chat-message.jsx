"use client";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { FileText } from "lucide-react";
import { Button } from "@/components/chat/primitives";
import { CopyMessage } from "./copy-message";
import { SourceCards } from "./source-cards";
import { PdfPreviewDialog } from "@/components/pdf-preview-dialog";
import { parseDocumentEntries, parseSourceDocs, stripCitationsBlock, stripTrailingSourcesOrCitationsBlock } from "@/lib/chat-utils";
import { DOCUMENT_FORMATTING } from "@/lib/document-formatting";
import { getDocumentMarkdownComponents } from "@/lib/markdown";
const components = getDocumentMarkdownComponents(DOCUMENT_FORMATTING);
function splitAnswer(message) {
  const newMarker = "\n\n---\n\nSources:\n";
  const oldMarker = "\n\n---\n\nSources (raw OCR excerpts from the documents used above):";
  const index = message.indexOf(newMarker) !== -1 ? message.indexOf(newMarker) : message.indexOf(oldMarker);
  const sourceText = index === -1 ? "" : message.slice(index);
  const documents = parseSourceDocs(sourceText);
  let answer = stripCitationsBlock(index === -1 ? message : message.slice(0, index));
  if (documents?.length) answer = stripTrailingSourcesOrCitationsBlock(answer);
  // Do not expose an incomplete metadata record while its network chunks arrive.
  answer = answer.replace(/__(?:SOURCE_DOCS|CITATIONS)__:[\s\S]*$/, "");
  return { answer, documents, legacy: sourceText && !documents && !sourceText.includes("__SOURCE_DOCS__") ? sourceText.replace(oldMarker, "") : "" };
}
function DocumentList({ text, streaming }) {
  const [visible, setVisible] = useState(10);
  const parsed = parseDocumentEntries(text);
  if (!parsed.isDocumentList) return <Streamdown components={components} mode={streaming ? "streaming" : "static"} isAnimating={streaming}>{text}</Streamdown>;
  return <><Streamdown components={components} mode="static">{parsed.header}</Streamdown>{parsed.documents.slice(0, visible).map(doc => <div key={doc.title + doc.content} className="mt-5"><Streamdown components={components} mode={streaming ? "streaming" : "static"}>{doc.content}</Streamdown></div>)}{visible < parsed.documents.length && <Button variant="outline" size="sm" className="mt-4" onClick={() => setVisible(n => n + 10)}>View more documents ({parsed.documents.length - visible})</Button>}{visible > 10 && <Button variant="ghost" size="sm" onClick={() => setVisible(10)}>View less</Button>}</>;
}
export function ChatMessage({ message = "", sender, timestamp, isStreaming = false, status, error }) {
  const [preview, setPreview] = useState(null);
  if (sender === "USER") return <article aria-label="Your message" className="ml-auto w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-2xl bg-muted px-4 py-3 text-sm leading-6">{message}</article>;
  const { answer, documents, legacy } = splitAnswer(message);
  return <article aria-label="Assistant response" aria-busy={isStreaming} className="min-w-0">
    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary"><FileText className="size-4" />Document assistant</div>
    {status && isStreaming && <p role="status" className="mb-3 text-sm text-muted-foreground">{status}</p>}
    <div className="document-response min-w-0 text-sm leading-7"><DocumentList text={answer} streaming={isStreaming} /></div>
    {isStreaming && answer && <span aria-hidden="true" className="inline-block h-4 w-0.5 bg-primary motion-safe:animate-pulse" />}
    {!isStreaming && Array.isArray(documents) && documents.length > 0 && <SourceCards documents={documents} onOpen={setPreview} />}
    {!isStreaming && legacy && <details className="mt-4 rounded-xl border p-3 text-sm"><summary className="cursor-pointer font-medium">Source excerpts</summary><DocumentList text={legacy} streaming={false} /></details>}
    {error && <p role="status" className="mt-3 text-sm text-muted-foreground">{error}</p>}
    {!isStreaming && answer && <div className="mt-2 flex items-center justify-between gap-2"><CopyMessage text={answer} />{timestamp && <time className="text-xs text-muted-foreground" dateTime={timestamp}>{new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}</div>}
    {preview && <PdfPreviewDialog open={true} onOpenChange={open => !open && setPreview(null)} sourceDoc={preview} />}
  </article>;
}
