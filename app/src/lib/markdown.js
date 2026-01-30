import Link from "next/link";

// Flatten React children to a single string (for link text comparison).
function childrenToText(children) {
  if (children == null) return "";
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(childrenToText).join("");
  if (typeof children === "object" && children?.props?.children != null)
    return childrenToText(children.props.children);
  return String(children);
}

// Normalize for comparison: trim and optional trailing period.
function normalizeLabel(s) {
  if (typeof s !== "string") return "";
  return s.trim().replace(/\.+$/, "");
}

// Same short-form as chat-utils: "Frequently Asked Questions (FAQs) X" → "FAQs X".
const FAQ_FULL_PREFIX = "Frequently Asked Questions (FAQs)";
const TRAILING_FOR_REIMBURSEMENT = " For Reimbursement";

function getLabelVariants(label) {
  if (!label || typeof label !== "string") return [];
  const t = label.trim();
  const variants = [t, t + "."];
  if (
    t.length > FAQ_FULL_PREFIX.length &&
    t.slice(0, FAQ_FULL_PREFIX.length).localeCompare(FAQ_FULL_PREFIX, undefined, { sensitivity: "accent" }) === 0
  ) {
    const rest = t.slice(FAQ_FULL_PREFIX.length).trimStart();
    const shortForm = "FAQs" + (rest ? " " + rest : "");
    if (shortForm !== t) variants.push(shortForm, shortForm + ".");
  }
  const idx = t.indexOf(TRAILING_FOR_REIMBURSEMENT);
  if (idx > 0) {
    const beforeReimbursement = t.slice(0, idx).trim();
    if (beforeReimbursement && beforeReimbursement !== t) {
      variants.push(beforeReimbursement, beforeReimbursement + ".");
      if (
        beforeReimbursement.length > FAQ_FULL_PREFIX.length &&
        beforeReimbursement.slice(0, FAQ_FULL_PREFIX.length).localeCompare(FAQ_FULL_PREFIX, undefined, { sensitivity: "accent" }) === 0
      ) {
        const rest = beforeReimbursement.slice(FAQ_FULL_PREFIX.length).trimStart();
        const shortFormBefore = "FAQs" + (rest ? " " + rest : "");
        if (shortFormBefore !== beforeReimbursement) variants.push(shortFormBefore, shortFormBefore + ".");
      }
    }
  }
  return variants;
}

function linkTextMatchesDoc(linkTextNorm, doc) {
  if (!linkTextNorm || !doc?.label) return false;
  const labelNorm = normalizeLabel(doc.label);
  if (labelNorm === linkTextNorm || doc.label.trim() === linkTextNorm) return true;
  for (const v of getLabelVariants(doc.label)) {
    if (normalizeLabel(v) === linkTextNorm) return true;
  }
  return false;
}

// Factory that returns a shared Markdown components object
// Accepts a DOCUMENT_FORMATTING config to control spacing and detection.
// Optional options: { sourceDocs, onDocClick } - when href is __docref:index, render clickable doc preview link
export function getDocumentMarkdownComponents(DOCUMENT_FORMATTING, options = null) {
  const { sourceDocs = [], onDocClick } = options || {};
  return {
    p: ({ children, ...props }) => {
      const text = children?.toString() || '';

      if (text.match(DOCUMENT_FORMATTING.QUOTED_TEXT_PATTERN)) {
        return (
          <p className={DOCUMENT_FORMATTING.DOCUMENT_TITLE_SPACING_CLASS} {...props}>
            {children}
          </p>
        );
      }

      if (text.includes(DOCUMENT_FORMATTING.TOTAL_RESULTS_SUBSTRING)) {
        return (
          <p className={DOCUMENT_FORMATTING.TOTAL_RESULTS_SPACING_CLASS} {...props}>
            {children}
          </p>
        );
      }

      return <p {...props}>{children}</p>;
    },
    a: ({ href, children, ...props }) => {
      const hasDocPreview =
        Array.isArray(sourceDocs) &&
        sourceDocs.length > 0 &&
        typeof onDocClick === "function";

      // Source doc preview link (global chat): __docref:0 or __docref:0__ opens preview for sourceDocs[0]
      const docRefMatch = href && href.startsWith("__docref:");
      if (docRefMatch && hasDocPreview) {
        const afterPrefix = href.replace("__docref:", "").replace(/__+$/, "");
        const idx = parseInt(afterPrefix, 10);
        const doc = Number.isInteger(idx) && idx >= 0 ? sourceDocs[idx] : null;
        if (doc) {
          return (
            <button
              type="button"
              className="text-primary underline font-bold hover:text-primary/80 cursor-pointer bg-transparent border-none p-0 inline align-baseline"
              onClick={() => onDocClick(doc)}
            >
              {children}
            </button>
          );
        }
      }

      // If this link's text matches a source doc label or its short form (e.g. "FAQs On Milestones..."),
      // render as doc preview button so clicking opens popup instead of navigating
      if (hasDocPreview) {
        const linkText = childrenToText(children).trim();
        const linkTextNorm = normalizeLabel(linkText);
        const matched = linkTextNorm && sourceDocs.find((d) => linkTextMatchesDoc(linkTextNorm, d));
        if (matched) {
          return (
            <button
              type="button"
              className="text-primary underline font-bold hover:text-primary/80 cursor-pointer bg-transparent border-none p-0 inline align-baseline"
              onClick={(e) => {
                e.preventDefault();
                onDocClick(matched);
              }}
            >
              {children}
            </button>
          );
        }
      }

      // Check if it's an internal document link
      const isDocumentLink = href && href.startsWith("/documents/");

      if (isDocumentLink) {
        // Use Next.js Link for internal document links, but open in new tab
        return (
          <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline font-bold hover:text-blue-800 cursor-pointer"
            {...props}
          >
            {children}
          </Link>
        );
      }

      // External links open in new tab
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline font-bold hover:text-blue-800"
          {...props}
        >
          {children}
        </a>
      );
    },
  };
}


