import { prisma } from "./prisma";

/**
 * Validates and sanitizes search query
 * @param {string} query - The search query to validate
 * @param {number} maxLength - Maximum allowed query length (default: 500)
 * @returns {Object} - { isValid: boolean, error?: string, sanitizedQuery?: string }
 */
export function validateSearchQuery(query, maxLength = 500) {
  if (!query || typeof query !== "string") {
    return { isValid: false, error: "Search query must be a string" };
  }

  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { isValid: false, error: "Search query cannot be empty" };
  }

  if (trimmed.length > maxLength) {
    return {
      isValid: false,
      error: `Search query cannot exceed ${maxLength} characters`,
    };
  }

  // Check for potentially problematic patterns
  // Reject queries with excessive special characters that could cause performance issues
  const specialCharCount = (trimmed.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length;
  if (specialCharCount > trimmed.length * 0.5) {
    return {
      isValid: false,
      error: "Search query contains too many special characters",
    };
  }

  return { isValid: true, sanitizedQuery: trimmed };
}

/**
 * Shared function to execute document search query
 * @param {string} query - The search query
 * @param {number} limit - Maximum number of results
 * @param {number} offset - Offset for pagination
 * @param {string|null} organizationId - Organization ID for filtering (null for user's own docs)
 * @param {string|null} userId - User ID for filtering when no organization
 * @returns {Promise<Array>} - Search results
 */
export async function executeDocumentSearch(query, limit, offset, organizationId = null, userId = null) {
  // If organizationId is provided, filter by organization
  if (organizationId) {
    return await prisma.$queryRaw`
      SELECT 
        d.id,
        d.title,
        d.description,
        d."documentText",
        d.promisor,
        d.promisee,
        d.type,
        d.category,
        d."subCategory",
        d.city,
        d.state,
        d.country,
        d.location,
        d."documentNumber",
        d."uploadedAt",
        ts_rank(d.search_vector, plainto_tsquery('english', ${query})) as rank,
        (
          SELECT row_to_json(di.*)::jsonb
          FROM "document_info" di
          WHERE di."documentId" = d.id
          LIMIT 1
        ) as "documentInfo"
      FROM "documents" d
      WHERE d.search_vector @@ plainto_tsquery('english', ${query})
        AND d."organizationId" = ${organizationId}
      ORDER BY rank DESC, d."uploadedAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  }
  
  // If no organization but userId, filter by user
  if (userId) {
    return await prisma.$queryRaw`
      SELECT 
        d.id,
        d.title,
        d.description,
        d."documentText",
        d.promisor,
        d.promisee,
        d.type,
        d.category,
        d."subCategory",
        d.city,
        d.state,
        d.country,
        d.location,
        d."documentNumber",
        d."uploadedAt",
        ts_rank(d.search_vector, plainto_tsquery('english', ${query})) as rank,
        (
          SELECT row_to_json(di.*)::jsonb
          FROM "document_info" di
          WHERE di."documentId" = d.id
          LIMIT 1
        ) as "documentInfo"
      FROM "documents" d
      WHERE d.search_vector @@ plainto_tsquery('english', ${query})
        AND d."userId" = ${userId}
      ORDER BY rank DESC, d."uploadedAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  }
  
  // Fallback - return empty (shouldn't happen in normal flow)
  return [];
}

/**
 * Get total count of search results
 * @param {string} query - The search query
 * @param {string|null} organizationId - Organization ID for filtering
 * @param {string|null} userId - User ID for filtering when no organization
 * @returns {Promise<number>} - Total count
 */
export async function getDocumentSearchCount(query, organizationId = null, userId = null) {
  if (organizationId) {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM "documents" d
      WHERE d.search_vector @@ plainto_tsquery('english', ${query})
        AND d."organizationId" = ${organizationId}
    `;
    return result[0]?.count || 0;
  }
  
  if (userId) {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count
      FROM "documents" d
      WHERE d.search_vector @@ plainto_tsquery('english', ${query})
        AND d."userId" = ${userId}
    `;
    return result[0]?.count || 0;
  }
  
  return 0;
}

