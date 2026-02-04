import sys
import os

# Add current directory to Python path to allow imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import json
import logging
import typing
from typing import Dict, Any, List

import requests
import uvicorn
from dotenv import load_dotenv
import google.generativeai as genai
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from api_types.api import (
    ParseRequest,
    DocumentClassificationRequest,
    DocumentChatRequest,
    GlobalChatRequest,
    ProcessDocumentRequest,
    MultiDocumentChatRequest,
)
from utils.document_processor import process_document_with_gemini
from utils.classifier import classify_document
from utils.embeddings import generate_embedding
from utils.ai_agent import chat_with_specific_document, chat_with_multiple_documents
from utils.auth import verify_jwt_token
from utils.response_generator import stream_response_from_documents
from utils.websocket_handler import TaskPoller
from utils.semantic_agent import semantic_processor
from database import get_pool
from settings import PORT

# Initialize environment and AI model
load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
model = genai.GenerativeModel("gemini-3-pro-preview")

# Logger setup
LOGGER = logging.getLogger("documents_api")
logging.basicConfig(level=logging.INFO)

# FastAPI app setup
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["X-Requested-With", "Content-Type"],
)

RequestResponseEndpoint = typing.Callable[[Request], typing.Awaitable[Response]]


def _normalize_previous_chats(previous_chats: typing.Any) -> str:
    if not previous_chats:
        return ""
    if isinstance(previous_chats, str):
        return previous_chats
    if isinstance(previous_chats, list):
        lines: List[str] = []
        for item in previous_chats:
            try:
                sender = item.sender if hasattr(item, "sender") else item.get("sender")
                message = item.message if hasattr(item, "message") else item.get("message")
            except Exception:
                sender = ""
                message = ""
            if message:
                label = "User" if str(sender).upper() == "USER" else "Assistant"
                lines.append(f"{label}: {message}")
        return "\n".join(lines)
    return str(previous_chats)


# =============================================================================
# MIDDLEWARE
# =============================================================================


@app.middleware("http")
async def exception_handling_middleware(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    try:
        return await call_next(request)
    except HTTPException as exc:
        LOGGER.error(f"HTTP Error: {exc}")
        raise
    except Exception as exc:
        LOGGER.error(f"Unhandled error occurred: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500, content={"message": "error", "error": str(exc)}
        )


# =============================================================================
# ROUTE HANDLERS
# =============================================================================


@app.get("/")
async def root():
    return {"message": "Documents API"}


@app.post("/extract-document-info")
async def extract_info_from_text(data: ParseRequest):
    """Extract document information from a file URL."""
    job_id = data.job_id or "unknown"
    try:
        LOGGER.info(
            f"[Extract] Starting extract-document-info "
            f"(job_id={job_id}, url={data.documentUrl}, metadata_fields={data.metadata_fields})"
        )

        response = requests.get(data.documentUrl)
        response.raise_for_status()
        file_content = response.content

        result = await process_document_with_gemini(
            file_content, data.user_name, metadata_fields=data.metadata_fields
        )

        token_usage = result.pop(
            "_token_usage", {"input_tokens": 0, "output_tokens": 0}
        )
        LOGGER.info(
            f"[Extract] Completed (job_id={job_id}, "
            f"input_tokens={token_usage.get('input_tokens')}, output_tokens={token_usage.get('output_tokens')})"
        )

        content = _extract_content_from_result(result)

        return {
            "content": content,
            "response_from_ai": result,
            "token_usage": token_usage,
        }
    except requests.exceptions.RequestException as e:
        LOGGER.error(f"[Extract] Failed to fetch document (job_id={job_id}): {e}")
        raise HTTPException(
            status_code=400, detail=f"Failed to fetch document: {str(e)}"
        )
    except Exception as e:
        LOGGER.error(
            f"[Extract] Error extracting document info (job_id={job_id}): {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/classify-document")
async def classify_document_endpoint(data: DocumentClassificationRequest):
    """Classify document into predefined categories using AI."""
    try:
        result = classify_document(data)
        token_usage = result.pop(
            "_token_usage", {"input_tokens": 0, "output_tokens": 0}
        )
        result["token_usage"] = token_usage
        return result
    except Exception as e:
        LOGGER.error(f"Document classification failed: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": str(e),
                "token_usage": {"input_tokens": 0, "output_tokens": 0},
            },
        )


