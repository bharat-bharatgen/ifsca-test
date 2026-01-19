import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import {
  validateSearchQuery,
  executeDocumentSearch,
  getDocumentSearchCount,
} from "@/lib/search-utils";

/**
 * POST /api/v1/documents/search
 * Full-text search endpoint for documents using PostgreSQL full-text search
 */
export const POST = async (req) => {
  const session = await getServerSession({ req });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  try {
    const { query, limit = 10, offset = 0 } = await req.json();

    // Validate query
    const validation = validateSearchQuery(query);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const searchLimit = Math.min(Math.max(parseInt(limit) || 10, 1), 50); // Limit between 1-50
    const searchOffset = Math.max(parseInt(offset) || 0, 0);

    // Use shared search function with organization filtering
    const results = await executeDocumentSearch(
      validation.sanitizedQuery,
      searchLimit,
      searchOffset,
      user.organizationId,
      user.organizationId ? null : user.id
    );

    // Get total count for pagination with organization filtering
    const totalCount = await getDocumentSearchCount(
      validation.sanitizedQuery,
      user.organizationId,
      user.organizationId ? null : user.id
    );

    return NextResponse.json({
      documents: results,
      total: totalCount,
      limit: searchLimit,
      offset: searchOffset,
    });
  } catch (error) {
    console.error("Error in full-text search:", error);
    return NextResponse.json(
      { error: "Search failed", details: error.message },
      { status: 500 }
    );
  }
};

/**
 * GET /api/v1/documents/search?q=query&limit=10&offset=0
 * Alternative GET endpoint for full-text search
 */
export const GET = async (req) => {
  const session = await getServerSession({ req });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit")) || 10;
    const offset = parseInt(searchParams.get("offset")) || 0;

    // Validate query
    const validation = validateSearchQuery(query);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const searchLimit = Math.min(Math.max(limit, 1), 50);
    const searchOffset = Math.max(offset, 0);

    // Use shared search function with organization filtering
    const results = await executeDocumentSearch(
      validation.sanitizedQuery,
      searchLimit,
      searchOffset,
      user.organizationId,
      user.organizationId ? null : user.id
    );

    const totalCount = await getDocumentSearchCount(
      validation.sanitizedQuery,
      user.organizationId,
      user.organizationId ? null : user.id
    );

    return NextResponse.json({
      documents: results,
      total: totalCount,
      limit: searchLimit,
      offset: searchOffset,
    });
  } catch (error) {
    console.error("Error in full-text search:", error);
    return NextResponse.json(
      { error: "Search failed", details: error.message },
      { status: 500 }
    );
  }
};

