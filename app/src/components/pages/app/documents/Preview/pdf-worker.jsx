"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/chat/primitives";
import { useDocumentContext } from "./context";
const PdfViewer = dynamic(() => import("@/components/chat/pdf-viewer"), { ssr: false });
function ImageViewer({ url }) {
  const [scale, setScale] = useState(1);
  return <div className="flex h-full flex-col"><div className="flex justify-end gap-2 border-b p-2"><Button variant="ghost" size="icon" aria-label="Zoom out" disabled={scale <= 0.5} onClick={() => setScale(n => Math.max(0.5, n - 0.25))}><ZoomOut className="size-4" /></Button><Button variant="ghost" size="icon" aria-label="Zoom in" disabled={scale >= 3} onClick={() => setScale(n => Math.min(3, n + 0.25))}><ZoomIn className="size-4" /></Button></div><div className="flex-1 overflow-auto p-4"><img src={url} alt="Document preview" style={{ width: `${scale * 100}%`, maxWidth: "none" }} /></div></div>;
}
export function PdfWorker() {
  const { document } = useDocumentContext();
  const url = document?.documentUrl;
  const isImage = url && /\.(png|jpe?g|webp)(?:[?#]|$)/i.test(url);
  return <section aria-label="Document preview" className="chat-workspace h-[90dvh] min-w-0 overflow-hidden rounded-2xl border">{!url ? <p className="p-6 text-sm text-muted-foreground">Document preview is unavailable.</p> : isImage ? <ImageViewer key={url} url={url} /> : <PdfViewer url={url} />}</section>;
}
