
export const LegalFields = ({ document }) => {
  const formatDate = (date) => {
    if (!date) return "N/A";
    return new Date(date).toDateString();
  };

  return (
    <div className="mt-4">
      <h3 className="text-md font-semibold mb-2">LEGAL Document Details:</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Case Type - {document.caseType?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Case No - {document.caseNo?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Case Date - {document.caseDate ? formatDate(document.caseDate) : "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Court - {document.court?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Applicant - {document.applicant?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Petitioner - {document.petitioner?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Respondent - {document.respondent?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Plaintiff - {document.plaintiff?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Defendant - {document.defendant?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Advocate Name - {document.advocateName?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Judicature - {document.judicature?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Coram - {document.coram?.trim() || "N/A"}</span>
        </div>
      </div>
    </div>
  );
};

