"""Utility for generating AI responses from documents."""

import asyncio
import json
import logging
import os
from typing import Dict, Any, List, Tuple

import google.generativeai as genai
from dotenv import load_dotenv

from utils.llm_client import get_llm_client, LLMClient

load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

LOGGER = logging.getLogger("documents_api")

# Gemini model name - centralized for easy updates (used as fallback)
GEMINI_MODEL_NAME = "gemini-2.5-flash"

# Get configurable LLM client for chat (can be Gemini or OpenAI-compatible)
_response_llm_client: LLMClient = None


def get_response_client() -> LLMClient:
    """Get the LLM client for response generation."""
    global _response_llm_client
    if _response_llm_client is None:
        _response_llm_client = get_llm_client()
    return _response_llm_client


def build_document_context(
    documents: List[Dict[str, Any]], max_docs: int = 10
) -> Tuple[str, Dict[str, str]]:
    """
    Build context string and document map from a list of documents.

    Returns:
        tuple: (context_text, document_map) where document_map maps title to ID
    """
    documents_context = []
    document_map = {}  # Map document title to ID for link generation

    max_docs = min(len(documents), max_docs)
    MAX_TOTAL_CONTEXT_LENGTH = 20000
    max_text_length = MAX_TOTAL_CONTEXT_LENGTH // max_docs

    for i, doc in enumerate(documents[:max_docs], 1):
        doc_id = doc.get("id", "")
        doc_text = doc.get("text", "").strip()
        doc_title = doc.get("title", "Untitled Document")
        doc_metadata = doc.get("metadata", {})

        LOGGER.info(
            f"📄 Document {i}: {doc_title} (ID: {doc_id}, Text length: {len(doc_text)})"
        )

        # Use description as fallback if text is empty
        if not doc_text:
            LOGGER.warning(
                f"⚠️ Document {doc_title} (ID: {doc_id}) has empty text content"
            )
            doc_text = doc_metadata.get("description", "")
            if doc_text:
                LOGGER.info(f"Using description as fallback for {doc_title}")

        # Truncate text if too long
        if len(doc_text) > max_text_length:
            doc_text = doc_text[:max_text_length] + "..."

        document_map[doc_title] = doc_id

        # Build metadata string
        metadata_str = _build_metadata_string(doc_metadata)

        context_entry = f"""
Title: {doc_title}
ID: {doc_id}
Metadata:
{metadata_str}
Content: {doc_text}
"""
        documents_context.append(context_entry.strip())

    context_text = "\n\n---\n\n".join(documents_context)
    return context_text, document_map


def _build_metadata_string(doc_metadata: Dict[str, Any]) -> str:
    """Build a formatted metadata string from document metadata."""
    metadata_parts = []

    # Basic metadata
    metadata_parts.append(f"Type: {doc_metadata.get('type', 'N/A')}")
    metadata_parts.append(f"Category: {doc_metadata.get('category', 'N/A')}")
    metadata_parts.append(f"Location: {doc_metadata.get('location', 'N/A')}")

    # Document number fields
    if doc_metadata.get("documentNumber"):
        metadata_parts.append(f"Document Number: {doc_metadata.get('documentNumber')}")
    if doc_metadata.get("documentNumberLabel"):
        metadata_parts.append(
            f"Document Number Label: {doc_metadata.get('documentNumberLabel')}"
        )

    # Description
    if doc_metadata.get("description"):
        metadata_parts.append(f"Description: {doc_metadata.get('description')}")

    # Parties
    if doc_metadata.get("promisor"):
        metadata_parts.append(f"Promisor: {doc_metadata.get('promisor')}")
    if doc_metadata.get("promisee"):
        metadata_parts.append(f"Promisee: {doc_metadata.get('promisee')}")

    # Legal document fields
    if doc_metadata.get("caseNo"):
        metadata_parts.append(f"Case Number: {doc_metadata.get('caseNo')}")
    if doc_metadata.get("caseType"):
        metadata_parts.append(f"Case Type: {doc_metadata.get('caseType')}")
    if doc_metadata.get("court"):
        metadata_parts.append(f"Court: {doc_metadata.get('court')}")
    if doc_metadata.get("applicant"):
        metadata_parts.append(f"Applicant: {doc_metadata.get('applicant')}")
    if doc_metadata.get("petitioner"):
        metadata_parts.append(f"Petitioner: {doc_metadata.get('petitioner')}")

    # Additional metadata fields
    metadata_field_labels = {
        "respondent": "Respondent",
        "plaintiff": "Plaintiff",
        "defendant": "Defendant",
        "applicationNo": "Application Number",
        "approvalNo": "Approval Number",
        "orderNo": "Order Number",
        "companyName": "Company Name",
        "authorityName": "Authority Name",
        "registrationNo": "Registration Number",
        "surveyNo": "Survey Number",
        "seller": "Seller",
        "purchaser": "Purchaser",
    }
    for field, label in metadata_field_labels.items():
        value = doc_metadata.get(field)
        if value:
            metadata_parts.append(f"{label}: {value}")

    return "\n".join(metadata_parts) if metadata_parts else "No additional metadata"


