import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/env.mjs";
import {
  extractRelevantContext,
  findRelevantDocumentChunks,
} from "@/lib/document-search-utils";

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

  const { message, documentId } = await req.json();
  if (!message || !documentId) {
    return NextResponse.json(
      { error: "message and documentId are required" },
      { status: 400 },
    );
  }

  // Organization-based access filter
  const orgFilter = user.organizationId
    ? { organizationId: user.organizationId }
    : { userId: user.id };

  // Parse @ mentions from the message
  // Pattern matches @DocumentTitle or @DocumentTitle (with spaces)
  const mentionPattern = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionPattern.exec(message)) !== null) {
    const mentionedTitle = match[1].trim();
    if (mentionedTitle) {
      mentions.push(mentionedTitle);
    }
  }

  // Fetch document and mentioned documents in parallel
  const documentPromise = prisma.document.findFirst({
    where: { id: documentId, ...orgFilter },
    include: { documentInfo: true },
  });

  const mentionedDocsPromises = mentions.map((title) =>
    prisma.document.findMany({
      where: {
        title: {
          contains: title,
          mode: "insensitive",
        },
        id: {
          not: documentId, // Exclude the current document
        },
        ...orgFilter, // Filter by organization
      },
      include: { documentInfo: true },
      take: 1, // Take the first match
    }),
  );

  const [document, ...mentionedDocsResults] = await Promise.all([
    documentPromise,
    ...mentionedDocsPromises,
  ]);

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Fetch mentioned documents
  const mentionedDocuments = [];
  mentionedDocsResults.forEach((docs) => {
    if (docs.length > 0) {
      const mentionedDoc = docs[0];
      mentionedDocuments.push({
        document_id: mentionedDoc.id,
        document_text:
          mentionedDoc.documentInfo?.document ||
          mentionedDoc.documentText ||
          "",
        metadata: {
          title: mentionedDoc.title || "Untitled Document",
          documentUrl: mentionedDoc.documentUrl || null,
          type: mentionedDoc.type || "Unknown",
          documentValue: mentionedDoc.documentValue || 0,
          duration: mentionedDoc.duration || 0,
          promisor: mentionedDoc.promisor || "",
          promisee: mentionedDoc.promisee || "",
          country: mentionedDoc.country || "India",
          state: mentionedDoc.state || "N/A",
          city: mentionedDoc.city || "N/A",
          location: mentionedDoc.location || "",
          documentNumber: mentionedDoc.documentNumber || "",
          documentNumberLabel: mentionedDoc.documentNumberLabel || "",
        },
        title: mentionedDoc.title || "Untitled Document",
      });
    }
  });

  // Persist user message
  await prisma.aiChat.create({
    data: {
      userId: user.id,
      documentId,
      sender: "USER",
      message,
    },
  });

  // Extract relevant context from document using tsvector
  const fullDocumentText =
    document.documentInfo?.document || document.documentText || "";
  let relevantContext = fullDocumentText;

  // Only use tsvector search if document is large enough (> 3000 chars)
  // For smaller documents, send the full text
  if (fullDocumentText.length > 3000) {
    try {
      // Use extractRelevantContext for efficiency (uses ts_headline)
      relevantContext = await extractRelevantContext(
        fullDocumentText,
        message,
        5000,
      );

      // If extracted context is too short, try chunk-based approach
      if (relevantContext.length < 1000) {
        const relevantChunks = await findRelevantDocumentChunks(
          fullDocumentText,
          message,
          5,
        );
        if (relevantChunks.length > 0) {
          relevantContext = relevantChunks
            .map((chunk) => chunk.text)
            .join("\n\n");
        }
      }
    } catch (error) {
      console.error("Error extracting relevant context with tsvector:", error);
      // Fallback to full document text
      relevantContext = fullDocumentText;
    }
  }

  // Compose payload for documents-api
  const payload = {
    document_id: document.id,
    query: message,
    document_text: relevantContext, // Use relevant context instead of full text
    metadata: {
      title: document.title || "Untitled Document",
      documentUrl: document.documentUrl || null,
      type: document.type || "Unknown",
      documentValue: document.documentValue || 0,
      duration: document.duration || 0,
      promisor: document.promisor || "",
      promisee: document.promisee || "",
      country: document.country || "India",
      state: document.state || "N/A",
      city: document.city || "N/A",
      location: document.location || "",
      documentNumber: document.documentNumber || "",
      documentNumberLabel: document.documentNumberLabel || "",
    },
    mentioned_documents: mentionedDocuments,
  };

  const controller = new AbortController();
  const upstream = await fetch(`${env.DOCUMENT_API_URL}/chat-with-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Upstream chat error" }, { status: 502 });
  }

  // Use TransformStream for proper streaming without buffering
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);

      // Extract token usage for DB persistence (but keep markers for client to filter)
      const tokenMatch = text.match(/__TOKEN_USAGE__:({[^}]+})/);
      if (tokenMatch) {
        try {
          const tokenData = JSON.parse(tokenMatch[1]);
          inputTokens = tokenData.input_tokens || 0;
          outputTokens = tokenData.output_tokens || 0;
        } catch (e) {
          console.error("Error parsing token usage:", e);
        }
      }

      // Accumulate text without markers for DB persistence
      let cleanedText = text
        .replace(/__TOKEN_USAGE__:[^\n]*\n?/g, "")
        .replace(/__STATUS__:[^\n]*\n?/g, "");
      fullText += cleanedText;

      // Pass the original chunk through to client (including __STATUS__ markers)
      controller.enqueue(chunk);
    },
    async flush(controller) {
      // Persist agent message and track token usage after stream finishes
      try {
        const cleaned = fullText.trim();
        if (cleaned) {
          await prisma.aiChat.create({
            data: {
              userId: user.id,
              documentId,
              sender: "AGENT",
              message: cleaned,
            },
          });
        }

        // Track token usage for document-chat if we have token data
        if (inputTokens > 0 || outputTokens > 0) {
          await prisma.tokenUsage.create({
            data: {
              userId: user.id,
              inputTokens,
              outputTokens,
              endpointType: "document-chat",
            },
          });
        }
      } catch (error) {
        console.error("Error persisting chat or token usage:", error);
      }
    },
  });

  // Pipe upstream body through our transform stream
  const responseStream = upstream.body.pipeThrough(transformStream);

  return new NextResponse(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
