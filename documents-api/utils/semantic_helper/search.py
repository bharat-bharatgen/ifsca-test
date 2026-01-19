import logging
import os
import re
from datetime import datetime
from typing import Dict, Any, List, Tuple

from database import get_pool


LOGGER = logging.getLogger(__name__)


async def semantic_search(query: str, understanding: Dict[str, Any], genai) -> List[Dict[str, Any]]:
    try:
        embedding = genai.embed_content(
            model="gemini-embedding-001",
            content=query,
            task_type="retrieval_query",
            output_dimensionality=256,
        )["embedding"]
        embedding_str = "[" + ",".join(map(str, embedding)) + "]"

        sql_query, params = build_semantic_search_query(embedding_str, understanding)

        pool = await get_pool()
        async with pool.acquire() as conn:
            if understanding["filters"].get("types"):
                type_debug_query = "SELECT DISTINCT c.type FROM documents c WHERE c.type IS NOT NULL LIMIT 10"
                type_results = await conn.fetch(type_debug_query)
                LOGGER.info(f"Available types in database: {[row['type'] for row in type_results]}")
                LOGGER.info(f"Searching for types: {understanding['filters']['types']}")

            results = await conn.fetch(sql_query, *params)
            LOGGER.info(f"Semantic search returned {len(results)} results")
            processed_results: List[Dict[str, Any]] = []
            for row in results:
                processed_results.append({
                    "document_id": row["documentId"],
                    "title": row["title"] or "Untitled",
                    "description": row["description"] or "",
                    "promisor": row["promisor"] or "",
                    "promisee": row["promisee"] or "",
                    "type": row["type"] or "Unknown",
                    "value": row["documentValue"] or 0,
                    "date": row["date"].strftime("%Y-%m-%d") if row["date"] else "N/A",
                    "detailed_date": row["date"].strftime("%A, %B %d, %Y") if row["date"] else "N/A",
                    "state": row["state"],
                    "city": row["city"],
                    "location": row["location"],
                    "document_number": row["documentNumber"] or "N/A",
                    "court": row.get("court") or None,
                    "case_no": row.get("caseNo") or None,
                    "seller": row.get("seller") or None,
                    "purchaser": row.get("purchaser") or None,
                    "similarity_score": float(row["similarity"]),
                    "content": row.get("textChunk", "")[:500],
                })

            LOGGER.info(f"Processed {len(processed_results)} documents")
            return processed_results
    except Exception as e:
        LOGGER.error(f"Error in semantic search: {str(e)}")
        return []


