"""
LLM Client - Configurable provider for chat completions.
Supports Gemini and OpenAI-compatible APIs (including self-hosted LiteLLM).
Configuration is read from the database (llm_config table).
"""

import json
import logging
import os
from typing import Dict, Any, Optional, AsyncIterator, Tuple

import requests
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

LOGGER = logging.getLogger(__name__)

# Default config (fallback if DB config not available)
DEFAULT_PROVIDER = os.getenv("LLM_PROVIDER", "GEMINI")  # "GEMINI" or "OPENAI"
DEFAULT_API_BASE = os.getenv("OPENAI_API_BASE", "http://localhost:8005/v1")
DEFAULT_API_KEY = os.getenv("OPENAI_API_KEY", "sk-key")
DEFAULT_MODEL = os.getenv("OPENAI_MODEL", "gpt-oss-20b")
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


class LLMClient:
    """
    Unified LLM client that switches between Gemini and OpenAI-compatible APIs.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        """
        Initialize with optional config dict.
        If config is None, uses environment variables.
        
        Config dict should have:
        - provider: "GEMINI" or "OPENAI"
        - apiBase: API base URL (for OpenAI)
        - apiKey: API key
        - modelName: Model name
        """
        if config:
            self.provider = config.get("provider", DEFAULT_PROVIDER)
            self.api_base = config.get("apiBase", DEFAULT_API_BASE)
            self.api_key = config.get("apiKey", DEFAULT_API_KEY)
            self.model_name = config.get("modelName", DEFAULT_MODEL)
        else:
            self.provider = DEFAULT_PROVIDER
            self.api_base = DEFAULT_API_BASE
            self.api_key = DEFAULT_API_KEY
            self.model_name = DEFAULT_MODEL if self.provider == "OPENAI" else GEMINI_MODEL

        # Configure Gemini if needed
        if self.provider == "GEMINI":
            genai.configure(api_key=GEMINI_API_KEY or self.api_key, transport="rest")

        LOGGER.info(f"LLM Client initialized: provider={self.provider}, model={self.model_name}")

    def chat_completion(
        self,
        prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 8192,
        **kwargs
    ) -> Tuple[str, int, int]:
        """
        Generate a chat completion.
        
        Returns:
            Tuple of (response_text, input_tokens, output_tokens)
        """
        LOGGER.info(f"🤖 Chat request using provider={self.provider}, model={self.model_name}")
        if self.provider == "GEMINI":
            return self._gemini_chat(prompt, temperature, max_tokens, **kwargs)
        else:
            return self._openai_chat(prompt, temperature, max_tokens, **kwargs)
        
    def _gemini_chat(
        self,
        prompt: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> Tuple[str, int, int]:
        """Chat using Gemini API."""
        try:
            model = genai.GenerativeModel(
                self.model_name,
                generation_config={
                    "temperature": temperature,
                    "max_output_tokens": max_tokens,
                    **kwargs
                }
            )
            response = model.generate_content(prompt)
            response.resolve()
            
            LOGGER.debug(f"Gemini response: {response}")

            text = (response.text or "").strip()
            
            # Extract token usage
            usage = response.usage_metadata if hasattr(response, "usage_metadata") else None
            input_tokens = usage.prompt_token_count if usage else 0
            output_tokens = usage.candidates_token_count if usage else 0

            return text, input_tokens, output_tokens
        except Exception as e:
            LOGGER.error(f"Gemini chat error: {e}")
            raise

    def _openai_chat(
        self,
        prompt: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> Tuple[str, int, int]:
        """Chat using OpenAI-compatible API (LiteLLM, vLLM, etc.)."""
        try:
            response = requests.post(
                f"{self.api_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": self.model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    **kwargs
                },
                timeout=120
            )
            response.raise_for_status()
            data = response.json()
            
            LOGGER.debug(f"OpenAI response data: {data}")

            text = data["choices"][0]["message"]["content"].strip()
            usage = data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)

            return text, input_tokens, output_tokens
        except Exception as e:
            LOGGER.error(f"OpenAI-compatible chat error: {e}")
            raise

    async def stream_chat_completion(
        self,
        prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 8192,
        **kwargs
    ) -> AsyncIterator[Dict[str, Any]]:
        """
        Stream a chat completion.
        
        Yields dicts with:
        - type: "content" | "token_usage"
        - For content: text (str)
        - For token_usage: input_tokens, output_tokens (int)
        """
        LOGGER.info(f"🤖 Stream request using provider={self.provider}, model={self.model_name}")
        if self.provider == "GEMINI":
            async for chunk in self._gemini_stream(prompt, temperature, max_tokens, **kwargs):
                yield chunk
        else:
            async for chunk in self._openai_stream(prompt, temperature, max_tokens, **kwargs):
                yield chunk

    async def _gemini_stream(
        self,
        prompt: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> AsyncIterator[Dict[str, Any]]:
        """Stream using Gemini API."""
        try:
            model = genai.GenerativeModel(
                self.model_name,
                generation_config={
                    "temperature": temperature,
                    "max_output_tokens": max_tokens,
                    **kwargs
                }
            )
            
            response = await model.generate_content_async(prompt, stream=True)
            
            input_tokens = 0
            output_tokens = 0

            async for chunk in response:
                if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
                    input_tokens = chunk.usage_metadata.prompt_token_count or input_tokens
                    output_tokens = chunk.usage_metadata.candidates_token_count or output_tokens

                if hasattr(chunk, "text") and chunk.text:
                    yield {"type": "content", "text": chunk.text}

            yield {"type": "token_usage", "input_tokens": input_tokens, "output_tokens": output_tokens}
        except Exception as e:
            LOGGER.error(f"Gemini stream error: {e}")
            raise

    async def _openai_stream(
        self,
        prompt: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> AsyncIterator[Dict[str, Any]]:
        """Stream using OpenAI-compatible API."""
        import asyncio
        
        try:
            # Use sync requests in thread for compatibility
            def make_request():
                return requests.post(
                    f"{self.api_base}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model_name,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                        "stream": True,
                        **kwargs
                    },
                    stream=True,
                    timeout=120
                )

            response = await asyncio.to_thread(make_request)
            response.raise_for_status()

            input_tokens = 0
            output_tokens = 0

            for line in response.iter_lines():
                if not line:
                    continue
                
                line_text = line.decode("utf-8")
                if line_text.startswith("data: "):
                    data_str = line_text[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    
                    try:
                        data = json.loads(data_str)
                        
                        LOGGER.debug(f"OpenAI stream chunk data: {data}")
                        # Extract content
                        if "choices" in data and len(data["choices"]) > 0:
                            delta = data["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield {"type": "content", "text": content}
                        
                        # Extract usage if present
                        if "usage" in data:
                            input_tokens = data["usage"].get("prompt_tokens", input_tokens)
                            output_tokens = data["usage"].get("completion_tokens", output_tokens)
                    except json.JSONDecodeError:
                        continue

            yield {"type": "token_usage", "input_tokens": input_tokens, "output_tokens": output_tokens}
        except Exception as e:
            LOGGER.error(f"OpenAI stream error: {e}")
            raise


# Cache for LLM client instance
_llm_client_cache: Optional[LLMClient] = None


def get_llm_client(config: Optional[Dict[str, Any]] = None) -> LLMClient:
    """
    Get LLM client with optional config.
    Uses cached client if no config provided.
    Reads from environment variables (LLM_PROVIDER, OPENAI_API_BASE, etc.)
    """
    global _llm_client_cache

    if config:
        return LLMClient(config)

    if _llm_client_cache is None:
        _llm_client_cache = LLMClient()

    return _llm_client_cache


def clear_llm_client_cache():
    """Clear the cached LLM client (call after config changes)."""
    global _llm_client_cache
    _llm_client_cache = None
