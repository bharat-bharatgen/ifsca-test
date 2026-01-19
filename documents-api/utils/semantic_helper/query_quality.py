from typing import Dict, Any


def is_unclear_query(query: str, understanding: Dict[str, Any]) -> bool:
    query_lower = query.lower().strip()

    if len(query_lower.split()) <= 1:
        return True

    filters = understanding.get("filters", {})
    has_meaningful_filters = (
        filters.get("locations")
        or filters.get("types")
        or filters.get("document_numbers")
        or filters.get("exclude_suit")
        or filters.get("years")
        or filters.get("promisor")
        or filters.get("promisee")
        or (filters.get("value_range", {}).get("min") is not None)
        or (filters.get("value_range", {}).get("max") is not None)
        # LEGAL document type filters
        or filters.get("court")
        or filters.get("case_no")
        or filters.get("case_type")
        or filters.get("applicant")
        or filters.get("petitioner")
        or filters.get("respondent")
        or filters.get("plaintiff")
        or filters.get("defendant")
        or filters.get("advocate_name")
        or filters.get("judicature")
        or filters.get("coram")
        # LAND document type filters
        or filters.get("seller")
        or filters.get("purchaser")
        or filters.get("registration_no")
        or filters.get("survey_no")
        or filters.get("cts_no")
        or filters.get("gut_no")
        or filters.get("plot_no")
        or filters.get("village")
        or filters.get("taluka")
        or filters.get("pincode")
        # LIAISON document type filters
        or filters.get("company_name")
        or filters.get("authority_name")
        or filters.get("approval_no")
        or filters.get("order_no")
        or filters.get("building_name")
        or filters.get("project_name")
        or filters.get("sector")
        or filters.get("subject")
        or filters.get("drawing_no")
        or filters.get("building_type")
        or filters.get("commence_certificate")
        or filters.get("intimation_of_disapproval")
        or filters.get("intimation_of_approval")
        or filters.get("rera")
        # Date filters
        or filters.get("approval_date")
        or filters.get("expiry_date")
        or filters.get("drawing_date")
        or filters.get("application_date")
        or filters.get("case_date")
        or filters.get("registration_date")
        or filters.get("land_document_date")
    )

    search_terms = understanding.get("search_terms", [])
    generic_terms = ["documents", "contracts", "show", "find", "get", "give", "me", "all", "everything"]
    meaningful_terms = [term for term in search_terms if term.lower() not in generic_terms]

    if len(search_terms) == 2 and any(
        term in query_lower for term in ["find contracts", "show documents", "get documents", "give documents"]
    ):
        meaningful_terms = search_terms

    if not has_meaningful_filters and len(meaningful_terms) == 0:
        return True

    vague_patterns = [
        "everything", "all documents", "show all", "give me all", "find all",
        "what do you have", "what's available", "what can you show me",
    ]
    if any(pattern in query_lower for pattern in vague_patterns):
        return True

    vague_doc_patterns = [
        "lease document", "lease documents", "document", "documents",
        "contract document", "contract documents", "agreement document", "agreement documents",
        "sale document", "sale documents", "service document", "service documents",
    ]
    for pattern in vague_doc_patterns:
        if query_lower == pattern or query_lower.strip() == pattern:
            return True

    single_document_types = ["lease", "document", "documents"]
    if len(query_lower.split()) <= 2 and any(word in query_lower for word in single_document_types):
        return True

    return False


