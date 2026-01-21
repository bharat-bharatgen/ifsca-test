import os
import logging
import requests
import uuid
import asyncio
import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from celery import Task
from celery_app import celery_app
from utils.document_processor import process_document_with_gemini, parse_duration
from utils.classifier import classify_document
from utils.embeddings import generate_embedding
from api_types.api import DocumentClassificationRequest
from utils.redis_utils import set_task_state_in_redis
from database import get_pool

LOGGER = logging.getLogger(__name__)

# Maximum retry attempts
MAX_RETRIES = 3


def run_async_in_new_loop(coro):
    """
    Run an async coroutine in a new event loop and properly clean up the database pool.
    This ensures the pool is created in the correct event loop and cleaned up afterwards.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        # Clean up the pool for this loop before closing
        try:
            from database import close_pool
            loop_id = id(loop)
            loop.run_until_complete(close_pool(loop_id))
        except Exception as e:
            LOGGER.warning(f"Error closing database pool: {e}")
        finally:
            loop.close()


async def delete_document_from_db(document_id: str):
    """
    Delete a document from the database.
    This will cascade delete related records (document_info, document_summaries, document_embeddings).
    """
    try:
        LOGGER.warning(f"[CLEANUP] Deleting document {document_id} from database due to processing failure")
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Delete the document (cascade will handle related records)
            await conn.execute('DELETE FROM documents WHERE id = $1', document_id)
            LOGGER.info(f"[CLEANUP] Successfully deleted document {document_id} from database")
    except Exception as e:
        error_msg = "Failed to delete document from database"
        LOGGER.error(f"[CLEANUP] {error_msg} for document {document_id}: {e}", exc_info=True)
        # Don't raise - we want to continue even if deletion fails


def _extract_document_info_impl(document_url: str, user_name: str) -> Dict[str, Any]:
    """
    Internal implementation for extracting document information.
    Can be called directly or through Celery task.
    """
    LOGGER.info(f"Starting document extraction for URL: {document_url}")
    
    # Fetch document content
    response = requests.get(document_url)
    response.raise_for_status()
    file_content = response.content
    
    # Run async function in event loop
    # Run async function using asyncio.run (Python 3.7+)
    result = asyncio.run(
        process_document_with_gemini(file_content, user_name)
    )
    
    # Extract token usage
    token_usage = result.pop("_token_usage", {"input_tokens": 0, "output_tokens": 0})
    
     # Extract full OCR text content as primary content
    # This is the actual complete text from the document
    content = result.get("raw_ocr_text", "")

    # Fallback to AI summaries only if raw OCR text is not available or too short
    if not content or len(content.strip()) < 100:
        LOGGER.warning("[EXTRACT] Raw OCR text is missing or too short, falling back to AI summaries")
        content_parts = []
        if result.get("contract_summary"):
            content_parts.append(result["contract_summary"])
        details = result.get("contract_details", {})
        if details.get("description"):
            content_parts.append(details["description"])
        content = "\n\n".join(content_parts) if content_parts else ""
    else:
        LOGGER.info(f"[EXTRACT] Using full raw OCR text ({len(content)} characters)")
    
    return {
        "content": content,
        "response_from_ai": result,
        "token_usage": token_usage,
        "success": True
    }


@celery_app.task(
    bind=True,
    name="tasks.extract_document_info",
    max_retries=MAX_RETRIES,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,  # Max 10 minutes
    retry_jitter=True
)
def extract_document_info_task(
    self: Task,
    document_url: str,
    user_name: str,
    document_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Celery task to extract document information.
    This is a synchronous wrapper around the async function.
    """
    retry_count = self.request.retries
    attempt_number = retry_count + 1
    
    LOGGER.info(f"[EXTRACT] Starting attempt {attempt_number}/{MAX_RETRIES + 1} for document extraction")
    
    try:
        result = _extract_document_info_impl(document_url, user_name)
        if retry_count > 0:
            LOGGER.info(f"[EXTRACT] Successfully completed on attempt {attempt_number} after {retry_count} retries")
        return result
    except Exception as e:
        error_msg = f"Document extraction failed"
        LOGGER.warning(f"[EXTRACT] Attempt {attempt_number}/{MAX_RETRIES + 1} failed: {error_msg}")
        
        # If we've exhausted all retries and have a document_id, delete the document
        if retry_count >= MAX_RETRIES and document_id:
            LOGGER.error(f"[EXTRACT] Max retries ({MAX_RETRIES}) exceeded. Deleting document {document_id}")
            run_async_in_new_loop(delete_document_from_db(document_id))
            self.update_state(
                state="FAILURE",
                meta={"error": error_msg, "message": "Document extraction failed after all retries"}
            )
        
        # Retry if we haven't exceeded max retries
        if retry_count < MAX_RETRIES:
            next_attempt = retry_count + 2
            LOGGER.info(f"[EXTRACT] Retrying... Next attempt will be {next_attempt}/{MAX_RETRIES + 1}")
            raise self.retry(exc=e)
        else:
            LOGGER.error(f"[EXTRACT] All retries exhausted. Task failed.")
        raise


