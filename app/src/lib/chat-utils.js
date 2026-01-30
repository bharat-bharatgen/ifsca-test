/**
 * Escape text for use inside markdown link text [text](url) - escape ] and \.
 * @param {string} s - Raw text
 * @returns {string} - Escaped text
 */
function escapeMarkdownLinkText(s) {
  if (typeof s !== "string") return "";
  return s.replace(/\\/g, "\\\\").replace(/]/g, "\\]");
}

/** Prefix that we shorten to "FAQs" so AI-written short form matches. */
const FAQ_FULL_PREFIX = "Frequently Asked Questions (FAQs)";

/** Trailing phrase in FAQ doc title; AI often cites without this (e.g. "Preliminary Section"). */
const TRAILING_FOR_REIMBURSEMENT = " For Reimbursement";

/**
 * Return possible phrases that might appear in the message for this doc label
 * (full label, with period, short form "FAQs...", and citation shortenings without " For Reimbursement...").
 * @param {string} label - Source doc label
 * @returns {string[]} - Phrases to try replacing (longest first)
 */
function getLabelVariants(label) {
  if (!label || typeof label !== "string") return [];
  const trimmed = label.trim();
  const variants = [trimmed, trimmed + "."];
  const prefix = FAQ_FULL_PREFIX;
  if (
    trimmed.length > prefix.length &&
    trimmed.slice(0, prefix.length).localeCompare(prefix, undefined, { sensitivity: "accent" }) === 0
  ) {
    const rest = trimmed.slice(prefix.length).trimStart();
    const shortForm = "FAQs" + (rest ? " " + rest : "");
    if (shortForm !== trimmed) {
      variants.push(shortForm, shortForm + ".");
    }
  }
  // Citation shortening: "Frequently Asked Questions (FAQs) On Milestones & Illustrative Permissible Expenses"
  // (AI drops " For Reimbursement Under IFSCA (FinTech Incentive) Scheme, 2022")
  const idx = trimmed.indexOf(TRAILING_FOR_REIMBURSEMENT);
  if (idx > 0) {
    const beforeReimbursement = trimmed.slice(0, idx).trim();
    if (beforeReimbursement && beforeReimbursement !== trimmed) {
      variants.push(beforeReimbursement, beforeReimbursement + ".");
      const shortPrefix = FAQ_FULL_PREFIX;
      if (
        beforeReimbursement.length > shortPrefix.length &&
        beforeReimbursement.slice(0, shortPrefix.length).localeCompare(shortPrefix, undefined, { sensitivity: "accent" }) === 0
      ) {
        const rest = beforeReimbursement.slice(shortPrefix.length).trimStart();
        const shortFormBefore = "FAQs" + (rest ? " " + rest : "");
        if (shortFormBefore !== beforeReimbursement) {
          variants.push(shortFormBefore, shortFormBefore + ".");
        }
      }
    }
  }
  return variants.sort((a, b) => b.length - a.length);
}

/**
 * Replace source document names in message with markdown links that open the doc preview (__docref:index).
 * Uses longest labels first. Replaces full label, "Label.", and short form (e.g. "FAQs On Milestones...") when applicable.
 * @param {string} message - The message content
 * @param {Array<{label: string}>} sourceDocs - List of source docs with label
 * @returns {string} - Message with document names replaced by [text](__docref:i__)
 */
export function injectDocumentLinks(message, sourceDocs) {
  if (typeof message !== "string" || !Array.isArray(sourceDocs) || sourceDocs.length === 0) {
    return message;
  }
  let out = message;
  const withIndex = sourceDocs.map((doc, origIdx) => ({ doc, origIdx }));
  const sorted = withIndex.sort(
    (a, b) => (b.doc?.label?.length ?? 0) - (a.doc?.label?.length ?? 0),
  );
  sorted.forEach(({ doc, origIdx }) => {
    const label = (doc?.label && typeof doc.label === "string" && doc.label.trim()) || "";
    if (!label) return;
    const variants = getLabelVariants(label);
    for (const phrase of variants) {
      if (!phrase || !out.includes(phrase)) continue;
      const escaped = escapeMarkdownLinkText(phrase);
      const link = `[${escaped}](__docref:${origIdx}__)`;
      out = out.split(phrase).join(link);
    }
  });
  return out;
}

/**
 * Strip __CITATIONS__: [...] block from agent message so it is not shown to the user.
 * @param {string} text - The message content
 * @returns {string} - Message with citations block removed
 */
export function stripCitationsBlock(text) {
  if (typeof text !== "string") return text;
  const marker = "__CITATIONS__:";
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return text.slice(0, idx).replace(/\n{2,}$/, "\n").trimEnd();
}

/**
 * Parse __SOURCE_DOCS__ JSON array from message (new format with id, url, label, citations?).
 * @param {string} message - The message content to parse
 * @returns {Array<{id: string, url: string, label: string, citations?: Array<{page?: number, excerpt?: string}>}>|null} - Source docs or null if not found
 */
export function parseSourceDocs(message) {
  const marker = "__SOURCE_DOCS__:";
  const idx = message.indexOf(marker);
  if (idx === -1) return null;
  const afterMarker = message.slice(idx + marker.length).trim();
  const startBracket = afterMarker.indexOf("[");
  if (startBracket === -1) return null;
  let depth = 0;
  let endBracket = -1;
  for (let i = startBracket; i < afterMarker.length; i++) {
    if (afterMarker[i] === "[") depth++;
    else if (afterMarker[i] === "]") {
      depth--;
      if (depth === 0) {
        endBracket = i;
        break;
      }
    }
  }
  if (endBracket === -1) return null;
  try {
    return JSON.parse(afterMarker.slice(startBracket, endBracket + 1));
  } catch {
    return null;
  }
}

/**
 * Helper function to parse document entries from AGENT messages
 * Parses messages that contain document lists in the format:
 * "I found X documents:\n\n\n\"Document Title\"\n\nDocument details..."
 * 
 * @param {string} message - The message content to parse
 * @returns {Object} - Object with header, documents array, and isDocumentList flag
 */
export function parseDocumentEntries(message) {
  // Split by pattern that separates documents: \n\n followed by a quoted title
  // Pattern: \n\n\"Document Title\"\n\n
  const documentPattern = /\n\n"([^"]+)"\n\n/g;
  
  // Find all document entries
  const documentMatches = [];
  let match;
  while ((match = documentPattern.exec(message)) !== null) {
    documentMatches.push({
      start: match.index,
      title: match[1],
      fullMatch: match[0]
    });
  }
  
  if (documentMatches.length === 0) {
    // No document pattern found, return the whole message as a single part
    return {
      header: message,
      documents: [],
      isDocumentList: false
    };
  }
  
  // Extract header (everything before first document)
  const header = message.substring(0, documentMatches[0].start).trim();
  
  // Extract each document entry (include the title pattern in content)
  const documents = [];
  for (let i = 0; i < documentMatches.length; i++) {
    const start = documentMatches[i].start; // Start from the \n\n" pattern
    const end = i < documentMatches.length - 1 
      ? documentMatches[i + 1].start 
      : message.length;
    const documentContent = message.substring(start, end).trim();
    documents.push({
      title: documentMatches[i].title,
      content: documentContent
    });
  }
  
  return {
    header,
    documents,
    isDocumentList: true
  };
}

