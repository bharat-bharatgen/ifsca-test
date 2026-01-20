import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/env.mjs";
import { validateSearchQuery } from "@/lib/search-utils";

// Conversation constraints (align with app-root behavior)
const MAX_CONVERSATION_TITLE_LENGTH = 120;

export const GET = async (req) => {
  const session = await getServerSession({ req });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 401 });

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, title: true, lastMessageAt: true, createdAt: true },
  });
  return NextResponse.json({ conversations });
};

export const POST = async (req) => {
  const session = await getServerSession({ req });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 401 });

  const {
    message,
    conversationId,
    target,
    offset = 0,
    limit = 10,
  } = await req.json();
  if (!message || message.trim() === "") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Ensure conversation (quick operation)
  let convId = conversationId;
  if (!convId) {
    const conv = await prisma.conversation.create({
      data: { userId: user.id, title: null },
    });
    convId = conv.id;
  }

  // Return streaming response IMMEDIATELY - do processing inside the stream
  // This reduces TTFB to near-zero
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial status immediately (this is what fixes TTFB)
        controller.enqueue(
          encoder.encode("__STATUS__:Processing your request...\n"),
        );

        // Now do the heavier operations while user sees "Processing..."
        // Persist user message
        await prisma.aiChat.create({
          data: {
            userId: user.id,
            conversationId: convId,
            sender: "USER",
            message,
          },
        });
        await prisma.conversation.update({
          where: { id: convId },
          data: { lastMessageAt: new Date() },
        });

        // Auto-title conversation on first message (non-blocking)
        prisma.conversation
          .findUnique({
            where: { id: convId },
            select: { id: true, title: true },
          })
          .then((convo) => {
            if (
              !convo?.title ||
              convo.title.toLowerCase().includes("untitled")
            ) {
              const title = message
                .trim()
                .slice(0, MAX_CONVERSATION_TITLE_LENGTH);
              if (title) {
                prisma.conversation
                  .update({ where: { id: convId }, data: { title } })
                  .catch(() => {});
              }
            }
          })
          .catch(() => {});

        controller.enqueue(
          encoder.encode("__STATUS__:Searching documents...\n"),
        );

        // Build previous chats summary
        const recent = await prisma.aiChat.findMany({
          where: { conversationId: convId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { sender: true, message: true },
        });
        const previous_chats = recent
          .reverse()
          .map(
            (m) =>
              `${m.sender === "USER" ? "User" : "Assistant"}: ${m.message}`,
          )
          .join("\n");

        // Parse @ mentions from the message
        const mentionPattern = /@([^\s@]+(?:\s+[^\s@]+)*)/g;
        const mentions = [];
        let match;
        while ((match = mentionPattern.exec(message)) !== null) {
          const mentionedTitle = match[1].trim();
          if (mentionedTitle) {
            mentions.push(mentionedTitle);
          }
        }

        // Filter by organization for document isolation
        const orgFilter = user.organizationId
          ? { organizationId: user.organizationId }
          : { userId: user.id };

        let targetDocument = null;
        let upstreamResponse = null;
        let endpointType = "global-chat";

        // Check for target document from UI or @ mention
        if (target && target.id) {
          targetDocument = await prisma.document.findFirst({
            where: { id: target.id, ...orgFilter },
            include: { documentInfo: true },
          });
        } else if (mentions.length > 0) {
          const mentionedTitle = mentions[0];
          const foundDocs = await prisma.document.findMany({
            where: {
              title: { contains: mentionedTitle, mode: "insensitive" },
              ...orgFilter,
            },
            include: { documentInfo: true },
            take: 1,
          });
          if (foundDocs.length > 0) {
            targetDocument = foundDocs[0];
          }
        }

        // If target document found, use document-specific chat
        if (targetDocument) {
          controller.enqueue(
            encoder.encode("__STATUS__:Analyzing document...\n"),
          );

          const cleanedMessage = message
            .replace(/@([^\s@]+(?:\s+[^\s@]+)*)/g, "")
            .trim();
          const payload = {
            document_id: targetDocument.id,
            query: cleanedMessage || message,
            document_text:
              targetDocument.documentInfo?.document ||
              targetDocument.documentText ||
              "",
            metadata: {
              title: targetDocument.title || "Untitled Document",
              documentUrl: targetDocument.documentUrl || null,
              type: targetDocument.type || "Unknown",
              documentValue: targetDocument.documentValue || 0,
              duration: targetDocument.duration || 0,
              promisor: targetDocument.promisor || "",
              promisee: targetDocument.promisee || "",
              country: targetDocument.country || "India",
              state: targetDocument.state || "N/A",
              city: targetDocument.city || "N/A",
              location: targetDocument.location || "",
              documentNumber: targetDocument.documentNumber || "",
              documentNumberLabel: targetDocument.documentNumberLabel || "",
            },
            mentioned_documents: [],
          };

          upstreamResponse = await fetch(
            `${env.DOCUMENT_API_URL}/chat-with-document`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            },
          );
          endpointType = "document-chat";
        }

        // If no target, try semantic matching
        if (!targetDocument && !upstreamResponse) {
          controller.enqueue(
            encoder.encode("__STATUS__:Finding relevant documents...\n"),
          );

          try {
            const semanticMatch = await fetch(
              `${env.DOCUMENT_API_URL}/find-similar-document`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  query: message,
                  user_id: user.id,
                  organization_id: user.organizationId,
                  threshold: 0.6,
                }),
              },
            );

            if (semanticMatch.ok) {
              const matchData = await semanticMatch.json();

              if (matchData.documents && matchData.count > 0) {
                if (matchData.count === 1) {
                  const matchedDoc = matchData.documents[0];
                  targetDocument = await prisma.document.findFirst({
                    where: { id: matchedDoc.document_id, ...orgFilter },
                    include: { documentInfo: true },
                  });

                  if (targetDocument) {
                    controller.enqueue(
                      encoder.encode(
                        "__STATUS__:Analyzing matched document...\n",
                      ),
                    );

                    const payload = {
                      document_id: targetDocument.id,
                      query: message,
                      document_text:
                        targetDocument.documentInfo?.document ||
                        targetDocument.documentText ||
                        "",
                      metadata: {
                        title: targetDocument.title || "Untitled Document",
                        documentUrl: targetDocument.documentUrl || null,
                        type: targetDocument.type || "Unknown",
                        documentValue: targetDocument.documentValue || 0,
                        duration: targetDocument.duration || 0,
                        promisor: targetDocument.promisor || "",
                        promisee: targetDocument.promisee || "",
                        country: targetDocument.country || "India",
                        state: targetDocument.state || "N/A",
                        city: targetDocument.city || "N/A",
                        location: targetDocument.location || "",
                        documentNumber: targetDocument.documentNumber || "",
                        documentNumberLabel:
                          targetDocument.documentNumberLabel || "",
                      },
                      mentioned_documents: [],
                    };

                    upstreamResponse = await fetch(
                      `${env.DOCUMENT_API_URL}/chat-with-document`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      },
                    );
                    endpointType = "document-chat";
                  }
                } else if (matchData.count > 1) {
                  controller.enqueue(
                    encoder.encode(
                      "__STATUS__:Analyzing multiple documents...\n",
                    ),
                  );

                  // Fetch all documents in PARALLEL for reduced latency
                  const docPromises = matchData.documents.map(
                    async (matchedDoc) => {
                      const doc = await prisma.document.findFirst({
                        where: { id: matchedDoc.document_id, ...orgFilter },
                        include: { documentInfo: true },
                      });
                      if (doc) {
                        return {
                          document_id: doc.id,
                          document_text:
                            doc.documentInfo?.document ||
                            doc.documentText ||
                            "",
                          metadata: {
                            title: doc.title || "Untitled Document",
                            documentUrl: doc.documentUrl || null,
                            type: doc.type || "Unknown",
                            documentValue: doc.documentValue || 0,
                            promisor: doc.promisor || "",
                            promisee: doc.promisee || "",
                            country: doc.country || "India",
                            state: doc.state || "N/A",
                            city: doc.city || "N/A",
                            documentNumber: doc.documentNumber || "",
                          },
                          document_url: doc.documentUrl || null,
                          similarity: matchedDoc.similarity,
                        };
                      }
                      return null;
                    },
                  );

                  const results = await Promise.all(docPromises);
                  const matchedDocuments = results.filter(Boolean);

                  if (matchedDocuments.length > 0) {
                    upstreamResponse = await fetch(
                      `${env.DOCUMENT_API_URL}/chat-with-multi-docs`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          query: message,
                          documents: matchedDocuments,
                        }),
                      },
                    );
                    endpointType = "multi-document-chat";
                  }
                }
              }
            }
          } catch (semanticError) {
            console.error("Semantic matching failed:", semanticError);
          }
        }

        // If still no response, use full-text search and global chat
        if (!upstreamResponse) {
          controller.enqueue(
            encoder.encode("__STATUS__:Searching knowledge base...\n"),
          );

          let relevantDocuments = [];
          try {
            const validation = validateSearchQuery(message);
            if (validation.isValid) {
              // Simplified full-text search - call the global-chat endpoint directly
              // which will handle document search internally
            }
          } catch (searchError) {
            console.error("Search error:", searchError);
          }

          upstreamResponse = await fetch(
            `${env.DOCUMENT_API_URL}/global-chat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message,
                previous_chats,
                relevant_documents: relevantDocuments,
                offset,
                limit,
              }),
            },
          );
          endpointType = "global-chat";
        }

        // Stream the upstream response
        if (upstreamResponse && upstreamResponse.ok && upstreamResponse.body) {
          const reader = upstreamResponse.body.getReader();
          let fullText = "";
          let inputTokens = 0;
          let outputTokens = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              // Pass chunk directly to client
              controller.enqueue(value);

              // Extract metadata for persistence
              const text = new TextDecoder().decode(value);

              const tokenMatch = text.match(/__TOKEN_USAGE__:({[^}]+})/);
              if (tokenMatch) {
                try {
                  const tokenData = JSON.parse(tokenMatch[1]);
                  inputTokens = tokenData.input_tokens || 0;
                  outputTokens = tokenData.output_tokens || 0;
                } catch (e) {}
              }

              let cleanText = text
                .replace(/__TOKEN_USAGE__:[^\n]*\n?/g, "")
                .replace(/__STATUS__:[^\n]*\n?/g, "")
                .replace(/__PAGINATION__:[^\n]*\n?/g, "");
              fullText += cleanText;
            }
          } catch (streamError) {
            console.error("Stream error:", streamError);
          }

          // Persist agent message (non-blocking)
          const agentText = fullText.trim();
          if (agentText) {
            prisma.aiChat
              .create({
                data: {
                  userId: user.id,
                  conversationId: convId,
                  sender: "AGENT",
                  message: agentText,
                },
              })
              .catch((e) => console.error("Error persisting chat:", e));

            prisma.conversation
              .update({
                where: { id: convId },
                data: { lastMessageAt: new Date() },
              })
              .catch(() => {});
          }

          if (inputTokens > 0 || outputTokens > 0) {
            prisma.tokenUsage
              .create({
                data: {
                  userId: user.id,
                  inputTokens,
                  outputTokens,
                  endpointType,
                },
              })
              .catch(() => {});
          }

          // Send conversation ID
          controller.enqueue(encoder.encode(`\n__CONV_ID__:${convId}\n`));
        } else {
          controller.enqueue(
            encoder.encode(
              "I apologize, but I encountered an error processing your request.\n",
            ),
          );
          controller.enqueue(encoder.encode(`\n__CONV_ID__:${convId}\n`));
        }
      } catch (error) {
        console.error("Stream processing error:", error);
        controller.enqueue(
          encoder.encode(
            "I apologize, but I encountered an error processing your request.\n",
          ),
        );
        controller.enqueue(encoder.encode(`\n__CONV_ID__:${convId}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};

// Keep old handlers for backward compatibility
export const PATCH = async (req) => {
  const session = await getServerSession({ req });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 401 });

  const { conversationId, title } = await req.json();
  if (!conversationId || !title)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await prisma.conversation.update({
    where: { id: conversationId, userId: user.id },
    data: { title },
  });
  return NextResponse.json({ ok: true });
};

export const DELETE = async (req) => {
  const session = await getServerSession({ req });
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId)
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );

  // Ensure ownership and delete messages + conversation
  await prisma.aiChat.deleteMany({
    where: { conversationId, userId: user.id },
  });
  await prisma.conversation.delete({
    where: { id: conversationId, userId: user.id },
  });
  return NextResponse.json({ ok: true });
};
