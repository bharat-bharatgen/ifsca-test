import io
import json
import logging
import os
import re
import asyncio
from typing import Dict, Any, Tuple, Optional

from google import genai
from google.genai import types
import google.generativeai as ggenai
import imghdr
import requests
from dotenv import load_dotenv
from fastapi import HTTPException

from utils.prompts import PROMPTS
from utils.document_processor import compress_file_if_needed
from utils.retry_utils import retry_with_backoff
from utils.llm_client import get_llm_client, LLMClient
from utils.langfuse_client import observe, update_current_span


def _transform_stream_output(items):
    """Transform streamed items to a single string output for Langfuse."""
    text_parts = []
    for item in items:
        if isinstance(item, dict) and item.get("type") == "content":
            text_parts.append(item.get("text", ""))
    return "".join(text_parts) if text_parts else "No content generated"

LOGGER = logging.getLogger(__name__)

load_dotenv()

# Initialize Gemini client
gemini_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
ggenai.configure(api_key=os.getenv("GOOGLE_API_KEY"), transport="rest")

# Maximum number of characters to include from each mentioned document's text
MAX_MENTIONED_DOC_TEXT_LENGTH = 5000  # Reduced for faster processing

# Gemini model name - using Gemini 3 Flash with minimal thinking
GEMINI_MODEL_NAME = "gemini-3-flash-preview"


# Cache for configurable chat client (Gemini or selfhost)
_chat_llm_client: Optional[LLMClient] = None


def get_chat_client() -> LLMClient:
    """Get the LLM client for non-streaming chat tasks in this module."""
    global _chat_llm_client
    if _chat_llm_client is None:
        _chat_llm_client = get_llm_client()
    return _chat_llm_client


def _llm_mode() -> str:
    """Primary switch: LLM=selfhost|gemini."""
    return (os.getenv("LLM", "gemini") or "gemini").strip().lower()


def _is_greeting(text: str) -> bool:
    if not text:
        return False
    t = text.strip().lower()
    return (
        re.fullmatch(r"\b(hi|hello|hey|good\s*(morning|afternoon|evening))\b[!.]*", t)
        is not None
    )


def _is_thanks(text: str) -> bool:
    if not text:
        return False
    t = text.strip().lower()
    return (
        re.fullmatch(r"\b(thank\s*you|thanks|thx|ty|thank\s*u)\b[!.]*", t) is not None
    )


def _has_non_ascii_chars(text: str) -> bool:
    """
    Quick heuristic check: if text contains mostly ASCII characters,
    it's likely English. Non-ASCII suggests other languages.
    Returns True if text has significant non-ASCII content.
    """
    if not text:
        return False

    # Count non-ASCII characters
    non_ascii_count = sum(1 for char in text if ord(char) > 127)
    total_chars = len(text)

    if total_chars == 0:
        return False

    # If more than 30% non-ASCII, likely not English
    non_ascii_ratio = non_ascii_count / total_chars
    return non_ascii_ratio > 0.3


def _sample_text_for_detection(text: str, max_length: int = 2000) -> str:
    """
    Sample text for language detection. For longer texts, samples from
    beginning, middle, and end to get better coverage.
    Returns sampled text string.
    """
    text = text.strip()
    text_len = len(text)

    if text_len <= max_length:
        return text

    # For longer texts, sample from beginning, middle, and end
    sample_size = max_length // 3
    beginning = text[:sample_size]
    middle_start = text_len // 2 - sample_size // 2
    middle = text[middle_start : middle_start + sample_size]
    end = text[-sample_size:]

    return f"{beginning}\n...\n{middle}\n...\n{end}"


