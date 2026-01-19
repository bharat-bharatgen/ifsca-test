import json
import logging
import re
from typing import Dict, Any


LOGGER = logging.getLogger(__name__)


def understand_query(query: str, model) -> Dict[str, Any]:
    prompt = f"""
        Understand this user query and extract relevant information for document search.

        Query: "{query}"

        Return ONLY a JSON object with this structure (leave arrays empty unless explicitly present in the query):
        {{
            "is_count_query": false,
            "search_terms": [],
            "filters": {{
                "locations": [],
                "years": [],
                "types": [],
                "document_numbers": [],
                "exclude_suit": false,
                "value_range": {{"min": null, "max": null}},
                "no_of_pages_range": {{"min": null, "max": null}},
                "promisor": [],
                "promisee": [],
                "court": [],
                "case_no": [],
                "case_type": [],
                "applicant": [],
                "petitioner": [],
                "respondent": [],
                "plaintiff": [],
                "defendant": [],
                "advocate_name": [],
                "judicature": [],
                "coram": [],
                "seller": [],
                "purchaser": [],
                "registration_no": [],
                "survey_no": [],
                "cts_no": [],
                "gut_no": [],
                "plot_no": [],
                "village": [],
                "taluka": [],
                "pincode": [],
                "company_name": [],
                "authority_name": [],
                "approval_no": [],
                "order_no": [],
                "building_name": [],
                "project_name": [],
                "sector": [],
                "subject": [],
                "drawing_no": [],
                "building_type": [],
                "commence_certificate": [],
                "intimation_of_disapproval": [],
                "intimation_of_approval": [],
                "rera": [],
                "approval_date": [],
                "expiry_date": [],
                "drawing_date": [],
                "application_date": [],
                "case_date": [],
                "registration_date": [],
                "land_document_date": [],
                "land_document_type": []
            }},
            "response_style": "list"
        }}

        Guidelines:
        - is_count_query: true if user wants numbers (how many, total, count)
        - search_terms: key concepts to search for in documents (do not invent)
        - locations: Geographic locations (city, state, area) - BUT NOT court names, building names, or other document-specific fields
        - years: any years or date ranges mentioned (BUT NOT years that are part of case numbers like "CIV-4267/2025" - in that case, extract the full case number to case_no field and do NOT extract 2025 as a year)
        - types: document types mentioned (SALE, SERVICE, CONTRACT, LEASE, LAND, LIAISON, LEGAL, OTHER) - map "sales" to "SALE", "contracts" to "CONTRACT", "land" to "LAND", "liaison" to "LIAISON", "legal" to "LEGAL", etc.
        - document_numbers: extract FULL document numbers when explicitly mentioned (e.g., "document number X" or "documentNumber X" should extract "X" as the complete number). If query mentions "suit" without a specific number, add "suit" to document_numbers array for documentNumber field search
        - exclude_suit: if query mentions "not have suit", "without suit", "no suit", "didn't consist of suit", etc., set to true
        - value_range: any monetary amounts or ranges mentioned
        - no_of_pages_range: any number of pages or page ranges mentioned (e.g., "5 pages", "10-15 pages", "more than 20 pages", "less than 10 pages"). Extract as {{"min": number or null, "max": number or null}}. For single values like "5 pages", set both min and max to 5. For ranges like "10-15 pages", set min to 10 and max to 15. For "more than 20", set min to 20 and max to null. For "less than 10", set min to null and max to 10.
        - promisor: extract names/entities mentioned as promisor (person/company making the promise)
        - promisee: extract names/entities mentioned as promisee (person/company receiving the promise)
        - court: extract court names when mentioned (e.g., "High Court of Delhi", "Supreme Court") - DO NOT put court names in locations
        - case_no: extract case numbers when mentioned (e.g., "Case No. 123", "Suit No. 456")
        - case_type: extract case types (e.g., "Civil Suit", "Criminal Case", "Writ Petition")
        - applicant: extract applicant names for LEGAL documents
        - petitioner: extract petitioner names for LEGAL documents
        - respondent: extract respondent names for LEGAL documents
        - plaintiff: extract plaintiff names for LEGAL documents
        - defendant: extract defendant names for LEGAL documents
        - advocate_name: extract advocate/lawyer names for LEGAL documents
        - judicature: extract judicature type (e.g., "High Court", "District Court", "Supreme Court")
        - coram: extract coram (judges) for LEGAL documents
        - seller: extract seller names for LAND documents (e.g., "seller ABC", "sold by XYZ")
        - purchaser: extract purchaser names for LAND documents (e.g., "purchaser ABC", "bought by XYZ")
        - registration_no: extract registration numbers for LAND documents
        - survey_no: extract survey numbers for LAND documents
        - cts_no: extract CTS numbers for LAND documents
        - gut_no: extract GUT numbers for LAND documents
        - plot_no: extract plot numbers for LAND documents
        - village: extract village names for LAND documents
        - taluka: extract taluka names for LAND documents
        - pincode: extract PIN codes for LAND documents
        - company_name: extract company names for LIAISON documents (e.g., "company ABC", "applicant XYZ")
        - authority_name: extract authority names for LIAISON documents (e.g., "authority ABC", "approved by XYZ")
        - approval_no: extract approval numbers for LIAISON documents
        - order_no: extract order numbers for LIAISON documents
        - building_name: extract building names for LIAISON documents (e.g., "ABC Tower", "XYZ Building") - extract the actual building name, not just the word "building"
        - project_name: extract project names for LIAISON documents
        - sector: extract sector/zone information for LIAISON documents
        - subject: extract subject matter for LIAISON documents (e.g., "construction approval", "building permit") - extract the actual subject matter, not just the word "subject"
        - drawing_no: extract drawing numbers for LIAISON documents
        - building_type: extract building types (e.g., "Residential", "Commercial") for LIAISON documents
        - commence_certificate: extract commencement certificate numbers for LIAISON documents
        - intimation_of_disapproval: extract IOD numbers for LIAISON documents
        - intimation_of_approval: extract IOA numbers for LIAISON documents
        - rera: extract RERA numbers or mentions for LIAISON documents
        - approval_date: extract approval dates for LIAISON documents as an array. For single dates: ["2024-01-15"] or ["2024"]. For ranges: ["2016", "2020"] or ["2016-01-01", "2020-12-31"]. Examples: "approval date 2024-01-15" -> ["2024-01-15"], "approval from 2016 to 2020" -> ["2016", "2020"]
        - expiry_date: extract expiry dates for LIAISON documents as an array. For single dates: ["2025-12-31"] or ["2025"]. For ranges: ["2016", "2020"]. Examples: "expiry date 2025" -> ["2025"], "expires from 2016 to 2020" -> ["2016", "2020"]
        - drawing_date: extract drawing dates for LIAISON documents as an array. For single dates: ["2024-03-20"] or ["2024"]. For ranges: ["2016", "2020"]
        - application_date: extract application dates for LIAISON documents as an array. For single dates: ["2024-01-15"] or ["2024"]. For ranges: ["2016", "2020"]. Examples: "application date 2024" -> ["2024"], "application from 2016 to 2020" -> ["2016", "2020"]
        - case_date: extract case dates for LEGAL documents as an array. For single dates: ["2024-05-10"] or ["2024"]. For ranges: ["2016", "2020"]
        - registration_date: extract registration dates for LAND documents as an array. For single dates: ["2024-01-15"] or ["2024"]. For ranges: ["2016", "2020"]. Examples: "registration date 2024" -> ["2024"], "registered from 2016 to 2020" -> ["2016", "2020"]
        - land_document_date: extract document dates for LAND documents as an array. For single dates: ["2024-02-20"] or ["2024"]. For ranges: ["2016", "2020"]
        - land_document_type: extract land document types for LAND documents (e.g., "Sale Deed", "Gift Deed", "Partition Deed") as an array. Examples: "land document type sale deed" -> ["sale deed"], "sale deed" -> ["sale deed"]
        - response_style: "list" for showing documents, "count" for numbers only
        
        IMPORTANT: 
        - If the query contains "location [anything]", extract that "anything" as a location ONLY if it's a geographic place
        - If the query contains "court [name]" or "with court [name]" or "document with court [name]", extract the court name to "court" field, NOT locations
        - If the query contains "type [anything]" or mentions document types, extract the type
        - If the query explicitly mentions a document number (e.g., "document number Suit No. 396 of 2006"), extract the FULL document number exactly as mentioned (e.g., "Suit No. 396 of 2006")
        - If the query mentions "suit" without a specific document number, add "suit" to document_numbers array (this searches in documentNumber field)
        - If the query mentions "promisor [name]" or "promisor is [name]", extract the name as promisor
        - If the query mentions "promisee [name]" or "promisee is [name]", extract the name as promisee
        - If the query mentions "between [name1] and [name2]", consider both as potential promisor/promisee
        - If the query mentions "documents with [name]" or "contracts involving [name]", extract the name for both promisor and promisee
        - If the query mentions "case [number]" or "case no [number]", extract the FULL case number (including any year suffix like /2025) to case_no field. Do NOT extract the year separately - it's part of the case number.
        - If the query mentions "case type [type]", extract to case_type field
        - If the query mentions "applicant [name]", "petitioner [name]", "respondent [name]", "plaintiff [name]", "defendant [name]", extract to respective fields
        - If the query mentions "advocate [name]" or "lawyer [name]", extract to advocate_name field
        - If the query mentions "judicature [type]", extract to judicature field
        - If the query mentions "coram [judges]", extract to coram field
        - If the query mentions "seller [name]" or "purchaser [name]", extract to respective fields
        - If the query mentions "registration [number]" or "registration no [number]", extract to registration_no field
        - If the query mentions "survey [number]" or "survey no [number]", extract to survey_no field
        - If the query mentions "cts [number]" or "cts no [number]", extract to cts_no field
        - If the query mentions "gut [number]" or "gut no [number]", extract to gut_no field
        - If the query mentions "plot [number]" or "plot no [number]", extract to plot_no field
        - If the query mentions "village [name]", extract to village field
        - If the query mentions "taluka [name]", extract to taluka field
        - If the query mentions "pincode [code]" or "pin code [code]", extract to pincode field
        - If the query mentions "company [name]" or "authority [name]" for approval documents, extract to respective fields
        - If the query mentions "order [number]" or "order no [number]", extract to order_no field
        - If the query mentions "sector [name]", extract to sector field
        - If the query mentions "subject [matter]" or "subject [anything]" or "subject matter [anything]", extract the subject matter to subject field (e.g., "subject construction approval" -> ["construction approval"])
        - If the query mentions "building name [name]" or "building [name]" (when referring to a building name), extract to building_name field (e.g., "building name ABC Tower" -> ["ABC Tower"], "building XYZ approval" -> ["XYZ"])
        - If the query mentions "drawing [number]" or "drawing no [number]", extract to drawing_no field
        - If the query mentions "building type [type]", extract to building_type field
        - If the query mentions "commence certificate [number]" or "commencement certificate [number]", extract to commence_certificate field
        - If the query mentions "iod [number]" or "intimation of disapproval [number]", extract to intimation_of_disapproval field
        - If the query mentions "ioa [number]" or "intimation of approval [number]", extract to intimation_of_approval field
        - If the query mentions "approval date [date]" or "approved on [date]" or "approval on [date]", extract the date to approval_date array. For single dates: ["2024-01-15"] or ["2024"]. For ranges like "from 2016 to 2020": ["2016", "2020"]
        - If the query mentions "expiry date [date]" or "expires on [date]" or "expiry on [date]", extract the date to expiry_date array. For single dates: ["2025-12-31"] or ["2025"]. For ranges: ["2016", "2020"]
        - If the query mentions "drawing date [date]" or "drawn on [date]", extract the date to drawing_date array. For single dates: ["2024-03-20"] or ["2024"]. For ranges: ["2016", "2020"]
        - If the query mentions "application date [date]" or "applied on [date]" or "application on [date]", extract the date to application_date array. For single dates: ["2024-01-15"] or ["2024"]. For ranges: ["2016", "2020"]
        - If the query mentions "case date [date]" or "case on [date]", extract the date to case_date array. For single dates: ["2024-05-10"] or ["2024"]. For ranges: ["2016", "2020"]
        - If the query mentions "registration date [date]" or "registered on [date]" or "registration on [date]", extract the date to registration_date array. For single dates: ["2024-01-15"] or ["2024"]. For ranges: ["2016", "2020"]
        - If the query mentions "document date [date]" for land documents or "land document date [date]", extract the date to land_document_date array. For single dates: ["2024-02-20"] or ["2024"]. For ranges: ["2016", "2020"]
        - If the query mentions "land document type [type]" or "document type [type]" for land documents (e.g., "sale deed", "gift deed", "partition deed"), extract the type to land_document_type array. Examples: "land document type sale deed" -> ["sale deed"], "sale deed documents" -> ["sale deed"]
        - If the query mentions common land document types like "sale deed", "gift deed", "partition deed", "lease deed", "mortgage deed" and the document type is LAND, also extract to land_document_type array
        - If the query mentions "number of pages", "pages", "no of pages", "total pages" with a number or range, extract to no_of_pages_range. Examples: "5 pages" -> {{"min": 5, "max": 5}}, "10-15 pages" -> {{"min": 10, "max": 15}}, "more than 20 pages" -> {{"min": 20, "max": null}}, "less than 10 pages" -> {{"min": null, "max": 10}}
        - For date ranges, extract as array with two elements: ["start_date", "end_date"]. Examples: "from 2016 to 2020" -> ["2016", "2020"], "between 2016 and 2020" -> ["2016", "2020"]
        - Map common variations: "sales" -> "SALE", "contracts" -> "CONTRACT", "services" -> "SERVICE", "land" -> "LAND", "lands" -> "LAND", "liaison" -> "LIAISON", "liaisons" -> "LIAISON", "legal" -> "LEGAL", "legals" -> "LEGAL"
        - Extract ONLY what is present in the query. If not present, leave arrays empty or null
        """

    try:
        response = model.generate_content(prompt)
        response.resolve()
        response_text = response.text.strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        understanding = json.loads(response_text)
        
        # Extract token usage from response
        usage_metadata = response.usage_metadata if hasattr(response, 'usage_metadata') else None
        understanding["_token_usage"] = {
            "input_tokens": usage_metadata.prompt_token_count if usage_metadata else 0,
            "output_tokens": usage_metadata.candidates_token_count if usage_metadata else 0,
        }
        understanding.setdefault("is_count_query", False)
        understanding.setdefault("search_terms", [])
        understanding.setdefault("filters", {})
        understanding.setdefault("response_style", "list")

        # Sanitize: drop any invented filters that are not present in the query text
        ql = query.lower()
        filters = understanding.get("filters", {})

        # Locations: keep only those that appear in the query
        if isinstance(filters.get("locations"), list):
            filters["locations"] = [loc for loc in filters["locations"] if isinstance(loc, str) and loc.lower() in ql]

        # Types: keep only known types that appear in the query wording
        if isinstance(filters.get("types"), list):
            type_words = {
                "sale": ["sale", "sales"],
                "service": ["service", "services"],
                "contract": ["contract", "contracts"],
                "lease": ["lease", "leases", "rental", "rentals"],
                "land": ["land", "lands", "property", "properties", "real estate", "sale deed", "property deed"],
                "liaison": ["liaison", "liaisons", "approval", "approvals", "permit", "permits", "rera", "building approval", "construction approval"],
                "legal": ["legal", "legals", "case", "cases", "court", "courts", "lawsuit", "affidavit", "affidavits"],
                "other": ["other", "others"],
            }
            kept_types = []
            for t in filters["types"]:
                t_upper = (t or "").upper()
                # Check if type matches any known type and keywords are present in query
                for type_key, keywords in type_words.items():
                    type_name = type_key.upper()
                    if t_upper == type_name and any(w in ql for w in keywords):
                        kept_types.append(type_name)
                        break
            filters["types"] = kept_types

        # Promisor/Promisee: keep only names that occur in the query
        for key in ["promisor", "promisee"]:
            if isinstance(filters.get(key), list):
                filters[key] = [name for name in filters[key] if isinstance(name, str) and name.lower() in ql]

        # Court: extract court names and remove from locations if mistakenly added
        if isinstance(filters.get("court"), list) and filters["court"]:
            # If court is mentioned, remove court names from locations
            court_keywords = ["court", "high court", "supreme court", "district court"]
            if any(keyword in ql for keyword in court_keywords):
                # Remove any location that contains "court" or matches court names
                if isinstance(filters.get("locations"), list):
                    filters["locations"] = [
                        loc for loc in filters["locations"]
                        if not any(court in loc.lower() for court in ["court", "high court", "supreme court"])
                    ]
        else:
            # Fallback: if query mentions "court" but AI didn't extract it, try to extract it
            if "court" in ql and isinstance(filters.get("locations"), list):
                # Check if any location looks like a court name
                potential_courts = [loc for loc in filters["locations"] if "court" in loc.lower()]
                if potential_courts:
                    filters["court"] = potential_courts
                    # Remove from locations
                    filters["locations"] = [loc for loc in filters["locations"] if loc not in potential_courts]

        # If a document number is explicitly extracted (typical of queries like
        # "give me document with number X"), ignore years to avoid over-filtering
        # when the number string itself contains a year fragment (e.g., TNN-5-4321/2015).
        if isinstance(filters.get("document_numbers"), list) and filters["document_numbers"]:
            if "number" in ql or "document number" in ql or "doc number" in ql:
                filters["years"] = []
        
        # If a case number is explicitly extracted (e.g., "case no CIV-4267/2025"),
        # ignore years to avoid over-filtering when the case number contains a year.
        if isinstance(filters.get("case_no"), list) and filters["case_no"]:
            # Clear years if query mentions case number OR if case_no contains a year pattern (e.g., /2025)
            case_has_year_pattern = any(
                re.search(r'[/\-]\s*\d{4}', str(case_no)) for case_no in filters["case_no"]
            )
            if "case no" in ql or "case number" in ql or "case#" in ql or "caseno" in ql or case_has_year_pattern:
                filters["years"] = []

        understanding["filters"] = filters
        LOGGER.info(f"AI Understanding (sanitized) for query '{query}': {understanding}")
        return understanding
    except Exception as e:
        LOGGER.error(f"Error in query understanding: {str(e)}")
        fallback_result = fallback_understanding(query)
        # Add token usage (0 for fallback since no AI call was made)
        fallback_result["_token_usage"] = {"input_tokens": 0, "output_tokens": 0}
        LOGGER.info(f"Using fallback understanding due to AI error: {fallback_result}")
        return fallback_result


