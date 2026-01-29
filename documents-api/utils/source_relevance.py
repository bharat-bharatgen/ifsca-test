"""Helper to detect when AI response indicates no relevant info was found - don't show sources."""

import re


# Phrases that indicate the AI found nothing relevant - don't show sources in these cases
NOT_FOUND_PATTERNS = [
    r"\bis\s+not\s+mentioned\b",
    r"\bnot\s+mentioned\b",
    r"\bnot\s+found\b",
    r"\bcouldn't\s+find\b",
    r"\bcould\s+not\s+find\b",
    r"\bno\s+documents?\s+(?:were\s+)?(?:found|relevant)\b",
    r"\bdoes\s+not\s+appear\b",
    r"\bdoesn't\s+appear\b",
    r"\bis\s+not\s+in\s+(?:the\s+)?documents?\b",
    r"\bnot\s+in\s+(?:the\s+)?documents?\b",
    r"\bnot\s+in\s+any\s+(?:of\s+)?(?:the\s+)?documents?\b",
    r"\bno\s+information\s+(?:was\s+)?(?:found|available)\b",
    r"\bno\s+relevant\s+(?:information|documents?)\b",
    r"\b(?:term|query|word)\s+.*\s+is\s+not\s+(?:mentioned|found)\b",
    r"\b(?:i\s+)?couldn't\s+find\s+any\s+relevant\b",
    r"\b(?:i\s+)?could\s+not\s+find\s+any\s+relevant\b",
]


def response_indicates_not_found(response_text: str) -> bool:
    """
    Return True if the AI response indicates it found nothing relevant.
    In these cases we should NOT show sources (would be misleading).
    """
    if not response_text or not response_text.strip():
        return False
    text_lower = response_text.lower().strip()
    # Must be a short-ish response (likely a "not found" type answer)
    if len(text_lower) > 800:
        return False
    for pattern in NOT_FOUND_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return True
    return False