@app.post("/api/generate-embedding")
async def generate_embedding_endpoint(request: Request):
    """Generate embeddings for document text and store in database."""
    try:
        data = await request.json()
        document_id = data.get("document_id") or data.get("contract_id")
        document_text = data.get("document_text", "").strip()
        metadata = data.get("metadata", {})

        if not document_id or not document_text:
            raise HTTPException(
                status_code=422, detail="document_id and document_text are required"
            )

        LOGGER.info(
            f"Embedding request for document {document_id} ({len(document_text)} chars)"
        )

        result = await generate_embedding(
            document_id=document_id, document_text=document_text, metadata=metadata
        )

        return result

    except Exception as e:
        LOGGER.error(f"Embedding failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat-with-document")
async def chat_with_document_endpoint(data: DocumentChatRequest):
    """Streaming chat endpoint for document-specific queries with @ mention support."""
    try:
        LOGGER.info(f"Processing chat request for document {data.document_id}")

        if data.mentioned_documents:
            LOGGER.info(
                f"Processing {len(data.mentioned_documents)} mentioned document(s)"
            )

        if not data.document_text or len(data.document_text.strip()) == 0:
            raise HTTPException(
                status_code=400, detail="Valid document text is required"
            )

        mentioned_docs_data = _prepare_mentioned_documents(data.mentioned_documents)

        previous_chats = _normalize_previous_chats(data.previous_chats)

        async def generate():
            try:
                # Use the streaming generator
                from utils.ai_agent import stream_chat_with_specific_document

                stream_gen = stream_chat_with_specific_document(
                    document_id=data.document_id,
                    document_text=data.document_text.strip(),
                    metadata=data.metadata or {},
                    query=data.query,
                    document_url=(data.metadata or {}).get("documentUrl"),
                    previous_chats=previous_chats,
                    mentioned_documents=mentioned_docs_data,
                )

                # Iterate over the async generator
                async for item in stream_gen:
                    if item["type"] == "status":
                        yield f"__STATUS__:{item['message']}\n"
                    elif item["type"] == "content":
                        yield item["text"]
                    elif item["type"] == "token_usage":
                        yield f"__TOKEN_USAGE__:{json.dumps({'input_tokens': item['input_tokens'], 'output_tokens': item['output_tokens']})}\n"
                    elif item["type"] == "error":
                        yield f"\nI apologize, but I encountered an error: {item['message']}\n"

            except Exception as e:
                LOGGER.error(f"Error generating chat response: {str(e)}")
                yield "I apologize, but I encountered an error processing your request."

        return StreamingResponse(generate(), media_type="text/event-stream")

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Document chat failed: {str(e)}", exc_info=True)
        return JSONResponse(status_code=500, content={"detail": str(e)})


@app.post("/chat-with-multi-docs")
async def chat_with_multi_docs_endpoint(data: MultiDocumentChatRequest):
    """Streaming chat endpoint for multi-document queries (up to 3 documents)."""
    try:
        if not data.documents:
            raise HTTPException(
                status_code=400, detail="At least one document is required"
            )

        if len(data.documents) > 3:
            LOGGER.warning(f"Received {len(data.documents)} documents, limiting to 3")
            data.documents = data.documents[:3]

        LOGGER.info(
            f"Processing multi-document chat request with {len(data.documents)} document(s)"
        )

        # Prepare documents data for the AI function (include pages for citations when available)
        documents_data = []
        for doc in data.documents:
            if not doc.document_text or len(doc.document_text.strip()) == 0:
                LOGGER.warning(f"Skipping document {doc.document_id} - empty text")
                continue
            meta = doc.metadata or {}
            doc_entry = {
                "document_id": doc.document_id,
                "document_text": doc.document_text.strip(),
                "metadata": meta,
                "document_url": doc.document_url,
            }
            if meta.get("pages"):
                doc_entry["pages"] = meta["pages"]
            documents_data.append(doc_entry)

        if not documents_data:
            raise HTTPException(
                status_code=400, detail="No valid documents with text provided"
            )

        previous_chats = _normalize_previous_chats(data.previous_chats)

        async def generate():
            try:
                # Use the streaming generator
                from utils.ai_agent import stream_chat_with_multiple_documents

                stream_gen = stream_chat_with_multiple_documents(
                    documents=documents_data,
                    query=data.query,
                    previous_chats=previous_chats,
                )

                # Iterate over the async generator
                async for item in stream_gen:
                    if item["type"] == "status":
                        yield f"__STATUS__:{item['message']}\n"
                    elif item["type"] == "content":
                        yield item["text"]
                    elif item["type"] == "token_usage":
                        yield f"__TOKEN_USAGE__:{json.dumps({'input_tokens': item['input_tokens'], 'output_tokens': item['output_tokens']})}\n"
                    elif item["type"] == "error":
                        yield f"\nI apologize, but I encountered an error: {item['message']}\n"

            except Exception as e:
                LOGGER.error(f"Error generating multi-doc chat response: {str(e)}")
                yield "I apologize, but I encountered an error processing your request."

        return StreamingResponse(generate(), media_type="text/event-stream")

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Multi-document chat failed: {str(e)}", exc_info=True)
        return JSONResponse(status_code=500, content={"detail": str(e)})



