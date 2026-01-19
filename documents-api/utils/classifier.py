import json
import logging
from typing import Dict, Any

import google.generativeai as genai
import os

from utils.prompts import PROMPTS
from utils.document_processor import classify_document_fallback
from utils.retry_utils import retry_with_backoff
from api_types.api import DocumentClassificationRequest

LOGGER = logging.getLogger(__name__)


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
def _call_gemini_for_classification(classification_prompt: str) -> Any:
    """
    Helper function to call Gemini API for classification with retry logic.
    """
    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(
        classification_prompt,
        generation_config={
            "temperature": 0.1,
            "top_p": 0.8,
            "max_output_tokens": 500
        }
    )
    response.resolve()
    return response


def classify_document(data: DocumentClassificationRequest) -> Dict[str, Any]:
    """Classify document into predefined categories using AI"""
    try:
        LOGGER.info(f"Document classification request for: {data.title}")
        prompt_template = PROMPTS.get_prompt("classify_document")
        
        if not prompt_template:
            LOGGER.warning("Classification prompt not found, using fallback")
            fallback_result = classify_document_fallback(data)
            return {
                "success": True,
                "category": fallback_result["category"],
                "subCategory": fallback_result["subCategory"],
                "confidence": 0.5,
                "reasoning": "Fallback classification",
                "_token_usage": {
                    "input_tokens": 0,
                    "output_tokens": 0,
                }
            }
        
        classification_prompt = prompt_template.format(
            title=data.title or "Untitled",
            contract_type=data.contract_type or "Unknown",
            promisor=data.promisor or "Unknown",
            promisee=data.promisee or "Unknown", 
            content=data.content[:2000] if data.content else "No content available",
            value=data.value or 0.0
        )
        
        response = _call_gemini_for_classification(classification_prompt)
        
        # Extract token usage from response
        usage_metadata = response.usage_metadata if hasattr(response, 'usage_metadata') else None
        input_tokens = usage_metadata.prompt_token_count if usage_metadata else 0
        output_tokens = usage_metadata.candidates_token_count if usage_metadata else 0
        
        try:
            response_text = response.text.strip()
            if response_text.startswith("```json"):
                response_text = response_text.replace("```json", "").replace("```", "").strip()
            classification_result = json.loads(response_text)
            
            category = classification_result.get("category", "Miscellaneous").strip()
            sub_category = classification_result.get("subCategory", "General Contract").strip()
            
            valid_categories = [
                "Real Estate", "Corporate", "Financial", "Government", 
                "Technology", "Healthcare", "Legal", "Miscellaneous"
            ]
            
            if category not in valid_categories:
                LOGGER.warning(f"Invalid category '{category}', defaulting to Miscellaneous")
                category = "Miscellaneous"
            
            if not sub_category or len(sub_category) < 2:
                sub_category = "General Contract"
            
            confidence = float(classification_result.get("confidence", 0.5))
            confidence = max(0.0, min(1.0, confidence))
            reasoning = classification_result.get("reasoning", "No reasoning provided")
            
            LOGGER.info(f"Classification result: {category} > {sub_category} (confidence: {confidence:.2f})")
            
            return {
                "success": True,
                "category": category,
                "subCategory": sub_category,
                "confidence": confidence,
                "reasoning": reasoning,
                "valid_categories": valid_categories,
                "_token_usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                }
            }
            
        except json.JSONDecodeError as e:
            LOGGER.error(f"Failed to parse classification response: {e}")
            LOGGER.error(f"Raw response: {response.text}")
            fallback_result = classify_document_fallback(data)
            return {
                "success": True,
                "category": fallback_result["category"],
                "subCategory": fallback_result["subCategory"],
                "confidence": 0.3,
                "reasoning": "Fallback classification due to parsing error",
                "valid_categories": [
                    "Real Estate", "Corporate", "Financial", "Government", 
                    "Technology", "Healthcare", "Legal", "Miscellaneous"
                ],
                "_token_usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                }
            }
            
    except Exception as e:
        LOGGER.error(f"Document classification failed: {e}", exc_info=True)
        fallback_result = classify_document_fallback(data)
        return {
            "success": False,
            "category": fallback_result["category"],
            "subCategory": fallback_result["subCategory"],
            "confidence": 0.2,
            "reasoning": f"Error occurred: {str(e)}",
            "valid_categories": [
                "Real Estate", "Corporate", "Financial", "Government", 
                "Technology", "Healthcare", "Legal", "Miscellaneous"
            ],
            "error": str(e),
            "_token_usage": {
                "input_tokens": 0,
                "output_tokens": 0,
            }
        }