def _is_english(text: str) -> Tuple[bool, int, int]:
    """
    Detect if the text is primarily in English using lightweight checks first,
    then the configured LLM provider if needed.
    Returns tuple: (is_english, input_tokens, output_tokens)
    """
    if not text or len(text.strip()) < 10:
        # Very short text, assume English
        return True, 0, 0

    # Quick heuristic check: if mostly ASCII, likely English
    # This avoids API calls for clearly English text
    if not _has_non_ascii_chars(text):
        LOGGER.debug("Text appears to be English (ASCII check), skipping API call")
        return True, 0, 0

    # Text has significant non-ASCII, use API for accurate detection
    try:
        sampled_text = _sample_text_for_detection(text, max_length=2000)

        detection_prompt = f"""Analyze the following text and determine if it is written in English.

Text: {sampled_text}

Respond with ONLY "yes" if the text is primarily in English, or "no" if it is in another language.
Do not include any explanation, just "yes" or "no"."""

        # Use configurable LLM client
        result, input_tokens, output_tokens = _call_llm_for_language_detection(detection_prompt)

        is_english_result = result.strip().lower().startswith("yes")

        return is_english_result, input_tokens, output_tokens
    except Exception as e:
        LOGGER.warning(f"Language detection failed: {e}, assuming English")
        # On error, assume English to avoid unnecessary translation
        return True, 0, 0


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_gemini_for_language_detection(detection_prompt: str) -> Any:
    """
    Helper function to call Gemini API for language detection with retry logic.
    (Used when provider is GEMINI)
    """
    model = ggenai.GenerativeModel(GEMINI_MODEL_NAME)
    response = model.generate_content(
        detection_prompt,
        generation_config={
            "temperature": 0.1,
            "max_output_tokens": 10,
        },
    )
    response.resolve()
    return response


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_gemini_for_translation(translation_prompt: str) -> Any:
    """
    Helper function to call Gemini API for translation with retry logic.
    (Used when provider is GEMINI)
    """
    model = ggenai.GenerativeModel(GEMINI_MODEL_NAME)
    response = model.generate_content(
        translation_prompt,
        generation_config={
            "temperature": 0.2,
            "max_output_tokens": 8192,
        },
    )
    response.resolve()
    return response


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_gemini_for_chat(prompt_parts: list, generation_config: dict) -> Any:
    """
    Helper function to call Gemini API for chat with retry logic.
    (Used when provider is GEMINI)
    """
    model = ggenai.GenerativeModel(
        GEMINI_MODEL_NAME, generation_config=generation_config
    )
    response = model.generate_content(contents=prompt_parts)
    response.resolve()
    return response


# ============ Configurable LLM Functions (uses DB/env config) ============

@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_llm_for_language_detection(detection_prompt: str) -> Tuple[str, int, int]:
    """
    Helper function to call configured LLM for language detection.
    Works with both Gemini and OpenAI-compatible APIs.
    Returns: (response_text, input_tokens, output_tokens)
    """
    client = get_chat_client()
    return client.chat_completion(detection_prompt, temperature=0.1, max_tokens=10)


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_llm_for_translation(translation_prompt: str) -> Tuple[str, int, int]:
    """
    Helper function to call configured LLM for translation.
    Works with both Gemini and OpenAI-compatible APIs.
    Returns: (response_text, input_tokens, output_tokens)
    """
    client = get_chat_client()
    return client.chat_completion(translation_prompt, temperature=0.2, max_tokens=8192)


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_llm_for_chat(prompt: str, generation_config: dict) -> Tuple[str, int, int]:
    """
    Helper function to call configured LLM for chat.
    Works with both Gemini and OpenAI-compatible APIs.
    Returns: (response_text, input_tokens, output_tokens)
    """
    client = get_chat_client()
    return client.chat_completion(
        prompt,
        temperature=generation_config.get("temperature", 0.3),
        max_tokens=generation_config.get("max_output_tokens", 8192),
    )


def _translate_to_english(text: str) -> Tuple[str, int, int]:
    """
    Translate text to English using the configured LLM provider.
    Returns tuple: (translated_text, input_tokens, output_tokens)
    """
    if not text:
        return text, 0, 0

    try:
        translation_prompt = f"""Translate the following text to English. 
Preserve the meaning, tone, and formatting (including markdown if present).
Do not add any explanations or notes, just provide the translated text.

Text to translate:
{text}"""

        # Use configurable LLM client
        translated, trans_input_tokens, trans_output_tokens = _call_llm_for_translation(translation_prompt)

        if not translated:
            LOGGER.warning("Translation returned empty, using original text")
            return text, 0, 0

        return translated, trans_input_tokens, trans_output_tokens
    except Exception as e:
        LOGGER.error(f"Translation failed: {e}, returning original text")
        return text, 0, 0