def build_semantic_search_query(embedding_str: str, understanding: Dict[str, Any]) -> Tuple[str, List[Any]]:
    base_sql = """
            SELECT d."documentId", d."textChunk",
                   c.title, c.description, c.promisor, c.promisee, c.type, c."documentValue", c.date,
                   c.state, c.city, c.location, c."documentNumber",
                   c.court, c."caseNo", c."caseType", c.applicant, c.petitioner, c.respondent,
                   c.plaintiff, c.defendant, c."advocateName", c.judicature, c.coram,
                   c.seller, c.purchaser, c."registrationNo", c."surveyNo", c."ctsNo", 
                   c."gutNo", c."plotNo", c.village, c.taluka, c.pincode,
                   c."companyName", c."authorityName", c."approvalNo", c."orderNo",
                   c."buildingName", c."projectName", c.sector, c.subject, c."drawingNo",
                   c."buildingType", c."commenceCertificate", c."intimationOfDisapproval",
                   c."intimationOfApproval", c.rera,
                   c."approvalDate", c."expiryDate", c."drawingDate", c."applicationDate", c."caseDate",
                   c."registrationDate", c."landDocumentDate", c."landDocumentType",
                   d."embedding_256d" <=> $1::vector(256) AS similarity
            FROM document_embeddings d
            JOIN documents c ON c.id = d."documentId"
            WHERE d."embedding_256d" IS NOT NULL
        """

    params: List[Any] = [embedding_str]
    param_count = 1

    if understanding["filters"].get("locations"):
        location_conditions = []
        for location in understanding["filters"]["locations"]:
            param_count += 1
            location_conditions.append(
                f"(LOWER(c.state) = ${param_count} OR LOWER(c.city) = ${param_count} OR LOWER(c.location) = ${param_count} OR LOWER(c.state) LIKE ${param_count + 1} OR LOWER(c.city) LIKE ${param_count + 1} OR LOWER(c.location) LIKE ${param_count + 1})"
            )
            params.append(location.lower())
            params.append(f"%{location.lower()}%")
            param_count += 1
        if location_conditions:
            base_sql += f" AND ({' OR '.join(location_conditions)})"

    if understanding["filters"].get("years"):
        year_conditions = []
        # Check if querying for LAND or LIAISON documents
        types = understanding["filters"].get("types", [])
        is_land_query = types and any("LAND" in t.upper() for t in types)
        is_liaison_query = types and any("LIAISON" in t.upper() for t in types)
        
        for year in understanding["filters"]["years"]:
            param_count += 1
            # For LAND documents, query landDocumentDate
            # For LIAISON documents, query applicationDate
            # Otherwise use date
            if is_land_query:
                year_conditions.append(f"EXTRACT(YEAR FROM c.\"landDocumentDate\") = ${param_count}")
            elif is_liaison_query:
                year_conditions.append(f"EXTRACT(YEAR FROM c.\"applicationDate\") = ${param_count}")
            else:
                year_conditions.append(f"EXTRACT(YEAR FROM c.date) = ${param_count}")
            params.append(year)
        if year_conditions:
            base_sql += f" AND ({' OR '.join(year_conditions)})"

    if understanding["filters"].get("types"):
        type_conditions = []
        for t in understanding["filters"]["types"]:
            param_count += 1
            type_conditions.append(f"c.type ILIKE ${param_count}")
            params.append(f"%{t}%")
        if type_conditions:
            base_sql += f" AND ({' OR '.join(type_conditions)})"

    if understanding["filters"].get("document_numbers"):
        doc_number_conditions = []
        for doc_num in understanding["filters"]["document_numbers"]:
            # Exact case-insensitive match
            param_count += 1
            doc_number_conditions.append(f"LOWER(c.\"documentNumber\") = LOWER(${param_count})")
            params.append(doc_num)
            # Fuzzy contains match
            param_count += 1
            doc_number_conditions.append(f"c.\"documentNumber\" ILIKE ${param_count}")
            params.append(f"%{doc_num}%")
        if doc_number_conditions:
            base_sql += f" AND ({' OR '.join(doc_number_conditions)})"

    if understanding["filters"].get("exclude_suit"):
        base_sql += " AND (c.\"documentNumber\" IS NULL OR c.\"documentNumber\" NOT ILIKE '%suit%')"

    if understanding["filters"].get("promisor"):
        promisor_conditions = []
        for promisor in understanding["filters"]["promisor"]:
            param_count += 1
            promisor_conditions.append(f"c.promisor ILIKE ${param_count}")
            params.append(f"%{promisor}%")
        if promisor_conditions:
            base_sql += f" AND ({' OR '.join(promisor_conditions)})"

    if understanding["filters"].get("promisee"):
        promisee_conditions = []
        for promisee in understanding["filters"]["promisee"]:
            param_count += 1
            promisee_conditions.append(f"c.promisee ILIKE ${param_count}")
            params.append(f"%{promisee}%")
        if promisee_conditions:
            base_sql += f" AND ({' OR '.join(promisee_conditions)})"

    # LEGAL document type filters
    if understanding["filters"].get("court"):
        court_conditions = []
        for court in understanding["filters"]["court"]:
            param_count += 1
            # Use unquoted identifier for lowercase column name, handle NULL values
            court_conditions.append(f"(c.court IS NOT NULL AND c.court ILIKE ${param_count})")
            params.append(f"%{court}%")
        if court_conditions:
            base_sql += f" AND ({' OR '.join(court_conditions)})"

    if understanding["filters"].get("case_no"):
        case_no_conditions = []
        for case_no in understanding["filters"]["case_no"]:
            param_count += 1
            case_no_conditions.append(f"(c.\"caseNo\" IS NOT NULL AND c.\"caseNo\" ILIKE ${param_count})")
            params.append(f"%{case_no}%")
        if case_no_conditions:
            base_sql += f" AND ({' OR '.join(case_no_conditions)})"

    if understanding["filters"].get("case_type"):
        case_type_conditions = []
        for case_type in understanding["filters"]["case_type"]:
            param_count += 1
            case_type_conditions.append(f"(c.\"caseType\" IS NOT NULL AND c.\"caseType\" ILIKE ${param_count})")
            params.append(f"%{case_type}%")
        if case_type_conditions:
            base_sql += f" AND ({' OR '.join(case_type_conditions)})"

    if understanding["filters"].get("applicant"):
        applicant_conditions = []
        for applicant in understanding["filters"]["applicant"]:
            param_count += 1
            applicant_conditions.append(f"(c.applicant IS NOT NULL AND c.applicant ILIKE ${param_count})")
            params.append(f"%{applicant}%")
        if applicant_conditions:
            base_sql += f" AND ({' OR '.join(applicant_conditions)})"

    if understanding["filters"].get("petitioner"):
        petitioner_conditions = []
        for petitioner in understanding["filters"]["petitioner"]:
            param_count += 1
            petitioner_conditions.append(f"(c.petitioner IS NOT NULL AND c.petitioner ILIKE ${param_count})")
            params.append(f"%{petitioner}%")
        if petitioner_conditions:
            base_sql += f" AND ({' OR '.join(petitioner_conditions)})"

    if understanding["filters"].get("respondent"):
        respondent_conditions = []
        for respondent in understanding["filters"]["respondent"]:
            param_count += 1
            respondent_conditions.append(f"(c.respondent IS NOT NULL AND c.respondent ILIKE ${param_count})")
            params.append(f"%{respondent}%")
        if respondent_conditions:
            base_sql += f" AND ({' OR '.join(respondent_conditions)})"

    if understanding["filters"].get("plaintiff"):
        plaintiff_conditions = []
        for plaintiff in understanding["filters"]["plaintiff"]:
            param_count += 1
            plaintiff_conditions.append(f"(c.plaintiff IS NOT NULL AND c.plaintiff ILIKE ${param_count})")
            params.append(f"%{plaintiff}%")
        if plaintiff_conditions:
            base_sql += f" AND ({' OR '.join(plaintiff_conditions)})"

    if understanding["filters"].get("defendant"):
        defendant_conditions = []
        for defendant in understanding["filters"]["defendant"]:
            param_count += 1
            defendant_conditions.append(f"(c.defendant IS NOT NULL AND c.defendant ILIKE ${param_count})")
            params.append(f"%{defendant}%")
        if defendant_conditions:
            base_sql += f" AND ({' OR '.join(defendant_conditions)})"

    if understanding["filters"].get("advocate_name"):
        advocate_conditions = []
        for advocate in understanding["filters"]["advocate_name"]:
            param_count += 1
            advocate_conditions.append(f"(c.\"advocateName\" IS NOT NULL AND c.\"advocateName\" ILIKE ${param_count})")
            params.append(f"%{advocate}%")
        if advocate_conditions:
            base_sql += f" AND ({' OR '.join(advocate_conditions)})"

    if understanding["filters"].get("judicature"):
        judicature_conditions = []
        for judicature in understanding["filters"]["judicature"]:
            param_count += 1
            judicature_conditions.append(f"(c.judicature IS NOT NULL AND c.judicature ILIKE ${param_count})")
            params.append(f"%{judicature}%")
        if judicature_conditions:
            base_sql += f" AND ({' OR '.join(judicature_conditions)})"

    if understanding["filters"].get("coram"):
        coram_conditions = []
        for coram in understanding["filters"]["coram"]:
            param_count += 1
            coram_conditions.append(f"(c.coram IS NOT NULL AND c.coram ILIKE ${param_count})")
            params.append(f"%{coram}%")
        if coram_conditions:
            base_sql += f" AND ({' OR '.join(coram_conditions)})"

    # LAND document type filters
    if understanding["filters"].get("seller"):
        seller_conditions = []
        for seller in understanding["filters"]["seller"]:
            param_count += 1
            seller_conditions.append(f"(c.seller IS NOT NULL AND c.seller ILIKE ${param_count})")
            params.append(f"%{seller}%")
        if seller_conditions:
            base_sql += f" AND ({' OR '.join(seller_conditions)})"

    if understanding["filters"].get("purchaser"):
        purchaser_conditions = []
        for purchaser in understanding["filters"]["purchaser"]:
            param_count += 1
            purchaser_conditions.append(f"(c.purchaser IS NOT NULL AND c.purchaser ILIKE ${param_count})")
            params.append(f"%{purchaser}%")
        if purchaser_conditions:
            base_sql += f" AND ({' OR '.join(purchaser_conditions)})"

    if understanding["filters"].get("registration_no"):
        registration_conditions = []
        for reg_no in understanding["filters"]["registration_no"]:
            param_count += 1
            registration_conditions.append(f"(c.\"registrationNo\" IS NOT NULL AND c.\"registrationNo\" ILIKE ${param_count})")
            params.append(f"%{reg_no}%")
        if registration_conditions:
            base_sql += f" AND ({' OR '.join(registration_conditions)})"

    if understanding["filters"].get("survey_no"):
        survey_conditions = []
        for survey_no in understanding["filters"]["survey_no"]:
            param_count += 1
            survey_conditions.append(f"(c.\"surveyNo\" IS NOT NULL AND c.\"surveyNo\" ILIKE ${param_count})")
            params.append(f"%{survey_no}%")
        if survey_conditions:
            base_sql += f" AND ({' OR '.join(survey_conditions)})"

    if understanding["filters"].get("cts_no"):
        cts_conditions = []
        for cts_no in understanding["filters"]["cts_no"]:
            param_count += 1
            cts_conditions.append(f"(c.\"ctsNo\" IS NOT NULL AND c.\"ctsNo\" ILIKE ${param_count})")
            params.append(f"%{cts_no}%")
        if cts_conditions:
            base_sql += f" AND ({' OR '.join(cts_conditions)})"

    if understanding["filters"].get("gut_no"):
        gut_conditions = []
        for gut_no in understanding["filters"]["gut_no"]:
            param_count += 1
            gut_conditions.append(f"(c.\"gutNo\" IS NOT NULL AND c.\"gutNo\" ILIKE ${param_count})")
            params.append(f"%{gut_no}%")
        if gut_conditions:
            base_sql += f" AND ({' OR '.join(gut_conditions)})"

    if understanding["filters"].get("plot_no"):
        plot_conditions = []
        for plot_no in understanding["filters"]["plot_no"]:
            param_count += 1
            plot_conditions.append(f"(c.\"plotNo\" IS NOT NULL AND c.\"plotNo\" ILIKE ${param_count})")
            params.append(f"%{plot_no}%")
        if plot_conditions:
            base_sql += f" AND ({' OR '.join(plot_conditions)})"

    if understanding["filters"].get("village"):
        village_conditions = []
        for village in understanding["filters"]["village"]:
            param_count += 1
            village_conditions.append(f"(c.village IS NOT NULL AND c.village ILIKE ${param_count})")
            params.append(f"%{village}%")
        if village_conditions:
            base_sql += f" AND ({' OR '.join(village_conditions)})"

    if understanding["filters"].get("taluka"):
        taluka_conditions = []
        for taluka in understanding["filters"]["taluka"]:
            param_count += 1
            taluka_conditions.append(f"(c.taluka IS NOT NULL AND c.taluka ILIKE ${param_count})")
            params.append(f"%{taluka}%")
        if taluka_conditions:
            base_sql += f" AND ({' OR '.join(taluka_conditions)})"

    if understanding["filters"].get("pincode"):
        pincode_conditions = []
        for pincode in understanding["filters"]["pincode"]:
            param_count += 1
            pincode_conditions.append(f"(c.pincode IS NOT NULL AND c.pincode ILIKE ${param_count})")
            params.append(f"%{pincode}%")
        if pincode_conditions:
            base_sql += f" AND ({' OR '.join(pincode_conditions)})"

    if understanding["filters"].get("land_document_type"):
        land_doc_type_conditions = []
        for land_doc_type in understanding["filters"]["land_document_type"]:
            param_count += 1
            land_doc_type_conditions.append(f"(c.\"landDocumentType\" IS NOT NULL AND c.\"landDocumentType\" ILIKE ${param_count})")
            params.append(f"%{land_doc_type}%")
        if land_doc_type_conditions:
            base_sql += f" AND ({' OR '.join(land_doc_type_conditions)})"

    if understanding["filters"].get("no_of_pages_range"):
        pages_range = understanding["filters"]["no_of_pages_range"]
        pages_conditions = []
        if pages_range.get("min") is not None:
            param_count += 1
            pages_conditions.append(f"(c.\"noOfPages\" IS NOT NULL AND c.\"noOfPages\" >= ${param_count})")
            params.append(pages_range["min"])
        if pages_range.get("max") is not None:
            param_count += 1
            pages_conditions.append(f"(c.\"noOfPages\" IS NOT NULL AND c.\"noOfPages\" <= ${param_count})")
            params.append(pages_range["max"])
        if pages_conditions:
            base_sql += f" AND ({' AND '.join(pages_conditions)})"

    # LIAISON document type filters
    if understanding["filters"].get("company_name"):
        company_conditions = []
        for company in understanding["filters"]["company_name"]:
            param_count += 1
            company_conditions.append(f"(c.\"companyName\" IS NOT NULL AND c.\"companyName\" ILIKE ${param_count})")
            params.append(f"%{company}%")
        if company_conditions:
            base_sql += f" AND ({' OR '.join(company_conditions)})"

    if understanding["filters"].get("authority_name"):
        authority_conditions = []
        for authority in understanding["filters"]["authority_name"]:
            param_count += 1
            authority_conditions.append(f"(c.\"authorityName\" IS NOT NULL AND c.\"authorityName\" ILIKE ${param_count})")
            params.append(f"%{authority}%")
        if authority_conditions:
            base_sql += f" AND ({' OR '.join(authority_conditions)})"

    if understanding["filters"].get("approval_no"):
        approval_conditions = []
        for approval_no in understanding["filters"]["approval_no"]:
            param_count += 1
            approval_conditions.append(f"(c.\"approvalNo\" IS NOT NULL AND c.\"approvalNo\" ILIKE ${param_count})")
            params.append(f"%{approval_no}%")
        if approval_conditions:
            base_sql += f" AND ({' OR '.join(approval_conditions)})"

    if understanding["filters"].get("order_no"):
        order_conditions = []
        for order_no in understanding["filters"]["order_no"]:
            param_count += 1
            order_conditions.append(f"(c.\"orderNo\" IS NOT NULL AND c.\"orderNo\" ILIKE ${param_count})")
            params.append(f"%{order_no}%")
        if order_conditions:
            base_sql += f" AND ({' OR '.join(order_conditions)})"

    if understanding["filters"].get("building_name"):
        building_conditions = []
        for building in understanding["filters"]["building_name"]:
            param_count += 1
            building_conditions.append(f"(c.\"buildingName\" IS NOT NULL AND c.\"buildingName\" ILIKE ${param_count})")
            params.append(f"%{building}%")
        if building_conditions:
            base_sql += f" AND ({' OR '.join(building_conditions)})"

    if understanding["filters"].get("project_name"):
        project_conditions = []
        for project in understanding["filters"]["project_name"]:
            param_count += 1
            project_conditions.append(f"(c.\"projectName\" IS NOT NULL AND c.\"projectName\" ILIKE ${param_count})")
            params.append(f"%{project}%")
        if project_conditions:
            base_sql += f" AND ({' OR '.join(project_conditions)})"

    if understanding["filters"].get("sector"):
        sector_conditions = []
        for sector in understanding["filters"]["sector"]:
            param_count += 1
            sector_conditions.append(f"(c.sector IS NOT NULL AND c.sector ILIKE ${param_count})")
            params.append(f"%{sector}%")
        if sector_conditions:
            base_sql += f" AND ({' OR '.join(sector_conditions)})"

    if understanding["filters"].get("subject"):
        subject_conditions = []
        for subject in understanding["filters"]["subject"]:
            param_count += 1
            subject_conditions.append(f"(c.subject IS NOT NULL AND c.subject ILIKE ${param_count})")
            params.append(f"%{subject}%")
        if subject_conditions:
            base_sql += f" AND ({' OR '.join(subject_conditions)})"

    if understanding["filters"].get("drawing_no"):
        drawing_conditions = []
        for drawing_no in understanding["filters"]["drawing_no"]:
            param_count += 1
            drawing_conditions.append(f"(c.\"drawingNo\" IS NOT NULL AND c.\"drawingNo\" ILIKE ${param_count})")
            params.append(f"%{drawing_no}%")
        if drawing_conditions:
            base_sql += f" AND ({' OR '.join(drawing_conditions)})"

    if understanding["filters"].get("building_type"):
        building_type_conditions = []
        for building_type in understanding["filters"]["building_type"]:
            param_count += 1
            building_type_conditions.append(f"(c.\"buildingType\" IS NOT NULL AND c.\"buildingType\" ILIKE ${param_count})")
            params.append(f"%{building_type}%")
        if building_type_conditions:
            base_sql += f" AND ({' OR '.join(building_type_conditions)})"

    if understanding["filters"].get("commence_certificate"):
        commence_conditions = []
        for commence in understanding["filters"]["commence_certificate"]:
            param_count += 1
            commence_conditions.append(f"(c.\"commenceCertificate\" IS NOT NULL AND c.\"commenceCertificate\" ILIKE ${param_count})")
            params.append(f"%{commence}%")
        if commence_conditions:
            base_sql += f" AND ({' OR '.join(commence_conditions)})"

    if understanding["filters"].get("intimation_of_disapproval"):
        iod_conditions = []
        for iod in understanding["filters"]["intimation_of_disapproval"]:
            param_count += 1
            iod_conditions.append(f"(c.\"intimationOfDisapproval\" IS NOT NULL AND c.\"intimationOfDisapproval\" ILIKE ${param_count})")
            params.append(f"%{iod}%")
        if iod_conditions:
            base_sql += f" AND ({' OR '.join(iod_conditions)})"

    if understanding["filters"].get("intimation_of_approval"):
        ioa_conditions = []
        for ioa in understanding["filters"]["intimation_of_approval"]:
            param_count += 1
            ioa_conditions.append(f"(c.\"intimationOfApproval\" IS NOT NULL AND c.\"intimationOfApproval\" ILIKE ${param_count})")
            params.append(f"%{ioa}%")
        if ioa_conditions:
            base_sql += f" AND ({' OR '.join(ioa_conditions)})"

    if understanding["filters"].get("rera"):
        rera_conditions = []
        for rera in understanding["filters"]["rera"]:
            param_count += 1
            rera_conditions.append(f"(c.rera IS NOT NULL AND c.rera ILIKE ${param_count})")
            params.append(f"%{rera}%")
        if rera_conditions:
            base_sql += f" AND ({' OR '.join(rera_conditions)})"

    # Date field filters (LIAISON and LAND document types)
    def parse_date_value(date_str):
        """Parse a date string and return (year, full_date) tuple."""
        if not date_str:
            return None, None
        
        date_str = str(date_str).strip()
        # Check if it's a year (4 digits)
        if date_str.isdigit() and len(date_str) == 4:
            return int(date_str), None
        
        # Try to extract year from string
        year_match = re.search(r'\b(19|20)\d{2}\b', date_str)
        if year_match:
            year = int(year_match.group())
        else:
            year = None
        
        # Try to parse as full date
        full_date = None
        try:
            full_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            # If parsing fails, leave full_date as None. This is expected for non-date strings
            # (e.g., year-only values like "2024" or other date formats).
            pass
        
        return year, full_date

    def build_date_condition(date_array, column_name, start_param_count):
        """Build date filter condition. Supports single date or date range from array.
        Returns: (condition_string, param_values, next_param_count)"""
        if not date_array or not isinstance(date_array, list):
            return None, [], start_param_count
        
        conditions = []
        param_values = []
        current_param = start_param_count
        
        if len(date_array) == 1:
            # Single date
            date_str = date_array[0]
            year, full_date = parse_date_value(date_str)
            
            if full_date:
                # Use exact date match
                conditions.append(f"(c.\"{column_name}\" IS NOT NULL AND DATE(c.\"{column_name}\") = ${current_param}::date)")
                param_values.append(full_date)
            elif year:
                # Use year match
                conditions.append(f"(c.\"{column_name}\" IS NOT NULL AND EXTRACT(YEAR FROM c.\"{column_name}\") = ${current_param})")
                param_values.append(year)
        elif len(date_array) >= 2:
            # Date range: use first as start, second as end
            start_str = date_array[0]
            end_str = date_array[1]
            start_year, start_date = parse_date_value(start_str)
            end_year, end_date = parse_date_value(end_str)
            
            # Build range condition
            if start_date and end_date:
                # Both are full dates
                conditions.append(f"(c.\"{column_name}\" IS NOT NULL AND DATE(c.\"{column_name}\") >= ${current_param}::date AND DATE(c.\"{column_name}\") <= ${current_param + 1}::date)")
                param_values.append(start_date)
                param_values.append(end_date)
            elif start_year and end_year:
                # Both are years
                conditions.append(f"(c.\"{column_name}\" IS NOT NULL AND EXTRACT(YEAR FROM c.\"{column_name}\") >= ${current_param} AND EXTRACT(YEAR FROM c.\"{column_name}\") <= ${current_param + 1})")
                param_values.append(start_year)
                param_values.append(end_year)
            elif start_date and end_year:
                # Start is date, end is year - use start of end year
                end_date_start = datetime(end_year, 1, 1).date()
                conditions.append(f"(c.\"{column_name}\" IS NOT NULL AND DATE(c.\"{column_name}\") >= ${current_param}::date AND DATE(c.\"{column_name}\") <= ${current_param + 1}::date)")
                param_values.append(start_date)
                param_values.append(end_date_start)
            elif start_year and end_date:
                # Start is year, end is date - use end of start year
                start_date_end = datetime(start_year, 12, 31).date()
                conditions.append(f"(c.\"{column_name}\" IS NOT NULL AND DATE(c.\"{column_name}\") >= ${current_param}::date AND DATE(c.\"{column_name}\") <= ${current_param + 1}::date)")
                param_values.append(start_date_end)
                param_values.append(end_date)
        
        if conditions:
            next_param_count = start_param_count + len(param_values)
            return " AND ".join(conditions), param_values, next_param_count
        return None, [], start_param_count

    # Date field filters - process all date filters in a loop
    date_field_mappings = [
        ("approval_date", "approvalDate"),
        ("expiry_date", "expiryDate"),
        ("drawing_date", "drawingDate"),
        ("application_date", "applicationDate"),
        ("case_date", "caseDate"),
        ("registration_date", "registrationDate"),
        ("land_document_date", "landDocumentDate"),
    ]
    
    for filter_key, column_name in date_field_mappings:
        date_array = understanding["filters"].get(filter_key)
        if date_array:
            condition, date_values, param_count = build_date_condition(date_array, column_name, param_count + 1)
            if condition and date_values:
                base_sql += f" AND {condition}"
                params.extend(date_values)

    base_sql += " ORDER BY similarity ASC"
    LOGGER.info(f"SQL Query: {base_sql}")
    LOGGER.info(f"SQL Parameters: {params}")
    return base_sql, params


