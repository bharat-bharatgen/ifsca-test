import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey } from "@/lib/api-key-auth";
import { env } from "@/env.mjs";
import { PutObjectCommand, S3 } from "@aws-sdk/client-s3";
import axios from "axios";
import { processDocument } from "@/lib/document-processor-worker";
import crypto from "crypto";
import dns from "dns";
import net from "net";

const s3Client = new S3({
  forcePathStyle: false,
  endpoint: env.DO_SPACES_ENDPOINT_URL,
  region: "blr1",
  credentials: {
    accessKeyId: env.DO_SPACES_ACCESS_KEY,
    secretAccessKey: env.DO_SPACES_SECRET_KEY,
  },
});

// Normalize incoming document URLs so we can reliably download the raw file.
// - For Google Drive "viewer" links like:
//   https://drive.google.com/file/d/FILE_ID/view?usp=sharing
//   we convert to a direct download URL:
//   https://drive.google.com/uc?export=download&id=FILE_ID
// - For Dropbox shared links like:
//   https://www.dropbox.com/s/.../file.pdf?dl=0
//   we force direct download by setting dl=1
const normalizeDocumentUrlForDownload = (urlString) => {
  try {
    const parsed = new URL(urlString);

    if (parsed.hostname.includes("drive.google.com")) {
      const match = parsed.pathname.match(/\/file\/d\/([^/]+)\//);
      if (match && match[1]) {
        const fileId = match[1];
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(
          fileId
        )}`;
      }
    }

    if (parsed.hostname.includes("dropbox.com")) {
      // Force direct download by setting dl=1
      if (parsed.searchParams.get("dl") !== "1") {
        parsed.searchParams.set("dl", "1");
      }
      return parsed.toString();
    }

    // Fallback: return original URL if no special handling is needed
    return urlString;
  } catch (e) {
    // If URL parsing fails, just return the original string and let the normal validator handle it
    return urlString;
  }
};

// Basic SSRF protection helpers
const isPrivateOrDisallowedIp = (ip) => {
  const family = net.isIP(ip);

  if (family === 4) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    const [a, b] = parts;

    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (localhost)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local, includes 169.254.169.254 metadata)
    if (a === 169 && b === 254) return true;
  } else if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv6 localhost
    if (lower === "::1") return true;
    // Link-local IPv6
    if (lower.startsWith("fe80:")) return true;
  }

  return false;
};

const validatePublicHttpUrl = async (urlString) => {
  let url;

  try {
    url = new URL(urlString);
  } catch {
    return {
      ok: false,
      message: "Invalid documentUrl format",
    };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return {
      ok: false,
      message: "documentUrl must use http or https",
    };
  }

  const hostname = url.hostname;

  // Block obvious local hosts
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  ) {
    return {
      ok: false,
      message: "documentUrl cannot point to localhost or loopback addresses",
    };
  }

  let addresses = [];
  const ipVersion = net.isIP(hostname);

  if (ipVersion) {
    // Hostname is already an IP literal
    addresses = [{ address: hostname, family: ipVersion }];
  } else {
    try {
      addresses = await dns.promises.lookup(hostname, { all: true });
    } catch (err) {
      console.error("[PublicAPI] DNS lookup failed for documentUrl host:", {
        hostname,
        error: err?.message || String(err),
      });
      return {
        ok: false,
        message: "Failed to resolve documentUrl host",
      };
    }
  }

  for (const addr of addresses) {
    if (isPrivateOrDisallowedIp(addr.address)) {
      return {
        ok: false,
        message:
          "documentUrl host resolves to a private or local IP address, which is not allowed",
      };
    }
  }

  return { ok: true };
};

export const POST = async (req) => {
  // Authenticate API key
  const authError = await requireApiKey(req);
  if (authError) {
    return authError;
  }

  const user = req.user;

  try {
    const { documentUrl, webhookUrl, documentName, metadata } = await req.json();

    console.log("[PublicAPI] /api/v1/public/documents/process - Incoming request", {
      userId: user?.id,
      documentUrl,
      hasWebhookUrl: !!webhookUrl,
      documentName,
      metadataPreview: metadata
        ? Array.isArray(metadata)
          ? metadata
          : Object.keys(metadata)
        : null,
    });

    // Validate required fields
    if (!documentUrl) {
      return NextResponse.json(
        { error: "documentUrl is required" },
        { status: 400 }
      );
    }

    // Validate document URL format, scheme, and protect against SSRF
    const urlValidation = await validatePublicHttpUrl(documentUrl);
    if (!urlValidation.ok) {
      return NextResponse.json(
        { error: urlValidation.message },
        { status: 400 }
      );
    }

    // Validate metadata if provided - it should be an array of field names to extract
    let metadataFields = null;
    if (metadata !== undefined && metadata !== null) {
      if (Array.isArray(metadata)) {
        // If it's an array, treat as list of field names to extract
        if (metadata.length === 0) {
          return NextResponse.json(
            { error: "metadata array cannot be empty" },
            { status: 400 }
          );
        }
        // Validate all items are strings
        if (!metadata.every(item => typeof item === "string")) {
          return NextResponse.json(
            { error: "metadata array must contain only string field names" },
            { status: 400 }
          );
        }
        metadataFields = metadata;
      } else if (typeof metadata === "object") {
        // Legacy support: if it's an object, convert keys to array for extraction
        // This maintains backward compatibility
        metadataFields = Object.keys(metadata);
      } else {
        return NextResponse.json(
          { error: "metadata must be an array of field names or an object" },
          { status: 400 }
        );
      }
    }

    // Validate webhook URL if provided
    if (webhookUrl) {
      try {
        new URL(webhookUrl);
      } catch (error) {
        return NextResponse.json(
          { error: "Invalid webhookUrl format" },
          { status: 400 }
        );
      }
    }

    // Generate unique job ID
    const jobId = `job_${crypto.randomBytes(16).toString("hex")}`;
    console.log("[PublicAPI] Generated jobId for document processing", {
      jobId,
      userId: user.id,
    });

    // Download document from URL (with normalization for known providers like Google Drive)
    let fileBuffer;
    let originalFileName;
    let fileHash = null;
    const normalizedDocumentUrl = normalizeDocumentUrlForDownload(documentUrl);
    if (normalizedDocumentUrl !== documentUrl) {
      console.log("[PublicAPI] Normalized documentUrl for download", {
        jobId,
        originalDocumentUrl: documentUrl,
        normalizedDocumentUrl,
      });
    }

    try {
      const response = await axios.get(normalizedDocumentUrl, {
        responseType: "arraybuffer",
        timeout: 60000, // 60 second timeout
        maxContentLength: 100 * 1024 * 1024, // 100MB max
      });

      fileBuffer = Buffer.from(response.data);
      
      // Calculate SHA-256 hash for duplicate detection
      fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
      
      // Check for duplicates within the organization before creating document
      try {
        const orgFilter = user.organizationId 
          ? { organizationId: user.organizationId }
          : { userId: user.id };
          
        const existingDocument = await prisma.document.findFirst({
          where: {
            fileHash: fileHash,
            ...orgFilter,
          },
        });
        
        if (existingDocument) {
          console.log("[PublicAPI] Duplicate document found", {
            jobId,
            existingDocumentId: existingDocument.id,
            fileHash,
          });
          return NextResponse.json(
            {
              error: "Duplicate document detected",
              message: "A document with the same content already exists in your organization",
              existingDocumentId: existingDocument.id,
            },
            { status: 409 } // 409 Conflict
          );
        }
      } catch (duplicateError) {
        console.error("[PublicAPI] Error checking for duplicate document:", duplicateError);
        // Continue with upload if duplicate check fails to avoid blocking user
      }
      
      // Try to derive a reasonable original filename:
      // - Prefer an explicit documentName from the client
      // - Then Content-Disposition from the remote server
      // - Then fall back to the last path segment of the *original* URL (before normalization)
      let fallbackName = "";
      try {
        const originalParsed = new URL(documentUrl);
        fallbackName =
          originalParsed.pathname.split("/").pop()?.split("?")[0] || "";
      } catch {
        fallbackName =
          documentUrl.split("/").pop()?.split("?")[0] || `document-${Date.now()}`;
      }

      originalFileName = documentName ||
        response.headers["content-disposition"]?.match(/filename="?(.+?)"?$/)?.[1] ||
        fallbackName ||
        `document-${Date.now()}`;
    } catch (error) {
      console.error("[PublicAPI] Error downloading document:", {
        jobId,
        documentUrl,
        error: error?.message || String(error),
      });
      return NextResponse.json(
        { error: "Failed to download document from URL" },
        { status: 400 }
      );
    }

    // Sanitize filename
    const sanitizeFilename = (name) => {
      const lastDotIndex = name.lastIndexOf(".");
      const base = lastDotIndex === -1 ? name : name.slice(0, lastDotIndex);
      const ext = lastDotIndex === -1 ? "" : name.slice(lastDotIndex);
      const safeBase = base
        .replace(/[^a-zA-Z0-9-_ ]+/g, "")
        .replace(/\s+/g, "-");
      return `${safeBase}${ext}`;
    };

    const safeOriginalName = sanitizeFilename(originalFileName);
    const filename = `${Date.now()}-${safeOriginalName}`;

    // Upload to S3
    let s3Url;
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: env.DO_SPACES_NAME,
          Key: filename,
          Body: fileBuffer,
          ACL: "public-read",
        })
      );

      const encodedKey = encodeURIComponent(filename);
      s3Url = `https://${env.DO_SPACES_NAME}.${env.DO_SPACES_ENDPOINT}/${encodedKey}`;
    } catch (error) {
      console.error("[PublicAPI] Error uploading to S3:", {
        jobId,
        filename,
        error: error?.message || String(error),
      });
      return NextResponse.json(
        { error: "Failed to upload document to storage" },
        { status: 500 }
      );
    }

    // Create document record with fileHash and organizationId for proper isolation
    const document = await prisma.document.create({
      data: {
        documentUrl: s3Url,
        userId: user.id,
        organizationId: user.organizationId, // Associate with user's organization
        documentName: originalFileName,
        documentType: "UPLOADED",
        fileHash: fileHash,
      },
    });
    console.log("[PublicAPI] Document record created", {
      jobId,
      documentId: document.id,
      documentUrl: s3Url,
    });

    // Create processing job
    const job = await prisma.documentProcessingJob.create({
      data: {
        jobId,
        userId: user.id,
        documentId: document.id,
        status: "PENDING",
        documentUrl: s3Url,
        webhookUrl: webhookUrl || null,
      },
    });
    console.log("[PublicAPI] DocumentProcessingJob created", {
      jobId: job.jobId,
      documentId: job.documentId,
      userId: job.userId,
      webhookUrl: job.webhookUrl,
      metadataFields,
    });

    // Trigger async processing (don't await)
    // Pass metadataFields so AI can extract only those specific fields
    processDocument(jobId, document.id, s3Url, user.id, webhookUrl, filename, metadataFields)
      .then(() => {
        console.log("[PublicAPI] Background processing completed", { jobId });
      })
      .catch((error) => {
        console.error("[PublicAPI] Error in background processing:", {
          jobId,
          error: error?.message || String(error),
        });
      });

    return NextResponse.json({
      jobId,
      status: "PENDING",
      documentId: document.id,
      message: "Document processing started",
    });
  } catch (error) {
    console.error("[PublicAPI] Error in process endpoint:", {
      error: error?.message || String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
};

