"use client";
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { defineRegistry, Renderer, StateProvider, VisibilityProvider, ActionProvider } from "@json-render/react";
import { z } from "zod";
import { Button } from "@base-ui/react/button";
import { FileText, ArrowUpRight } from "lucide-react";
import { createContext, useContext } from "react";
const OpenSource = createContext(null);
// Deliberately read-only: retrieval metadata can only render these known components.
const catalog = defineCatalog(schema, { components: {
  Sources: { props: z.object({ count: z.number() }), slots: ["default"] },
  Source: { props: z.object({ index: z.number(), label: z.string(), pages: z.string(), excerpt: z.string() }) },
}, actions: {} });
const { registry } = defineRegistry(catalog, { components: {
  Sources: ({ props, children }) => <section aria-label="Answer sources" className="mt-5 border-t pt-4"><h3 className="mb-3 text-xs font-semibold text-muted-foreground">Sources · {props.count}</h3><div className="grid gap-2 sm:grid-cols-2">{children}</div></section>,
  Source: function Source({ props }) {
    const open = useContext(OpenSource);
    return <Button type="button" className="flex min-w-0 items-start gap-2 rounded-xl border bg-card p-3 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" onClick={() => open(props.index)}>
      <FileText className="mt-1 size-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{props.label}</span>{props.pages && <span className="block text-xs text-muted-foreground">{props.pages}</span>}{props.excerpt && <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{props.excerpt}</span>}</span><ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
    </Button>;
  },
} });
export function SourceCards({ documents, onOpen }) {
  const items = documents.filter(doc => doc && typeof doc === "object");
  const spec = { root: "sources", elements: { sources: { type: "Sources", props: { count: items.length }, children: items.map((_, i) => `source-${i}`) } } };
  items.forEach((doc, index) => {
    const pages = [...new Set((Array.isArray(doc.citations) ? doc.citations : []).map(c => c?.page).filter(p => Number.isInteger(p) && p > 0))].sort((a,b) => a-b);
    spec.elements[`source-${index}`] = { type: "Source", props: { index, label: String(doc.label || `Document ${index + 1}`), pages: pages.length ? `${pages.length === 1 ? "Page" : "Pages"} ${pages.join(", ")}` : "", excerpt: String(doc.citations?.[0]?.excerpt || "") } };
  });
  return <OpenSource.Provider value={index => onOpen(items[index])}><StateProvider initialState={{}}><VisibilityProvider><ActionProvider handlers={{}}><Renderer spec={spec} registry={registry} /></ActionProvider></VisibilityProvider></StateProvider></OpenSource.Provider>;
}
