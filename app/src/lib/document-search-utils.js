import { prisma } from "./prisma";

/**
 * Split document text into chunks for search
 * @param {string} text - The document text to split
 * @param {number} chunkSize - Maximum characters per chunk (default: 2000)
 * @param {number} overlap - Characters to overlap between chunks (default: 200)
 * @returns {Array<{text: string, start: number, end: number}>} Array of chunks with positions
 */
export function splitDocumentIntoChunks(text, chunkSize = 2000, overlap = 200) {
  if (!text || text.length === 0) {
    return [];
  }

  const chunks = [];
  let start = 0;

  // Split by paragraphs first, then by sentences if needed
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  for (const paragraph of paragraphs) {
    if (paragraph.length <= chunkSize) {
      // Paragraph fits in one chunk
      chunks.push({
        text: paragraph.trim(),
        start: start,
        end: start + paragraph.length,
      });
      start += paragraph.length + 2; // +2 for the paragraph separator
    } else {
      // Split paragraph into smaller chunks
      const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
      let currentChunk = "";

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length <= chunkSize) {
          currentChunk += (currentChunk ? " " : "") + sentence;
        } else {
          if (currentChunk) {
            chunks.push({
              text: currentChunk.trim(),
              start: start,
              end: start + currentChunk.length,
            });
            start += currentChunk.length;
          }
          // Start new chunk with overlap
          if (overlap > 0 && chunks.length > 0) {
            const lastChunk = chunks[chunks.length - 1];
            const overlapText = lastChunk.text.slice(-overlap);
            currentChunk = overlapText + " " + sentence;
            // Set start to the end of the last chunk minus the length of overlapText, but not less than zero
            start = Math.max(lastChunk.end - overlapText.length, 0);
          } else {
            currentChunk = sentence;
          }
        }
      }

      if (currentChunk) {
        chunks.push({
          text: currentChunk.trim(),
          start: start,
          end: start + currentChunk.length,
        });
        start += currentChunk.length;
      }
    }
  }

  return chunks;
}

/**
 * Find relevant document chunks using tsvector search
 * Uses a simpler approach: splits document and uses ts_headline for each chunk
 * @param {string} documentText - The full document text
 * @param {string} query - The user's search query
 * @param {number} maxChunks - Maximum number of chunks to return (default: 5)
 * @returns {Promise<Array<{text: string, rank: number}>>} Relevant chunks ranked by relevance
 */
export async function findRelevantDocumentChunks(documentText, query, maxChunks = 5) {
  if (!documentText || !query || documentText.trim().length === 0 || query.trim().length === 0) {
    return [];
  }

  try {
    // Split document into chunks
    const chunks = splitDocumentIntoChunks(documentText, 2000, 200);

    if (chunks.length === 0) {
      return [];
    }

    // Batch all chunks into a single query to avoid N+1 problem
    // Process chunks in batches to avoid query size limits and improve performance
    const BATCH_SIZE = 20; // Process 20 chunks at a time
    const rankedChunks = [];

    try {
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel using Promise.all for better performance
        const batchPromises = batch.map(async (chunk, batchIdx) => {
          try {
            const matchResult = await prisma.$queryRaw`
              SELECT 
                CASE 
                  WHEN to_tsvector('english', ${chunk.text}) @@ plainto_tsquery('english', ${query})
                  THEN ts_rank(
                    to_tsvector('english', ${chunk.text}),
                    plainto_tsquery('english', ${query})
                  )
                  ELSE 0
                END as rank
            `;

            if (matchResult && matchResult.length > 0 && matchResult[0] && matchResult[0].rank > 0) {
              return {
                text: chunk.text,
                rank: parseFloat(matchResult[0].rank) || 0,
                start: chunk.start,
                end: chunk.end,
              };
            }
            return null;
          } catch (error) {
            // Skip chunks that cause errors
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach((result) => {
          if (result) {
            rankedChunks.push(result);
          }
        });
      }

      // Sort by rank and return top chunks
      rankedChunks.sort((a, b) => b.rank - a.rank);
      
      // If no chunks matched, return the first few chunks as fallback
      if (rankedChunks.length === 0 && chunks.length > 0) {
        return chunks.slice(0, Math.min(maxChunks, chunks.length)).map(chunk => ({
          ...chunk,
          rank: 0,
        }));
      }

      return rankedChunks.slice(0, maxChunks);
    } catch (error) {
      console.error("Error finding relevant document chunks:", error);
      // Fallback: return first few chunks
      const fallbackChunks = splitDocumentIntoChunks(documentText, 2000, 200);
      return fallbackChunks.slice(0, Math.min(maxChunks, fallbackChunks.length)).map(chunk => ({
        ...chunk,
        rank: 0,
      }));
    }
  } catch (error) {
    console.error("Error in findRelevantDocumentChunks:", error);
    // Final fallback: return first few chunks
    const fallbackChunks = splitDocumentIntoChunks(documentText, 2000, 200);
    return fallbackChunks.slice(0, Math.min(maxChunks, fallbackChunks.length)).map(chunk => ({
      ...chunk,
      rank: 0,
    }));
  }
}

/**
 * Alternative approach: Use PostgreSQL's ts_headline to extract relevant snippets
 * This is more efficient for large documents
 * @param {string} documentText - The full document text
 * @param {string} query - The user's search query
 * @param {number} maxLength - Maximum length of context to return (default: 5000)
 * @returns {Promise<string>} Relevant context extracted from document
 */
export async function extractRelevantContext(documentText, query, maxLength = 5000) {
  if (!documentText || !query || documentText.trim().length === 0 || query.trim().length === 0) {
    return documentText.substring(0, maxLength);
  }

  try {
    // Use PostgreSQL's ts_headline to extract relevant snippets
    const result = await prisma.$queryRaw`
      SELECT ts_headline(
        'english',
        ${documentText},
        plainto_tsquery('english', ${query}),
        'MaxWords=100, MinWords=20, StartSel=<mark>, StopSel=</mark>'
      ) as highlighted_text
    `;

    if (result && result[0] && result[0].highlighted_text) {
      // Remove HTML tags and clean up
      let context = result[0].highlighted_text
        .replace(/<mark>/g, "")
        .replace(/<\/mark>/g, "")
        .replace(/\s+/g, " ")
        .trim();

      // If the extracted context is too short, add surrounding context
      if (context.length < 500) {
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/);
        const sentences = documentText.split(/(?<=[.!?])\s+/);

        const relevantSentences = sentences.filter(sentence => {
          const sentenceLower = sentence.toLowerCase();
          return queryWords.some(word => sentenceLower.includes(word));
        });

        context = relevantSentences.slice(0, 10).join(" ");
      }

      return context.substring(0, maxLength);
    }

    // Fallback: return beginning of document
    return documentText.substring(0, maxLength);
  } catch (error) {
    console.error("Error extracting relevant context:", error);
    // Fallback: return beginning of document
    return documentText.substring(0, maxLength);
  }
}

