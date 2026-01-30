import { prisma } from "@/lib/prisma";
import axios from "axios";
import { axiosWithRetry } from "@/lib/retry-utils";
import { callWebhook } from "@/lib/webhook-utils";
import { DeleteObjectCommand, S3 } from "@aws-sdk/client-s3";
import { env } from "@/env.mjs";

const s3Client = new S3({
  forcePathStyle: false,
  endpoint: env.DO_SPACES_ENDPOINT_URL,
  region: "blr1",
  credentials: {
    accessKeyId: env.DO_SPACES_ACCESS_KEY,
    secretAccessKey: env.DO_SPACES_SECRET_KEY,
  },
});

// Helper function to parse duration string to integer (in months)
const parseDuration = (durationStr) => {
  if (!durationStr || typeof durationStr !== 'string' || durationStr.trim() === '') {
    return null;
  }
  
  const duration = durationStr.toLowerCase().trim();
  const numbers = duration.match(/\d+/g);
  if (!numbers || numbers.length === 0) {
    return null;
  }
  
  const value = parseInt(numbers[0]);
  if (isNaN(value)) {
    return null;
  }
  
  // Convert to months based on unit
  if (duration.includes('year')) {
    return value * 12;
  } else if (duration.includes('month')) {
    return value;
  } else if (duration.includes('week')) {
    return Math.floor(value / 4);
  } else if (duration.includes('day')) {
    return Math.floor(value / 30);
  } else {
    return value;
  }
};

// Helper function to parse date string to Date object
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    return new Date(dateStr);
  } catch (e) {
    return null;
  }
};

// Helper function to parse integer
const parseIntSafe = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
};

/**
 * Process a document asynchronously
 * @param {string} jobId - The processing job ID
 * @param {string} documentId - The document ID
 * @param {string} documentUrl - The document URL
 * @param {string} userId - The user ID
 * @param {string} webhookUrl - Optional webhook URL
 * @param {string} filename - S3 filename for cleanup on failure
 * @param {string[]} metadataFields - Optional array of field names to extract from document
 */
