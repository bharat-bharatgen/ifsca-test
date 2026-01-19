import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/env.mjs";
import { extractRelevantContext, findRelevantDocumentChunks } from "@/lib/document-search-utils";

export const POST = async (req) => {
  const session = await getServerSession({ req });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const { message, documentId } = await req.json();
  if (!message || !documentId) {
    return NextResponse.json({ error: "message and documentId are required" }, { status: 400 });
  }

  // Organization-based access filter
  const orgFilter = user.organizationId 
    ? { organizationId: user.organizationId }
    : { userId: user.id };

  // Load document and info (only from user's organization)
  const document = await prisma.document.findFirst({
    where: { id: documentId, ...orgFilter },
    include: { documentInfo: true },
  });
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

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

  // Fetch mentioned documents
  const mentionedDocuments = [];
  if (mentions.length > 0) {
    // Find documents by title (case-insensitive, partial match) - filtered by organization
    for (const mentionedTitle of mentions) {
      // Try to find documents matching the title (only from user's organization)
      const mentionedDocs = await prisma.document.findMany({
        where: {
          title: {
            contains: mentionedTitle,
            mode: 'insensitive',
          },
          id: {
            not: documentId, // Exclude the current document
          },
          ...orgFilter, // Filter by organization
        },
        include: { documentInfo: true },
        take: 1, // Take the first match
      });

      if (mentionedDocs.length > 0) {
        const mentionedDoc = mentionedDocs[0];
        mentionedDocuments.push({
          document_id: mentionedDoc.id,
          document_text: mentionedDoc.documentInfo?.document || mentionedDoc.documentText || "",
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
    }
  }

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
  const fullDocumentText = document.documentInfo?.document || document.documentText || "";
  let relevantContext = fullDocumentText;
  
  // Only use tsvector search if document is large enough (> 3000 chars)
  // For smaller documents, send the full text
  if (fullDocumentText.length > 3000) {
    try {
      // Use extractRelevantContext for efficiency (uses ts_headline)
      relevantContext = await extractRelevantContext(fullDocumentText, message, 5000);
      
      // If extracted context is too short, try chunk-based approach
      if (relevantContext.length < 1000) {
        const relevantChunks = await findRelevantDocumentChunks(fullDocumentText, message, 5);
        if (relevantChunks.length > 0) {
          relevantContext = relevantChunks.map(chunk => chunk.text).join("\n\n");
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

  const reader = upstream.body.getReader();
  const encoder = new TextEncoder();
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = new TextDecoder().decode(value);
          
          // Process the chunk, extracting token usage while preserving formatting
          let processedChunk = chunk;
          
          // Extract token usage if present (but don't send to client)
          const tokenMatch = processedChunk.match(/__TOKEN_USAGE__:({[^}]+})/);
          if (tokenMatch) {
            try {
              const tokenData = JSON.parse(tokenMatch[1]);
              inputTokens = tokenData.input_tokens || 0;
              outputTokens = tokenData.output_tokens || 0;
            } catch (e) {
              console.error("Error parsing token usage:", e);
            }
            // Remove token usage markers from the chunk
            processedChunk = processedChunk.replace(/__TOKEN_USAGE__:[^\n]*\n?/g, "");
          }
          
          // Send the processed chunk to client (preserving all formatting)
          if (processedChunk) {
            fullText += processedChunk;
            controller.enqueue(encoder.encode(processedChunk));
          }
        }
      } catch (e) {
        // swallow streaming errors to avoid crashing the stream
      } finally {
        controller.close();
        // Persist agent message and track token usage (best-effort, after stream finishes)
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
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};


