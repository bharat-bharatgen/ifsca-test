import io
import json
import logging
import os
import re
from datetime import datetime
from typing import Dict, Any, Optional, List
import imghdr

import google.generativeai as genai
import requests
from dotenv import load_dotenv
from fastapi import HTTPException
from PIL import Image
from PyPDF2 import PdfReader, PdfWriter

from settings import USER_CONTEXT_PARSE_DOCUMENT
from utils.retry_utils import retry_with_backoff

LOGGER = logging.getLogger(__name__)

load_dotenv()
genai.configure(
    api_key=os.getenv('GOOGLE_API_KEY'),
    transport='rest'
)

# Initialize Gemini model
model = genai.GenerativeModel("gemini-2.0-flash")

CONTRACT_SCHEMA = """
Use this JSON schema for contract details:

ContractDetails = {
    'title': str,
    'description': str,
    'promisor': str,
    'promisee': str,
    'value': float,
    'duration': str,
    'type': str,
    'date': str,
    'country': str,
    'state': str,
    'city': str,
    'location': str,
    'document_number': str,
    'document_number_label': str
}

Response = {
    'contract_details': ContractDetails,
    'contract_summary': str
}

Return: Response
"""


def _norm(s: str) -> str:
    """
    Normalize field/column names for fuzzy matching.

    - Lowercase
    - Replace any sequence of non-alphanumerics with a single underscore
    - Strip leading/trailing underscores
    """
    normalized = re.sub(r"[^a-z0-9]+", "_", str(s).strip().lower())
    return normalized.strip("_")


def extract_text_from_pdf(file_content: bytes) -> str:
    """
    Extract raw text from a PDF using PyPDF2.
    This is used as a lightweight OCR/text layer for explicit metadata fields.
    """
    try:
        reader = PdfReader(io.BytesIO(file_content))
        texts = []
        for page in reader.pages:
            try:
                page_text = page.extract_text() or ""
                texts.append(page_text)
            except Exception as e:
                LOGGER.warning(f"PDF text extraction failed for a page: {e}")
        return "\n".join(texts)
    except Exception as e:
        LOGGER.warning(f"PDF text extraction failed: {e}")
        return ""


