from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ParseRequest(BaseModel):
    documentUrl: str
    user_name: str
    metadata_fields: Optional[List[str]] = None  # List of field names to extract from document
    job_id: Optional[str] = None  # Correlation ID from main app (for logging)

class DocumentClassificationRequest(BaseModel):
    title: str
    contract_type: str
    promisor: str
    promisee: str
    content: str
    value: Optional[float] = 0.0


class ChatMessage(BaseModel):
    message: str
    sender: str


class MentionedDocument(BaseModel):
    document_id: str
    document_text: str
    metadata: Dict[str, Any] = {}
    title: Optional[str] = None

class DocumentChatRequest(BaseModel):
    document_id: str
    query: str
    document_text: str
    metadata: Dict[str, Any] = {}
    file_path: Optional[str] = None
    previous_chats: List[ChatMessage] = []
    mentioned_documents: List[MentionedDocument] = []  # Documents mentioned via @ in the query


class GlobalChatRequest(BaseModel):
    message: str
    user_id: Optional[str] = "anonymous"
    previous_chats: Optional[str] = None
    relevant_documents: Optional[List[Dict[str, Any]]] = None
    offset: Optional[int] = 0  # Skip first N documents (for pagination)
    limit: Optional[int] = 10  # Number of documents to process per request


class ProcessDocumentRequest(BaseModel):
    document_id: str
    document_url: str
    user_name: str
    original_file_name: str
    user_id: str


class MultiDocumentItem(BaseModel):
    document_id: str
    document_text: str
    metadata: Dict[str, Any] = {}
    document_url: Optional[str] = None


class MultiDocumentChatRequest(BaseModel):
    query: str
    documents: List[MultiDocumentItem]  # Up to 3 documents
    # Optional conversational history as newline-separated "User: ..."/"Assistant: ..." lines
    previous_chats: Optional[str] = None
