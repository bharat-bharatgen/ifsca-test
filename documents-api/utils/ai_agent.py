import io
import json
import logging
import os
import re
from typing import Dict, Any, Tuple

import google.generativeai as genai
import imghdr
import requests
from dotenv import load_dotenv
from fastapi import HTTPException

from utils.prompts import PROMPTS
from utils.document_processor import compress_file_if_needed
from utils.retry_utils import retry_with_backoff

LOGGER = logging.getLogger(__name__)

load_dotenv()
genai.configure(
    api_key=os.getenv('GOOGLE_API_KEY'),
    transport='rest'
)

# Maximum number of characters to include from each mentioned document's text
MAX_MENTIONED_DOC_TEXT_LENGTH = 5000

# Gemini model name - centralized for easy updates
GEMINI_MODEL_NAME = "gemini-2.5-flash"


def _is_greeting(text: str) -> bool:
    if not text:
        return False
    t = text.strip().lower()
    return re.fullmatch(r"\b(hi|hello|hey|good\s*(morning|afternoon|evening))\b[!.]*", t) is not None


def _is_thanks(text: str) -> bool:
    if not text:
        return False
    t = text.strip().lower()
    return re.fullmatch(r"\b(thank\s*you|thanks|thx|ty|thank\s*u)\b[!.]*", t) is not None


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
    middle = text[middle_start:middle_start + sample_size]
    end = text[-sample_size:]
    
    return f"{beginning}\n...\n{middle}\n...\n{end}"


