"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { Button } from "./primitives";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export default function PdfViewer({ url, initialPage = 1 }) {
  return <PdfFile key={url} url={url} initialPage={initialPage} />;
}
function PdfFile({ url, initialPage }) {
  const container = useRef(null);
  const [width, setWidth] = useState(300);
  const [count, setCount] = useState(0);
  const pdf = useRef(null);
  const searchRun = useRef(0);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [searching, setSearching] = useState(false);
  useEffect(() => () => { searchRun.current++; }, []);
  const search = async (event) => {
    event.preventDefault();
    const run = ++searchRun.current;
    const term = query.trim().toLocaleLowerCase();
    setMatches([]);
    if (!term || !pdf.current) { setSearchStatus(""); setSearching(false); return; }
    setSearching(true);
    const found = [];
    try {
      for (let number = 1; number <= count; number++) {
        if (run !== searchRun.current) return;
        setSearchStatus(`Searching page ${number} of ${count}…`);
        const currentPage = await pdf.current.getPage(number);
        const content = await currentPage.getTextContent();
        const text = content.items.map(item => item.str || "").join(" ");
        const index = text.toLocaleLowerCase().indexOf(term);
        if (index !== -1) found.push({ page: number, excerpt: text.slice(Math.max(0, index - 30), index + term.length + 80) });
      }
      if (run === searchRun.current) { setMatches(found); setSearchStatus(found.length ? `Found text on ${found.length} pages.` : "No matching text found."); }
    } catch {
      if (run === searchRun.current) setSearchStatus("Could not search this PDF. You can still browse its pages.");
    } finally {
      if (run === searchRun.current) setSearching(false);
    }
  };
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(160, Math.floor(entry.contentRect.width - 24))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const handleLoad = useCallback(document => { if (pdf.current === document) return; pdf.current = document; setCount(document.numPages); setPage(Math.min(document.numPages, Math.max(1, initialPage))); }, [initialPage]);
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Previous page" disabled={!count || page <= 1} onClick={() => setPage(n => n - 1)}><ChevronLeft className="size-4" /></Button>
        <label className="flex items-center gap-1 text-xs">Page <input aria-label="Page number" type="number" min={1} max={count || 1} value={page} disabled={!count} onChange={e => { const next = Number(e.target.value); if (Number.isInteger(next) && next >= 1 && next <= count) setPage(next); }} className="w-12 rounded border bg-background px-1 py-1 text-center tabular-nums" /><span role="status">of {count || "…"}</span></label>
        <Button variant="ghost" size="icon" aria-label="Next page" disabled={!count || page >= count} onClick={() => setPage(n => n + 1)}><ChevronRight className="size-4" /></Button>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Zoom out" disabled={scale <= 0.5} onClick={() => setScale(n => Math.max(0.5, n - 0.25))}><Minus className="size-4" /></Button>
        <Button variant="ghost" size="sm" aria-label="Reset zoom to fit width" className="tabular-nums" onClick={() => setScale(1)}>{Math.round(scale * 100)}%</Button>
        <Button variant="ghost" size="icon" aria-label="Zoom in" disabled={scale >= 2} onClick={() => setScale(n => Math.min(2, n + 0.25))}><Plus className="size-4" /></Button>
      </div>
    </div>
    <form onSubmit={search} className="flex gap-2 border-b px-3 py-2">
      <input aria-label="Find text in PDF" placeholder="Find text in this PDF…" value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 flex-1 rounded-lg border bg-background px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" />
      {searching ? <Button type="button" variant="outline" size="sm" onClick={() => { searchRun.current++; setSearching(false); setSearchStatus("Search stopped."); }}>Stop search</Button> : <Button type="submit" variant="outline" size="sm" disabled={!count || !query.trim()}>Find</Button>}
    </form>
    {searchStatus && <div className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground"><p role="status">{searchStatus}</p>{matches.length > 0 && <details className="mt-1"><summary className="cursor-pointer">Matching pages</summary><div className="mt-2 max-h-32 overflow-auto">{matches.map(match => <Button key={match.page} size="sm" variant="ghost" className="flex h-auto w-full items-start gap-2 whitespace-normal py-2 text-left" onClick={() => setPage(match.page)}><span className="shrink-0">Page {match.page}</span><span className="line-clamp-2">{match.excerpt}</span></Button>)}</div></details>}</div>}
    <div ref={container} className="flex-1 min-h-0 overflow-auto bg-muted/30 p-3">
      <Document suspense={false} file={url} onLoadSuccess={handleLoad} loading={<p role="status" className="p-8 text-center text-sm text-muted-foreground">Loading document…</p>} error={<p role="alert" className="p-8 text-center text-sm text-muted-foreground">Could not open this PDF. Close the preview and try again.</p>}>
        <Page suspense={false} pageNumber={page} width={Math.min(width, 1200) * scale} renderAnnotationLayer renderTextLayer loading={<p role="status" className="p-8 text-sm text-muted-foreground">Loading page…</p>} />
      </Document>
    </div>
  </div>;
}
