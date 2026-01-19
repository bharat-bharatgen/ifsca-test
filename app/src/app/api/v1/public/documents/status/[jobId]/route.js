import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/api-key-auth";

export const GET = async (req, context) => {
  // Authenticate API key
  const authError = await requireApiKey(req);
  if (authError) {
    return authError;
  }

  const user = req.user;
  const params = await context.params;
  const { jobId } = params;

  if (!jobId) {
    return NextResponse.json(
      { error: "jobId is required" },
      { status: 400 }
    );
  }

  try {
    // Find job and verify ownership
    const job = await prisma.documentProcessingJob.findFirst({
      where: {
        jobId,
        userId: user.id,
      },
      include: {
        document: {
          include: {
            documentMetadata: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Format metadata as object
    const metadata = {};
    if (job.document?.documentMetadata) {
      job.document.documentMetadata.forEach((item) => {
        metadata[item.key] = item.value;
      });
    }

    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
      documentId: job.documentId,
      document: job.document
        ? {
            ...job.document,
            metadata,
          }
        : null,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    });
  } catch (error) {
    console.error("Error fetching job status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
};