def build_response_prompt(
    query: str,
    context_text: str,
    document_map: Dict[str, str],
    first_doc_metadata: Dict[str, Any],
    previous_chats: str = "",
    pagination_context: str = "",
) -> str:
    """Build the prompt for generating a response from documents.

    Args:
        query: User's question
        context_text: Formatted document content
        document_map: Map of document titles to IDs
        first_doc_metadata: Metadata from first document for examples
        previous_chats: Previous conversation history
        pagination_context: Separate pagination info (not mixed with chat history)
    """
    # Build document link instructions
    link_instructions = "\n".join(
        [
            f'- "{title}": Use markdown link format [{title}](/documents/{doc_id}) when referencing it.'
            for title, doc_id in document_map.items()
        ]
    )

    # Get first document info for example
    first_title = list(document_map.keys())[0] if document_map else "Document"
    first_id = list(document_map.values())[0] if document_map else ""
    first_doc_type = first_doc_metadata.get("type", "document")

    # Build pagination section separately from conversation history
    pagination_section = ""
    if pagination_context:
        pagination_section = f"""
Pagination Context:
{pagination_context}
"""

    return f"""You are a helpful assistant that answers questions based on the provided documents.

Previous conversation:
{previous_chats if previous_chats else "No previous conversation."}
{pagination_section}
Relevant Documents:
{context_text}

User Question: {query}

Instructions:
1. IMPORTANT: Since documents were found matching the search query, you MUST provide context about what was found, even if the exact query term isn't in the document text.
2. Search through ALL available information:
   - Document Title
   - All Metadata fields (Type, Category, Document Number, Case Number, Application Number, Parties, etc.)
   - Document Content/Text
3. If the query term appears in ANY field (title, metadata, or content), mention where it was found and provide relevant context.
4. If the query term doesn't appear in the text but documents were found, provide information about the found document(s) including:
   - Document title and type
   - Relevant metadata (case numbers, document numbers, parties, dates, etc.)
   - A summary of what the document contains
   - A link to view the document
5. Always acknowledge that a document was found and provide useful context, even if the exact query term isn't in the content.
6. Be concise and accurate.
7. If multiple documents are relevant, synthesize the information.
8. When referencing documents, ALWAYS use the document's TITLE (not "Document 1", "Document 2", etc.) and include clickable links using markdown format: [Document Title](/documents/DOCUMENT_ID)
9. Use the following document titles and IDs for links:
{link_instructions}
10. Example: "I found [{first_title}](/documents/{first_id}) which is a {first_doc_type}. According to the metadata..."
11. Make sure every document reference uses the document's actual title and includes a clickable link.
12. NEVER use generic terms like "Document 1" or "Document 2" - always use the actual document title.
13. NEVER say "I couldn't find information" if documents were provided - instead, describe what was found in the documents.

Answer:"""


