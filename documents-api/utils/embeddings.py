import asyncio
import json
import logging
import os
import uuid
from typing import Dict, Any, Optional, List

import asyncpg
import google.generativeai as genai
import requests

from utils.retry_utils import retry_with_backoff
from database import get_pool

LOGGER = logging.getLogger(__name__)

def chunk_text(text: str, max_chars: int = 1500) -> list:
    """Split text into chunks for embedding"""
    paragraphs = text.split("\n")
    chunks, current = [], ""

    for para in paragraphs:
        if len(current) + len(para) < max_chars:
            current += para + "\n"
        else:
            if current.strip():
                chunks.append(current.strip())
            current = para + "\n"
    if current.strip():
        chunks.append(current.strip())
    
    return chunks


def _call_gemini_embed_content_sync(model_name: str, content: str, task_type: str, output_dimensionality: int) -> Dict[str, Any]:
    """
    Synchronous helper function to call Gemini embedding API.
    This is wrapped in asyncio.to_thread() to avoid blocking the event loop.
    """
    return genai.embed_content(
        model=model_name,
        content=content,
        task_type=task_type,
        output_dimensionality=output_dimensionality
    )


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
async def _call_gemini_embed_content(model_name: str, content: str, task_type: str, output_dimensionality: int) -> Dict[str, Any]:
    """
    Async helper function to call Gemini embedding API with retry logic.
    Uses asyncio.to_thread() to run the synchronous API call without blocking the event loop.
    """
    return await asyncio.to_thread(
        _call_gemini_embed_content_sync,
        model_name,
        content,
        task_type,
        output_dimensionality
    )


def _embedding_mode() -> str:
    """
    Select embedding provider.

    Rule you requested:
    - When LLM=selfhost  -> use self-host embeddings
    - When LLM=gemini or unset -> use Gemini embeddings
    """
    llm_mode = (os.getenv("LLM", "gemini") or "gemini").strip().lower()
    return "selfhost" if llm_mode == "selfhost" else "gemini"


def _selfhost_embed_sync(model_name: str, inputs: List[str]) -> Dict[str, Any]:
    api_base = (os.getenv("SELFHOST_API_BASE", "") or "").rstrip("/")
    api_key = os.getenv("SELFHOST_API_KEY", "")
    if not api_base or not api_key:
        raise ValueError("SELFHOST_API_BASE and SELFHOST_API_KEY are required for selfhost embeddings")

    resp = requests.post(
        f"{api_base}/embeddings",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model_name,
            "input": inputs,
            "encoding_format": "float",
        },
        timeout=120,
    )

    # Log detailed error body before raising for easier debugging
    if not resp.ok:
        body_preview = resp.text[:2000] if resp.text else ""
        LOGGER.error(
            "Selfhost embeddings request failed "
            f"(status=%s, model=%s, inputs_count=%s, body_preview=%r)",
            resp.status_code,
            model_name,
            len(inputs),
            body_preview,
        )

    resp.raise_for_status()
    return resp.json()


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
async def _call_selfhost_embeddings(model_name: str, inputs: List[str]) -> Dict[str, Any]:
    return await asyncio.to_thread(_selfhost_embed_sync, model_name, inputs)


@retry_with_backoff(max_retries=3, initial_delay=2.0, max_delay=60.0)
async def embed_text_256d(content: str) -> Dict[str, Any]:
    """
    Provider-agnostic embedding call returning a dict with at least:
      - embedding: List[float]
      - model_used: str
    """
    mode = _embedding_mode()
    if mode == "selfhost":
        # BharatGen / kalm-embedding has a maximum context length (e.g. 8192 tokens).
        # To avoid 400 ContextWindowExceededError, we truncate very long content before
        # calling the self-host embeddings endpoint. This still uses ONLY selfhost.
        max_chars = int(os.getenv("SELFHOST_EMBEDDING_MAX_CHARS", "18000"))
        if len(content) > max_chars:
            LOGGER.info(
                "Truncating content for selfhost embeddings from %s to %s characters "
                "to stay within context window",
                len(content),
                max_chars,
            )
            content = content[:max_chars]

        model = os.getenv("SELFHOST_EMBEDDING_MODEL", "kalm-embedding")
        data = await _call_selfhost_embeddings(model_name=model, inputs=[content])
        # OpenAI-compatible embedding format: {"data":[{"embedding":[...], "index":0}], ...}
        emb = (data.get("data") or [{}])[0].get("embedding") or []
        # Database schema and queries expect 256-d vectors.
        # Many self-hosted models (e.g. kalm-embedding) return higher dims (e.g. 3840),
        # so we truncate/pad to exactly 256 dimensions to keep compatibility.
        if len(emb) > 256:
            emb = emb[:256]
        elif len(emb) < 256:
            # Pad with zeros if the embedding is unexpectedly short
            emb = emb + [0.0] * (256 - len(emb))
        return {"embedding": emb, "model_used": model}

    # Default Gemini
    result = await _call_gemini_embed_content(
        model_name="gemini-embedding-001",
        content=content,
        task_type="retrieval_document",
        output_dimensionality=256,
    )
    return {"embedding": result["embedding"], "model_used": "gemini-embedding-001"}