@app.post("/find-similar-document")
async def find_similar_document_endpoint(request: Request):
    """
    Find up to 3 most similar documents based on query embedding.
    Compares query embedding with document summary embeddings using cosine similarity.
    Returns documents that meet or exceed the similarity threshold.
    """
    try:
        data = await request.json()
        query = data.get("query", "").strip()
        user_id = data.get("user_id")
        organization_id = data.get("organization_id")
        threshold = data.get("threshold", 0.6)

        if not query:
            raise HTTPException(status_code=422, detail="query is required")

        LOGGER.info(
            f"Finding similar documents for query: '{query[:100]}...' (threshold: {threshold})"
        )

        # Generate embedding for the query
        from utils.embeddings import embed_text_256d

        query_result = await embed_text_256d(query)
        query_embedding = "[" + ",".join(map(str, query_result["embedding"])) + "]"

        # Find most similar document summaries using vector similarity
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Build the WHERE clause for organization filtering
            org_filter = ""
            params = [query_embedding, threshold]

            if organization_id:
                org_filter = 'AND d."organizationId" = $3'
                params.append(organization_id)
            elif user_id:
                org_filter = 'AND d."userId" = $3'
                params.append(user_id)

            # Query to find up to 3 most similar document summaries above threshold
            query_sql = f"""
                SELECT 
                    ds.id as summary_id,
                    ds."documentId" as document_id,
                    ds.summary,
                    d.title,
                    d."documentName",
                    1 - (ds.embedding_256d <=> $1::vector(256)) as similarity
                FROM document_summaries ds
                JOIN documents d ON ds."documentId" = d.id
                WHERE ds.embedding_256d IS NOT NULL
                  AND ds."isActive" = true
                  AND 1 - (ds.embedding_256d <=> $1::vector(256)) >= $2
                  {org_filter}
                ORDER BY ds.embedding_256d <=> $1::vector(256)
                LIMIT 3
            """

            results = await conn.fetch(query_sql, *params)

            if results:
                documents = []
                for result in results:
                    documents.append(
                        {
                            "document_id": result["document_id"],
                            "title": result["title"],
                            "document_name": result["documentName"],
                            "summary": result["summary"],
                            "similarity": float(result["similarity"]),
                        }
                    )

                LOGGER.info(
                    f"Found {len(documents)} matching document(s) above threshold {threshold}: "
                    f"{[d['title'] or d['document_name'] for d in documents]}"
                )
                return {"documents": documents, "count": len(documents)}
            else:
                LOGGER.info(f"No documents match threshold {threshold}")
                return {
                    "documents": [],
                    "count": 0,
                    "message": "No documents found above similarity threshold",
                }

    except HTTPException:
        raise
    except Exception as e:
        LOGGER.error(f"Error finding similar documents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/global-chat")
async def global_chat_semantic_endpoint(data: GlobalChatRequest):
    """Streaming semantic query processing endpoint that uses AI to understand queries."""
    try:
        user_id = data.user_id or "guest_user"
        query = data.message.strip()
        previous_chats = data.previous_chats or ""
        relevant_documents = data.relevant_documents or []
        offset = data.offset or 0
        limit = data.limit or 10

        LOGGER.info(
            f"🧠 Semantic query: '{query[:100]}...' (user: {user_id}, docs: {len(relevant_documents)}, offset: {offset}, limit: {limit})"
        )

        if relevant_documents:
            LOGGER.info(
                f"📄 Using {len(relevant_documents)} documents from full-text search (showing {offset + 1} to {min(offset + limit, len(relevant_documents))})"
            )

            async def generate():
                async for chunk in stream_response_from_documents(
                    query=query,
                    documents=relevant_documents,
                    previous_chats=previous_chats,
                    offset=offset,
                    limit=limit,
                ):
                    yield chunk

            return StreamingResponse(generate(), media_type="text/event-stream")
        else:
            # For queries without documents, use semantic processor (non-streaming for now)
            result = await semantic_processor.process_query(
                query=query,
                user_id=user_id,
            )
            token_usage = result.get(
                "token_usage", {"input_tokens": 0, "output_tokens": 0}
            )
            response_text = result.get("response", "")

            async def generate_fallback():
                yield response_text
                yield "\n__TOKEN_USAGE__:" + json.dumps(token_usage) + "\n"

            return StreamingResponse(
                generate_fallback(), media_type="text/event-stream"
            )
    except Exception as e:
        LOGGER.error(f"❌ Semantic query processing failed: {e}", exc_info=True)

        async def generate_error():
            yield f"I apologize, but I encountered an error processing your request: {str(e)}"
            yield (
                "\n__TOKEN_USAGE__:"
                + json.dumps({"input_tokens": 0, "output_tokens": 0})
                + "\n"
            )

        return StreamingResponse(generate_error(), media_type="text/event-stream")