async def stream_response_from_documents(
    query: str,
    documents: List[Dict[str, Any]],
    previous_chats: str = "",
    offset: int = 0,
    limit: int = 10,
):
    """
    Stream an AI response based on relevant documents found via full-text search.
    Supports pagination with offset and limit. Uses async streaming for real-time response.

    If the offset is greater than or equal to the number of available documents, 
    the function yields an empty result set and appropriate pagination metadata.

    Args:
        query: User's question
        documents: All relevant documents from search
        previous_chats: Previous conversation context
        offset: Number of documents to skip (for pagination)
        limit: Maximum documents to process in this request

    Yields:
        str: Chunks of the response text, with metadata at the end
    """
    total_documents = len(documents)

    if not documents:
        # Consistent order: PAGINATION first, then TOKEN_USAGE
        yield (
            "__PAGINATION__:"
            + json.dumps(
                {"total": 0, "offset": offset, "limit": limit, "hasMore": False}
            )
            + "\n"
        )
        yield (
            "__TOKEN_USAGE__:"
            + json.dumps({"input_tokens": 0, "output_tokens": 0})
            + "\n"
        )
        yield "I couldn't find any relevant documents for your query. Please try rephrasing your question or using different keywords."
        return

    yield "__STATUS__:Analyzing document context...\n"

    # Apply pagination - slice documents based on offset and limit
    paginated_documents = documents[offset : offset + limit]
    has_more = (offset + limit) < total_documents
    remaining_count = max(0, total_documents - (offset + limit))

    LOGGER.info(
        f"📑 Pagination: offset={offset}, limit={limit}, total={total_documents}, showing={len(paginated_documents)}, hasMore={has_more}"
    )

    if not paginated_documents:
        # Consistent order: PAGINATION first, then TOKEN_USAGE
        yield (
            "__PAGINATION__:"
            + json.dumps(
                {
                    "total": total_documents,
                    "offset": offset,
                    "limit": limit,
                    "hasMore": False,
                }
            )
            + "\n"
        )
        yield (
            "__TOKEN_USAGE__:"
            + json.dumps({"input_tokens": 0, "output_tokens": 0})
            + "\n"
        )
        yield "No more documents to show for this query."
        return

    yield "__STATUS__:Building document context...\n"

    # Build context from paginated documents
    context_text, document_map = build_document_context(
        paginated_documents, max_docs=limit
    )

    # Get first document metadata for prompt example
    first_doc_metadata = (
        paginated_documents[0].get("metadata", {}) if paginated_documents else {}
    )

    # Build pagination context as a separate section (not mixed with chat history)
    pagination_context = ""
    if offset > 0:
        pagination_context = f"This is a continuation. You are now showing documents {offset + 1} to {offset + len(paginated_documents)} out of {total_documents} total documents found."

    yield "__STATUS__:Preparing AI prompt...\n"

    # Pass pagination_context as a dedicated parameter
    prompt = build_response_prompt(
        query=query,
        context_text=context_text,
        document_map=document_map,
        first_doc_metadata=first_doc_metadata,
        previous_chats=previous_chats,
        pagination_context=pagination_context,
    )

    try:
        yield "__STATUS__:Generating response...\n"
        
        # Get configurable LLM client
        llm_client = get_response_client()
        
        # Initialize with proper async streaming
        generation_config = {
            "temperature": 0.3,
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 8192,
        }
        
        input_tokens = 0
        output_tokens = 0
        chunk_count = 0

        # Use the configurable LLM client for streaming
        async for chunk in llm_client.stream_chat_completion(prompt, **generation_config):
            if chunk["type"] == "content":
                chunk_count += 1
                yield chunk["text"]
                await asyncio.sleep(0)  # Small yield to ensure chunks are flushed
            elif chunk["type"] == "token_usage":
                input_tokens = chunk.get("input_tokens", 0)
                output_tokens = chunk.get("output_tokens", 0)

        LOGGER.info(f"✅ Streamed {chunk_count} chunks for query")

        # After the main answer, append raw OCR excerpts as explicit sources
        try:
            if paginated_documents:
                sources_parts = []
                sources_parts.append(
                    "\n\n---\n\nSources (raw OCR excerpts from the documents used above):"
                )

                for i, doc in enumerate(paginated_documents, 1):
                    doc_title = doc.get("title") or f"Document {i}"
                    # Use the original text field from the search result as the OCR content
                    doc_text = (doc.get("text") or "").strip()

                    if not doc_text:
                        continue

                    # Use a bounded excerpt per document to keep responses manageable
                    MAX_EXCERPT_LENGTH = 10000
                    excerpt = doc_text[:MAX_EXCERPT_LENGTH]

                    # Format so the frontend can treat this as a document list with pagination
                    # Pattern: \n\n"Document Title"\n\n<raw text>
                    sources_parts.append(f'\n\n"{doc_title}"\n\n{excerpt}')

                if len(sources_parts) > 1:
                    sources_block = "".join(sources_parts)
                    yield sources_block
        except Exception as e:
            LOGGER.warning(f"Failed to append raw OCR sources for global-chat: {e}")

        # Consistent order: PAGINATION first, then TOKEN_USAGE
        yield (
            "\n__PAGINATION__:"
            + json.dumps(
                {
                    "total": total_documents,
                    "offset": offset,
                    "limit": limit,
                    "shown": len(paginated_documents),
                    "hasMore": has_more,
                    "remaining": remaining_count,
                    "nextOffset": offset + limit if has_more else None,
                }
            )
            + "\n"
        )
        yield (
            "__TOKEN_USAGE__:"
            + json.dumps({"input_tokens": input_tokens, "output_tokens": output_tokens})
            + "\n"
        )

    except Exception as e:
        LOGGER.error(f"Error streaming response from documents: {e}")
        # Consistent order: PAGINATION first, then TOKEN_USAGE
        yield (
            "__PAGINATION__:"
            + json.dumps(
                {
                    "total": total_documents,
                    "offset": offset,
                    "limit": limit,
                    "hasMore": has_more,
                }
            )
            + "\n"
        )
        yield (
            "__TOKEN_USAGE__:"
            + json.dumps({"input_tokens": 0, "output_tokens": 0})
            + "\n"
        )
        yield f"I found {total_documents} relevant document(s), but encountered an error generating a response. Please try rephrasing your question."