@observe(name="chat_with_specific_document")
def chat_with_specific_document(
    document_id: str,
    document_text: str,
    metadata: Dict,
    query: str,
    document_url: str = None,
    previous_chats: str = "",
    mentioned_documents: list = None,
) -> Dict[str, Any]:
    """
    Chat with a specific document using Gemini, guided by chat_with_document prompt.
    - Uses inline file upload when document_url is provided (PDF/images supported).
    - Ignores previous history by design (prompt rules are stateless for clarity).
    - Supports @ mentions: if mentioned_documents is provided, includes their context in the prompt.
    """
    try:
        mode = _llm_mode()
        generation_config = {
            "temperature": 0.3,
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 8192,
        }

        # Gemini-only model (selfhost uses LLMClient below)
        model = None
        if mode != "selfhost":
            model = ggenai.GenerativeModel(
                GEMINI_MODEL_NAME, generation_config=generation_config
            )

        safe_metadata = metadata or {}
        mentioned_docs = mentioned_documents or []

        # Build mentioned documents context
        mentioned_context = ""
        if mentioned_docs:
            mentioned_parts = []
            for i, mentioned_doc in enumerate(mentioned_docs, 1):
                doc_title = (
                    mentioned_doc.get("title")
                    or mentioned_doc.get("metadata", {}).get("title")
                    or f"Document {i}"
                )
                doc_text = mentioned_doc.get("document_text", "")[
                    :MAX_MENTIONED_DOC_TEXT_LENGTH
                ]
                doc_metadata = json.dumps(
                    mentioned_doc.get("metadata", {}), indent=2, ensure_ascii=False
                )
                mentioned_parts.append(
                    f"--- Mentioned Document {i}: {doc_title} ---\n"
                    f"Document Text:\n{doc_text}\n\n"
                    f"Document Metadata:\n{doc_metadata}\n"
                )
            if mentioned_parts:
                mentioned_context = "\n\n" + "=" * 80 + "\n"
                mentioned_context += "ADDITIONAL CONTEXT: The user has mentioned the following documents in their query:\n"
                mentioned_context += "=" * 80 + "\n\n"
                mentioned_context += "\n".join(mentioned_parts)

        prompt = PROMPTS.get_prompt("chat_with_document").format(
            query=query,
            document_text=document_text,
            metadata=json.dumps(safe_metadata, indent=2, ensure_ascii=False),
            title=(safe_metadata.get("title") or "this document"),
            mentioned_context=mentioned_context,
            previous_chats=previous_chats or "No previous conversation.",
        )

        prompt_parts = [prompt]

        if document_url and mode != "selfhost":
            try:
                resp = requests.get(document_url)
                resp.raise_for_status()
                file_content = resp.content

                is_pdf = file_content.startswith(b"%PDF")
                img_type = imghdr.what(None, h=file_content)
                is_image = img_type is not None

                if is_pdf:
                    mime_type = "application/pdf"
                elif is_image:
                    mime_type = f"image/{img_type}"
                else:
                    raise ValueError("Unsupported file type")

                file_content = compress_file_if_needed(file_content, mime_type)
                uploaded = genai.upload_file(
                    io.BytesIO(file_content), mime_type=mime_type
                )
                prompt_parts.append(uploaded)
            except Exception as e:
                LOGGER.warning(f"Could not attach document file to prompt: {e}")

        if mode == "selfhost":
            # Selfhost path: rely on prompt text (no file uploads).
            text, input_tokens, output_tokens = _call_llm_for_chat(
                prompt, generation_config
            )
            if not text:
                return {
                    "text": "I apologize, but I couldn't analyze your question. Please try rephrasing it.",
                    "input_tokens": 0,
                    "output_tokens": 0,
                }
        else:
            response = _call_gemini_for_chat(prompt_parts, generation_config)

            text = (response.text or "").strip()
            if not text:
                return "I apologize, but I couldn't analyze your question. Please try rephrasing it."

            # Extract token usage from response
            usage_metadata = (
                response.usage_metadata if hasattr(response, "usage_metadata") else None
            )
            input_tokens = usage_metadata.prompt_token_count if usage_metadata else 0
            output_tokens = usage_metadata.candidates_token_count if usage_metadata else 0

        # Check if response is in English, translate if not
        is_english_result, detect_input_tokens, detect_output_tokens = _is_english(text)

        # Add language detection tokens to total token usage
        input_tokens += detect_input_tokens
        output_tokens += detect_output_tokens

        if not is_english_result:
            LOGGER.info("Response is not in English, translating to English...")
            translated_text, trans_input_tokens, trans_output_tokens = (
                _translate_to_english(text)
            )

            # Add translation tokens to total token usage
            input_tokens += trans_input_tokens
            output_tokens += trans_output_tokens

            text = translated_text
            LOGGER.info(
                f"Translation completed (added {trans_input_tokens} input, {trans_output_tokens} output tokens)"
            )

        # Return text and token usage as a dict
        return {
            "text": text,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    except Exception as e:
        LOGGER.error(f"Document chat processing error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@observe(name="stream_chat_with_specific_document", transform_to_string=_transform_stream_output)
async def stream_chat_with_specific_document(
    document_id: str,
    document_text: str,
    metadata: Dict,
    query: str,
    document_url: str = None,
    previous_chats: str = "",
    mentioned_documents: list = None,
):
    """
    Async Generator function that streams status updates and content chunks.
    Yields dicts with keys: 'type' (status/content/token_usage) and payload.
    """
    try:
        mode = _llm_mode()
        yield {"type": "status", "message": "Preparing document analysis..."}

        generation_config = {
            "temperature": 0.3,
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 8192,
        }

        # Gemini-only model (selfhost uses LLMClient streaming)
        model = None
        if mode != "selfhost":
            model = ggenai.GenerativeModel(
                GEMINI_MODEL_NAME, generation_config=generation_config
            )

        safe_metadata = metadata or {}
        mentioned_docs = mentioned_documents or []

        yield {"type": "status", "message": "Processing document context..."}

        # Build mentioned documents context
        mentioned_context = ""
        if mentioned_docs:
            yield {"type": "status", "message": f"Including {len(mentioned_docs)} mentioned document(s)..."}
            mentioned_parts = []
            for i, mentioned_doc in enumerate(mentioned_docs, 1):
                doc_title = (
                    mentioned_doc.get("title")
                    or mentioned_doc.get("metadata", {}).get("title")
                    or f"Document {i}"
                )
                doc_text = mentioned_doc.get("document_text", "")[
                    :MAX_MENTIONED_DOC_TEXT_LENGTH
                ]
                doc_metadata = json.dumps(
                    mentioned_doc.get("metadata", {}), indent=2, ensure_ascii=False
                )
                mentioned_parts.append(
                    f"--- Mentioned Document {i}: {doc_title} ---\n"
                    f"Document Text:\n{doc_text}\n\n"
                    f"Document Metadata:\n{doc_metadata}\n"
                )
            if mentioned_parts:
                mentioned_context = "\n\n" + "=" * 80 + "\n"
                mentioned_context += "ADDITIONAL CONTEXT: The user has mentioned the following documents in their query:\n"
                mentioned_context += "=" * 80 + "\n\n"
                mentioned_context += "\n".join(mentioned_parts)

        yield {"type": "status", "message": "Building AI prompt..."}

        prompt = PROMPTS.get_prompt("chat_with_document").format(
            query=query,
            document_text=document_text,
            metadata=json.dumps(safe_metadata, indent=2, ensure_ascii=False),
            title=(safe_metadata.get("title") or "this document"),
            mentioned_context=mentioned_context,
            previous_chats=previous_chats or "No previous conversation.",
        )

        prompt_parts = [prompt]

        if document_url and mode != "selfhost":
            yield {"type": "status", "message": "Downloading referenced file..."}
            try:
                # Run blocking requests.get in a thread
                resp = await asyncio.to_thread(requests.get, document_url, timeout=30)
                resp.raise_for_status()
                file_content = resp.content

                is_pdf = file_content.startswith(b"%PDF")
                img_type = imghdr.what(None, h=file_content)
                is_image = img_type is not None

                if is_pdf:
                    mime_type = "application/pdf"
                elif is_image:
                    mime_type = f"image/{img_type}"
                else:
                    raise ValueError("Unsupported file type")

                file_content = compress_file_if_needed(file_content, mime_type)
                # Upload in thread to not block event loop
                uploaded = await asyncio.to_thread(
                    genai.upload_file, io.BytesIO(file_content), mime_type=mime_type
                )
                prompt_parts.append(uploaded)
            except Exception as e:
                LOGGER.warning(f"Could not attach document file to prompt: {e}")

        yield {"type": "status", "message": "Generating response..."}

        input_tokens = 0
        output_tokens = 0
        chunk_count = 0
        full_response_text = ""

        if mode == "selfhost":
            llm_client = get_chat_client()
            async for item in llm_client.stream_chat_completion(
                prompt, **generation_config
            ):
                if item["type"] == "content":
                    chunk_count += 1
                    full_response_text += item["text"]
                    yield {"type": "content", "text": item["text"]}
                    await asyncio.sleep(0)
                elif item["type"] == "token_usage":
                    input_tokens = item.get("input_tokens", 0)
                    output_tokens = item.get("output_tokens", 0)
        else:
            # Stream response asynchronously (Gemini)
            response = await model.generate_content_async(prompt_parts, stream=True)

            async for chunk in response:
                # Track tokens if available (Gemini 1.5/pro often provides this in chunks or at end)
                if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
                    input_tokens = chunk.usage_metadata.prompt_token_count or input_tokens
                    output_tokens = (
                        chunk.usage_metadata.candidates_token_count or output_tokens
                    )

                if chunk.text:
                    chunk_count += 1
                    full_response_text += chunk.text
                    yield {"type": "content", "text": chunk.text}
                    # Ensure chunk is flushed immediately for real-time streaming
                    await asyncio.sleep(0)

        LOGGER.info(f"✅ Streamed {chunk_count} chunks for document chat")

        # Always append sources when a document was used (compulsory at bottom for every response)
        try:
            doc_url = document_url or (metadata or {}).get("documentUrl")
            doc_title = (metadata or {}).get("title") or "Document"
            source_docs = [{"id": document_id, "url": doc_url or "", "label": doc_title}]
            sources_block = (
                "\n\n---\n\nSources:\n__SOURCE_DOCS__: "
                + json.dumps(source_docs, ensure_ascii=False)
                + "\n"
            )
            yield {"type": "content", "text": sources_block}
        except Exception as e:
            LOGGER.warning(f"Failed to append source docs for document chat: {e}")

        # Yield final token usage
        yield {
            "type": "token_usage",
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    except Exception as e:
        LOGGER.error(
            f"Streaming document chat processing error: {str(e)}", exc_info=True
        )
        yield {"type": "error", "message": str(e)}


@observe(name="chat_with_multiple_documents")
def chat_with_multiple_documents(
    documents: list[Dict[str, Any]],
    query: str,
    previous_chats: str = "",
) -> Dict[str, Any]:
    """
    Chat with multiple documents (up to 3) using Gemini, guided by chat_with_multiple_documents prompt.

    Each document in the list should have:
    - document_id: str - Unique identifier for the document
    - document_text: str - The full OCR/extracted text
    - metadata: Dict - Document metadata (title, date, type, etc.)
    - document_url: str (optional) - URL to the original file (PDF/image)

    Returns:
    - Dict with 'text', 'input_tokens', and 'output_tokens'
    """
    try:
        mode = _llm_mode()
        # Limit to 3 documents
        if len(documents) > 3:
            LOGGER.warning(f"Received {len(documents)} documents, limiting to 3")
            documents = documents[:3]

        if not documents:
            return {
                "text": "No documents provided. Please provide at least one document to analyze.",
                "input_tokens": 0,
                "output_tokens": 0,
            }

        generation_config = {
            "temperature": 0.3,
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 8192,
        }

        model = None
        if mode != "selfhost":
            model = ggenai.GenerativeModel(
                GEMINI_MODEL_NAME, generation_config=generation_config
            )

        # Build context for all documents
        documents_context_parts = []
        uploaded_files = []

        for i, doc in enumerate(documents, 1):
            doc_id = doc.get("document_id", f"doc_{i}")
            doc_text = doc.get("document_text", "")
            doc_metadata = doc.get("metadata", {})
            doc_url = doc.get("document_url")
            doc_title = doc_metadata.get("title") or f"Untitled Document {i}"

            # Build document section - use title instead of numbered reference
            doc_section = f"""
{"=" * 80}
{doc_title}
{"=" * 80}

Document Text:
{doc_text[: MAX_MENTIONED_DOC_TEXT_LENGTH * 2]}

Document Metadata:
{json.dumps(doc_metadata, indent=2, ensure_ascii=False)}
"""
            documents_context_parts.append(doc_section)

            # Try to upload the actual file if URL is provided
            if doc_url and mode != "selfhost":
                try:
                    resp = requests.get(doc_url)
                    resp.raise_for_status()
                    file_content = resp.content

                    is_pdf = file_content.startswith(b"%PDF")
                    img_type = imghdr.what(None, h=file_content)
                    is_image = img_type is not None

                    if is_pdf:
                        mime_type = "application/pdf"
                    elif is_image:
                        mime_type = f"image/{img_type}"
                    else:
                        raise ValueError("Unsupported file type")

                    file_content = compress_file_if_needed(file_content, mime_type)
                    uploaded = genai.upload_file(
                        io.BytesIO(file_content), mime_type=mime_type
                    )
                    uploaded_files.append((i, doc_title, uploaded))
                except Exception as e:
                    LOGGER.warning(f"Could not attach document {i} file to prompt: {e}")

        documents_context = "\n".join(documents_context_parts)

        prompt = PROMPTS.get_prompt("chat_with_multiple_documents").format(
            query=query,
            documents_context=documents_context,
            previous_chats=previous_chats or "No previous conversation.",
        )

        # If prompt template not found, use a fallback
        if not prompt or prompt == query:
            prompt = f"""You are OutRiskAI's legal document assistant.
Analyze the following documents and answer the user's query precisely.

Previous conversation:
{previous_chats or "No previous conversation."}

User Query: {query}

{documents_context}

Instructions:
- Answer only what's asked
- Be concise, use clear markdown
- Always specify which document you're referring to when citing information
- Compare and contrast information across documents when relevant
"""

        prompt_parts = [prompt]

        # Add uploaded files to prompt
        for doc_num, doc_title, uploaded_file in uploaded_files:
            prompt_parts.append(
                f"\n[Attached file for Document {doc_num}: {doc_title}]"
            )
            prompt_parts.append(uploaded_file)

        if mode == "selfhost":
            text, input_tokens, output_tokens = _call_llm_for_chat(prompt, generation_config)
            if not text:
                return {
                    "text": "I apologize, but I couldn't analyze your question. Please try rephrasing it.",
                    "input_tokens": 0,
                    "output_tokens": 0,
                }
        else:
            response = _call_gemini_for_chat(prompt_parts, generation_config)

            text = (response.text or "").strip()
            if not text:
                return {
                    "text": "I apologize, but I couldn't analyze your question. Please try rephrasing it.",
                    "input_tokens": 0,
                    "output_tokens": 0,
                }

            # Extract token usage from response
            usage_metadata = (
                response.usage_metadata if hasattr(response, "usage_metadata") else None
            )
            input_tokens = usage_metadata.prompt_token_count if usage_metadata else 0
            output_tokens = usage_metadata.candidates_token_count if usage_metadata else 0

        # Check if response is in English, translate if not
        is_english_result, detect_input_tokens, detect_output_tokens = _is_english(text)

        # Add language detection tokens to total token usage
        input_tokens += detect_input_tokens
        output_tokens += detect_output_tokens

        if not is_english_result:
            LOGGER.info("Response is not in English, translating to English...")
            translated_text, trans_input_tokens, trans_output_tokens = (
                _translate_to_english(text)
            )

            # Add translation tokens to total token usage
            input_tokens += trans_input_tokens
            output_tokens += trans_output_tokens

            text = translated_text
            LOGGER.info(
                f"Translation completed (added {trans_input_tokens} input, {trans_output_tokens} output tokens)"
            )

        # Return text and token usage as a dict
        return {
            "text": text,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    except Exception as e:
        LOGGER.error(f"Multi-document chat processing error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@observe(name="stream_chat_with_multiple_documents", transform_to_string=_transform_stream_output)
async def stream_chat_with_multiple_documents(
    documents: list[Dict[str, Any]],
    query: str,
    previous_chats: str = "",
):
    """
    Async Generator function that streams status updates and content chunks for multi-document chat.
    Yields dicts with keys: 'type' (status/content/token_usage/error) and payload.

    Each document in the list should have:
    - document_id: str - Unique identifier for the document
    - document_text: str - The full OCR/extracted text
    - metadata: Dict - Document metadata (title, date, type, etc.)
    - document_url: str (optional) - URL to the original file (PDF/image)
    """
    try:
        mode = _llm_mode()
        yield {"type": "status", "message": "Preparing multi-document analysis..."}

        # Limit documents based on context window constraints
        # Increase this if your model supports larger context
        MAX_DOCS = 10
        if len(documents) > MAX_DOCS:
            LOGGER.warning(f"Received {len(documents)} documents, limiting to {MAX_DOCS}")
            documents = documents[:MAX_DOCS]

        if not documents:
            yield {"type": "content", "text": "No documents provided. Please provide at least one document to analyze."}
            yield {"type": "token_usage", "input_tokens": 0, "output_tokens": 0}
            return

        generation_config = {
            "temperature": 0.3,
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 8192,
        }

        yield {"type": "status", "message": f"Processing {len(documents)} document(s)..."}

        # Build context for all documents using extracted text (with optional page markers for citations)
        documents_context_parts = []

        for i, doc in enumerate(documents, 1):
            doc_id = doc.get("document_id", f"doc_{i}")
            doc_text = doc.get("document_text", "")
            doc_metadata = doc.get("metadata", {})
            doc_title = doc_metadata.get("title") or f"Untitled Document {i}"
            pages = doc.get("pages")  # list of {"page": N, "text": "..."} for citations

            # When we have page-level text, build context with [Page N] markers so the model can cite pages
            if pages and isinstance(pages, list):
                text_parts = []
                for p in pages:
                    page_num = p.get("page", 0)
                    page_text = (p.get("text") or "")[: MAX_MENTIONED_DOC_TEXT_LENGTH]
                    text_parts.append(f"[Page {page_num}]\n{page_text}")
                context_text = "\n\n".join(text_parts)[: MAX_MENTIONED_DOC_TEXT_LENGTH * 2]
            else:
                context_text = doc_text[: MAX_MENTIONED_DOC_TEXT_LENGTH * 2]

            # Log document text length for debugging
            LOGGER.info(f"📄 Doc {i} '{doc_title}': text length = {len(doc_text)} chars")

            # Build document section - use title instead of numbered reference
            doc_section = f"""
{"=" * 80}
{doc_title}
{"=" * 80}

Document Text:
{context_text}

Document Metadata:
{json.dumps(doc_metadata, indent=2, ensure_ascii=False)}
"""
            documents_context_parts.append(doc_section)

        documents_context = "\n".join(documents_context_parts)

        clean_query = (query or "").strip()
        contextual_query = clean_query
        if previous_chats:
            history_lines = previous_chats.strip().splitlines()
            trimmed_history = "\n".join(history_lines[-20:])
            contextual_query = (
                "Conversation so far:\n"
                f"{trimmed_history}\n\n"
                f"User's latest question: {clean_query}"
            )

        # Collect documents with URLs for file attachment (optional feature)
        docs_with_urls = [
            (i, doc.get("metadata", {}).get("title") or f"Document {i}", doc.get("document_url"))
            for i, doc in enumerate(documents, 1)
            if doc.get("document_url")
        ]

        # Download and upload files in PARALLEL (major latency reduction)
        # Check if PDF attachments should be skipped for performance
        skip_pdf = os.getenv("SKIP_PDF_ATTACHMENTS", "false").lower() == "true"
        
        uploaded_files = []
        if docs_with_urls and not skip_pdf:
            yield {"type": "status", "message": f"Downloading {len(docs_with_urls)} file(s) in parallel..."}
            
            async def download_and_upload(doc_num, doc_title, doc_url):
                """Download and upload a single file."""
                try:
                    resp = await asyncio.to_thread(requests.get, doc_url, timeout=30)
                    resp.raise_for_status()
                    file_content = resp.content

                    is_pdf = file_content.startswith(b"%PDF")
                    img_type = imghdr.what(None, h=file_content)
                    is_image = img_type is not None

                    if is_pdf:
                        mime_type = "application/pdf"
                    elif is_image:
                        mime_type = f"image/{img_type}"
                    else:
                        return None  # Unsupported file type

                    file_content = compress_file_if_needed(file_content, mime_type)
                    # Upload in thread to not block
                    uploaded = await asyncio.to_thread(
                        genai.upload_file, io.BytesIO(file_content), mime_type=mime_type
                    )
                    return (doc_num, doc_title, uploaded)
                except Exception as e:
                    LOGGER.warning(f"Could not attach document {doc_num} file to prompt: {e}")
                    return None

            # Run all downloads/uploads in parallel
            results = await asyncio.gather(
                *[download_and_upload(num, title, url) for num, title, url in docs_with_urls],
                return_exceptions=True
            )
            uploaded_files = [r for r in results if r is not None]
            LOGGER.info(f"📎 Successfully attached {len(uploaded_files)} file(s)")

        # Build the prompt using the template
        yield {"type": "status", "message": "Building AI prompt..."}
        
        try:
            template = PROMPTS.get_prompt("chat_with_multiple_documents")
            if not template:
                raise ValueError("get_prompt returned empty string")
            prompt = template.format(
                query=contextual_query,
                documents_context=documents_context,
                previous_chats=previous_chats or "No previous conversation.",
            )
        except Exception as e:
            LOGGER.warning(
                "Failed to load prompt template, using fallback: %s",
                e,
                exc_info=True,
            )
            prompt = f"""You are OutRiskAI's legal document assistant.
Analyze the following documents and answer the user's query precisely.

Previous conversation:
{previous_chats or "No previous conversation."}

User Query: {query}

{documents_context}

Instructions:
- Answer only what's asked
- Be concise, use clear markdown
- Always specify which document you're referring to when citing information
- Compare and contrast information across documents when relevant
"""

        # Log prompt length to debug if context is being passed
        LOGGER.info(f"📝 Built prompt with {len(prompt)} chars, documents_context has {len(documents_context)} chars")

        yield {"type": "status", "message": "Generating response..."}

        input_tokens = 0
        output_tokens = 0
        chunk_count = 0
        total_chars = 0
        full_response_text = ""

        if mode == "selfhost":
            llm_client = get_chat_client()
            async for item in llm_client.stream_chat_completion(
                prompt, **generation_config
            ):
                if item["type"] == "content":
                    chunk_count += 1
                    chunk_len = len(item["text"])
                    total_chars += chunk_len
                    full_response_text += item["text"]
                    yield {"type": "content", "text": item["text"]}
                    await asyncio.sleep(0)
                elif item["type"] == "token_usage":
                    input_tokens = item.get("input_tokens", 0)
                    output_tokens = item.get("output_tokens", 0)
        else:
            # Stream response using Gemini 3 with thinking_level=minimal for fast responses
            response = gemini_client.models.generate_content_stream(
                model=GEMINI_MODEL_NAME,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.3,
                    max_output_tokens=8192,
                    thinking_config=types.ThinkingConfig(
                        thinking_level="minimal"  #  Options: 'MINIMAL', 'LOW', 'MEDIUM', 'HIGH'
                    )
                )
            )

            # Gemini 3's stream is synchronous, collect chunks in thread
            def iterate_stream():
                chunks = []
                for chunk in response:
                    chunks.append(chunk)
                return chunks

            chunks = await asyncio.to_thread(iterate_stream)

            for chunk in chunks:
                # Track tokens if available
                if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
                    input_tokens = getattr(chunk.usage_metadata, "prompt_token_count", 0) or input_tokens
                    output_tokens = getattr(chunk.usage_metadata, "candidates_token_count", 0) or output_tokens

                if hasattr(chunk, "text") and chunk.text:
                    chunk_count += 1
                    chunk_len = len(chunk.text)
                    total_chars += chunk_len
                    full_response_text += chunk.text
                    LOGGER.debug(f"📝 Chunk {chunk_count}: {chunk_len} chars")
                    yield {"type": "content", "text": chunk.text}
                    await asyncio.sleep(0)

        LOGGER.info(f"✅ Streamed {chunk_count} chunks ({total_chars} total chars) for multi-document chat")
        
        # Update Langfuse span with the full response output
        update_current_span(output=full_response_text[:5000])  # Limit output size for Langfuse

        # Parse __CITATIONS__ from response if present (document title, page, excerpt)
        parsed_citations = []
        try:
            marker = "__CITATIONS__:"
            if marker in full_response_text:
                start = full_response_text.index(marker) + len(marker)
                rest = full_response_text[start:].strip()
                # Extract JSON array (take from first '[' to matching ']')
                depth = 0
                end = -1
                for i, c in enumerate(rest):
                    if c == "[":
                        depth += 1
                    elif c == "]":
                        depth -= 1
                        if depth == 0:
                            end = i + 1
                            break
                if end > 0:
                    arr_str = rest[:end]
                    parsed_citations = json.loads(arr_str)
                    if not isinstance(parsed_citations, list):
                        parsed_citations = []
        except (ValueError, json.JSONDecodeError) as e:
            LOGGER.debug(f"Could not parse __CITATIONS__ from response: {e}")

        # Always append sources when documents were used (compulsory at bottom for every response)
        try:
            if documents:
                source_docs = []
                for doc in documents:
                    doc_id = doc.get("document_id", "")
                    doc_url = doc.get("document_url") or (doc.get("metadata") or {}).get("documentUrl")
                    doc_title = (doc.get("metadata") or {}).get("title") or doc.get("document_name") or "Document"
                    # Match citations for this document by title (exact or normalized)
                    citations_for_doc = []
                    for c in parsed_citations:
                        if not isinstance(c, dict):
                            continue
                        cit_doc = (c.get("document") or "").strip()
                        if cit_doc and (cit_doc == doc_title or cit_doc.lower() in doc_title.lower() or doc_title.lower() in cit_doc.lower()):
                            citations_for_doc.append({
                                "page": c.get("page"),
                                "excerpt": (c.get("excerpt") or "").strip()[:500],
                            })
                    entry = {
                        "id": doc_id,
                        "url": doc_url or "",
                        "label": doc_title,
                    }
                    if citations_for_doc:
                        entry["citations"] = citations_for_doc
                    source_docs.append(entry)
                if source_docs:
                    sources_block = (
                        "\n\n---\n\nSources:\n__SOURCE_DOCS__: "
                        + json.dumps(source_docs, ensure_ascii=False)
                        + "\n"
                    )
                    yield {"type": "content", "text": sources_block}
        except Exception as e:
            LOGGER.warning(f"Failed to append source docs for multi-doc chat: {e}")

        # Yield final token usage
        yield {
            "type": "token_usage",
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    except Exception as e:
        LOGGER.error(
            f"Streaming multi-document chat processing error: {str(e)}", exc_info=True
        )
        yield {"type": "error", "message": str(e)}
