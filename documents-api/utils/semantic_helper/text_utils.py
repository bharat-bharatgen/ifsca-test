from typing import List


def extract_user_message(query: str) -> str:
    if "User:" in query:
        lines: List[str] = query.split('\n')
        for line in reversed(lines):
            if line.strip().startswith("User:"):
                return line.replace("User:", "").strip()
    return query.strip()


def is_greeting(query: str) -> bool:
    query_lower = query.lower().strip()
    greeting_patterns = [
        "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
        "greetings", "howdy", "what's up", "sup", "yo", "hi there", "hello there",
        "good day", "morning", "afternoon", "evening", "hiya", "how are you",
        "how do you do", "nice to meet you", "pleased to meet you",
    ]

    if query_lower in greeting_patterns:
        return True

    for pattern in greeting_patterns:
        if query_lower.startswith(pattern):
            remaining = query_lower[len(pattern):].strip()
            remaining = (
                remaining.replace("!", "").replace("?", "").replace(".", "").replace(",", "")
            )
            if remaining and len(remaining.split()) > 0:
                filler_words = ["there", "how", "are", "you", "doing", "today"]
                meaningful_words = [word for word in remaining.split() if word not in filler_words]
                if meaningful_words:
                    return False
                if len(query_lower.split()) <= 4:
                    return True
                else:
                    return False
            if len(query_lower.split()) <= 3:
                return True

    if len(query_lower.split()) <= 2 and any(word in query_lower for word in ["hi", "hello", "hey"]):
        return True

    return False


