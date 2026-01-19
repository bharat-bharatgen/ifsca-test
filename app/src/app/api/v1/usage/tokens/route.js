import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const USAGE_ACCOUNT_EMAIL = "usage@example.com";

export const GET = async (req) => {
  const session = await getServerSession({ req });
  
  // Only allow usage account to access this endpoint
  if (!session || session.user?.email !== USAGE_ACCOUNT_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    // Get user details
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get all token usage records for this user
    const tokenUsageRecords = await prisma.tokenUsage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    // Calculate totals for all endpoints
    const totalInputTokens = tokenUsageRecords.reduce(
      (sum, record) => sum + record.inputTokens,
      0
    );
    const totalOutputTokens = tokenUsageRecords.reduce(
      (sum, record) => sum + record.outputTokens,
      0
    );
    const totalTokens = totalInputTokens + totalOutputTokens;

    // Calculate totals by endpoint type
    const documentChatRecords = tokenUsageRecords.filter(
      (r) => r.endpointType === "document-chat" || (!r.endpointType)
    );
    const globalChatRecords = tokenUsageRecords.filter(
      (r) => r.endpointType === "global-chat"
    );
    const documentUploadRecords = tokenUsageRecords.filter(
      (r) => r.endpointType === "document-upload"
    );

    const documentChatInput = documentChatRecords.reduce(
      (sum, record) => sum + record.inputTokens,
      0
    );
    const documentChatOutput = documentChatRecords.reduce(
      (sum, record) => sum + record.outputTokens,
      0
    );
    const documentChatTotal = documentChatInput + documentChatOutput;

    const globalChatInput = globalChatRecords.reduce(
      (sum, record) => sum + record.inputTokens,
      0
    );
    const globalChatOutput = globalChatRecords.reduce(
      (sum, record) => sum + record.outputTokens,
      0
    );
    const globalChatTotal = globalChatInput + globalChatOutput;

    const documentUploadInput = documentUploadRecords.reduce(
      (sum, record) => sum + record.inputTokens,
      0
    );
    const documentUploadOutput = documentUploadRecords.reduce(
      (sum, record) => sum + record.outputTokens,
      0
    );
    const documentUploadTotal = documentUploadInput + documentUploadOutput;

    return NextResponse.json({
      user,
      // Overall totals
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      // Document chat totals
      documentChat: {
        inputTokens: documentChatInput,
        outputTokens: documentChatOutput,
        totalTokens: documentChatTotal,
        recordCount: documentChatRecords.length,
      },
      // Global chat totals
      globalChat: {
        inputTokens: globalChatInput,
        outputTokens: globalChatOutput,
        totalTokens: globalChatTotal,
        recordCount: globalChatRecords.length,
      },
      // Document upload totals
      documentUpload: {
        inputTokens: documentUploadInput,
        outputTokens: documentUploadOutput,
        totalTokens: documentUploadTotal,
        recordCount: documentUploadRecords.length,
      },
      records: tokenUsageRecords,
      recordCount: tokenUsageRecords.length,
    });
  } catch (error) {
    console.error("Error fetching token usage:", error);
    return NextResponse.json({ error: "Failed to fetch token usage" }, { status: 500 });
  }
};

