import { prisma } from "@/lib/prisma";
import { verifyApiKey, validateApiKey } from "@/lib/api-key-utils";
import { NextResponse } from "next/server";

/**
 * Extract API key from request headers
 * Supports both X-API-Key header and Authorization: Bearer <key>
 * @param {Request} req - The request object
 * @returns {string|null} The API key or null if not found
 */
export function extractApiKey(req) {
  // Try X-API-Key header first
  const apiKeyHeader = req.headers.get("x-api-key");
  if (apiKeyHeader) {
    return apiKeyHeader.trim();
  }
  
  // Try Authorization: Bearer <key>
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  
  return null;
}

/**
 * Authenticate request using API key
 * Attaches user to request object if valid
 * @param {Request} req - The request object
 * @returns {Promise<{user: User, apiKey: ApiKey}|null>} User and API key if valid, null otherwise
 */
export async function authenticateApiKey(req) {
  const apiKey = extractApiKey(req);
  
  if (!apiKey) {
    return null;
  }
  
  // Validate format
  if (!validateApiKey(apiKey)) {
    return null;
  }
  
  // Find all active API keys and check each one
  // We need to check all because we can't query by hash directly
  const apiKeys = await prisma.apiKey.findMany({
    where: { isActive: true },
    include: { user: true },
  });
  
  // Check each API key
  for (const storedKey of apiKeys) {
    const isValid = await verifyApiKey(apiKey, storedKey.keyHash);
    if (isValid) {
      // Update lastUsedAt
      await prisma.apiKey.update({
        where: { id: storedKey.id },
        data: { lastUsedAt: new Date() },
      });
      
      return {
        user: storedKey.user,
        apiKey: storedKey,
      };
    }
  }
  
  return null;
}

/**
 * Middleware function to require API key authentication
 * Returns 401 if authentication fails
 * @param {Request} req - The request object
 * @returns {Promise<NextResponse|null>} Error response if auth fails, null if successful
 */
export async function requireApiKey(req) {
  const authResult = await authenticateApiKey(req);
  
  if (!authResult) {
    return NextResponse.json(
      { error: "Unauthorized. Valid API key required." },
      { status: 401 }
    );
  }
  
  // Attach user to request for downstream use
  req.user = authResult.user;
  req.apiKey = authResult.apiKey;
  
  return null;
}

