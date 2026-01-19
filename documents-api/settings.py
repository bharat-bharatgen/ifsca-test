import os
from dotenv import load_dotenv
from utils.prompts import PROMPTS

load_dotenv(".env")

# Environment variables
PORT = int(os.getenv("PORT", 9219))
APP_URL = os.getenv("APP_URL", "http://localhost:3000")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "your-google-api-key")

# Prompts - only essential ones for document upload
USER_CONTEXT_PARSE_DOCUMENT = PROMPTS.get_prompt('parse_document')

