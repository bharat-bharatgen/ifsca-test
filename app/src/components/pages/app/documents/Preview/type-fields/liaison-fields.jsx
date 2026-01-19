
export const LiaisonFields = ({ document }) => {
  const formatDate = (date) => {
    if (!date) return "N/A";
    return new Date(date).toDateString();
  };

  return (
    <div className="mt-4">
      <h3 className="text-md font-semibold mb-2">LIASION Document Details:</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Application No - {document.applicationNo?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Application Date - {document.applicationDate ? formatDate(document.applicationDate) : "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Company Name - {document.companyName?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Authority Name - {document.authorityName?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Approval No - {document.approvalNo?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Order No - {document.orderNo?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Approval Date - {document.approvalDate ? formatDate(document.approvalDate) : "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Building Name - {document.buildingName?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Project Name - {document.projectName?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Expiry Date - {document.expiryDate ? formatDate(document.expiryDate) : "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Sector - {document.sector?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Subject - {document.subject?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Drawing No - {document.drawingNo?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Drawing Date - {document.drawingDate ? formatDate(document.drawingDate) : "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Building Type - {document.buildingType?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Commence Certificate - {document.commenceCertificate?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Intimation of Disapproval - {document.intimationOfDisapproval?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">Intimation of Approval - {document.intimationOfApproval?.trim() || "N/A"}</span>
        </div>
        <div className="flex items-start text-sm text-gray-400">
          <span className="break-words">RERA - {document.rera?.trim() || "N/A"}</span>
        </div>
      </div>
    </div>
  );
};

