
export const LandFields = ({ document }) => {
  const formatDate = (date) => {
    if (!date) return "N/A";
    return new Date(date).toDateString();
  };

  return (
    <div className="mt-4">
      <h3 className="text-md font-semibold mb-2">LAND Document Details:</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
        {document.registrationNo && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">{document.registrationNoLabel || "Registration No"} - {document.registrationNo}</span>
          </div>
        )}
        {document.registrationDate && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">Registration Date - {formatDate(document.registrationDate)}</span>
          </div>
        )}
        {document.landDocumentType && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">Land Document Type - {document.landDocumentType}</span>
          </div>
        )}
        {document.landDocumentDate && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">Land Document Date - {formatDate(document.landDocumentDate)}</span>
          </div>
        )}
        {document.seller && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">Seller - {document.seller}</span>
          </div>
        )}
        {document.purchaser && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">Purchaser - {document.purchaser}</span>
          </div>
        )}
        {document.surveyNo && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">Survey No - {document.surveyNo}</span>
          </div>
        )}
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">CTS No - {document.ctsNo?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">GUT No - {document.gutNo?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Plot No - {document.plotNo?.trim() || "N/A"}</span>
        </div>
        {document.noOfPages && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">No. of Pages - {document.noOfPages}</span>
          </div>
        )}
        {document.village && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">Village - {document.village}</span>
          </div>
        )}
        {document.taluka && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">Taluka - {document.taluka}</span>
          </div>
        )}
        {document.pincode && (
          <div className="flex items-start text-sm text-gray-400">
            <span className="break-words">Pincode - {document.pincode}</span>
          </div>
        )}
      </div>
    </div>
  );
};

