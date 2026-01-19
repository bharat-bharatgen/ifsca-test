from typing import Dict, Any, List


def remove_duplicate_documents(documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def make_key(doc: Dict[str, Any]) -> str:
        doc_no = (doc.get('document_number') or '').strip().lower()
        if doc_no and doc_no != 'n/a':
            return f"DOCNO::{doc_no}"
        title = (doc.get('title') or '').strip().lower()
        promisor = (doc.get('promisor') or '').strip().lower()
        promisee = (doc.get('promisee') or '').strip().lower()
        if title or promisor or promisee:
            return f"TRIPLE::{title}::{promisor}::{promisee}"
        doc_id = (doc.get('document_id') or '').strip()
        if doc_id:
            return f"ID::{doc_id}"
        content = (doc.get('content') or '').strip().lower()
        return f"CONTENT::{hash(content)}"

    unique: Dict[str, Dict[str, Any]] = {}
    for d in documents:
        key = make_key(d)
        if key not in unique or d.get("similarity_score", 1e9) < unique[key].get("similarity_score", 1e9):
            unique[key] = d
    return sorted(unique.values(), key=lambda x: x.get("similarity_score", 1e9))


def ensure_unique_documents(documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: Dict[str, Dict[str, Any]] = {}

    def key_for(doc: Dict[str, Any]) -> str:
        doc_no = (doc.get('document_number') or '').strip().lower()
        if doc_no and doc_no != 'n/a':
            return f"DOCNO::{doc_no}"
        title = (doc.get('title') or '').strip().lower()
        promisor = (doc.get('promisor') or '').strip().lower()
        promisee = (doc.get('promisee') or '').strip().lower()
        if title or promisor or promisee:
            return f"TRIPLE::{title}::{promisor}::{promisee}"
        doc_id = (doc.get('document_id') or '').strip()
        if doc_id:
            return f"ID::{doc_id}"
        content = (doc.get('content') or '').strip().lower()
        return f"CONTENT::{hash(content)}"

    unique_docs: List[Dict[str, Any]] = []
    for d in documents:
        k = key_for(d)
        if k not in seen:
            seen[k] = d
            unique_docs.append(d)
    return unique_docs