@app.post("/api/process-document")
async def process_document_endpoint(data: ProcessDocumentRequest):
    """Start a Celery task to process a document."""
    try:
        from tasks.document_processing import process_document_pipeline

        task = process_document_pipeline.delay(
            document_id=data.document_id,
            document_url=data.document_url,
            user_name=data.user_name,
            original_file_name=data.original_file_name,
            user_id=data.user_id,
        )

        return {"task_id": task.id, "status": "PENDING"}
    except Exception as e:
        LOGGER.error(f"Error starting document processing task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# WEBSOCKET ENDPOINT
# =============================================================================


@app.websocket("/ws/tasks")
async def websocket_tasks(websocket: WebSocket, token: str = Query(...)):
    """
    WebSocket endpoint for polling multiple tasks.
    Requires JWT token in query string: /ws/tasks?token=JWT_HERE
    """
    # Authenticate before accepting connection
    try:
        payload = verify_jwt_token(token)
        user_id = payload.get("userId") or payload.get("email")
        LOGGER.info(f"[WebSocket] Authenticated user: {user_id}")
    except HTTPException as e:
        LOGGER.error(f"[WebSocket] Authentication failed: {e.detail}")
        try:
            await websocket.close(code=1008, reason=e.detail)
        except Exception as close_err:
            LOGGER.error(f"[WebSocket] Error closing rejected connection: {close_err}")
        return
    except Exception as e:
        LOGGER.error(f"[WebSocket] Error during JWT verification: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception as close_err:
            LOGGER.error(f"[WebSocket] Error closing connection: {close_err}")
        return

    # Accept connection
    try:
        await websocket.accept()
        LOGGER.info(f"[WebSocket] Connection accepted for user: {user_id}")
    except Exception as e:
        LOGGER.error(f"[WebSocket] Error accepting connection: {e}", exc_info=True)
        return

    # Initialize task poller and run
    poller = TaskPoller(websocket, user_id)
    if not await poller.send_initial_message():
        return

    await poller.run_polling_loop()


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def _extract_content_from_result(result: Dict[str, Any]) -> str:
    """Extract text content from the document processing result in a generic way."""
    # Prefer full OCR text when present (PDFs and images)
    if result.get("raw_ocr_text", "").strip():
        return result["raw_ocr_text"].strip()
    content_parts = []
    # Try common generic fields
    for key in ["summary", "description", "content", "details"]:
        value = result.get(key)
        if isinstance(value, str) and value.strip():
            content_parts.append(value.strip())
        elif isinstance(value, dict):
            # If 'details' or similar is a dict, look for 'description' or 'content' inside
            for subkey in ["description", "content", "summary"]:
                subvalue = value.get(subkey)
                if isinstance(subvalue, str) and subvalue.strip():
                    content_parts.append(subvalue.strip())
    # Fallback: concatenate all string fields in result
    if not content_parts:
        for v in result.values():
            if isinstance(v, str) and v.strip():
                content_parts.append(v.strip())
    return "\n\n".join(content_parts) if content_parts else ""


def _prepare_mentioned_documents(mentioned_documents) -> list:
    """Prepare mentioned documents data for chat processing."""
    mentioned_docs_data = []
    if mentioned_documents:
        for mentioned_doc in mentioned_documents:
            mentioned_docs_data.append(
                {
                    "document_id": mentioned_doc.document_id,
                    "document_text": mentioned_doc.document_text.strip()
                    if mentioned_doc.document_text
                    else "",
                    "metadata": mentioned_doc.metadata or {},
                    "title": mentioned_doc.title
                    or mentioned_doc.metadata.get("title")
                    or "Untitled Document",
                }
            )
    return mentioned_docs_data


def run_dev_server(port: int = PORT) -> None:
    uvicorn.run("server:app", port=port, reload=True, log_level="info")


if __name__ == "__main__":
    run_dev_server(port=PORT)