def _is_english(text: str) -> Tuple[bool, int, int]:
    """
    Detect if the text is primarily in English using lightweight checks first,
    then Gemini API if needed.
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
        
        response = _call_gemini_for_language_detection(detection_prompt)
        
        result = (response.text or "").strip().lower()
        is_english_result = result.startswith("yes")
        
        # Extract token usage from detection response
        usage_metadata = response.usage_metadata if hasattr(response, 'usage_metadata') else None
        input_tokens = usage_metadata.prompt_token_count if usage_metadata else 0
        output_tokens = usage_metadata.candidates_token_count if usage_metadata else 0
        
        return is_english_result, input_tokens, output_tokens
    except Exception as e:
        LOGGER.warning(f"Language detection failed: {e}, assuming English")
        # On error, assume English to avoid unnecessary translation
        return True, 0, 0


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_gemini_for_language_detection(detection_prompt: str) -> Any:
    """
    Helper function to call Gemini API for language detection with retry logic.
    """
    model = genai.GenerativeModel(GEMINI_MODEL_NAME)
    response = model.generate_content(
        detection_prompt,
        generation_config={
            "temperature": 0.1,
            "max_output_tokens": 10,
        }
    )
    response.resolve()
    return response


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_gemini_for_translation(translation_prompt: str) -> Any:
    """
    Helper function to call Gemini API for translation with retry logic.
    """
    model = genai.GenerativeModel(GEMINI_MODEL_NAME)
    response = model.generate_content(
        translation_prompt,
        generation_config={
            "temperature": 0.2,
            "max_output_tokens": 8192,
        }
    )
    response.resolve()
    return response


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_gemini_for_chat(prompt_parts: list, generation_config: dict) -> Any:
    """
    Helper function to call Gemini API for chat with retry logic.
    """
    model = genai.GenerativeModel(GEMINI_MODEL_NAME, generation_config=generation_config)
    response = model.generate_content(contents=prompt_parts)
    response.resolve()
    return response


def _translate_to_english(text: str) -> Tuple[str, int, int]:
    """
    Translate text to English using Gemini API.
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
        
        response = _call_gemini_for_translation(translation_prompt)
        
        translated = (response.text or "").strip()
        if not translated:
            LOGGER.warning("Translation returned empty, using original text")
            return text, 0, 0
        
        # Extract token usage from translation response
        usage_metadata = response.usage_metadata if hasattr(response, 'usage_metadata') else None
        trans_input_tokens = usage_metadata.prompt_token_count if usage_metadata else 0
        trans_output_tokens = usage_metadata.candidates_token_count if usage_metadata else 0
        
        return translated, trans_input_tokens, trans_output_tokens
    except Exception as e:
        LOGGER.error(f"Translation failed: {e}, returning original text")
        return text, 0, 0


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
        generation_config = {
            "temperature": 0.3,
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 8192,
        }

        model = genai.GenerativeModel(GEMINI_MODEL_NAME, generation_config=generation_config)

        safe_metadata = metadata or {}
        mentioned_docs = mentioned_documents or []
        
        # Build mentioned documents context
        mentioned_context = ""
        if mentioned_docs:
            mentioned_parts = []
            for i, mentioned_doc in enumerate(mentioned_docs, 1):
                doc_title = mentioned_doc.get("title") or mentioned_doc.get("metadata", {}).get("title") or f"Document {i}"
                doc_text = mentioned_doc.get("document_text", "")[:MAX_MENTIONED_DOC_TEXT_LENGTH]
                doc_metadata = json.dumps(mentioned_doc.get("metadata", {}), indent=2, ensure_ascii=False)
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
        
        prompt = PROMPTS.get_prompt('chat_with_document').format(
            query=query,
            document_text=document_text,
            metadata=json.dumps(safe_metadata, indent=2, ensure_ascii=False),
            title=(safe_metadata.get("title") or "this document"),
            mentioned_context=mentioned_context,
        )

        prompt_parts = [prompt]

        if document_url:
            try:
                resp = requests.get(document_url)
                resp.raise_for_status()
                file_content = resp.content

                is_pdf = file_content.startswith(b'%PDF')
                img_type = imghdr.what(None, h=file_content)
                is_image = img_type is not None

                if is_pdf:
                    mime_type = "application/pdf"
                elif is_image:
                    mime_type = f"image/{img_type}"
                else:
                    raise ValueError("Unsupported file type")

                file_content = compress_file_if_needed(file_content, mime_type)
                uploaded = genai.upload_file(io.BytesIO(file_content), mime_type=mime_type)
                prompt_parts.append(uploaded)
            except Exception as e:
                LOGGER.warning(f"Could not attach document file to prompt: {e}")

        response = _call_gemini_for_chat(prompt_parts, generation_config)

        text = (response.text or "").strip()
        if not text:
            return "I apologize, but I couldn't analyze your question. Please try rephrasing it."

        # Extract token usage from response
        usage_metadata = response.usage_metadata if hasattr(response, 'usage_metadata') else None
        input_tokens = usage_metadata.prompt_token_count if usage_metadata else 0
        output_tokens = usage_metadata.candidates_token_count if usage_metadata else 0

        # Check if response is in English, translate if not
        is_english_result, detect_input_tokens, detect_output_tokens = _is_english(text)
        
        # Add language detection tokens to total token usage
        input_tokens += detect_input_tokens
        output_tokens += detect_output_tokens
        
        if not is_english_result:
            LOGGER.info("Response is not in English, translating to English...")
            translated_text, trans_input_tokens, trans_output_tokens = _translate_to_english(text)
            
            # Add translation tokens to total token usage
            input_tokens += trans_input_tokens
            output_tokens += trans_output_tokens
            
            text = translated_text
            LOGGER.info(f"Translation completed (added {trans_input_tokens} input, {trans_output_tokens} output tokens)")

        # Return text and token usage as a dict
        return {
            "text": text,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    except Exception as e:
        LOGGER.error(f"Document chat processing error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def chat_with_multiple_documents(
    documents: list[Dict[str, Any]],
    query: str,
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

        model = genai.GenerativeModel(GEMINI_MODEL_NAME, generation_config=generation_config)
        
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
{'=' * 80}
{doc_title}
{'=' * 80}

Document Text:
{doc_text[:MAX_MENTIONED_DOC_TEXT_LENGTH * 2]}

Document Metadata:
{json.dumps(doc_metadata, indent=2, ensure_ascii=False)}
"""
            documents_context_parts.append(doc_section)
            
            # Try to upload the actual file if URL is provided
            if doc_url:
                try:
                    resp = requests.get(doc_url)
                    resp.raise_for_status()
                    file_content = resp.content

                    is_pdf = file_content.startswith(b'%PDF')
                    img_type = imghdr.what(None, h=file_content)
                    is_image = img_type is not None

                    if is_pdf:
                        mime_type = "application/pdf"
                    elif is_image:
                        mime_type = f"image/{img_type}"
                    else:
                        raise ValueError("Unsupported file type")

                    file_content = compress_file_if_needed(file_content, mime_type)
                    uploaded = genai.upload_file(io.BytesIO(file_content), mime_type=mime_type)
                    uploaded_files.append((i, doc_title, uploaded))
                except Exception as e:
                    LOGGER.warning(f"Could not attach document {i} file to prompt: {e}")
        
        documents_context = "\n".join(documents_context_parts)
        
        prompt = PROMPTS.get_prompt('chat_with_multiple_documents').format(
            query=query,
            documents_context=documents_context,
        )
        
        # If prompt template not found, use a fallback
        if not prompt or prompt == query:
            prompt = f"""You are OutRiskAI's legal document assistant.
Analyze the following documents and answer the user's query precisely.

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
            prompt_parts.append(f"\n[Attached file for Document {doc_num}: {doc_title}]")
            prompt_parts.append(uploaded_file)

        response = _call_gemini_for_chat(prompt_parts, generation_config)

        text = (response.text or "").strip()
        if not text:
            return {
                "text": "I apologize, but I couldn't analyze your question. Please try rephrasing it.",
                "input_tokens": 0,
                "output_tokens": 0,
            }

        # Extract token usage from response
        usage_metadata = response.usage_metadata if hasattr(response, 'usage_metadata') else None
        input_tokens = usage_metadata.prompt_token_count if usage_metadata else 0
        output_tokens = usage_metadata.candidates_token_count if usage_metadata else 0

        # Check if response is in English, translate if not
        is_english_result, detect_input_tokens, detect_output_tokens = _is_english(text)
        
        # Add language detection tokens to total token usage
        input_tokens += detect_input_tokens
        output_tokens += detect_output_tokens
        
        if not is_english_result:
            LOGGER.info("Response is not in English, translating to English...")
            translated_text, trans_input_tokens, trans_output_tokens = _translate_to_english(text)
            
            # Add translation tokens to total token usage
            input_tokens += trans_input_tokens
            output_tokens += trans_output_tokens
            
            text = translated_text
            LOGGER.info(f"Translation completed (added {trans_input_tokens} input, {trans_output_tokens} output tokens)")

        # Return text and token usage as a dict
        return {
            "text": text,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    except Exception as e:
        LOGGER.error(f"Multi-document chat processing error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


