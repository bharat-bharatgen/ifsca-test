import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/v1/chat/count
 * Returns the count of AI chats (queries) raised by the current user and unresolved queries
 * - count: Total USER messages (queries raised)
 * - unresolvedCount: Count of queries that have unresolved agent responses
 */
export const GET = async () => {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Count only USER messages (queries raised by the user)
  const queryCount = await prisma.aiChat.count({
    where: {
      userId: user.id,
      sender: "USER",
    },
  });

  // Find unresolved queries by checking agent responses
  // A query is unresolved if the agent response matches specific patterns
  const unresolvedPatterns = [
    "I need more specific information to help you find the right documents",
    "Document doesn't exist for",
  ];

  // Get all agent responses that match unresolved patterns
  const allAgentResponses = await prisma.aiChat.findMany({
    where: {
      userId: user.id,
      sender: "AGENT",
      OR: unresolvedPatterns.map((pattern) => ({
        message: { contains: pattern },
      })),
    },
    select: {
      id: true,
      conversationId: true,
      documentId: true,
      createdAt: true,
      message: true,
    },
  });

  // Get all user queries to match with agent responses
  const userQueries = await prisma.aiChat.findMany({
    where: {
      userId: user.id,
      sender: "USER",
    },
    select: {
      id: true,
      conversationId: true,
      documentId: true,
      createdAt: true,
    },
  });

  // Group user queries by context for O(1) lookup and binary search within each group
  const convToQueries = new Map();
  const docToQueries = new Map();

  for (const q of userQueries) {
    const createdAtMs = new Date(q.createdAt).getTime();
    if (q.conversationId) {
      if (!convToQueries.has(q.conversationId)) convToQueries.set(q.conversationId, []);
      convToQueries.get(q.conversationId).push({ id: q.id, createdAtMs });
    }
    if (q.documentId) {
      if (!docToQueries.has(q.documentId)) docToQueries.set(q.documentId, []);
      docToQueries.get(q.documentId).push({ id: q.id, createdAtMs });
    }
  }

  // Sort groups ascending by time for binary search
  for (const arr of convToQueries.values()) arr.sort((a, b) => a.createdAtMs - b.createdAtMs);
  for (const arr of docToQueries.values()) arr.sort((a, b) => a.createdAtMs - b.createdAtMs);

  // Binary search: index of most recent element with createdAtMs <= targetMs
  const findLatestIndexBefore = (arr, targetMs) => {
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].createdAtMs <= targetMs) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  };

  // Match unresolved agent responses to the latest user query in same context efficiently
  const unresolvedQueryIds = new Set();
  for (const agentResponse of allAgentResponses) {
    const agentAtMs = new Date(agentResponse.createdAt).getTime();

    // Prefer conversation context; fall back to document context
    let arr = null;
    if (agentResponse.conversationId && convToQueries.has(agentResponse.conversationId)) {
      arr = convToQueries.get(agentResponse.conversationId);
    } else if (agentResponse.documentId && docToQueries.has(agentResponse.documentId)) {
      arr = docToQueries.get(agentResponse.documentId);
    }

    if (!arr || arr.length === 0) continue;

    const idx = findLatestIndexBefore(arr, agentAtMs);
    if (idx >= 0) {
      unresolvedQueryIds.add(arr[idx].id);
    }
  }

  const unresolvedCount = unresolvedQueryIds.size;

  return NextResponse.json({
    count: queryCount,
    unresolvedCount,
    resolvedCount: queryCount - unresolvedCount,
  });
};