def fallback_understanding(query: str) -> Dict[str, Any]:
    query_lower = query.lower()

    is_count = any(word in query_lower for word in ["how many", "count", "total", "number of"])
    search_terms = query.split()

    locations = []
    if "location" in query_lower:
        words = query.split()
        for i, word in enumerate(words):
            if word.lower() == "location" and i + 1 < len(words):
                location = words[i + 1].lower().strip()
                if location and location not in ["in", "from", "of", "with"]:
                    locations.append(location)

    # Extract court names - prioritize court field over location
    courts = []
    # Pattern to capture full court names like "The High Court of Delhi at New Delhi"
    # Match "court" followed by everything until end of string or a clear stopping point
    court_patterns = [
        r"document\s+with\s+court\s+(.+?)(?:\s*$|\.|,|;|\?)",  # "document with court [name]"
        r"with\s+court\s+(.+?)(?:\s*$|\.|,|;|\?)",  # "with court [name]"
        r"court\s+(.+?)(?:\s*$|\.|,|;|\?)",  # "court [name]"
    ]
    for pattern in court_patterns:
        matches = re.findall(pattern, query, re.IGNORECASE)
        for match in matches:
            court_name = match.strip()
            # Clean up: remove trailing punctuation and common stop words
            court_name = re.sub(r'[,;\.\?]+$', '', court_name).strip()
            if court_name and len(court_name) > 3:  # Minimum length to avoid false positives
                courts.append(court_name)
                # Remove from locations if it was mistakenly added
                if court_name.lower() in [loc.lower() for loc in locations]:
                    locations = [loc for loc in locations if loc.lower() != court_name.lower()]
                break
        if courts:
            break

    types = []
    if "type" in query_lower:
        words = query.split()
        for i, word in enumerate(words):
            if word.lower() == "type" and i + 1 < len(words):
                doc_type = words[i + 1].lower().strip()
                if doc_type and doc_type not in ["of", "is", "with", "in"]:
                    type_mapping = {
                        "sale": "SALE",
                        "sales": "SALE",
                        "contract": "CONTRACT",
                        "contracts": "CONTRACT",
                        "service": "SERVICE",
                        "services": "SERVICE",
                        "lease": "LEASE",
                        "leases": "LEASE",
                        "land": "LAND",
                        "lands": "LAND",
                        "liaison": "LIAISON",
                        "liaisons": "LIAISON",
                        "legal": "LEGAL",
                        "legals": "LEGAL",
                        "other": "OTHER",
                        "others": "OTHER",
                    }
                    if doc_type in type_mapping:
                        types.append(type_mapping[doc_type])
                    else:
                        types.append(doc_type.upper())

    type_keywords = ["sale", "sales", "contract", "contracts", "service", "services", "lease", "leases", 
                     "land", "lands", "property", "properties", "real estate", "sale deed", "property deed",
                     "liaison", "liaisons", "approval", "approvals", "permit", "permits", "rera", "building approval", "construction approval",
                     "legal", "legals", "case", "cases", "court", "courts", "lawsuit", "affidavit", "affidavits",
                     "other", "others"]
    for keyword in type_keywords:
        if keyword in query_lower:
            type_mapping = {
                "sale": "SALE",
                "sales": "SALE",
                "contract": "CONTRACT",
                "contracts": "CONTRACT",
                "service": "SERVICE",
                "services": "SERVICE",
                "lease": "LEASE",
                "leases": "LEASE",
                "land": "LAND",
                "lands": "LAND",
                "property": "LAND",
                "properties": "LAND",
                "real estate": "LAND",
                "sale deed": "LAND",
                "property deed": "LAND",
                "liaison": "LIAISON",
                "liaisons": "LIAISON",
                "approval": "LIAISON",
                "approvals": "LIAISON",
                "permit": "LIAISON",
                "permits": "LIAISON",
                "rera": "LIAISON",
                "building approval": "LIAISON",
                "construction approval": "LIAISON",
                "legal": "LEGAL",
                "legals": "LEGAL",
                "case": "LEGAL",
                "cases": "LEGAL",
                "court": "LEGAL",
                "courts": "LEGAL",
                "lawsuit": "LEGAL",
                "affidavit": "LEGAL",
                "affidavits": "LEGAL",
                "other": "OTHER",
                "others": "OTHER",
            }
            if keyword in type_mapping and type_mapping[keyword] not in types:
                types.append(type_mapping[keyword])

    document_number_search = []
    exclude_suit = False
    
    # First, check for explicitly mentioned document numbers (full numbers)
    # Broader patterns: allow number/no/#, optional colon/dash, optional quotes
    # Capture everything after the phrase until end of string or stopping tokens
    explicit_doc_number_patterns = [
        r"document\s*(?:number|no\.?|#)\s*[:\-]?\s+\"?(.+?)\"?(?:\s*(?:and|or|with|for|in|at|from|to)\s+|$|[,;!?]|\.\s+(?:and|or|the|a|an)\s+)",
        r"documentnumber\s*[:\-]?\s+\"?(.+?)\"?(?:\s*(?:and|or|with|for|in|at|from|to)\s+|$|[,;!?]|\.\s+(?:and|or|the|a|an)\s+)",
        r"doc\s*(?:number|no\.?)\s*[:\-]?\s+\"?(.+?)\"?(?:\s*(?:and|or|with|for|in|at|from|to)\s+|$|[,;!?]|\.\s+(?:and|or|the|a|an)\s+)",
        r"number\s*(?:is|=)\s+\"?(.+?)\"?(?:\s*(?:and|or|with|for|in|at|from|to)\s+|$|[,;!?])",
        r"(?:^|\s)#\s*\"?(.+?)\"?(?:\s|$|[,;!?])",
    ]
    
    for pattern in explicit_doc_number_patterns:
        matches = re.findall(pattern, query, re.IGNORECASE)
        for match in matches:
            doc_num = match.strip()
            # Normalize internal whitespace and remove surrounding quotes/punctuation
            doc_num = re.sub(r"\s+", " ", doc_num)
            doc_num = doc_num.strip().strip('"\'')
            # Remove trailing punctuation that might have been captured
            doc_num = re.sub(r'[,;!?\.]+$', '', doc_num).strip()
            # Clean up common trailing words
            doc_num = re.sub(r'\s+(and|or|with|for|in|at|from|to|the|a|an)\s*$', '', doc_num, flags=re.IGNORECASE)
            if doc_num and doc_num not in document_number_search:
                document_number_search.append(doc_num)
    
    # Also try a simpler pattern that captures to end of string if no matches found
    if not document_number_search:
        simple_patterns = [
            r"document\s*(?:number|no\.?|#)\s*[:\-]?\s+\"?(.+)$",
            r"documentnumber\s*[:\-]?\s+\"?(.+)$",
            r"doc\s*(?:number|no\.?)\s*[:\-]?\s+\"?(.+)$",
        ]
        for pattern in simple_patterns:
            matches = re.findall(pattern, query, re.IGNORECASE)
            for match in matches:
                doc_num = re.sub(r"\s+", " ", match)
                doc_num = doc_num.strip().strip('"\'')
                doc_num = re.sub(r'[,;!?\.]+$', '', doc_num).strip()
                if doc_num and doc_num not in document_number_search:
                    document_number_search.append(doc_num)
                    break
            if document_number_search:
                break
    
    # If no explicit document number found, check for suit-related patterns
    if not document_number_search:
        negative_suit_patterns = [
            "not have suit", "don't have suit", "without suit", "no suit",
            "didn't consist of suit", "doesn't have suit", "exclude suit",
            "not suit", "avoid suit", "except suit",
        ]
        if any(pattern in query_lower for pattern in negative_suit_patterns):
            exclude_suit = True
        elif "suit" in query_lower:
            document_number_search.append("suit")

    promisor_terms = []
    promisee_terms = []
    promisor_patterns = [
        r"promisor\s+(?:is\s+)?([a-zA-Z0-9\s&.,-]+)",
        r"promisor\s*[:=]\s*([a-zA-Z0-9\s&.,-]+)",
        r"promisor\s*:\s*([a-zA-Z0-9\s&.,-]+)",
    ]
    promisee_patterns = [
        r"promisee\s+(?:is\s+)?([a-zA-Z0-9\s&.,-]+)",
        r"promisee\s*[:=]\s*([a-zA-Z0-9\s&.,-]+)",
        r"promisee\s*:\s*([a-zA-Z0-9\s&.,-]+)",
    ]
    for pattern in promisor_patterns:
        matches = re.findall(pattern, query_lower)
        for match in matches:
            name = match.strip()
            if name and name not in promisor_terms:
                promisor_terms.append(name)
    for pattern in promisee_patterns:
        matches = re.findall(pattern, query_lower)
        for match in matches:
            name = match.strip()
            if name and name not in promisee_terms:
                promisee_terms.append(name)

    between_pattern = r"between\s+([a-zA-Z0-9\s&.,-]+?)\s+and\s+([a-zA-Z0-9\s&.,-]+)"
    between_matches = re.findall(between_pattern, query_lower)
    for match in between_matches:
        name1, name2 = match[0].strip(), match[1].strip()
        if name1 and name1 not in promisor_terms and name1 not in promisee_terms:
            promisor_terms.append(name1)
        if name2 and name2 not in promisor_terms and name2 not in promisee_terms:
            promisee_terms.append(name2)

    involvement_patterns = [
        r"documents?\s+with\s+([a-zA-Z0-9\s&.,-]+)",
        r"contracts?\s+involving\s+([a-zA-Z0-9\s&.,-]+)",
        r"documents?\s+for\s+([a-zA-Z0-9\s&.,-]+)",
        r"contracts?\s+for\s+([a-zA-Z0-9\s&.,-]+)",
    ]
    for pattern in involvement_patterns:
        matches = re.findall(pattern, query_lower)
        for match in matches:
            name = match.strip()
            if name and name not in promisor_terms and name not in promisee_terms:
                promisor_terms.append(name)
                promisee_terms.append(name)

    location_keywords = [
        "mumbai", "pune", "delhi", "bangalore", "kolkata", "chennai",
        "hyderabad", "ahmedabad", "kolshet", "thane", "kurla", "fort", "powai",
        "maharashtra", "karnataka", "tamil nadu", "west bengal", "gujarat",
        "alibag", "revdanda", "palav", "talegaon", "solapur", "nagpur",
        "bandra", "andheri", "borivali", "hutatma rajguru chowk",
    ]
    for keyword in location_keywords:
        if keyword in query_lower and keyword not in locations:
            locations.append(keyword)

    # Extract building_name (simple pattern matching for fallback)
    building_names = []
    if "building" in query_lower:
        building_match = re.search(r"building\s+name\s+(?:is\s+)?([a-zA-Z0-9\s&.,-]+)", query, re.IGNORECASE)
        if building_match:
            building_name = building_match.group(1).strip()
            building_name = re.sub(r'[,;\.\?]+$', '', building_name).strip()
            if building_name and len(building_name) > 2:
                building_names.append(building_name)

    # Extract subject (simple pattern matching for fallback)
    subjects = []
    if "subject" in query_lower:
        subject_match = re.search(r"subject\s+(?:matter\s+)?(?:is\s+)?([a-zA-Z0-9\s&.,-]+)", query, re.IGNORECASE)
        if subject_match:
            subject = subject_match.group(1).strip()
            subject = re.sub(r'[,;\.\?]+$', '', subject).strip()
            if subject and len(subject) > 2:
                subjects.append(subject)

    result = {
        "is_count_query": is_count,
        "search_terms": search_terms,
        "filters": {
            "locations": locations,
            "years": [],
            "types": types,
            "document_numbers": document_number_search,
            "exclude_suit": exclude_suit,
            "value_range": {"min": None, "max": None},
            "no_of_pages_range": {"min": None, "max": None},
            "promisor": promisor_terms,
            "promisee": promisee_terms,
            "court": courts,
            "case_no": [],
            "case_type": [],
            "applicant": [],
            "petitioner": [],
            "respondent": [],
            "plaintiff": [],
            "defendant": [],
            "advocate_name": [],
            "judicature": [],
            "coram": [],
            "seller": [],
            "purchaser": [],
            "registration_no": [],
            "survey_no": [],
            "cts_no": [],
            "gut_no": [],
            "plot_no": [],
            "village": [],
            "taluka": [],
            "pincode": [],
            "company_name": [],
            "authority_name": [],
            "approval_no": [],
            "order_no": [],
            "building_name": building_names,
            "project_name": [],
            "sector": [],
            "subject": subjects,
            "drawing_no": [],
            "building_type": [],
            "commence_certificate": [],
            "intimation_of_disapproval": [],
            "intimation_of_approval": [],
            "rera": [],
            "approval_date": [],
            "expiry_date": [],
            "drawing_date": [],
            "application_date": [],
            "case_date": [],
            "registration_date": [],
            "land_document_date": [],
            "land_document_type": [],
        },
        "response_style": "count" if is_count else "list",
    }
    # Helpful debug logging for extracted document numbers
    if result["filters"].get("document_numbers"):
        LOGGER.info(f"Extracted document_numbers: {result['filters']['document_numbers']}")
    LOGGER.info(f"Fallback Understanding for query '{query}': {result}")
    return result
