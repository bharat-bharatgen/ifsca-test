import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/env.mjs";
import { validateSearchQuery } from "@/lib/search-utils";

// Conversation constraints (align with app-root behavior)
const MAX_CONVERSATION_TITLE_LENGTH = 120;

export const GET = async (req) => {
  const session = await getServerSession({ req });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, title: true, lastMessageAt: true, createdAt: true },
  });
  return NextResponse.json({ conversations });
};

export const POST = async (req) => {
  const session = await getServerSession({ req });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const { message, conversationId, target, offset = 0, limit = 10 } = await req.json();
  if (!message || message.trim() === "") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  // Ensure conversation
  let convId = conversationId;
  if (!convId) {
    const conv = await prisma.conversation.create({ data: { userId: user.id, title: null } });
    convId = conv.id;
  }

  // Persist user message
  const userMsg = await prisma.aiChat.create({
    data: { userId: user.id, conversationId: convId, sender: "USER", message },
  });
  await prisma.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });

  // Auto-title conversation on first message
  try {
    const convo = await prisma.conversation.findUnique({ where: { id: convId }, select: { id: true, title: true } });
    if (!convo?.title || convo.title.toLowerCase().includes("untitled")) {
      const title = message.trim().slice(0, MAX_CONVERSATION_TITLE_LENGTH);
      if (title) {
        await prisma.conversation.update({ where: { id: convId }, data: { title } });
      }
    }
  } catch (e) {
    // non-fatal
  }

  // Build previous chats summary (lightweight)
  const recent = await prisma.aiChat.findMany({
    where: { conversationId: convId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { sender: true, message: true },
  });
  const previous_chats = recent
    .reverse()
    .map((m) => `${m.sender === "USER" ? "User" : "Assistant"}: ${m.message}`)
    .join("\n");

  let agentText = "";

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

  // Determine which document to use: target (from UI selection) or first @ mention
  // Filter by organization for document isolation
  const orgFilter = user.organizationId
    ? { organizationId: user.organizationId }
    : { userId: user.id };

  let targetDocument = null;
  if (target && target.id) {
    // Use the selected document from UI (only from user's organization)
    targetDocument = await prisma.document.findFirst({
      where: { id: target.id, ...orgFilter },
      include: { documentInfo: true },
    });
  } else if (mentions.length > 0) {
    // Try to find document by title from @ mention (only from user's organization)
    const mentionedTitle = mentions[0]; // Use first mention
    const foundDocs = await prisma.document.findMany({
      where: {
        title: {
          contains: mentionedTitle,
          mode: 'insensitive',
        },
        ...orgFilter,
      },
      include: { documentInfo: true },
      take: 1,
    });
    if (foundDocs.length > 0) {
      targetDocument = foundDocs[0];
    }
  }

  // If a target document is found, use document-specific chat instead of semantic search
  if (targetDocument) {
    // Extract the actual question by removing the @ mention part
    const cleanedMessage = message.replace(/@([^\s@]+(?:\s+[^\s@]+)*)/g, "").trim();

    // Use document-specific chat endpoint
    const payload = {
      document_id: targetDocument.id,
      query: cleanedMessage || message, // Use cleaned message or fallback to original
      document_text: targetDocument.documentInfo?.document || targetDocument.documentText || "",
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
      mentioned_documents: [], // No nested mentions for now
    };

    const upstream = await fetch(`${env.DOCUMENT_API_URL}/chat-with-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (upstream.ok && upstream.body) {
      // Stream the response
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // Check for token usage metadata
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("__TOKEN_USAGE__:")) {
            try {
              const tokenData = JSON.parse(line.replace("__TOKEN_USAGE__:", ""));
              inputTokens = tokenData.input_tokens || 0;
              outputTokens = tokenData.output_tokens || 0;
            } catch (e) {
              console.error("Error parsing token usage:", e);
            }
          } else if (line.trim() && !line.startsWith("__TOKEN_USAGE__:")) {
            fullText += line + "\n";
          }
        }
      }

      agentText = fullText.trim();

      // Track token usage for document-chat if we have token data
      if (inputTokens > 0 || outputTokens > 0) {
        try {
          await prisma.tokenUsage.create({
            data: {
              userId: user.id,
              inputTokens,
              outputTokens,
              endpointType: "document-chat",
            },
          });
        } catch (error) {
          console.error("Error tracking token usage for document-chat:", error);
        }
      }
    } else {
      agentText = "I apologize, but I encountered an error processing your request about this document.";
    }

    // Persist assistant message for document-specific chat
    await prisma.aiChat.create({
      data: {
        userId: user.id,
        conversationId: convId,
        sender: "AGENT",
        message: agentText || "[No response generated]"
      },
    });
    await prisma.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });

    // Return response for document-specific chat
    return NextResponse.json({
      response: agentText,
      conversationId: convId,
    });
  }

  // NEW: Semantic document matching when no @ mention
  // Try to find the most relevant documents using embedding similarity
  if (!targetDocument) {
    try {
      console.log(`[Global Chat] No @ mention found, attempting semantic matching for: "${message.substring(0, 100)}..."`);

      const semanticMatch = await fetch(`${env.DOCUMENT_API_URL}/find-similar-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: message,
          user_id: user.id,
          organization_id: user.organizationId,
          threshold: 0.6,
        }),
      });

      if (semanticMatch.ok) {
        const matchData = await semanticMatch.json();
        console.log(`[Global Chat] Semantic match result:`, matchData);

        // Check if we have matching documents (new format with documents array)
        if (matchData.documents && matchData.count > 0) {

          // === SINGLE DOCUMENT: Use chat-with-document endpoint ===
          if (matchData.count === 1) {
            const matchedDoc = matchData.documents[0];
            targetDocument = await prisma.document.findFirst({
              where: { id: matchedDoc.document_id, ...orgFilter },
              include: { documentInfo: true },
            });

            if (targetDocument) {
              console.log(`[Global Chat] Single document match: ${targetDocument.title || targetDocument.documentName} (similarity: ${matchedDoc.similarity.toFixed(3)})`);

              // Use document-specific chat endpoint
              const payload = {
                document_id: targetDocument.id,
                query: message,
                document_text: targetDocument.documentInfo?.document || targetDocument.documentText || "",
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

              const upstream = await fetch(`${env.DOCUMENT_API_URL}/chat-with-document`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              if (upstream.ok && upstream.body) {
                const reader = upstream.body.getReader();
                const decoder = new TextDecoder();
                let fullText = "";
                let inputTokens = 0;
                let outputTokens = 0;

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const chunk = decoder.decode(value, { stream: true });

                  const lines = chunk.split("\n");
                  for (const line of lines) {
                    if (line.startsWith("__TOKEN_USAGE__:")) {
                      try {
                        const tokenData = JSON.parse(line.replace("__TOKEN_USAGE__:", ""));
                        inputTokens = tokenData.input_tokens || 0;
                        outputTokens = tokenData.output_tokens || 0;
                      } catch (e) {
                        console.error("Error parsing token usage:", e);
                      }
                    } else if (line.trim() && !line.startsWith("__TOKEN_USAGE__:")) {
                      fullText += line + "\n";
                    }
                  }
                }

                agentText = fullText.trim();

                if (inputTokens > 0 || outputTokens > 0) {
                  try {
                    await prisma.tokenUsage.create({
                      data: {
                        userId: user.id,
                        inputTokens,
                        outputTokens,
                        endpointType: "document-chat",
                      },
                    });
                  } catch (error) {
                    console.error("Error tracking token usage for semantic match:", error);
                  }
                }
              } else {
                agentText = "I apologize, but I encountered an error processing your request about this document.";
              }

              await prisma.aiChat.create({
                data: {
                  userId: user.id,
                  conversationId: convId,
                  sender: "AGENT",
                  message: agentText || "[No response generated]"
                },
              });
              await prisma.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });

              return NextResponse.json({
                response: agentText,
                conversationId: convId,
                autoSelectedDocument: {
                  id: targetDocument.id,
                  title: targetDocument.title || targetDocument.documentName,
                  similarity: matchedDoc.similarity,
                },
              });
            }
          }

          // === MULTIPLE DOCUMENTS: Use chat-with-multi-docs endpoint ===
          else if (matchData.count > 1) {
            console.log(`[Global Chat] Multiple documents match (${matchData.count}), using multi-doc chat`);

            // Fetch full document data for all matched documents
            const matchedDocuments = [];
            for (const matchedDoc of matchData.documents) {
              const doc = await prisma.document.findFirst({
                where: { id: matchedDoc.document_id, ...orgFilter },
                include: { documentInfo: true },
              });
              if (doc) {
                matchedDocuments.push({
                  document_id: doc.id,
                  document_text: doc.documentInfo?.document || doc.documentText || "",
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
                });
              }
            }

            if (matchedDocuments.length > 0) {
              console.log(`[Global Chat] Using ${matchedDocuments.length} documents for multi-doc chat: ${matchedDocuments.map(d => d.metadata.title).join(", ")}`);

              const payload = {
                query: message,
                documents: matchedDocuments,
              };

              const upstream = await fetch(`${env.DOCUMENT_API_URL}/chat-with-multi-docs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });

              if (upstream.ok && upstream.body) {
                const reader = upstream.body.getReader();
                const decoder = new TextDecoder();
                let fullText = "";
                let inputTokens = 0;
                let outputTokens = 0;

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  const chunk = decoder.decode(value, { stream: true });

                  const lines = chunk.split("\n");
                  for (const line of lines) {
                    if (line.startsWith("__TOKEN_USAGE__:")) {
                      try {
                        const tokenData = JSON.parse(line.replace("__TOKEN_USAGE__:", ""));
                        inputTokens = tokenData.input_tokens || 0;
                        outputTokens = tokenData.output_tokens || 0;
                      } catch (e) {
                        console.error("Error parsing token usage:", e);
                      }
                    } else if (line.trim() && !line.startsWith("__TOKEN_USAGE__:")) {
                      fullText += line + "\n";
                    }
                  }
                }

                agentText = fullText.trim();

                if (inputTokens > 0 || outputTokens > 0) {
                  try {
                    await prisma.tokenUsage.create({
                      data: {
                        userId: user.id,
                        inputTokens,
                        outputTokens,
                        endpointType: "multi-document-chat",
                      },
                    });
                  } catch (error) {
                    console.error("Error tracking token usage for multi-doc chat:", error);
                  }
                }
              } else {
                agentText = "I apologize, but I encountered an error processing your request about these documents.";
              }

              await prisma.aiChat.create({
                data: {
                  userId: user.id,
                  conversationId: convId,
                  sender: "AGENT",
                  message: agentText || "[No response generated]"
                },
              });
              await prisma.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });

              return NextResponse.json({
                response: agentText,
                conversationId: convId,
                autoSelectedDocuments: matchedDocuments.map(d => ({
                  id: d.document_id,
                  title: d.metadata.title,
                  similarity: d.similarity,
                })),
              });
            }
          }
        }
      }
    } catch (semanticError) {
      console.error("[Global Chat] Semantic matching failed, falling back to multi-document search:", semanticError);
      // Fall through to multi-document search
    }
  }

  // If no semantic match or semantic matching failed, use full-text search to find relevant documents
  if (!targetDocument) {
    // Then pass them to the AI for context-aware responses

    let relevantDocuments = [];
    try {
      // Validate message query before searching
      const validation = validateSearchQuery(message);
      if (!validation.isValid) {
        console.warn("Invalid search query in global chat:", validation.error);
        // Continue without documents if query is invalid
      } else {
        // Perform full-text search to find relevant documents (filtered by organization)
        let searchResults;

        if (user.organizationId) {
          // Filter by organization
          searchResults = await prisma.$queryRaw`
            SELECT 
              d.id,
              d.title,
              d.description,
              d."documentText",
              d.promisor,
              d.promisee,
              d."documentValue",
              d.duration,
              d.type,
              d.date,
              d."uploadedAt",
              d."userId",
              d."documentUrl",
              d."documentName",
              d.city,
              d.country,
              d.state,
              d.location,
              d."documentNumber",
              d."documentNumberLabel",
              d."documentType",
              d.category,
              d."subCategory",
              d."categoryConfidence",
              d."migrationTestField",
              -- LAND document type fields
              d."registrationNo",
              d."registrationDate",
              d."landDocumentType",
              d."landDocumentDate",
              d.seller,
              d.purchaser,
              d."surveyNo",
              d."ctsNo",
              d."gutNo",
              d."plotNo",
              d."noOfPages",
              d.village,
              d.taluka,
              d.pincode,
              -- LIAISON document type fields
              d."applicationNo",
              d."applicationDate",
              d."companyName",
              d."authorityName",
              d."approvalNo",
              d."orderNo",
              d."approvalDate",
              d."buildingName",
              d."projectName",
              d."expiryDate",
              d.sector,
              d.subject,
              d."drawingNo",
              d."drawingDate",
              d."buildingType",
              d."commenceCertificate",
              d."intimationOfDisapproval",
              d."intimationOfApproval",
              d.rera,
              -- LEGAL document type fields
              d."caseType",
              d."caseNo",
              d."caseDate",
              d.court,
              d.applicant,
              d.petitioner,
              d.respondent,
              d.plaintiff,
              d.defendant,
              d."advocateName",
              d.judicature,
              d.coram,
              -- Aggregated explicit metadata (public API documentMetadata)
              m.metadata_text as "metadataText",
              m.explicit_metadata as "explicitMetadata",
              ts_rank(
                d.search_vector ||
                coalesce(to_tsvector('english', m.metadata_text), to_tsvector('english', '')),
                plainto_tsquery('english', ${validation.sanitizedQuery})
              ) as rank,
              (
                SELECT di.document
                FROM "document_info" di
                WHERE di."documentId" = d.id
                LIMIT 1
              ) as "documentInfoText"
            FROM "documents" d
            LEFT JOIN LATERAL (
              SELECT 
                string_agg(dm.value, ' ') AS metadata_text,
                jsonb_object_agg(dm.key, dm.value) AS explicit_metadata
              FROM "document_metadata" dm
              WHERE dm."documentId" = d.id
            ) m ON TRUE
            WHERE 
              d."organizationId" = ${user.organizationId}
              AND (
                d.search_vector @@ plainto_tsquery('english', ${validation.sanitizedQuery})
                OR (
                  m.metadata_text IS NOT NULL
                  AND to_tsvector('english', m.metadata_text) @@ plainto_tsquery('english', ${validation.sanitizedQuery})
                )
              )
            ORDER BY rank DESC, d."uploadedAt" DESC
            LIMIT 50
          `;
        } else {
          // Filter by user (no organization)
          searchResults = await prisma.$queryRaw`
            SELECT 
              d.id,
              d.title,
              d.description,
              d."documentText",
              d.promisor,
              d.promisee,
              d."documentValue",
              d.duration,
              d.type,
              d.date,
              d."uploadedAt",
              d."userId",
              d."documentUrl",
              d."documentName",
              d.city,
              d.country,
              d.state,
              d.location,
              d."documentNumber",
              d."documentNumberLabel",
              d."documentType",
              d.category,
              d."subCategory",
              d."categoryConfidence",
              d."migrationTestField",
              -- LAND document type fields
              d."registrationNo",
              d."registrationDate",
              d."landDocumentType",
              d."landDocumentDate",
              d.seller,
              d.purchaser,
              d."surveyNo",
              d."ctsNo",
              d."gutNo",
              d."plotNo",
              d."noOfPages",
              d.village,
              d.taluka,
              d.pincode,
              -- LIAISON document type fields
              d."applicationNo",
              d."applicationDate",
              d."companyName",
              d."authorityName",
              d."approvalNo",
              d."orderNo",
              d."approvalDate",
              d."buildingName",
              d."projectName",
              d."expiryDate",
              d.sector,
              d.subject,
              d."drawingNo",
              d."drawingDate",
              d."buildingType",
              d."commenceCertificate",
              d."intimationOfDisapproval",
              d."intimationOfApproval",
              d.rera,
              -- LEGAL document type fields
              d."caseType",
              d."caseNo",
              d."caseDate",
              d.court,
              d.applicant,
              d.petitioner,
              d.respondent,
              d.plaintiff,
              d.defendant,
              d."advocateName",
              d.judicature,
              d.coram,
              -- Aggregated explicit metadata (public API documentMetadata)
              m.metadata_text as "metadataText",
              m.explicit_metadata as "explicitMetadata",
              ts_rank(
                d.search_vector ||
                coalesce(to_tsvector('english', m.metadata_text), to_tsvector('english', '')),
                plainto_tsquery('english', ${validation.sanitizedQuery})
              ) as rank,
              (
                SELECT di.document
                FROM "document_info" di
                WHERE di."documentId" = d.id
                LIMIT 1
              ) as "documentInfoText"
            FROM "documents" d
            LEFT JOIN LATERAL (
              SELECT 
                string_agg(dm.value, ' ') AS metadata_text,
                jsonb_object_agg(dm.key, dm.value) AS explicit_metadata
              FROM "document_metadata" dm
              WHERE dm."documentId" = d.id
            ) m ON TRUE
            WHERE 
              d."userId" = ${user.id}
              AND (
                d.search_vector @@ plainto_tsquery('english', ${validation.sanitizedQuery})
                OR (
                  m.metadata_text IS NOT NULL
                  AND to_tsvector('english', m.metadata_text) @@ plainto_tsquery('english', ${validation.sanitizedQuery})
                )
              )
            ORDER BY rank DESC, d."uploadedAt" DESC
            LIMIT 50
          `;
        }

        // Format documents for the AI
        relevantDocuments = searchResults.map((doc) => {
          const baseText = doc.documentInfoText || doc.documentText || doc.description || "";
          const metadataText = doc.metadataText || "";
          const docText = (baseText + "\n\n" + metadataText).trim();
          // Log document info for debugging
          console.log(`[Global Chat] Document found: ${doc.title || "Untitled"} (ID: ${doc.id})`);
          console.log(`[Global Chat] Text length: ${docText.length}, documentInfoText: ${doc.documentInfoText ? doc.documentInfoText.length : 0}, documentText: ${doc.documentText ? doc.documentText.length : 0}`);

          return {
            id: doc.id,
            title: doc.title || "Untitled Document",
            text: docText,
            metadata: {
              // Basic fields
              type: doc.type,
              category: doc.category,
              subCategory: doc.subCategory,
              documentType: doc.documentType,
              categoryConfidence: doc.categoryConfidence,
              description: doc.description,
              documentValue: doc.documentValue,
              duration: doc.duration,
              date: doc.date,
              uploadedAt: doc.uploadedAt,
              documentUrl: doc.documentUrl,
              documentName: doc.documentName,
              documentNumber: doc.documentNumber,
              documentNumberLabel: doc.documentNumberLabel,
              // Parties
              promisor: doc.promisor,
              promisee: doc.promisee,
              // Location
              location: doc.location || `${doc.city || ""}, ${doc.state || ""}, ${doc.country || ""}`.trim(),
              city: doc.city,
              state: doc.state,
              country: doc.country,
              // LAND document type fields
              registrationNo: doc.registrationNo,
              registrationDate: doc.registrationDate,
              landDocumentType: doc.landDocumentType,
              landDocumentDate: doc.landDocumentDate,
              seller: doc.seller,
              purchaser: doc.purchaser,
              surveyNo: doc.surveyNo,
              ctsNo: doc.ctsNo,
              gutNo: doc.gutNo,
              plotNo: doc.plotNo,
              noOfPages: doc.noOfPages,
              village: doc.village,
              taluka: doc.taluka,
              pincode: doc.pincode,
              // LIAISON document type fields
              applicationNo: doc.applicationNo,
              applicationDate: doc.applicationDate,
              companyName: doc.companyName,
              authorityName: doc.authorityName,
              approvalNo: doc.approvalNo,
              orderNo: doc.orderNo,
              approvalDate: doc.approvalDate,
              buildingName: doc.buildingName,
              projectName: doc.projectName,
              expiryDate: doc.expiryDate,
              sector: doc.sector,
              subject: doc.subject,
              drawingNo: doc.drawingNo,
              drawingDate: doc.drawingDate,
              buildingType: doc.buildingType,
              commenceCertificate: doc.commenceCertificate,
              intimationOfDisapproval: doc.intimationOfDisapproval,
              intimationOfApproval: doc.intimationOfApproval,
              rera: doc.rera,
              // LEGAL document type fields
              caseType: doc.caseType,
              caseNo: doc.caseNo,
              caseDate: doc.caseDate,
              court: doc.court,
              applicant: doc.applicant,
              petitioner: doc.petitioner,
              respondent: doc.respondent,
              plaintiff: doc.plaintiff,
              defendant: doc.defendant,
              advocateName: doc.advocateName,
              judicature: doc.judicature,
              coram: doc.coram,
              // Explicit metadata from public API / documentMetadata table
              explicitMetadata: doc.explicitMetadata || {},
            },
            rank: parseFloat(doc.rank) || 0,
          };
        });
      }
    } catch (searchError) {
      console.error("Error performing full-text search:", searchError);
      // Continue without documents if search fails
    }

    // Call the Python API with streaming (with pagination support)
    const upstream = await fetch(`${env.DOCUMENT_API_URL}/global-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        previous_chats,
        relevant_documents: relevantDocuments,
        offset,
        limit,
      }),
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "Upstream error" }, { status: upstream.status });
    }

    // Create a TransformStream to process the upstream response
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let fullText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let paginationData = null;

    // Helper function to extract JSON marker data from chunk
    const extractMarkerData = (chunk, marker) => {
      const markerIdx = chunk.indexOf(marker);
      if (markerIdx === -1) return { data: null, remaining: chunk };

      const startIdx = markerIdx + marker.length;
      const braceIdx = chunk.indexOf("{", startIdx);
      if (braceIdx === -1) return { data: null, remaining: chunk };

      // Start with braceCount=1 since we're at the opening brace, loop from next char
      let endIdx = -1;
      let braceCount = 1;
      for (let i = braceIdx + 1; i < chunk.length; i++) {
        if (chunk[i] === "{") braceCount++;
        else if (chunk[i] === "}") braceCount--;
        if (braceCount === 0) {
          endIdx = i;
          break;
        }
      }

      if (endIdx === -1) return { data: null, remaining: chunk };

      const jsonStr = chunk.slice(braceIdx, endIdx + 1);
      try {
        const data = JSON.parse(jsonStr);
        const remaining = chunk.slice(0, markerIdx) + chunk.slice(endIdx + 1);
        return { data, remaining };
      } catch (e) {
        console.error(`Error parsing ${marker}:`, e);
        return { data: null, remaining: chunk };
      }
    };

    const stream = new ReadableStream({
      async start(controller) {
        const reader = upstream.body.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Process the chunk, extracting metadata while preserving formatting
            let processedChunk = chunk;

            // Extract pagination data if present
            const paginationResult = extractMarkerData(processedChunk, "__PAGINATION__:");
            if (paginationResult.data) {
              paginationData = paginationResult.data;
              processedChunk = paginationResult.remaining;
            }

            // Extract token usage if present
            const tokenResult = extractMarkerData(processedChunk, "__TOKEN_USAGE__:");
            if (tokenResult.data) {
              inputTokens = tokenResult.data.input_tokens || 0;
              outputTokens = tokenResult.data.output_tokens || 0;
              processedChunk = tokenResult.remaining;
            }

            // Send the processed chunk to client (preserving all formatting)
            if (processedChunk) {
              fullText += processedChunk;
              controller.enqueue(encoder.encode(processedChunk));
            }
          }

          // After streaming is complete, persist to database
          agentText = fullText.trim();

          // Track token usage
          if (inputTokens > 0 || outputTokens > 0) {
            try {
              await prisma.tokenUsage.create({
                data: {
                  userId: user.id,
                  inputTokens,
                  outputTokens,
                  endpointType: "global-chat",
                },
              });
            } catch (error) {
              console.error("Error tracking token usage for global-chat:", error);
            }
          }

          // Persist assistant message (always persist to maintain conversation history integrity)
          await prisma.aiChat.create({
            data: {
              userId: user.id,
              conversationId: convId,
              sender: "AGENT",
              message: agentText || "[No response generated]"
            },
          });
          await prisma.conversation.update({ where: { id: convId }, data: { lastMessageAt: new Date() } });

          // Send conversation ID and pagination data at the end as special markers
          controller.enqueue(encoder.encode(`\n__CONV_ID__:${convId}\n`));
          if (paginationData) {
            controller.enqueue(encoder.encode(`__PAGINATION__:${JSON.stringify(paginationData)}\n`));
          }
          controller.close();
        } catch (error) {
          console.error("Error processing stream:", error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }
};

export const PATCH = async (req) => {
  const session = await getServerSession({ req });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const { conversationId, title } = await req.json();
  if (!conversationId || !title) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await prisma.conversation.update({ where: { id: conversationId, userId: user.id }, data: { title } });
  return NextResponse.json({ ok: true });
};

export const DELETE = async (req) => {
  const session = await getServerSession({ req });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ error: "conversationId is required" }, { status: 400 });

  // Ensure ownership and delete messages + conversation
  await prisma.aiChat.deleteMany({ where: { conversationId, userId: user.id } });
  await prisma.conversation.delete({ where: { id: conversationId, userId: user.id } });
  return NextResponse.json({ ok: true });
};