def extract_explicit_metadata_from_text(
    text: str,
    metadata_fields: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Best-effort extraction of explicit metadata fields directly from document text.

    This does not rely on the model's structured JSON; instead it:
      - scans lines of text
      - applies field-specific heuristics for known legal/land fields
      - uses a generic "label: value" pattern as a fallback
    """
    if not text or not metadata_fields:
        return {}

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    extracted: Dict[str, Any] = {}

    # Helper to search with a regex over all lines
    def search_pattern(pattern: str) -> Optional[str]:
        regex = re.compile(pattern, re.IGNORECASE)
        for line in lines:
            m = regex.search(line)
            if m:
                val = m.group("val").strip()
                if val:
                    return val
        return None

    for field in metadata_fields:
        norm = _norm(field)
        value: Optional[str] = None

        # Generic strategy: treat the field name as a label and look for "label: value" style patterns
        words = [w for w in re.split(r"[_\s]+", norm) if w]
        if words:
            # Allow small variations in spacing/punctuation between label words
            label_pattern = r"\s*".join(map(re.escape, words))
            # Match any non-linebreak Unicode character(s) for value, at least 2 chars
            generic_pattern = rf"({label_pattern})\s*[:\-]?\s*(?P<val>[^\r\n]{{2,}})"
            value = search_pattern(generic_pattern)

        if value is not None:
            extracted[field] = value

    return extracted

def parse_duration(value) -> int:
    """Parse duration string to integer (in months)"""
    if isinstance(value, int):
        return value
    try:
        return int(re.findall(r'\d+', str(value))[0]) if value else 0
    except Exception:
        return 0

def clean_gemini_json_response(text: str) -> str:
    """Remove markdown code block delimiters from Gemini response."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()

def compress_file_if_needed(file_content: bytes, mime_type: str, max_size_mb: int = 30) -> bytes:
    """
    Compress file if it exceeds max_size_mb.
    Supports PDF and images (jpeg/png).
    """
    max_size_bytes = max_size_mb * 1024 * 1024
    if len(file_content) <= max_size_bytes:
        return file_content

    if mime_type == "application/pdf":
        try:
            reader = PdfReader(io.BytesIO(file_content))
            writer = PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
                temp_io = io.BytesIO()
                writer.write(temp_io)
                if temp_io.tell() > max_size_bytes:
                    break
            temp_io = io.BytesIO()
            writer.write(temp_io)
            temp_io.seek(0)
            return temp_io.read()
        except Exception as e:
            LOGGER.warning(f"PDF compression failed: {e}")
            return file_content

    if mime_type.startswith("image/"):
        try:
            img = Image.open(io.BytesIO(file_content))
            temp_io = io.BytesIO()
            img.thumbnail((img.width // 2, img.height // 2))
            img.save(temp_io, format=img.format, quality=50, optimize=True)
            temp_io.seek(0)
            compressed = temp_io.read()
            if len(compressed) > max_size_bytes:
                temp_io = io.BytesIO()
                img.save(temp_io, format=img.format, quality=20, optimize=True)
                temp_io.seek(0)
                compressed = temp_io.read()
            return compressed if len(compressed) < len(file_content) else file_content
        except Exception as e:
            LOGGER.warning(f"Image compression failed: {e}")
            return file_content

    return file_content

@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_gemini_for_document(prompt: str, file_part: dict) -> Any:
    """
    Helper function to call Gemini API with retry logic.
    Separated to allow retry decorator to work properly.
    """
    response = model.generate_content(
        contents=[prompt, file_part],
        generation_config={
            "temperature": 0.1,
            "top_p": 0.7,
            "top_k": 40,
            "max_output_tokens": 16384
        }
    )
    response.resolve()
    return response


async def process_document_with_gemini(
    file_content: bytes, 
    user_name: str, 
    metadata_fields: Optional[List[str]] = None
) -> dict:
    """
    Process document file using Gemini AI to extract contract details.
    If metadata_fields is provided, extract only those specific fields.
    Returns structured data with contract details and summary.
    """
    try:
        LOGGER.info(
            f"[Gemini] Starting process_document_with_gemini "
            f"(user_name={user_name}, metadata_fields={metadata_fields})"
        )

        is_pdf = file_content.startswith(b'%PDF')
        img_type = imghdr.what(None, h=file_content)
        is_image = img_type is not None

        if not (is_pdf or is_image):
            raise ValueError("Invalid file format. Only PDF and images are supported.")

        if is_pdf:
            mime_type = "application/pdf"
        else:
            mime_type = f"image/{img_type}"

        file_content = compress_file_if_needed(file_content, mime_type, max_size_mb=30)
        file_part = {"mime_type": mime_type, "data": file_content}

        # Build prompt with custom metadata fields if provided
        base_prompt = USER_CONTEXT_PARSE_DOCUMENT
        if metadata_fields:
            fields_list = ", ".join(metadata_fields)
            custom_fields_instruction = (
                "\n\nIMPORTANT (CUSTOM METADATA FIELDS):\n"
                f"- The caller has requested the following metadata fields: {fields_list}.\n"
                "- For EACH of these requested fields, you MUST extract its value from the document if present.\n"
                "- In the `contract_details` object, INCLUDE a key for each requested field.\n"
                "- If you cannot find a value for a requested field, set that field to null.\n"
                "- You MAY also include your usual schema fields, but these requested fields are mandatory."
            )
            base_prompt = base_prompt + custom_fields_instruction

        prompt = f"{base_prompt}\nReturn only a valid JSON object matching the schema: {json.dumps({'contract_details': {}, 'contract_summary': ''}, indent=2)}. Escape all special characters (quotes, newlines) in strings. Do not include extra text or comments."
        
        LOGGER.info("[Gemini] Calling Gemini model for document analysis")
        response = _call_gemini_for_document(prompt, file_part)

        # Extract token usage from response
        usage_metadata = response.usage_metadata if hasattr(response, 'usage_metadata') else None
        input_tokens = usage_metadata.prompt_token_count if usage_metadata else 0
        output_tokens = usage_metadata.candidates_token_count if usage_metadata else 0

        LOGGER.debug(f"[Gemini] Raw Gemini response (truncated):\n{response.text[:5000]}")

        cleaned_text = clean_gemini_json_response(response.text)
        try:
            result = json.loads(cleaned_text)
        except json.JSONDecodeError as e:
            LOGGER.error(f"[Gemini] Failed to parse JSON response: {e}\nRaw response:\n{response.text[:5000]}")
            result = {
                "contract_details": {},
                "contract_summary": "Failed to parse response. Invalid JSON.",
            }

        # Add token usage to result
        result["_token_usage"] = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

        details = result.get("contract_details", {})
        LOGGER.info(
            "[Gemini] contract_details keys: %s",
            list(details.keys())
        )
        doc_type = details.get("type", "CONTRACT")
        
        # Base fields
        base_fields = {
            "title": details.get("title", "Untitled Document"),
            "description": details.get("description", ""),
            "promisor": details.get("promisor", ""),
            "promisee": details.get("promisee", ""),
            "value": details.get("value", 0),
            "duration": parse_duration(details.get("duration")),
            "type": doc_type,
            "date": details.get("date", datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z")),
            "country": details.get("country", "India"),
            "state": details.get("state", "NA"),
            "city": details.get("city", "NA"),
            "location": details.get("location", ""),
            "document_number": details.get("document_number") or details.get("case_number") or details.get("registration_number") or details.get("document_no") or "",
            "document_number_label": details.get("document_number_label") or (
                "Case Number" if details.get("case_number") else (
                "Registration Number" if details.get("registration_number") else (
                "Document Number" if (details.get("document_number") or details.get("document_no")) else ""))
            )
        }
        
        # LAND type fields
        if doc_type and "LAND" in str(doc_type).upper():
            base_fields.update({
                "registration_no": details.get("registration_no") or details.get("registration_number") or None,
                "registration_date": details.get("registration_date") or None,
                "land_document_type": details.get("land_document_type") or None,
                "land_document_date": details.get("land_document_date") or None,
                "seller": details.get("seller") or None,
                "purchaser": details.get("purchaser") or None,
                "survey_no": details.get("survey_no") or details.get("survey_number") or None,
                "cts_no": details.get("cts_no") or details.get("cts_number") or None,
                "gut_no": details.get("gut_no") or details.get("gut_number") or None,
                "plot_no": details.get("plot_no") or details.get("plot_number") or None,
                "no_of_pages": details.get("no_of_pages") or details.get("number_of_pages") or None,
                "village": details.get("village") or None,
                "taluka": details.get("taluka") or None,
                "pincode": details.get("pincode") or details.get("pin_code") or None,
            })
        
        # LIAISON type fields (handle both spellings for backward compatibility)
        doc_type_upper = str(doc_type).upper() if doc_type else ""
        if doc_type and ("LIAISON" in doc_type_upper or "LIAISON" in doc_type_upper):
            base_fields.update({
                "application_no": details.get("application_no") or details.get("application_number") or None,
                "application_date": details.get("application_date") or None,
                "company_name": details.get("company_name") or None,
                "authority_name": details.get("authority_name") or None,
                "approval_no": details.get("approval_no") or details.get("approval_number") or None,
                "order_no": details.get("order_no") or details.get("order_number") or None,
                "approval_date": details.get("approval_date") or None,
                "building_name": details.get("building_name") or None,
                "project_name": details.get("project_name") or None,
                "expiry_date": details.get("expiry_date") or None,
                "sector": details.get("sector") or None,
                "subject": details.get("subject") or None,
                "drawing_no": details.get("drawing_no") or details.get("drawing_number") or None,
                "drawing_date": details.get("drawing_date") or None,
                "building_type": details.get("building_type") or None,
                "commence_certificate": details.get("commence_certificate") or details.get("commencement_certificate") or None,
                "intimation_of_disapproval": details.get("intimation_of_disapproval") or details.get("iod") or None,
                "intimation_of_approval": details.get("intimation_of_approval") or details.get("ioa") or None,
                "rera": details.get("rera") or details.get("rera_number") or None,
            })
        
        # LEGAL type fields
        if doc_type and "LEGAL" in str(doc_type).upper():
            base_fields.update({
                "case_type": details.get("case_type") or None,
                "case_no": details.get("case_no") or details.get("case_number") or None,
                "case_date": details.get("case_date") or None,
                "court": details.get("court") or None,
                "applicant": details.get("applicant") or None,
                "petitioner": details.get("petitioner") or None,
                "respondent": details.get("respondent") or None,
                "plaintiff": details.get("plaintiff") or None,
                "defendant": details.get("defendant") or None,
                "advocate_name": details.get("advocate_name") or details.get("advocate") or None,
                "judicature": details.get("judicature") or None,
                "coram": details.get("coram") or None,
            })
        
        details.update(base_fields)
        result["contract_details"] = details
        result.setdefault("contract_summary", "No summary available")

        # If metadata_fields specified, extract only those fields and add to result
        if metadata_fields:
            # Build a normalized lookup to handle differences like
            # "MTR Form Number" vs "mtr_form_number" etc.
            normalized_map = {}
            for k, v in details.items():
                normalized_map[_norm(k)] = v

            extracted_metadata: Dict[str, Any] = {}
            for field in metadata_fields:
                raw_key = field
                value = None

                # 1) Direct key match (exact)
                if raw_key in details:
                    value = details[raw_key]
                else:
                    # 2) Normalized match
                    norm_key = _norm(raw_key)
                    if norm_key in normalized_map:
                        value = normalized_map[norm_key]

                if value is not None:
                    extracted_metadata[raw_key] = value

            # If PDF, try to fill missing explicit fields using direct text extraction (simple OCR layer)
            if is_pdf:
                pdf_text = extract_text_from_pdf(file_content)
                if pdf_text:
                    ocr_metadata = extract_explicit_metadata_from_text(pdf_text, metadata_fields)
                    if ocr_metadata:
                        LOGGER.info(
                            "[Gemini] OCR-based explicit metadata: %s",
                            {k: v for k, v in ocr_metadata.items() if v is not None},
                        )
                        for key, val in ocr_metadata.items():
                            # Only fill if Gemini didn't already provide a value
                            if key not in extracted_metadata or extracted_metadata.get(key) in (None, ""):
                                extracted_metadata[key] = val
                                # Also mirror into contract_details so downstream code can see it
                                details[key] = val

            result["extracted_metadata"] = extracted_metadata
            LOGGER.info(f"[Gemini] Extracted custom metadata fields: {list(extracted_metadata.keys())}")

        LOGGER.info(
            f"[Gemini] Processed {mime_type} document. "
            f"title={details.get('title')!r}, type={doc_type!r}"
        )
        return result

    except Exception as e:
        LOGGER.error(f"[Gemini] Document processing error: {str(e)}", exc_info=True)
        raise

def classify_document_fallback(data) -> dict:
    """Smart fallback classification based on content analysis and keywords"""
    content_lower = (data.content or "").lower()
    title_lower = (data.title or "").lower()
    contract_type_lower = (data.contract_type or "").lower()
    
    all_text = f"{title_lower} {content_lower} {contract_type_lower}"
    
    classification_patterns = {
        ("Legal", "Court Affidavit Document"): [
            "affidavit", "court", "judicial", "high court", "supreme court", 
            "sworn statement", "deponent", "verification"
        ],
        ("Legal", "Legal Service Agreement"): [
            "legal service", "attorney", "lawyer", "counsel", "legal advice",
            "litigation", "legal representation"
        ],
        ("Real Estate", "Property Sale Agreement"): [
            "property", "real estate", "land", "building", "sale deed", 
            "agreement to sell", "conveyance", "ownership", "title"
        ],
        ("Real Estate", "Property Lease Agreement"): [
            "lease", "rent", "tenant", "landlord", "rental", "tenancy", 
            "premises", "occupation", "monthly rent", "security deposit"
        ],
        ("Government", "Government Grant Agreement"): [
            "government", "grant", "ministry", "department", "public", 
            "state", "central", "municipal", "authority", "commission", "funding"
        ],
        ("Financial", "Banking Loan Agreement"): [
            "loan", "credit", "bank", "financial", "mortgage", "finance",
            "interest", "principal", "repayment", "collateral", "borrower"
        ],
        ("Corporate", "Professional Consulting Agreement"): [
            "consulting", "consultancy", "advisory", "professional services",
            "consultant", "advice", "expertise", "guidance"
        ],
        ("Technology", "Software License Agreement"): [
            "software", "license", "technology", "application", "system",
            "intellectual property", "source code", "usage rights"
        ],
    }
    
    # Score each category based on keyword matches
    category_scores = {}
    for (main_cat, sub_cat), keywords in classification_patterns.items():
        score = sum(1 for keyword in keywords if keyword in all_text)
        if score > 0:
            category_scores[(main_cat, sub_cat)] = score
    
    if category_scores:
        (category, sub_category) = max(category_scores, key=category_scores.get)
        return {
            "category": category,
            "subCategory": sub_category
        }
    
    contract_type = data.contract_type.upper() if data.contract_type else ""
    if "SERVICE" in contract_type:
        return {"category": "Corporate", "subCategory": "Service Agreement"}
    elif "SALE" in contract_type:
        return {"category": "Corporate", "subCategory": "Sale Agreement"}
    elif "LEASE" in contract_type:
        return {"category": "Real Estate", "subCategory": "Lease Agreement"}
    else:
        return {"category": "Miscellaneous", "subCategory": "General Contract"}

