/**
 * Parse __SOURCE_DOCS__ JSON array from message (new format with id, url, label).
 * @param {string} message - The message content to parse
 * @returns {Array<{id: string, url: string, label: string}>|null} - Source docs or null if not found
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