export async function processDocument(jobId, documentId, documentUrl, userId, webhookUrl, filename, metadataFields = null) {
  let document = null;
  
  try {
    console.log("[Processor] Starting document processing", {
      jobId,
      documentId,
      userId,
      documentUrl,
      hasWebhookUrl: !!webhookUrl,
      hasFilename: !!filename,
      metadataFields,
    });

    // Update job status to PROCESSING
    await prisma.documentProcessingJob.update({
      where: { jobId },
      data: { status: "PROCESSING" },
    });

    // Get user for processing
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Call documents-api to extract document info with retry logic
    console.log("[Processor] Calling documents-api /extract-document-info", {
      jobId,
      documentId,
      documentUrl,
      metadataFields,
    });
    const response = await axiosWithRetry(
      () => axios.post(
        env.DOCUMENT_API_URL + "/extract-document-info",
        {
          documentUrl: documentUrl,
          user_name: user.name || "API User",
          metadata_fields: metadataFields, // Pass custom fields to extract
          job_id: jobId, // Correlate logs in documents-api
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      ),
      {
        maxRetries: 3,
        initialDelay: 2000,
        maxDelay: 60000,
      }
    );

    if (response.status !== 200) {
      console.error("[Processor] Non-200 response from documents-api", {
        jobId,
        status: response.status,
        data: response.data,
      });
      throw new Error("Failed to process document");
    }

    const { content, response_from_ai, token_usage: extractTokenUsage } = response.data;
    console.log("[Processor] documents-api extraction completed", {
      jobId,
      hasContent: !!content,
      hasResponseFromAi: !!response_from_ai,
      extractTokenUsage,
    });

    // Track token usage for document extraction
    let totalInputTokens = extractTokenUsage?.input_tokens || 0;
    let totalOutputTokens = extractTokenUsage?.output_tokens || 0;

    // Validate response structure
    if (!response_from_ai || !response_from_ai.contract_details) {
      throw new Error("Invalid response structure from AI service");
    }

    // Classify document
    let documentCategory = "Miscellaneous";
    let documentSubCategory = "General Contract";
    let categoryConfidence = 0.5;
    
    try {
      const classificationResponse = await axiosWithRetry(
        () => axios.post(
          env.DOCUMENT_API_URL + "/api/classify-document",
          {
            title: response_from_ai.contract_details?.title || "Untitled Document",
            contract_type: response_from_ai.contract_details?.type || "CONTRACT",
            promisor: response_from_ai.contract_details?.promisor || "",
            promisee: response_from_ai.contract_details?.promisee || "",
            content: content || "",
            documentValue: response_from_ai.contract_details?.value || 0
          },
          {
            headers: { "Content-Type": "application/json" }
          }
        ),
        {
          maxRetries: 3,
          initialDelay: 2000,
          maxDelay: 60000,
        }
      );

      if (classificationResponse.status === 200 && classificationResponse.data.success) {
        documentCategory = classificationResponse.data.category;
        documentSubCategory = classificationResponse.data.subCategory;
        categoryConfidence = classificationResponse.data.confidence;
        
        // Add classification token usage to totals
        const classifyTokenUsage = classificationResponse.data.token_usage || {};
        totalInputTokens += classifyTokenUsage.input_tokens || 0;
        totalOutputTokens += classifyTokenUsage.output_tokens || 0;
      }
    } catch (classificationError) {
      console.error("Error during document classification:", classificationError.message);
    }

    // Track combined token usage for document upload/processing
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      try {
        await prisma.tokenUsage.create({
          data: {
            userId: user.id,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            endpointType: "document-upload",
          },
        });
      } catch (error) {
        console.error("Error tracking token usage for document upload:", error);
      }
    }

    const contractDetails = response_from_ai.contract_details || {};
    const docType = contractDetails.type || "";

    // Build update data object
    const updateData = {
      documentText: content,
      title: contractDetails.title || "Untitled Document",
      promisor: contractDetails.promisor || "",
      promisee: contractDetails.promisee || "",
      country: contractDetails.country || "",
      state: contractDetails.state || "",
      city: contractDetails.city || "",
      location: contractDetails.location || "",
      documentValue: parseFloat(contractDetails.value || 0),
      duration: parseDuration(contractDetails.duration),
      type: contractDetails.type,
      date: parseDate(contractDetails.date),
      description: contractDetails.description,
      category: documentCategory,
      subCategory: documentSubCategory,
      categoryConfidence: categoryConfidence,
      documentNumber: contractDetails.document_number || null,
      documentNumberLabel: contractDetails.document_number_label || null,
    };

    // Add LAND type fields if document type is LAND
    if (docType && docType.toUpperCase().includes("LAND")) {
      updateData.registrationNo = contractDetails.registration_no || null;
      updateData.registrationDate = parseDate(contractDetails.registration_date);
      updateData.landDocumentType = contractDetails.land_document_type || null;
      updateData.landDocumentDate = parseDate(contractDetails.land_document_date);
      updateData.seller = contractDetails.seller || null;
      updateData.purchaser = contractDetails.purchaser || null;
      updateData.surveyNo = contractDetails.survey_no || null;
      updateData.ctsNo = contractDetails.cts_no || null;
      updateData.gutNo = contractDetails.gut_no || null;
      updateData.plotNo = contractDetails.plot_no || null;
      updateData.noOfPages = parseIntSafe(contractDetails.no_of_pages);
      updateData.village = contractDetails.village || null;
      updateData.taluka = contractDetails.taluka || null;
      updateData.pincode = contractDetails.pincode || null;
      
      if (updateData.landDocumentDate) {
        updateData.date = updateData.landDocumentDate;
      } else if (updateData.date) {
        updateData.landDocumentDate = updateData.date;
      }
    }

    // Add LIAISON type fields
    const docTypeUpper = docType ? docType.toUpperCase() : "";
    if (docType && docTypeUpper.includes("LIAISON")) {
      updateData.applicationNo = contractDetails.application_no || null;
      updateData.applicationDate = parseDate(contractDetails.application_date);
      updateData.companyName = contractDetails.company_name || null;
      updateData.authorityName = contractDetails.authority_name || null;
      updateData.approvalNo = contractDetails.approval_no || null;
      updateData.orderNo = contractDetails.order_no || null;
      updateData.approvalDate = parseDate(contractDetails.approval_date);
      updateData.buildingName = contractDetails.building_name || null;
      updateData.projectName = contractDetails.project_name || null;
      updateData.expiryDate = parseDate(contractDetails.expiry_date);
      updateData.sector = contractDetails.sector || null;
      updateData.subject = contractDetails.subject || null;
      updateData.drawingNo = contractDetails.drawing_no || null;
      updateData.drawingDate = parseDate(contractDetails.drawing_date);
      updateData.buildingType = contractDetails.building_type || null;
      updateData.commenceCertificate = contractDetails.commence_certificate || null;
      updateData.intimationOfDisapproval = contractDetails.intimation_of_disapproval || null;
      updateData.intimationOfApproval = contractDetails.intimation_of_approval || null;
      updateData.rera = contractDetails.rera || null;
      
      if (updateData.applicationDate) {
        updateData.date = updateData.applicationDate;
      } else if (updateData.date) {
        updateData.applicationDate = updateData.date;
      }
    }

    // Add LEGAL type fields if document type is LEGAL
    if (docType && docType.toUpperCase().includes("LEGAL")) {
      updateData.caseType = contractDetails.case_type || null;
      updateData.caseNo = contractDetails.case_no || null;
      updateData.caseDate = parseDate(contractDetails.case_date);
      updateData.court = contractDetails.court || null;
      updateData.applicant = contractDetails.applicant || null;
      updateData.petitioner = contractDetails.petitioner || null;
      updateData.respondent = contractDetails.respondent || null;
      updateData.plaintiff = contractDetails.plaintiff || null;
      updateData.defendant = contractDetails.defendant || null;
      updateData.advocateName = contractDetails.advocate_name || null;
      updateData.judicature = contractDetails.judicature || null;
      updateData.coram = contractDetails.coram || null;
    }

    // Update document with extracted details
    console.log("[Processor] Updating document with extracted details", {
      jobId,
      documentId,
      docType,
      documentCategory,
      documentSubCategory,
    });
    await prisma.document.update({
      where: { id: documentId },
      data: updateData,
    });

    // Store extracted metadata fields if provided
    if (metadataFields && metadataFields.length > 0 && response_from_ai.extracted_metadata) {
      const extractedMetadata = response_from_ai.extracted_metadata;
      console.log("[Processor] Storing extracted metadata", {
        jobId,
        documentId,
        keys: Object.keys(extractedMetadata),
      });
      const metadataEntries = Object.entries(extractedMetadata)
        .filter(([key, value]) => value !== null && value !== undefined)
        .map(([key, value]) => ({
          documentId: documentId,
          key: String(key),
          value: typeof value === "object" ? JSON.stringify(value) : String(value),
        }));

      if (metadataEntries.length > 0) {
        // Delete existing metadata entries for these keys to avoid duplicates
        await prisma.documentMetadata.deleteMany({
          where: {
            documentId: documentId,
            key: { in: metadataEntries.map(e => e.key) },
          },
        });

        // Insert new metadata entries
        await prisma.documentMetadata.createMany({
          data: metadataEntries,
        });
      }
    }

    // Get updated document with metadata
    document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentMetadata: true,
        documentInfo: true,
      },
    });

    // Create document summary if available
    if (response_from_ai.contract_summary) {
      await prisma.documentSummary.create({
        data: {
          summary: response_from_ai.contract_summary,
          documentId: document.id,
          isActive: true,
        },
      });
    }

    // Generate embeddings
    try {
      let documentText = content;
      let embeddingStrategy = "full_content";
      
      if (!content || typeof content !== 'string' || content.trim().length < 200) {
        const updatedDocument = await prisma.document.findUnique({
          where: { id: documentId },
          select: { documentText: true }
        });
        
        if (updatedDocument?.documentText && updatedDocument.documentText.trim().length > 200) {
          documentText = updatedDocument.documentText;
          embeddingStrategy = "document_document_text";
        } else {
          const contractDetails = response_from_ai?.contract_details || {};
          const fallbackContent = [
            contractDetails.title || "Untitled Document",
            contractDetails.description || "",
            `Document Type: ${contractDetails.type || "Unknown"}`,
            `Parties: ${contractDetails.promisor || "Unknown"} and ${contractDetails.promisee || "Unknown"}`,
            `Value: ${contractDetails.value || "0"}`,
            `Duration: ${contractDetails.duration || "Not specified"}`,
            `Date: ${contractDetails.date || "Not specified"}`,
            `Location: ${contractDetails.city || ""}, ${contractDetails.state || ""}, ${contractDetails.country || ""}`,
            response_from_ai?.contract_summary || "",
          ].filter(Boolean).join("\n\n");
          
          if (fallbackContent.trim().length > 100) {
            documentText = fallbackContent;
            embeddingStrategy = "comprehensive_fallback";
          } else {
            console.warn("Skipping embedding generation due to insufficient content");
          }
        }
      }

      if (documentText && documentText.trim().length > 100) {
        console.log("[Processor] Generating embeddings for document", {
          jobId,
          documentId,
          embeddingStrategy,
        });
        const metadataPayload = {
          title: response_from_ai.contract_details?.title || "Untitled Document",
          type: response_from_ai.contract_details?.type || "document",
          user_id: user.id,
          embedding_strategy: embeddingStrategy,
          category: documentCategory,
          subCategory: documentSubCategory,
          category_confidence: categoryConfidence,
        };
        if (Array.isArray(response_from_ai.raw_ocr_pages) && response_from_ai.raw_ocr_pages.length > 0) {
          metadataPayload.pages = response_from_ai.raw_ocr_pages;
        }
        const embeddingResponse = await axiosWithRetry(
          () => axios.post(
            env.DOCUMENT_API_URL + "/api/generate-embedding",
            {
              document_id: documentId,
              document_text: documentText,
              metadata: metadataPayload,
            },
            {
              headers: {
                "Content-Type": "application/json",
              },
            }
          ),
          {
            maxRetries: 3,
            initialDelay: 2000,
            maxDelay: 60000,
          }
        );

        if (embeddingResponse.status === 200) {
          console.log("[Processor] Embeddings generated successfully for document", {
            jobId,
            documentId,
          });
        }
      }
    } catch (embeddingError) {
      console.error("[Processor] Error generating embeddings:", {
        jobId,
        documentId,
        error: embeddingError.message,
      });
      // Don't fail the entire processing if embedding generation fails
    }

    // Update job status to COMPLETED
    await prisma.documentProcessingJob.update({
      where: { jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
    console.log("[Processor] Document processing COMPLETED", {
      jobId,
      documentId,
    });

    // Call webhook if provided
    if (webhookUrl) {
      // Fetch metadata for webhook payload
      const metadata = await prisma.documentMetadata.findMany({
        where: { documentId },
      });
      
      const metadataObject = {};
      metadata.forEach((item) => {
        metadataObject[item.key] = item.value;
      });

      const webhookPayload = {
        jobId,
        status: "COMPLETED",
        documentId,
        document: {
          ...document,
          metadata: metadataObject,
        },
      };

      console.log("[Processor] Calling webhook with COMPLETED status", {
        jobId,
        documentId,
        webhookUrl,
      });
      await callWebhook(webhookUrl, webhookPayload);
    }

  } catch (error) {
    console.error("[Processor] Error processing document:", {
      jobId,
      documentId,
      error: error?.message || error?.toString() || "Unknown error",
    });
    
    const errorMessage = error?.message || error?.toString() || "Unknown error";
    
    // Update job status to FAILED
    await prisma.documentProcessingJob.update({
      where: { jobId },
      data: {
        status: "FAILED",
        errorMessage: errorMessage,
        completedAt: new Date(),
      },
    });

    // Cleanup: delete document and S3 object
    if (documentId) {
      try {
        await prisma.document.delete({
          where: { id: documentId },
        });
      } catch (deleteError) {
        console.error("[Processor] Error deleting document during cleanup:", {
          jobId,
          documentId,
          error: deleteError?.message || String(deleteError),
        });
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
      } catch (s3Error) {
        console.error("[Processor] Error deleting S3 object during cleanup:", {
          jobId,
          filename,
          error: s3Error?.message || String(s3Error),
        });
      }
    }

    // Call webhook with error if provided
    if (webhookUrl) {
      const webhookPayload = {
        jobId,
        status: "FAILED",
        documentId: documentId || null,
        error: errorMessage,
      };

      console.log("[Processor] Calling webhook with FAILED status", {
        jobId,
        documentId,
        webhookUrl,
      });
      await callWebhook(webhookUrl, webhookPayload);
    }
  }
}

/**
 * Recover stuck jobs that were left in PROCESSING or PENDING state
 * due to server crashes or restarts. Marks them as FAILED.
 * This should be called on server startup.
 */
export async function recoverStuckJobs() {
  try {
    console.log("[Recovery] Starting recovery of stuck processing jobs...");
    
    // Find all jobs that are stuck in PROCESSING or PENDING state
    // and don't have a completedAt timestamp (meaning they never finished)
    const stuckJobs = await prisma.documentProcessingJob.findMany({
      where: {
        status: {
          in: ["PROCESSING", "PENDING"],
        },
        completedAt: null, // Jobs that never completed
      },
      include: {
        document: true,
      },
    });

    if (stuckJobs.length === 0) {
      console.log("[Recovery] No stuck jobs found.");
      return { recovered: 0 };
    }

    console.log(`[Recovery] Found ${stuckJobs.length} stuck job(s) to recover.`);

    let recoveredCount = 0;
    const errorMessage = "Job failed due to server restart or crash. Processing was interrupted. Please retry uploading the document or contact support if the issue persists.";

    for (const job of stuckJobs) {
      try {
        // Store original status before updating (needed for cleanup logic)
        const originalStatus = job.status;
        
        // Update job status to FAILED
        await prisma.documentProcessingJob.update({
          where: { jobId: job.jobId },
          data: {
            status: "FAILED",
            errorMessage: errorMessage,
            completedAt: new Date(),
          },
        });

        console.log(`[Recovery] Marked job as FAILED: ${job.jobId} (was ${originalStatus})`);

        // Call webhook if provided
        if (job.webhookUrl) {
          const webhookPayload = {
            jobId: job.jobId,
            status: "FAILED",
            documentId: job.documentId || null,
            error: errorMessage,
          };

          console.log(`[Recovery] Calling webhook for failed job: ${job.jobId}`);
          await callWebhook(job.webhookUrl, webhookPayload).catch((webhookError) => {
            console.error(`[Recovery] Webhook call failed for job ${job.jobId}:`, {
              error: webhookError?.message || String(webhookError),
            });
          });
        }

        // Optionally clean up the document and S3 file if the job was in PROCESSING state
        // (meaning it had started processing but never completed)
        // Use originalStatus since job.status was already updated to FAILED
        if (originalStatus === "PROCESSING" && job.documentId && job.document) {
          try {
            // Extract filename from documentUrl if it's an S3 URL
            const documentUrl = job.documentUrl || job.document?.documentUrl;
            if (documentUrl) {
              try {
                const url = new URL(documentUrl);
                // S3 key is the full path minus the leading slash
                const s3Key = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
                
                if (s3Key) {
                  // Delete from S3
                  await s3Client.send(
                    new DeleteObjectCommand({
                      Bucket: env.DO_SPACES_NAME,
                      Key: s3Key,
                    })
                  );
                  console.log(`[Recovery] Deleted S3 object for job: ${job.jobId}`);
                }
              } catch (urlError) {
                console.warn(`[Recovery] Could not parse document URL for job ${job.jobId}:`, {
                  error: urlError?.message || String(urlError),
                });
              }
            }

            // Delete the document record
            await prisma.document.delete({
              where: { id: job.documentId },
            });
            console.log(`[Recovery] Deleted document record for job: ${job.jobId}`);
          } catch (cleanupError) {
            console.error(`[Recovery] Error during cleanup for job ${job.jobId}:`, {
              error: cleanupError?.message || String(cleanupError),
            });
            // Continue with other jobs even if cleanup fails
          }
        }

        recoveredCount++;
      } catch (jobError) {
        console.error(`[Recovery] Error recovering job ${job.jobId}:`, {
          error: jobError?.message || String(jobError),
        });
        // Continue with other jobs even if one fails
      }
    }

    console.log(`[Recovery] Recovery completed. Recovered ${recoveredCount} out of ${stuckJobs.length} stuck job(s).`);
    return { recovered: recoveredCount, total: stuckJobs.length };
  } catch (error) {
    console.error("[Recovery] Fatal error during recovery:", {
      error: error?.message || error?.toString() || "Unknown error",
    });
    return { recovered: 0, error: error?.message || String(error) };
  }
}

