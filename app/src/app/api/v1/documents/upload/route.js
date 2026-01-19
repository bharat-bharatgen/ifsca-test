import { env } from "@/env.mjs";
import { prisma } from "@/lib/prisma";
import { DeleteObjectCommand, PutObjectCommand, S3 } from "@aws-sdk/client-s3";
import axios from "axios";
import { createHash } from "crypto";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

const s3Client = new S3({
  forcePathStyle: false,
  endpoint: env.DO_SPACES_ENDPOINT_URL,
  region: "blr1",
  credentials: {
    accessKeyId: env.DO_SPACES_ACCESS_KEY,
    secretAccessKey: env.DO_SPACES_SECRET_KEY,
  },
});

// Configure axios instance with timeout and connection pooling for better concurrent request handling
// maxRedirects: 5 (default)
// timeout: 30 seconds - enough for FastAPI to start the Celery task
// httpAgent and httpsAgent: Use keep-alive for connection reuse
const axiosInstance = axios.create({
  baseURL: env.DOCUMENT_API_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    "Content-Type": "application/json",
  },
  // Enable connection pooling and keep-alive for better performance
  maxRedirects: 5,
  validateStatus: (status) => status < 500, // Don't throw on 4xx errors
});

export const dynamic = "force-dynamic";

export const POST = async (req) => {
  const session = await getServerSession({ req });

  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let document = null;
  let filename = null;
  let fileHash = null;

  const cleanupResources = async () => {
    if (document) {
      try {
        await prisma.document.delete({
          where: { id: document.id },
        });
      } catch (deleteError) {
        console.error("Error deleting document:", deleteError);
      }
    }

    if (filename) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: env.DO_SPACES_NAME,
            Key: filename,
          })
        );
      } catch (deleteError) {
        console.error("Error deleting S3 object:", deleteError);
      }
    }
  };

  try {
    const form = await req.formData();
    const file = form.get("documentFile") || form.get("contractFile");
    const forceUpload = (form.get("forceUpload") || "").toString() === "true";

    if (!file) {
      return new NextResponse(
        JSON.stringify({ message: "failure", error: "No file found" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const buffer = await file.arrayBuffer();

    // Create SHA-256 hash for duplicate detection & storage
    fileHash = createHash("sha256").update(Buffer.from(buffer)).digest("hex");

    // Extract just the filename (remove folder path if present)
    const getBasename = (name) => {
      if (!name) return null;
      const lastSlash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
      return lastSlash >= 0 ? name.substring(lastSlash + 1) : name;
    };

    // Sanitize original filename
    const sanitizeFilename = (name) => {
      const lastDotIndex = name.lastIndexOf(".");
      const base = lastDotIndex === -1 ? name : name.slice(0, lastDotIndex);
      const ext = lastDotIndex === -1 ? "" : name.slice(lastDotIndex);
      const safeBase = base
        .replace(/[^a-zA-Z0-9-_ ]+/g, "")
        .replace(/\s+/g, "-");
      return `${safeBase}${ext}`;
    };

    const originalFileName =
      getBasename(file.name) ||
      `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const safeOriginalName = sanitizeFilename(originalFileName);
    filename = `${Date.now()}-${safeOriginalName}`;

    // Before creating a new document, check for duplicates by fileHash within the organization
    if (!forceUpload && fileHash) {
      try {
        // Check for an existing document using the fileHash field within the same organization
        const existingDocument = await prisma.document.findFirst({
          where: {
            fileHash: fileHash,
            // Only check for duplicates within the same organization
            ...(user.organizationId ? { organizationId: user.organizationId } : { userId: user.id }),
          },
        });
        
        if (existingDocument) {
          return new NextResponse(
            JSON.stringify({
              message: "duplicate_found",
              existingDocument: {
                id: existingDocument.id,
                name:
                  existingDocument.documentName ||
                  existingDocument.title ||
                  originalFileName,
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      } catch (duplicateError) {
        console.error("Error checking for existing document by fileHash:", duplicateError);
        // If duplicate check fails, we still continue with upload to avoid blocking user
      }
    }

    // Upload to S3
    await s3Client.send(
      new PutObjectCommand({
        Bucket: env.DO_SPACES_NAME,
        Key: filename,
        Body: Buffer.from(buffer),
        ACL: "public-read",
      })
    );

    // Ensure URL uses encoded key
    const encodedKey = encodeURIComponent(filename);
    const url = `https://${env.DO_SPACES_NAME}.${env.DO_SPACES_ENDPOINT}/${encodedKey}`;

    // Create document record with minimal data including organizationId for isolation
    document = await prisma.document.create({
      data: {
        documentUrl: url,
        userId: user.id,
        organizationId: user.organizationId, // Associate document with user's organization
        documentName: originalFileName,
        documentType: "UPLOADED",
        fileHash: fileHash,
      },
    });

    // Start Celery task for processing
    // Use configured axios instance with timeout and connection pooling
    const processResponse = await axiosInstance.post("/api/process-document", {
      document_id: document.id,
      document_url: document.documentUrl,
      user_name: user.name || "Unknown User",
      original_file_name: originalFileName,
      user_id: user.id,
    });

    const { status: processingStatus = 500, data: processingData = {} } = processResponse || {};
    const taskId = processingData.task_id;

    if (processingStatus !== 200 || !taskId) {
      console.error(
        "Failed to start document processing task",
        JSON.stringify({ status: processingStatus, data: processingData }, null, 2)
      );

      await cleanupResources();

      return new NextResponse(
        JSON.stringify({
          message: "failure",
          error:
            processingData?.error ||
            "Unable to start document processing task. Please try again shortly.",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Return task_id immediately for WebSocket tracking
    return new NextResponse(
      JSON.stringify({
        message: "task_started",
        task_id: taskId,
        document: {
          id: document.id,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Upload error:", error);

    // Cleanup on error
    await cleanupResources();

    return new NextResponse(
      JSON.stringify({
        message: "failure",
        error: error.message || "Upload failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
