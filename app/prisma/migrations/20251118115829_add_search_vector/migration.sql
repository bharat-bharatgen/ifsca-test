-- Add search_vector column to documents table for full-text search
ALTER TABLE "documents" ADD COLUMN "search_vector" tsvector;

-- Create GIN index for efficient full-text search
CREATE INDEX "documents_search_vector_idx" ON "documents" USING GIN ("search_vector");

-- Create function to update search_vector when document is created or updated
CREATE OR REPLACE FUNCTION update_document_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW."documentText", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."documentName", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW."documentType"::text, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.promisor, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.promisee, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.type, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.category, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."subCategory", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.city, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.state, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.country, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.location, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."documentNumber", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."documentNumberLabel", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."registrationNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."landDocumentType", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."surveyNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."ctsNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."gutNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."plotNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.village, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.taluka, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.pincode, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."applicationNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."companyName", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW."authorityName", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW."approvalNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."orderNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."buildingName", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW."projectName", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.sector, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.subject, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW."drawingNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."buildingType", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."commenceCertificate", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."intimationOfDisapproval", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."intimationOfApproval", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.rera, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.court, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW."caseNo", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."caseType", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.applicant, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.petitioner, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.respondent, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.plaintiff, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.defendant, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW."advocateName", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.judicature, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.coram, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.seller, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.purchaser, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update search_vector on insert or update
CREATE TRIGGER update_document_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "documents"
  FOR EACH ROW
  EXECUTE FUNCTION update_document_search_vector();

-- Update existing documents with search_vector
UPDATE "documents"
SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("documentText", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("documentName", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("documentType"::text, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(promisor, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(promisee, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(type, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(category, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("subCategory", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(city, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(state, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(country, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(location, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("documentNumber", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("documentNumberLabel", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("registrationNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("landDocumentType", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("surveyNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("ctsNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("gutNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("plotNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(village, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(taluka, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(pincode, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("applicationNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("companyName", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("authorityName", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("approvalNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("orderNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("buildingName", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("projectName", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(sector, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(subject, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("drawingNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("buildingType", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("commenceCertificate", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("intimationOfDisapproval", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("intimationOfApproval", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(rera, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(court, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("caseNo", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE("caseType", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(applicant, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(petitioner, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(respondent, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(plaintiff, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(defendant, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE("advocateName", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(judicature, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(coram, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(seller, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(purchaser, '')), 'B');

