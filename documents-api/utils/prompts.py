
import os
import yaml
from typing import Dict
import logging

LOGGER = logging.getLogger(__name__)

class PromptLoader:
    _instance = None
    _prompts = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(PromptLoader, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if self._prompts is None:
            self._prompts = self._load_prompts()

    def _load_prompts(self) -> Dict[str, str]:
        """Load prompts from individual YAML files"""
        prompts = {}
        # prompts/ is at the root level, utils/ is one level down
        prompts_dir = os.path.join(os.path.dirname(__file__), '..', 'prompts')
        
        # Load parse_document.yml
        parse_doc_path = os.path.join(prompts_dir, 'parse_document.yml')
        try:
            with open(parse_doc_path, 'r', encoding='utf-8') as f:
                prompts['parse_document'] = f.read().strip()
        except Exception as e:
            LOGGER.error(f"Failed to load parse_document.yml: {e}")
        
        # Load classify_document.yml
        classify_doc_path = os.path.join(prompts_dir, 'classify_document.yml')
        try:
            with open(classify_doc_path, 'r', encoding='utf-8') as f:
                classify_prompt = f.read().strip()
                prompts['classify_document'] = classify_prompt
        except Exception as e:
            LOGGER.error(f"Failed to load classify_document.yml: {e}")
        
        # Load chat_with_document.yml
        chat_with_doc_path = os.path.join(prompts_dir, 'chat_with_document.yml')
        try:
            with open(chat_with_doc_path, 'r', encoding='utf-8') as f:
                prompts['chat_with_document'] = f.read().strip()
        except Exception as e:
            LOGGER.error(f"Failed to load chat_with_document.yml: {e}")
        
        # Load chat_with_multiple_documents.yml
        chat_multi_doc_path = os.path.join(prompts_dir, 'chat_with_multiple_documents.yml')
        try:
            with open(chat_multi_doc_path, 'r', encoding='utf-8') as f:
                prompts['chat_with_multiple_documents'] = f.read().strip()
        except Exception as e:
            LOGGER.error(f"Failed to load chat_with_multiple_documents.yml: {e}")
        
        return prompts

    def get_prompt(self, prompt_name: str) -> str:
        """Get a specific prompt by name"""
        return self._prompts.get(prompt_name, '')

# Create singleton instance
PROMPTS = PromptLoader()
