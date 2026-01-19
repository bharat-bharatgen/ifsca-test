import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

export const GET = async (req) => {
  const session = await getServerSession({ req });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  const limitParam = searchParams.get("limit");
  const before = searchParams.get("before");
  if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });

  const limit = Math.min(Math.max(parseInt(limitParam || "10", 10), 1), 50);

  const messages = await prisma.aiChat.findMany({
    where: { conversationId, userId: user.id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, message: true, sender: true, createdAt: true },
  });

  let nextBefore = null;
  if (messages.length === limit) {
    nextBefore = messages[messages.length - 1].createdAt.toISOString();
  }

  return NextResponse.json({ messages, hasMore: Boolean(nextBefore), nextBefore });
};