async def generate_embedding(
    document_id: str,
    document_text: str,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate embeddings for document text and store in database.
    Uses document_info and document_embeddings tables (matching app schema).
    """
    try:
        if not document_id or not document_text:
            raise ValueError("document_id and document_text are required")

        LOGGER.info(f"Embedding request for document {document_id} ({len(document_text)} chars)")
        
        metadata = metadata or {}
        embedding_strategy = metadata.get('embedding_strategy', 'unknown')
        document_category = metadata.get('category', 'Unknown')
        category_confidence = metadata.get('category_confidence', 0.0)
        
        LOGGER.info(f"Embedding strategy: {embedding_strategy}")
        LOGGER.info(f"Document category: {document_category} (confidence: {category_confidence:.2f})")
        
        should_chunk = len(document_text) > 1500
        chunks = chunk_text(document_text) if should_chunk else [document_text]
        LOGGER.info(f"Document split into {len(chunks)} chunks (strategy: {embedding_strategy})")

        pool = await get_pool()
        async with pool.acquire() as conn:
                # Generate 256D embedding for full document
                result_256d = await embed_text_256d(document_text)
                embedding_256d = "[" + ",".join(map(str, result_256d["embedding"])) + "]"
                # Optional: store page-level text for citations (list of {"page": N, "text": "..."})
                pages: Optional[List[Dict[str, Any]]] = metadata.get("pages")
                json_doc = json.dumps({"pages": pages}) if pages else None
                # Insert/update document_info table (matching app schema); jsonDoc stores pages for citations
                await conn.execute("""
                    INSERT INTO document_info (id, "documentId", document, "embedding_256d", "embedding_model", "jsonDoc", "createdAt", "updatedAt")
                    VALUES ($1, $2, $3, $4::vector(256), $5, $6::jsonb, NOW(), NOW())
                    ON CONFLICT ("documentId") 
                    DO UPDATE SET document = EXCLUDED.document,
                                  "embedding_256d" = EXCLUDED."embedding_256d",
                                  "embedding_model" = EXCLUDED."embedding_model",
                                  "jsonDoc" = COALESCE(EXCLUDED."jsonDoc", document_info."jsonDoc"),
                                  "updatedAt" = NOW()
                """, str(uuid.uuid4()), document_id, document_text, embedding_256d, result_256d["model_used"], json_doc)
                
                # Delete old chunk embeddings
                await conn.execute('DELETE FROM document_embeddings WHERE "documentId" = $1', document_id)
                
                # Generate embeddings for chunks
                for idx, chunk in enumerate(chunks):
                    chunk_result_256d = await embed_text_256d(chunk)
                    chunk_embedding_256d = "[" + ",".join(map(str, chunk_result_256d["embedding"])) + "]"
                    
                    await conn.execute("""
                        INSERT INTO document_embeddings (id, "documentId", "chunkIndex", "textChunk", "embedding_256d", "embedding_model")
                        VALUES ($1, $2, $3, $4, $5::vector(256), $6)
                    """, str(uuid.uuid4()), document_id, idx, chunk, chunk_embedding_256d, chunk_result_256d["model_used"])

        return {
            "success": True,
            "document_id": document_id,
            "total_chunks": len(chunks),
            "dimensions": 256,
            "model_used": result_256d["model_used"],
            "message": f"Stored {len(chunks)} embeddings (1 full + {len(chunks)} chunked) with 256D vectors using {result_256d['model_used']}"
        }

    except Exception as e:
        LOGGER.error(f"Embedding failed: {e}", exc_info=True)
        raise

