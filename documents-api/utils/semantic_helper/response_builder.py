from typing import Dict, Any, List
from settings import APP_URL
from .dedupe import ensure_unique_documents


def generate_response(query: str, understanding: Dict[str, Any], results: List[Dict[str, Any]]) -> str:
    results = ensure_unique_documents(results)

    if understanding["is_count_query"]:
        count = len(results)
        if understanding["filters"].get("locations"):
            location_terms = ", ".join(understanding["filters"]["locations"])
            return f"Total documents in {location_terms}: {count}"
        else:
            return f"Total documents: {count}"

    if not results:
        filters_applied: List[str] = []
        if understanding["filters"].get("locations"):
            location_terms = ", ".join(understanding["filters"]["locations"])
            filters_applied.append(f"location: {location_terms}")
        if understanding["filters"].get("types"):
            type_terms = ", ".join(understanding["filters"]["types"])
            filters_applied.append(f"type: {type_terms}")
        if understanding["filters"].get("document_numbers"):
            doc_terms = ", ".join(understanding["filters"]["document_numbers"])
            filters_applied.append(f"document number: {doc_terms}")
        if understanding["filters"].get("promisor"):
            promisor_terms = ", ".join(understanding["filters"]["promisor"])
            filters_applied.append(f"promisor: {promisor_terms}")
        if understanding["filters"].get("promisee"):
            promisee_terms = ", ".join(understanding["filters"]["promisee"])
            filters_applied.append(f"promisee: {promisee_terms}")
        # LEGAL document type filters
        if understanding["filters"].get("court"):
            court_terms = ", ".join(understanding["filters"]["court"])
            filters_applied.append(f"court: {court_terms}")
        if understanding["filters"].get("case_no"):
            case_terms = ", ".join(understanding["filters"]["case_no"])
            filters_applied.append(f"case number: {case_terms}")
        if understanding["filters"].get("case_type"):
            case_type_terms = ", ".join(understanding["filters"]["case_type"])
            filters_applied.append(f"case type: {case_type_terms}")
        if understanding["filters"].get("applicant"):
            applicant_terms = ", ".join(understanding["filters"]["applicant"])
            filters_applied.append(f"applicant: {applicant_terms}")
        if understanding["filters"].get("petitioner"):
            petitioner_terms = ", ".join(understanding["filters"]["petitioner"])
            filters_applied.append(f"petitioner: {petitioner_terms}")
        if understanding["filters"].get("respondent"):
            respondent_terms = ", ".join(understanding["filters"]["respondent"])
            filters_applied.append(f"respondent: {respondent_terms}")
        if understanding["filters"].get("plaintiff"):
            plaintiff_terms = ", ".join(understanding["filters"]["plaintiff"])
            filters_applied.append(f"plaintiff: {plaintiff_terms}")
        if understanding["filters"].get("defendant"):
            defendant_terms = ", ".join(understanding["filters"]["defendant"])
            filters_applied.append(f"defendant: {defendant_terms}")
        if understanding["filters"].get("advocate_name"):
            advocate_terms = ", ".join(understanding["filters"]["advocate_name"])
            filters_applied.append(f"advocate: {advocate_terms}")
        if understanding["filters"].get("judicature"):
            judicature_terms = ", ".join(understanding["filters"]["judicature"])
            filters_applied.append(f"judicature: {judicature_terms}")
        if understanding["filters"].get("coram"):
            coram_terms = ", ".join(understanding["filters"]["coram"])
            filters_applied.append(f"coram: {coram_terms}")
        # LAND document type filters
        if understanding["filters"].get("seller"):
            seller_terms = ", ".join(understanding["filters"]["seller"])
            filters_applied.append(f"seller: {seller_terms}")
        if understanding["filters"].get("purchaser"):
            purchaser_terms = ", ".join(understanding["filters"]["purchaser"])
            filters_applied.append(f"purchaser: {purchaser_terms}")
        if understanding["filters"].get("registration_no"):
            reg_terms = ", ".join(understanding["filters"]["registration_no"])
            filters_applied.append(f"registration number: {reg_terms}")
        if understanding["filters"].get("survey_no"):
            survey_terms = ", ".join(understanding["filters"]["survey_no"])
            filters_applied.append(f"survey number: {survey_terms}")
        if understanding["filters"].get("cts_no"):
            cts_terms = ", ".join(understanding["filters"]["cts_no"])
            filters_applied.append(f"CTS number: {cts_terms}")
        if understanding["filters"].get("gut_no"):
            gut_terms = ", ".join(understanding["filters"]["gut_no"])
            filters_applied.append(f"GUT number: {gut_terms}")
        if understanding["filters"].get("plot_no"):
            plot_terms = ", ".join(understanding["filters"]["plot_no"])
            filters_applied.append(f"plot number: {plot_terms}")
        if understanding["filters"].get("village"):
            village_terms = ", ".join(understanding["filters"]["village"])
            filters_applied.append(f"village: {village_terms}")
        if understanding["filters"].get("taluka"):
            taluka_terms = ", ".join(understanding["filters"]["taluka"])
            filters_applied.append(f"taluka: {taluka_terms}")
        if understanding["filters"].get("pincode"):
            pincode_terms = ", ".join(understanding["filters"]["pincode"])
            filters_applied.append(f"pincode: {pincode_terms}")
        # LIAISON document type filters
        if understanding["filters"].get("company_name"):
            company_terms = ", ".join(understanding["filters"]["company_name"])
            filters_applied.append(f"company: {company_terms}")
        if understanding["filters"].get("authority_name"):
            authority_terms = ", ".join(understanding["filters"]["authority_name"])
            filters_applied.append(f"authority: {authority_terms}")
        if understanding["filters"].get("approval_no"):
            approval_terms = ", ".join(understanding["filters"]["approval_no"])
            filters_applied.append(f"approval number: {approval_terms}")
        if understanding["filters"].get("order_no"):
            order_terms = ", ".join(understanding["filters"]["order_no"])
            filters_applied.append(f"order number: {order_terms}")
        if understanding["filters"].get("building_name"):
            building_terms = ", ".join(understanding["filters"]["building_name"])
            filters_applied.append(f"building: {building_terms}")
        if understanding["filters"].get("project_name"):
            project_terms = ", ".join(understanding["filters"]["project_name"])
            filters_applied.append(f"project: {project_terms}")
        if understanding["filters"].get("sector"):
            sector_terms = ", ".join(understanding["filters"]["sector"])
            filters_applied.append(f"sector: {sector_terms}")
        if understanding["filters"].get("subject"):
            subject_terms = ", ".join(understanding["filters"]["subject"])
            filters_applied.append(f"subject: {subject_terms}")
        if understanding["filters"].get("drawing_no"):
            drawing_terms = ", ".join(understanding["filters"]["drawing_no"])
            filters_applied.append(f"drawing number: {drawing_terms}")
        if understanding["filters"].get("building_type"):
            building_type_terms = ", ".join(understanding["filters"]["building_type"])
            filters_applied.append(f"building type: {building_type_terms}")
        if understanding["filters"].get("commence_certificate"):
            commence_terms = ", ".join(understanding["filters"]["commence_certificate"])
            filters_applied.append(f"commence certificate: {commence_terms}")
        if understanding["filters"].get("intimation_of_disapproval"):
            iod_terms = ", ".join(understanding["filters"]["intimation_of_disapproval"])
            filters_applied.append(f"IOD: {iod_terms}")
        if understanding["filters"].get("intimation_of_approval"):
            ioa_terms = ", ".join(understanding["filters"]["intimation_of_approval"])
            filters_applied.append(f"IOA: {ioa_terms}")
        if understanding["filters"].get("rera"):
            rera_terms = ", ".join(understanding["filters"]["rera"])
            filters_applied.append(f"rera: {rera_terms}")
        # Date filters
        def format_date_filter(date_array, label):
            """Format date array as single date or range."""
            if not date_array or not isinstance(date_array, list):
                return None
            if len(date_array) == 1:
                return f"{label}: {date_array[0]}"
            if len(date_array) >= 2:
                return f"{label}: {date_array[0]} to {date_array[1]}"
            return None
        
        date_field_mappings = [
            ("approval_date", "approval date"),
            ("expiry_date", "expiry date"),
            ("drawing_date", "drawing date"),
            ("application_date", "application date"),
            ("case_date", "case date"),
            ("registration_date", "registration date"),
            ("land_document_date", "document date"),
        ]
        
        for filter_key, label in date_field_mappings:
            date_filter = format_date_filter(understanding["filters"].get(filter_key), label)
            if date_filter:
                filters_applied.append(date_filter)
        if understanding["filters"].get("exclude_suit"):
            filters_applied.append("excluding suit documents")

        if filters_applied:
            filter_text = ", ".join(filters_applied)
            return f"Document doesn't exist for {filter_text}"
        else:
            return (
                "I need more specific information to help you find the right documents. Please include one or more of the following in your query:\n\n"
                "• **Location**: 'lease documents in Mumbai', 'contracts in Pune'\n"
                "• **Document Type**: 'sale documents', 'service contracts', 'lease agreements'\n"
                "• **Date**: 'documents from 2023', 'contracts in January'\n"
                "• **Specific Content**: 'anything about lease', 'documents with suit numbers'\n\n"
                "For example: 'lease documents in Mumbai' or 'sale contracts from 2023'\n\n"
                "How can I help you today?"
            )

    blocks: List[str] = []
    for doc in results:
        document_id = doc.get("document_id", "")
        document_url = f"{APP_URL}/documents/{document_id}" if document_id else ""

        location_parts: List[str] = []
        if doc.get("state") and doc.get("state") != "N/A":
            location_parts.append(doc.get("state"))
        if doc.get("city") and doc.get("city") != "N/A":
            location_parts.append(doc.get("city"))
        if doc.get("location") and doc.get("location").strip():
            location_parts.append(doc.get("location"))
        location_line = f"Location - {', '.join(location_parts)}" if location_parts else "Location - Not specified"

        details_parts: List[str] = []
        if doc.get("document_number") and doc.get("document_number") != "N/A":
            details_parts.append(f"Document Number - {doc.get('document_number')}")
        details_parts.append(f"Promisor - {doc.get('promisor', 'NA')}")
        details_parts.append(f"Promisee - {doc.get('promisee', 'NA')}")
        details_parts.append(f"Date - {doc.get('detailed_date') or doc.get('date')}")
        details_parts.append(f"Type - {doc.get('type', 'NA')}")
        details_parts.append("Country - India")
        details_parts.append(location_line)

        doc_title = doc.get("title", "Untitled")
        clickable_link = f"**[{doc_title}]({document_url})**" if document_url else doc_title

        block_lines = [
            f'"{doc_title}"',
            "",
            ", ".join(details_parts),
            "",
            clickable_link,
        ]
        blocks.append("\n".join(block_lines))

    header = f"I found {len(results)} documents:\n"
    return header + "\n\n" + "\n\n".join(blocks)


