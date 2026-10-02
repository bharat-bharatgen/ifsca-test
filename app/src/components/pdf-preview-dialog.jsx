"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/chat/primitives";
import { Button } from "@/components/chat/primitives";
import { LoaderIcon } from "lucide-react";
import dynamic from "next/dynamic";

const PdfViewer = dynamic(() => import("@/components/chat/pdf-viewer"), { ssr: false });

export function PdfPreviewDialog({ open, onOpenChange, sourceDoc }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !sourceDoc) {
      setPdfUrl(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setPdfUrl(null);
    setError(null);
    const loadUrl = async () => {
      if (sourceDoc.url) {
        setIsLoading(false);
        setPdfUrl(sourceDoc.url);
        return;
      }
      if (sourceDoc.id) {
        setIsLoading(true);
        setError(null);
        try {
          const res = await fetch(`/api/v1/documents/${encodeURIComponent(sourceDoc.id)}`, { signal: controller.signal });
          if (!res.ok) throw new Error("Document not found");
          const data = await res.json();
          const url = data?.document?.documentUrl;
          if (controller.signal.aborted) return;
          if (url) setPdfUrl(url);
          else setError("Document URL not available");
        } catch (e) {
          if (e.name !== "AbortError") setError(e.message || "Failed to load document");
        } finally {
          if (!controller.signal.aborted) setIsLoading(false);
        }
      } else {
        setError("No document URL or ID provided");
      }
    };

    loadUrl();
    return () => controller.abort();
  }, [open, sourceDoc]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        blurOverlay={true}
        className="sm:max-w-[90vw] max-h-[90dvh] overflow-hidden flex flex-col p-0"
      >
        <DialogTitle className="px-6 py-4 border-b">
          {sourceDoc?.label || "Document Preview"}
        </DialogTitle>
        <div className="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-4">
          {isLoading && (
            <div className="flex items-center justify-center h-[70dvh]">
              <LoaderIcon className="w-10 h-10 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-[70dvh] gap-2 text-muted-foreground">
              <p>{error}</p>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}
          {pdfUrl && !isLoading && !error && (
            <div className="h-[65dvh] shrink-0 overflow-hidden rounded-lg border">
              <PdfViewer url={pdfUrl} initialPage={sourceDoc?.citations?.find(c => Number.isInteger(c.page) && c.page > 0)?.page || 1} />
            </div>
          )}
          {sourceDoc?.citations && sourceDoc.citations.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <h4 className="font-medium text-foreground mb-2">Cited in this response</h4>
              <p className="text-xs text-muted-foreground mb-2">
                Page and section references from which the AI generated the answer:
              </p>
              <ul className="space-y-2">
                {sourceDoc.citations.map((c, i) => (
                  <li key={i} className="flex flex-col gap-0.5">
                    {c.page != null && (
                      <span className="font-medium text-foreground">Page {c.page}</span>
                    )}
                    {c.excerpt && (
                      <span className="text-muted-foreground italic">&ldquo;{c.excerpt}&rdquo;</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
