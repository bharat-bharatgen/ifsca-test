import os
from dotenv import load_dotenv
from utils.prompts import PROMPTS

load_dotenv(".env")

# Environment variables
PORT = int(os.getenv("PORT", 9219))
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "your-google-api-key")

# Provider: "GEMINI" or "OPENAI"
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "GEMINI")

# OpenAI-compatible API settings (for self-hosted LiteLLM, vLLM, etc.)
OPENAI_API_BASE = os.getenv("OPENAI_API_BASE", "http://localhost:8005/v1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "sk-key")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-oss-20b")

# Gemini model name
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Prompts - only essential ones for document upload
USER_CONTEXT_PARSE_DOCUMENT = PROMPTS.get_prompt('parse_document')