def _classify_document_impl(
    title: str,
    contract_type: str,
    promisor: str,
    promisee: str,
    content: str,
    value: float = 0.0
) -> Dict[str, Any]:
    """
    Internal implementation for classifying document.
    Can be called directly or through Celery task.
    """
    LOGGER.info(f"Starting document classification for: {title}")
    
    classification_request = DocumentClassificationRequest(
        title=title,
        contract_type=contract_type,
        promisor=promisor,
        promisee=promisee,
        content=content,
        value=value
    )
    
    result = classify_document(classification_request)
    
    # Extract token usage
    token_usage = result.pop("_token_usage", {"input_tokens": 0, "output_tokens": 0})
    result["token_usage"] = token_usage
    
    return result


@celery_app.task(
    bind=True,
    name="tasks.classify_document",
    max_retries=MAX_RETRIES,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,  # Max 10 minutes
    retry_jitter=True
)
def classify_document_task(
    self: Task,
    title: str,
    contract_type: str,
    promisor: str,
    promisee: str,
    content: str,
    value: float = 0.0,
    document_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Celery task to classify document.
    """
    retry_count = self.request.retries
    attempt_number = retry_count + 1
    
    LOGGER.info(f"[CLASSIFY] Starting attempt {attempt_number}/{MAX_RETRIES + 1} for document classification")
    
    try:
        result = _classify_document_impl(title, contract_type, promisor, promisee, content, value)
        if retry_count > 0:
            LOGGER.info(f"[CLASSIFY] Successfully completed on attempt {attempt_number} after {retry_count} retries")
        return result
    except Exception as e:
        error_msg = f"Document classification failed"
        LOGGER.warning(f"[CLASSIFY] Attempt {attempt_number}/{MAX_RETRIES + 1} failed: {error_msg}")
        
        # If we've exhausted all retries and have a document_id, delete the document
        if retry_count >= MAX_RETRIES and document_id:
            LOGGER.error(f"[CLASSIFY] Max retries ({MAX_RETRIES}) exceeded. Deleting document {document_id}")
            run_async_in_new_loop(delete_document_from_db(document_id))
            self.update_state(
                state="FAILURE",
                meta={"error": error_msg, "message": "Document classification failed after all retries"}
            )
        
        # Retry if we haven't exceeded max retries
        if retry_count < MAX_RETRIES:
            next_attempt = retry_count + 2
            LOGGER.info(f"[CLASSIFY] Retrying... Next attempt will be {next_attempt}/{MAX_RETRIES + 1}")
            raise self.retry(exc=e)
        else:
            LOGGER.error(f"[CLASSIFY] All retries exhausted. Task failed.")
        raise


def _generate_embedding_impl(
    document_id: str,
    document_text: str,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Internal implementation for generating embeddings.
    Can be called directly or through Celery task.
    """
    LOGGER.info(f"Starting embedding generation for document: {document_id}")
    
    # Run async function in event loop
    result = run_async_in_new_loop(
        generate_embedding(document_id, document_text, metadata)
    )
    
    return result


@celery_app.task(
    bind=True,
    name="tasks.generate_embedding",
    max_retries=MAX_RETRIES,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,  # Max 10 minutes
    retry_jitter=True
)
def generate_embedding_task(
    self: Task,
    document_id: str,
    document_text: str,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Celery task to generate embeddings.
    This is a synchronous wrapper around the async function.
    """
    retry_count = self.request.retries
    attempt_number = retry_count + 1
    
    LOGGER.info(f"[EMBEDDING] Starting attempt {attempt_number}/{MAX_RETRIES + 1} for embedding generation")
    
    try:
        result = _generate_embedding_impl(document_id, document_text, metadata)
        if retry_count > 0:
            LOGGER.info(f"[EMBEDDING] Successfully completed on attempt {attempt_number} after {retry_count} retries")
        return result
    except Exception as e:
        error_msg = f"Embedding generation failed"
        LOGGER.warning(f"[EMBEDDING] Attempt {attempt_number}/{MAX_RETRIES + 1} failed: {error_msg}")
        
        # If we've exhausted all retries, delete the document
        if retry_count >= MAX_RETRIES:
            LOGGER.error(f"[EMBEDDING] Max retries ({MAX_RETRIES}) exceeded. Deleting document {document_id}")
            run_async_in_new_loop(delete_document_from_db(document_id))
            self.update_state(
                state="FAILURE",
                meta={"error": error_msg, "message": "Embedding generation failed after all retries"}
            )
        
        # Retry if we haven't exceeded max retries
        if retry_count < MAX_RETRIES:
            next_attempt = retry_count + 2
            LOGGER.info(f"[EMBEDDING] Retrying... Next attempt will be {next_attempt}/{MAX_RETRIES + 1}")
            raise self.retry(exc=e)
        else:
            LOGGER.error(f"[EMBEDDING] All retries exhausted. Task failed.")
        raise


async def write_document_to_db(
    document_id: str,
    content: str,
    response_from_ai: Dict[str, Any],
    document_category: str,
    document_sub_category: str,
    category_confidence: float,
    total_input_tokens: int,
    total_output_tokens: int,
    user_id: str
):
    """
    Write document data to PostgreSQL database using asyncpg.
    """
    try:
        contract_details = response_from_ai.get("contract_details", {})
        doc_type = contract_details.get("type", "")
        
        # Helper functions
        def parse_date(date_str):
            if not date_str:
                return None
            
            if isinstance(date_str, datetime):
                # If already a datetime object, convert to timezone-naive UTC
                if date_str.tzinfo is not None:
                    return date_str.astimezone(timezone.utc).replace(tzinfo=None)
                return date_str
            
            if not isinstance(date_str, str):
                return None
            
            date_str = str(date_str).strip()
            
            try:
                # Handle ISO format with Z (e.g., 2025-11-19T06:40:15.672Z)
                if "Z" in date_str:
                    # Replace Z with +00:00 for fromisoformat
                    iso_str = date_str.replace("Z", "+00:00")
                    dt = datetime.fromisoformat(iso_str)
                    # Convert to UTC and make it timezone-naive for PostgreSQL
                    if dt.tzinfo is not None:
                        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
                    LOGGER.debug(f"Parsed date with Z: {date_str} -> {dt}")
                    return dt
                
                # Handle ISO format with timezone offset (e.g., 2025-11-19T06:40:15+05:30)
                if "+" in date_str or (date_str.count("-") >= 3 and "T" in date_str):
                    dt = datetime.fromisoformat(date_str)
                    if dt.tzinfo is not None:
                        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
                    LOGGER.debug(f"Parsed date with offset: {date_str} -> {dt}")
                    return dt
                
                # Try parsing ISO format without timezone
                try:
                    dt = datetime.fromisoformat(date_str)
                    if dt.tzinfo is not None:
                        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
                    LOGGER.debug(f"Parsed ISO date: {date_str} -> {dt}")
                    return dt
                except ValueError:
                    pass
                
                # Try parsing date-only format
                try:
                    dt = datetime.strptime(date_str, "%Y-%m-%d")
                    LOGGER.debug(f"Parsed date-only: {date_str} -> {dt}")
                    return dt
                except ValueError:
                    pass
                
                # Try other common formats
                formats = [
                    "%Y-%m-%d %H:%M:%S",
                    "%Y-%m-%d %H:%M:%S.%f",
                    "%Y/%m/%d",
                    "%d-%m-%Y",
                    "%d/%m/%Y",
                ]
                for fmt in formats:
                    try:
                        dt = datetime.strptime(date_str, fmt)
                        LOGGER.debug(f"Parsed date with format {fmt}: {date_str} -> {dt}")
                        return dt
                    except ValueError:
                        continue
                
                LOGGER.warning(f"Failed to parse date string: {date_str}")
                return None
            except Exception as e:
                LOGGER.error(f"Error parsing date '{date_str}': {e}", exc_info=True)
                return None
        
        def parse_int_safe(value):
            if value is None or value == "":
                return None
            try:
                return int(value)
            except Exception:
                return None
        
        # Build update data
        update_data = {
            "documentText": content,
            "title": contract_details.get("title") or "Untitled Document",
            "promisor": contract_details.get("promisor") or "",
            "promisee": contract_details.get("promisee") or "",
            "country": contract_details.get("country") or "",
            "state": contract_details.get("state") or "",
            "city": contract_details.get("city") or "",
            "location": contract_details.get("location") or "",
            "documentValue": float(contract_details.get("value") or 0),
            "duration": parse_duration(contract_details.get("duration")),
            "type": contract_details.get("type"),
            "date": parse_date(contract_details.get("date")),
            "description": contract_details.get("description"),
            "category": document_category,
            "subCategory": document_sub_category,
            "categoryConfidence": category_confidence,
            "documentNumber": contract_details.get("document_number") or None,
            "documentNumberLabel": contract_details.get("document_number_label") or None,
        }
        
        # Add LAND type fields
        if doc_type and "LAND" in str(doc_type).upper():
            update_data.update({
                "registrationNo": contract_details.get("registration_no") or None,
                "registrationDate": parse_date(contract_details.get("registration_date")),
                "landDocumentType": contract_details.get("land_document_type") or None,
                "landDocumentDate": parse_date(contract_details.get("land_document_date")),
                "seller": contract_details.get("seller") or None,
                "purchaser": contract_details.get("purchaser") or None,
                "surveyNo": contract_details.get("survey_no") or None,
                "ctsNo": contract_details.get("cts_no") or None,
                "gutNo": contract_details.get("gut_no") or None,
                "plotNo": contract_details.get("plot_no") or None,
                "noOfPages": parse_int_safe(contract_details.get("no_of_pages")),
                "village": contract_details.get("village") or None,
                "taluka": contract_details.get("taluka") or None,
                "pincode": contract_details.get("pincode") or None,
            })
            # Sync dates
            if update_data.get("landDocumentDate"):
                update_data["date"] = update_data["landDocumentDate"]
            elif update_data.get("date"):
                update_data["landDocumentDate"] = update_data["date"]
        
        # Add LIAISON type fields
        doc_type_upper = str(doc_type).upper() if doc_type else ""
        if doc_type and ("LIAISON" in doc_type_upper):
            update_data.update({
                "applicationNo": contract_details.get("application_no") or None,
                "applicationDate": parse_date(contract_details.get("application_date")),
                "companyName": contract_details.get("company_name") or None,
                "authorityName": contract_details.get("authority_name") or None,
                "approvalNo": contract_details.get("approval_no") or None,
                "orderNo": contract_details.get("order_no") or None,
                "approvalDate": parse_date(contract_details.get("approval_date")),
                "buildingName": contract_details.get("building_name") or None,
                "projectName": contract_details.get("project_name") or None,
                "expiryDate": parse_date(contract_details.get("expiry_date")),
                "sector": contract_details.get("sector") or None,
                "subject": contract_details.get("subject") or None,
                "drawingNo": contract_details.get("drawing_no") or None,
                "drawingDate": parse_date(contract_details.get("drawing_date")),
                "buildingType": contract_details.get("building_type") or None,
                "commenceCertificate": contract_details.get("commence_certificate") or None,
                "intimationOfDisapproval": contract_details.get("intimation_of_disapproval") or None,
                "intimationOfApproval": contract_details.get("intimation_of_approval") or None,
                "rera": contract_details.get("rera") or None,
            })
            # Sync dates
            if update_data.get("applicationDate"):
                update_data["date"] = update_data["applicationDate"]
            elif update_data.get("date"):
                update_data["applicationDate"] = update_data["date"]
        
        # Add LEGAL type fields
        if doc_type and "LEGAL" in str(doc_type).upper():
            update_data.update({
                "caseType": contract_details.get("case_type") or None,
                "caseNo": contract_details.get("case_no") or None,
                "caseDate": parse_date(contract_details.get("case_date")),
                "court": contract_details.get("court") or None,
                "applicant": contract_details.get("applicant") or None,
                "petitioner": contract_details.get("petitioner") or None,
                "respondent": contract_details.get("respondent") or None,
                "plaintiff": contract_details.get("plaintiff") or None,
                "defendant": contract_details.get("defendant") or None,
                "advocateName": contract_details.get("advocate_name") or None,
                "judicature": contract_details.get("judicature") or None,
                "coram": contract_details.get("coram") or None,
            })
        
        # Build SQL update query
        # Prisma uses camelCase field names directly as column names in PostgreSQL
        # When using quoted identifiers, PostgreSQL preserves case
        set_clauses = []
        values = []
        param_index = 1
        
        # Log date fields for debugging
        date_fields = ["date", "registrationDate", "landDocumentDate", "applicationDate", 
                      "approvalDate", "expiryDate", "drawingDate", "caseDate"]
        for date_field in date_fields:
            if date_field in update_data:
                LOGGER.info(f"Date field '{date_field}': {update_data[date_field]} (type: {type(update_data[date_field])})")
        
        for key, value in update_data.items():
            if value is not None:
                # Use the Prisma field name directly (camelCase) with quoted identifier
                # This matches what Prisma generates in the database
                set_clauses.append(f'"{key}" = ${param_index}')
                values.append(value)
                param_index += 1
        
        if set_clauses:
            query = f'''
                UPDATE documents
                SET {", ".join(set_clauses)}
                WHERE id = ${param_index}
            '''
            values.append(document_id)
            
            LOGGER.info(f"Executing update query with {len(set_clauses)} fields for document {document_id}")
            LOGGER.debug(f"Query: {query}")
            LOGGER.debug(f"Values count: {len(values)}")
        
        # Acquire pool once and reuse the same connection for all database operations
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Execute main update query
            if set_clauses:
                await conn.execute(query, *values)
                LOGGER.info(f"Successfully updated document {document_id} in database")
            
            # Create document summary if available
            contract_summary = response_from_ai.get("contract_summary")
            if contract_summary:
                summary_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO document_summaries (id, "documentId", summary, "isActive", "createdAt", "updatedAt")
                    VALUES ($1, $2, $3, $4, NOW(), NOW())
                """, summary_id, document_id, contract_summary, True)
                
                # Generate embedding for the summary
                try:
                    from utils.embeddings import _call_gemini_embed_content
                    
                    summary_result = await _call_gemini_embed_content(
                        model_name="gemini-embedding-001",
                        content=contract_summary,
                        task_type="retrieval_document",
                        output_dimensionality=256
                    )
                    summary_embedding = "[" + ",".join(map(str, summary_result["embedding"])) + "]"
                    
                    # Update the summary with its embedding
                    await conn.execute("""
                        UPDATE document_summaries
                        SET "embedding_256d" = $1::vector(256),
                            "embedding_model" = $2,
                            "updatedAt" = NOW()
                        WHERE id = $3
                    """, summary_embedding, "gemini-embedding-001", summary_id)
                    
                    LOGGER.info(f"Generated and stored embedding for document summary {summary_id}")
                except Exception as embedding_error:
                    # Non-critical error, log but don't fail the upload
                    LOGGER.warning(f"Failed to generate embedding for summary: {embedding_error}")

            
            # Track token usage
            if total_input_tokens > 0 or total_output_tokens > 0:
                await conn.execute("""
                    INSERT INTO token_usage (id, "userId", "inputTokens", "outputTokens", "endpointType", "createdAt", "updatedAt")
                    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                """, str(uuid.uuid4()), user_id, total_input_tokens, total_output_tokens, "document-upload")
        
        LOGGER.info(f"Successfully wrote document data to database for document: {document_id}")
        
    except Exception as e:
        error_msg = "Database write operation failed"
        LOGGER.error(f"[DB_WRITE] {error_msg} for document {document_id}")
        raise Exception(error_msg) from e


@celery_app.task(
    bind=True,
    name="tasks.process_document_pipeline",
    max_retries=0  # No retries at pipeline level - each step handles its own retries
)
def process_document_pipeline(
    self: Task,
    document_id: str,
    document_url: str,
    user_name: str,
    original_file_name: str,
    user_id: str
) -> Dict[str, Any]:
    """
    Main orchestration task that runs all three processing steps sequentially.
    Updates task state for WebSocket streaming.
    Each step has its own retry logic with max 3 retries.
    If any step fails after all retries, the document is deleted and the task fails.
    """
    try:
        # Update task state: Starting extraction
        meta = {"step": 1, "message": "Extracting document information..."}
        self.update_state(
            state="PROCESSING",
            meta=meta
        )
        # Store in Redis for stateless WebSocket
        set_task_state_in_redis(self.request.id, "PROCESSING", meta)
        
        # Step 1: Extract document info (call implementation directly with retry logic)
        extraction_result = None
        extraction_attempt = 0
        while extraction_attempt <= MAX_RETRIES:
            attempt_number = extraction_attempt + 1
            LOGGER.info(f"[PIPELINE] Step 1 - Extraction attempt {attempt_number}/{MAX_RETRIES + 1}")
            
            try:
                extraction_result = _extract_document_info_impl(document_url, user_name)
                if extraction_attempt > 0:
                    LOGGER.info(f"[PIPELINE] Step 1 - Extraction succeeded on attempt {attempt_number} after {extraction_attempt} retries")
                else:
                    LOGGER.info(f"[PIPELINE] Step 1 - Extraction succeeded on first attempt")
                break
            except Exception as e:
                extraction_attempt += 1
                error_msg = "Document extraction failed"
                LOGGER.warning(f"[PIPELINE] Step 1 - Extraction attempt {attempt_number}/{MAX_RETRIES + 1} failed: {error_msg}")
                
                if extraction_attempt <= MAX_RETRIES:
                    backoff_time = min(2 ** extraction_attempt, 60)
                    LOGGER.info(f"[PIPELINE] Step 1 - Retrying extraction in {backoff_time}s (attempt {extraction_attempt + 1}/{MAX_RETRIES + 1})")
                    time.sleep(backoff_time)
                else:
                    LOGGER.error(f"[PIPELINE] Step 1 - All extraction attempts ({MAX_RETRIES + 1}) failed")
                    raise Exception(error_msg)
        
        if not extraction_result or not extraction_result.get("success"):
            raise Exception("Document extraction returned unsuccessful result")
        
        content = extraction_result["content"]
        response_from_ai = extraction_result["response_from_ai"]
        extract_token_usage = extraction_result["token_usage"]
        
        # Update task state: Starting classification
        meta = {"step": 2, "message": "Classifying document..."}
        self.update_state(
            state="PROCESSING",
            meta=meta
        )
        # Store in Redis for stateless WebSocket
        set_task_state_in_redis(self.request.id, "PROCESSING", meta)
        
        # Step 2: Classify document (call implementation directly with retry logic)
        contract_details = response_from_ai.get("contract_details", {})
        classification_result = None
        classification_attempt = 0
        while classification_attempt <= MAX_RETRIES:
            attempt_number = classification_attempt + 1
            LOGGER.info(f"[PIPELINE] Step 2 - Classification attempt {attempt_number}/{MAX_RETRIES + 1}")
            
            try:
                classification_result = _classify_document_impl(
                    contract_details.get("title") or original_file_name,
                    contract_details.get("type") or "CONTRACT",
                    contract_details.get("promisor") or "",
                    contract_details.get("promisee") or "",
                    content or "",
                    float(contract_details.get("value") or 0)
                )
                if classification_attempt > 0:
                    LOGGER.info(f"[PIPELINE] Step 2 - Classification succeeded on attempt {attempt_number} after {classification_attempt} retries")
                else:
                    LOGGER.info(f"[PIPELINE] Step 2 - Classification succeeded on first attempt")
                break
            except Exception as e:
                classification_attempt += 1
                error_msg = "Document classification failed"
                LOGGER.warning(f"[PIPELINE] Step 2 - Classification attempt {attempt_number}/{MAX_RETRIES + 1} failed: {error_msg}")
                
                if classification_attempt <= MAX_RETRIES:
                    backoff_time = min(2 ** classification_attempt, 60)
                    LOGGER.info(f"[PIPELINE] Step 2 - Retrying classification in {backoff_time}s (attempt {classification_attempt + 1}/{MAX_RETRIES + 1})")
                    time.sleep(backoff_time)
                else:
                    LOGGER.error(f"[PIPELINE] Step 2 - All classification attempts ({MAX_RETRIES + 1}) failed")
                    raise Exception(error_msg)
        
        document_category = classification_result.get("category", "Miscellaneous")
        document_sub_category = classification_result.get("subCategory", "General Contract")
        category_confidence = classification_result.get("confidence", 0.5)
        classify_token_usage = classification_result.get("token_usage", {})
        
        # Update task state: Starting embedding generation
        meta = {"step": 3, "message": "Generating embeddings..."}
        self.update_state(
            state="PROCESSING",
            meta=meta
        )
        # Store in Redis for stateless WebSocket
        set_task_state_in_redis(self.request.id, "PROCESSING", meta)
        
        # Step 3: Generate embeddings (if content is sufficient) - call implementation directly with retry logic
        embedding_result = None
        if content and len(content.strip()) > 100:
            embedding_attempt = 0
            while embedding_attempt <= MAX_RETRIES:
                attempt_number = embedding_attempt + 1
                LOGGER.info(f"[PIPELINE] Step 3 - Embedding generation attempt {attempt_number}/{MAX_RETRIES + 1}")
                
                try:
                    embedding_result = _generate_embedding_impl(
                        document_id,
                        content,
                        {
                            "title": contract_details.get("title") or original_file_name,
                            "type": contract_details.get("type") or "document",
                            "user_id": user_id,
                            "embedding_strategy": "full_content",
                            "category": document_category,
                            "subCategory": document_sub_category,
                            "category_confidence": category_confidence,
                        }
                    )
                    if embedding_attempt > 0:
                        LOGGER.info(f"[PIPELINE] Step 3 - Embedding generation succeeded on attempt {attempt_number} after {embedding_attempt} retries")
                    else:
                        LOGGER.info(f"[PIPELINE] Step 3 - Embedding generation succeeded on first attempt")
                    break
                except Exception as e:
                    embedding_attempt += 1
                    error_msg = "Embedding generation failed"
                    LOGGER.warning(f"[PIPELINE] Step 3 - Embedding generation attempt {attempt_number}/{MAX_RETRIES + 1} failed: {error_msg}")
                    
                    if embedding_attempt <= MAX_RETRIES:
                        backoff_time = min(2 ** embedding_attempt, 60)
                        LOGGER.info(f"[PIPELINE] Step 3 - Retrying embedding generation in {backoff_time}s (attempt {embedding_attempt + 1}/{MAX_RETRIES + 1})")
                        time.sleep(backoff_time)
                    else:
                        LOGGER.warning(f"[PIPELINE] Step 3 - All embedding generation attempts ({MAX_RETRIES + 1}) failed. Continuing without embeddings (non-critical)")
                        # Don't raise for embeddings - it's not critical
                        embedding_result = None
        else:
            # Still update step even if embeddings are skipped
            meta = {"step": 3, "message": "Skipping embeddings (insufficient content)..."}
            self.update_state(
                state="PROCESSING",
                meta=meta
            )
            # Store in Redis for stateless WebSocket
            set_task_state_in_redis(self.request.id, "PROCESSING", meta)
        
        # Calculate total token usage
        total_input_tokens = (
            extract_token_usage.get("input_tokens", 0) +
            classify_token_usage.get("input_tokens", 0)
        )
        total_output_tokens = (
            extract_token_usage.get("output_tokens", 0) +
            classify_token_usage.get("output_tokens", 0)
        )
        
        # Update task state: Writing to database
        meta = {"step": 4, "message": "Saving document data..."}
        self.update_state(
            state="PROCESSING",
            meta=meta
        )
        # Store in Redis for stateless WebSocket
        set_task_state_in_redis(self.request.id, "PROCESSING", meta)
        
        # Write to database using asyncpg (with retry logic)
        # Create one event loop for all retry attempts to reuse the connection pool
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        db_write_attempt = 0
        try:
            while db_write_attempt <= MAX_RETRIES:
                attempt_number = db_write_attempt + 1
                LOGGER.info(f"[PIPELINE] Step 4 - Database write attempt {attempt_number}/{MAX_RETRIES + 1}")
                
                try:
                    loop.run_until_complete(
                        write_document_to_db(
                            document_id=document_id,
                            content=content,
                            response_from_ai=response_from_ai,
                            document_category=document_category,
                            document_sub_category=document_sub_category,
                            category_confidence=category_confidence,
                            total_input_tokens=total_input_tokens,
                            total_output_tokens=total_output_tokens,
                            user_id=user_id
                        )
                    )
                    if db_write_attempt > 0:
                        LOGGER.info(f"[PIPELINE] Step 4 - Database write succeeded on attempt {attempt_number} after {db_write_attempt} retries")
                    else:
                        LOGGER.info(f"[PIPELINE] Step 4 - Database write succeeded on first attempt")
                    break
                except Exception as e:
                    db_write_attempt += 1
                    error_msg = "Database write operation failed"
                    LOGGER.warning(f"[PIPELINE] Step 4 - Database write attempt {attempt_number}/{MAX_RETRIES + 1} failed: {error_msg}")
                    
                    if db_write_attempt <= MAX_RETRIES:
                        backoff_time = min(2 ** db_write_attempt, 60)
                        LOGGER.info(f"[PIPELINE] Step 4 - Retrying database write in {backoff_time}s (attempt {db_write_attempt + 1}/{MAX_RETRIES + 1})")
                        time.sleep(backoff_time)
                    else:
                        LOGGER.error(f"[PIPELINE] Step 4 - All database write attempts ({MAX_RETRIES + 1}) failed")
                        raise Exception(error_msg)
        finally:
            # Clean up the pool for this loop before closing
            try:
                from database import close_pool
                loop_id = id(loop)
                loop.run_until_complete(close_pool(loop_id))
            except Exception as e:
                LOGGER.warning(f"Error closing database pool: {e}")
            finally:
                loop.close()
        
        # Update task state: Completed
        meta = {"step": 5, "message": "Finalizing..."}
        self.update_state(
            state="PROCESSING",
            meta=meta
        )
        # Store in Redis for stateless WebSocket
        set_task_state_in_redis(self.request.id, "PROCESSING", meta)
        
        # Small delay to ensure step 5 is sent before SUCCESS state
        time.sleep(0.5)
        
        # Prepare result data
        result_data = {
            "success": True,
            "document_id": document_id,
            "documentId": document_id,  # Also include camelCase for frontend compatibility
            "content": content,
            "response_from_ai": response_from_ai,
            "classification": {
                "category": document_category,
                "subCategory": document_sub_category,
                "confidence": category_confidence,
            },
            "embedding": embedding_result,
            "token_usage": {
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
            }
        }
        
        LOGGER.info(f"[PIPELINE] Task completed successfully for document {document_id}")
        
        # Store SUCCESS state in Redis with result data
        success_meta = {"step": 7, "message": "Successfully Uploaded"}
        set_task_state_in_redis(self.request.id, "SUCCESS", success_meta, result_data)
        
        # Return the result - Celery will automatically set state to SUCCESS
        # The WebSocket endpoint will read this from result.result
        return result_data
    except Exception as e:
        error_msg = "Document processing pipeline failed after all retries"
        LOGGER.error(f"[PIPELINE] {error_msg} for document {document_id}")
        
        # Delete the document and update state to failure
        LOGGER.error(f"[PIPELINE] Deleting document {document_id} from database due to processing failure")
        run_async_in_new_loop(delete_document_from_db(document_id))
        
        failure_meta = {"error": error_msg, "message": "Document processing failed after all retries"}
        self.update_state(
            state="FAILURE",
            meta=failure_meta
        )
        # Store FAILURE state in Redis
        set_task_state_in_redis(self.request.id, "FAILURE", failure_meta)
        raise Exception(error_msg) from e

