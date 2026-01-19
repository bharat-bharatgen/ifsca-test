
import json
import logging
from typing import Dict, Any, List
import google.generativeai as genai

from .semantic_helper import (
    extract_user_message,
    is_greeting,
    is_unclear_query,
    understand_query,
    fallback_understanding,
    semantic_search,
    build_semantic_search_query,
    generate_response,
    remove_duplicate_documents,
    ensure_unique_documents,
)

LOGGER = logging.getLogger(__name__)

class SemanticQueryProcessor:
    """
    Simple semantic query processor that uses AI to understand queries
    and performs vector search without complex classification.
    """
    
    def __init__(self):
        self.model = genai.GenerativeModel("gemini-2.0-flash")
        self.genai = genai
        
    async def process_query(self, query: str, user_id: str = "guest_user") -> Dict[str, Any]:
        """
        Process any query using semantic understanding and vector search.
        """
        try:
            clean_query = extract_user_message(query)
            
            # Check if it's a simple greeting
            if is_greeting(clean_query):
                return {
                    "success": True,
                    "response": "Hello! How can I help you today? I can help you search for documents, filter by location, type, or other criteria, and answer questions about your contracts.",
                    "sources": [],
                    "total_contracts_found": 0,
                    "user_id": user_id,
                    "token_usage": {"input_tokens": 0, "output_tokens": 0}
                }
            
            # Use AI to understand the query intent and extract filters
            query_understanding = understand_query(clean_query, self.model)
            
            # Extract token usage from understanding (if available)
            token_usage = query_understanding.pop("_token_usage", {"input_tokens": 0, "output_tokens": 0})
            
            # Check if the system couldn't understand the query properly
            if is_unclear_query(clean_query, query_understanding):
                return {
                    "success": True,
                    "response": "I need more specific information to help you find the right documents. Please include one or more of the following in your query:\n\n• **Location**: 'lease documents in Mumbai', 'contracts in Pune'\n• **Document Type**: 'sale documents', 'service contracts', 'lease agreements'\n• **Date**: 'documents from 2023', 'contracts in January'\n• **Specific Content**: 'anything about lease', 'documents with suit numbers'\n\nFor example: 'lease documents in Mumbai' or 'sale contracts from 2023'\n\nHow can I help you today?",
                    "sources": [],
                    "total_contracts_found": 0,
                    "user_id": user_id,
                    "token_usage": token_usage
                }
            
            # Perform vector search with semantic understanding
            results = await semantic_search(clean_query, query_understanding, self.genai)
            
            # Generate response based on results
            # Deduplicate before response
            results = remove_duplicate_documents(results)
            response = generate_response(clean_query, query_understanding, results)
            
            return {
                "success": True,
                "response": response,
                "sources": results[:3],
                "total_contracts_found": len(results),
                "user_id": user_id,
                "token_usage": token_usage
            }
            
        except Exception as e:
            LOGGER.error(f"Error in semantic query processing: {str(e)}")
            return {
                "success": False,
                "response": "I apologize, but I encountered an error processing your request.",
                "error": str(e),
                "user_id": user_id,
                "token_usage": {"input_tokens": 0, "output_tokens": 0}
            }
    
    # The rest of the logic is moved into helpers in utils/semantic_helper


# Global instance
semantic_processor = SemanticQueryProcessor()
