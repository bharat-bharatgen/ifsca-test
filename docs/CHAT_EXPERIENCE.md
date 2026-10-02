# Chat experience

This UI iteration adapts Team-S's conversation rail, bounded reading column, source access and multiline composer for internal teams and clients. A Devin-inspired landing page and a shared neutral/blue palette with Chivo/Gabarito typography keep the product coherent. The authenticated shell restores visible Documents, Chat, Integrations, Team and API-key navigation, preserving chat-only role restrictions using the database role. System theme is the default; a direct light/dark toggle switches the resolved theme without a menu. Existing document ingestion, retrieval, ranking and model prompts are unchanged.

## Rendering and transport

- Streamdown renders incremental Markdown, tables and code in global and document chat. User questions remain plain text.
- The existing API uses raw streamed text with newline-delimited `__STATUS__`, `__CONV_ID__`, `__TOKEN_USAGE__` and `__PAGINATION__` records. `chat-stream.mjs` buffers incomplete control records independently of network boundaries and flushes the UTF-8 decoder at completion. It is not an SSE `data:` parser.
- Global chat now receives its conversation ID before document processing starts, so stopping a new response does not lose the conversation identity.
- Stop cancels the browser request and preserves received text. This does not guarantee cancellation of upstream model processing or persistence. Refreshing history can reveal the server's completed answer.
- json-render renders source metadata through a fixed read-only `Sources`/`Source` catalog. It cannot execute model-generated code or arbitrary actions. Source pages and excerpts remain visible. Sources open a maintained React-PDF viewer on the first cited page, with page navigation, fit-width/zoom controls, full-document text search, selectable text and annotations. Its matching PDF.js worker is bundled locally. Arbitrary model-generated UI specs and JSONL patches are deliberately not enabled; adding them later requires a backend output contract, validation and persistence.

## Interactions

Enter sends; Shift+Enter adds a line; composition input does not send prematurely. Drafting remains available while a response streams. Use `@` to choose a document with arrows/Enter/Escape or pointer input, and remove its chip to clear both the target and its mention. Sending and conversation switching are guarded during an active request. The transcript follows the response only while the reader stays near the bottom; Jump to latest restores following. Older messages preserve scroll position when prepended.

Conversation search, rename and delete remain available on desktop and in the mobile drawer. Base UI handles chat buttons, menus, dialogs and drawer focus; existing shadcn-style variants provide the visual contract. PDF preview shares the maintained viewer with document detail screens. Reduced motion and mobile safe areas are respected.

## Document workspace

The existing library, filters, uploads, folder selection, duplicate detection, processing tracker and document previews remain wired to their original APIs. The new Integrations page exposes the existing API-key-authenticated Google Drive/Dropbox shared-file import endpoint. It imports one accessible file; it does not claim OAuth account linking or continuous synchronization. The entered API key stays in component memory and is cleared after successful import. Real authenticated upload/import completion still requires a configured backend and storage.

## Dependencies

Next.js and React are updated to the latest npm releases used for this iteration (16.3.8 and 19.3.0). json-render requires React 19. Other application/root dependencies are refreshed within compatible ranges, including axios and next-auth patches. The React-18-only `react-waypoint` dependency is replaced by IntersectionObserver. Legacy react-pdf-viewer/PDF.js 3 is replaced by React-PDF 11 and PDF.js 6.3.289 after dependency audit found a PDF JavaScript-execution advisory. Docker stages now use Node 24 to satisfy PDF.js requirements, with pnpm 10.34.6 pinned and frozen installs. Prisma 5, Tailwind 3 and other independent major migrations remain on their existing major versions; changing them is not necessary for this chat integration. Python/RAG dependencies are unchanged. Production audit after migration has zero high/critical advisories; one moderate `decode-uri-component` advisory remains transitively under react-admin/query-string. Its patched release is ESM, so it is not forced into the legacy CommonJS consumer with an unverified override.

## Verification

Run `cd app && node --test tests/chat-stream.test.mjs`, `pnpm prisma:generate`, and `pnpm build`. UI QA uses synthetic document metadata and fragmented responses, with no production document access. Cover desktop and narrow mobile widths, light/dark themes, tables/code, source cards, copy, Stop, empty/failed responses, multiline input, document targeting, conversation menus and long-answer scrolling. Temporary QA routes must never be committed.

Live authenticated retrieval quality, model performance, and the 22k-document workload are later RAG validation tasks. A successful UI build or mock stream does not demonstrate those results.
