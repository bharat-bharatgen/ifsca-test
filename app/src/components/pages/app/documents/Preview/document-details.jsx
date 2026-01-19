"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DownloadIcon } from "lucide-react";
import axios from "axios";
import { useEffect, useState } from "react";
import { Icons } from "@/components/icons";
import { toast } from "@/components/ui/use-toast";
import { useDocumentContext } from "./context";
import { LandFields } from "./type-fields/land-fields";
import { LiaisonFields } from "./type-fields/liaison-fields";
import { LegalFields } from "./type-fields/legal-fields";

export const DocumentDetails = () => {
  const {
    document,
    setDocument,
    documentInfo,
    session,
    isGuest,
    documentSummary,
  } = useDocumentContext();

  const fetchDocument = async () => {
    const response = await axios.get(`/api/v1/documents/${document.id}`);
    if (response.status === 200) {
      setDocument(response.data.document);
    }
  };

  return (
    <Card className="p-6 space-y-4 rounded-lg lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{document.title || "Untitled Document"}</h2>
          <div className="flex items-center gap-2">
            <DocumentInfoEditor
              document={document}
              setDocument={setDocument}
              disabled={isGuest}
            />
            <DropDownMenu
              document={document}
              fetchDocument={fetchDocument}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <p className="text-sm">{documentSummary?.summary || document.description || ""}</p>
        <div className="mt-4">
          <h2 className="text-lg font-semibold">Document Information:</h2>

          {document.documentNumber && (
            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">
                {(document.documentNumberLabel || "Document Number")} - {document.documentNumber}
              </span>
            </div>
          )}

          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">Promisor - {document.promisor || "N/A"}</span>
            </div>

            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">Promisee - {document.promisee || "N/A"}</span>
            </div>

            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">Value - {document.documentValue || "N/A"}</span>
            </div>

            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">Date - {document.date ? new Date(document.date).toDateString() : "N/A"}</span>
            </div>

            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">Uploaded Date - {document.uploadedAt ? new Date(document.uploadedAt).toDateString() : "N/A"}</span>
            </div>

            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">Type - {document.type || "N/A"}</span>
            </div>


            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">Country - {document.country || "N/A"}</span>
            </div>

            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">State - {document.state || "N/A"}</span>
            </div>

            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">City - {document.city || "N/A"}</span>
            </div>

            <div className="flex items-start text-sm text-gray-400">
              <span className="break-words">Location - {document.location || "N/A"}</span>
            </div>
          </div>

          {/* Type-specific fields */}
          {document.type?.toUpperCase() === "LAND" && <LandFields document={document} />}
          {document.type?.toUpperCase() === "LIAISON" && <LiaisonFields document={document} />}
          {document.type?.toUpperCase() === "LEGAL" && <LegalFields document={document} />}

          {/* Explicit Metadata */}
          {Array.isArray(document.documentMetadata) && document.documentMetadata.length > 0 && (
            <div className="mt-6">
              <h3 className="text-md font-semibold mb-2">
                Explicit Metadata
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                {document.documentMetadata.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start text-sm text-gray-400"
                  >
                    <span className="break-words">
                      {item.key} - {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
};

const DropDownMenu = ({ document, fetchDocument }) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center p-2 space-x-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Icons.Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="flex flex-col items-center gap-2 font-medium cursor-pointer text-md">
        <DropdownMenuItem asChild>
          <DownloadPdf document={document} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const DownloadPdf = ({ document }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (isDownloading) return;
    try {
      setIsDownloading(true);
      
      if (!document.documentUrl) {
        throw new Error("Document URL not available");
      }

      const response = await fetch(document.documentUrl, {
        method: "GET",
      });

      if (response.status !== 200) {
        throw new Error("There was some error while downloading PDF");
      }

      const blob = await response.blob();

      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${document.title || document.documentName || "document"}.pdf`);

      // Append to html link element page
      document.body.appendChild(link);

      // Start download
      link.click();

      // Clean up and remove the link
      link.parentNode.removeChild(link);

      // Success message
      toast({
        title: `${document.title || document.documentName} downloaded successfully!`,
      });
    } catch (err) {
      console.log("Error:", err);
      toast({
        title: "Document download failed",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      disabled={isDownloading}
      className="w-full"
      onClick={handleDownload}
    >
      <DownloadIcon className="w-4 h-4 mr-2" />
      Download
    </Button>
  );
};

const formatDateInputValue = (value) => {
  if (!value) return "";
  const dateValue = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(dateValue.getTime())) return "";
  return dateValue.toISOString().split("T")[0];
};

const FIELD_CONFIG = {
  title:        { transform: (v) => v || "" },
  documentNumberLabel: { transform: (v) => v || "" },
  documentNumber:      { transform: (v) => v || "" },
  promisor:            { transform: (v) => v || "" },
  promisee:            { transform: (v) => v || "" },
  documentValue:       { transform: (v) => v?.toString() || "" },
  date:                { transform: formatDateInputValue },
  type:                { transform: (v) => v || "" },
  country:             { transform: (v) => v || "" },
  state:               { transform: (v) => v || "" },
  city:                { transform: (v) => v || "" },
  location:            { transform: (v) => v || "" },
  description:         { transform: (v) => v || "" },
  registrationNo:      { transform: (v) => v || "" },
  registrationDate:    { transform: formatDateInputValue },
  landDocumentType:    { transform: (v) => v || "" },
  landDocumentDate:    { transform: formatDateInputValue },
  seller:              { transform: (v) => v || "" },
  purchaser:           { transform: (v) => v || "" },
  surveyNo:            { transform: (v) => v || "" },
  ctsNo:               { transform: (v) => v || "" },
  gutNo:               { transform: (v) => v || "" },
  plotNo:              { transform: (v) => v || "" },
  noOfPages:           { transform: (v) => v?.toString() || "" },
  village:             { transform: (v) => v || "" },
  taluka:              { transform: (v) => v || "" },
  pincode:             { transform: (v) => v || "" },
  applicationNo:       { transform: (v) => v || "" },
  applicationDate:     { transform: formatDateInputValue },
  companyName:         { transform: (v) => v || "" },
  authorityName:       { transform: (v) => v || "" },
  approvalNo:          { transform: (v) => v || "" },
  orderNo:             { transform: (v) => v || "" },
  approvalDate:        { transform: formatDateInputValue },
  buildingName:        { transform: (v) => v || "" },
  projectName:         { transform: (v) => v || "" },
  expiryDate:          { transform: formatDateInputValue },
  sector:              { transform: (v) => v || "" },
  subject:             { transform: (v) => v || "" },
  drawingNo:           { transform: (v) => v || "" },
  drawingDate:         { transform: formatDateInputValue },
  buildingType:        { transform: (v) => v || "" },
  commenceCertificate: { transform: (v) => v || "" },
  intimationOfDisapproval: { transform: (v) => v || "" },
  intimationOfApproval:    { transform: (v) => v || "" },
  rera:                { transform: (v) => v || "" },
  caseType:            { transform: (v) => v || "" },
  caseNo:              { transform: (v) => v || "" },
  caseDate:            { transform: formatDateInputValue },
  court:               { transform: (v) => v || "" },
  applicant:           { transform: (v) => v || "" },
  petitioner:          { transform: (v) => v || "" },
  respondent:          { transform: (v) => v || "" },
  plaintiff:           { transform: (v) => v || "" },
  defendant:           { transform: (v) => v || "" },
  advocateName:        { transform: (v) => v || "" },
  judicature:          { transform: (v) => v || "" },
  coram:               { transform: (v) => v || "" },
};

const buildInitialFormState = (document) =>
  Object.entries(FIELD_CONFIG).reduce(
    (acc, [key, { transform }]) => ({
      ...acc,
      [key]: transform(document?.[key]),
    }),
    {}
  );
const TYPE_OPTIONS = ["LAND", "LIAISON", "LEGAL"];

const FIELD_GROUPS = {
  LAND: {
    title: "Land Document Details",
    fields: [
      { name: "registrationNo", label: "Registration No" },
      { name: "registrationDate", label: "Registration Date", props: { type: "date" } },
      { name: "landDocumentType", label: "Land Document Type" },
      { name: "landDocumentDate", label: "Land Document Date", props: { type: "date" } },
      { name: "seller", label: "Seller" },
      { name: "purchaser", label: "Purchaser" },
      { name: "surveyNo", label: "Survey No" },
      { name: "ctsNo", label: "CTS No" },
      { name: "gutNo", label: "GUT No" },
      { name: "plotNo", label: "Plot No" },
      { name: "noOfPages", label: "No. of Pages", props: { type: "number", min: "0" } },
      { name: "village", label: "Village" },
      { name: "taluka", label: "Taluka" },
      { name: "pincode", label: "Pincode" },
    ],
  },
  LIAISON: {
    title: "Liaison Document Details",
    fields: [
      { name: "applicationNo", label: "Application No" },
      { name: "applicationDate", label: "Application Date", props: { type: "date" } },
      { name: "companyName", label: "Company Name" },
      { name: "authorityName", label: "Authority Name" },
      { name: "approvalNo", label: "Approval No" },
      { name: "orderNo", label: "Order No" },
      { name: "approvalDate", label: "Approval Date", props: { type: "date" } },
      { name: "buildingName", label: "Building Name" },
      { name: "projectName", label: "Project Name" },
      { name: "expiryDate", label: "Expiry Date", props: { type: "date" } },
      { name: "sector", label: "Sector" },
      { name: "subject", label: "Subject" },
      { name: "drawingNo", label: "Drawing No" },
      { name: "drawingDate", label: "Drawing Date", props: { type: "date" } },
      { name: "buildingType", label: "Building Type" },
      { name: "commenceCertificate", label: "Commence Certificate" },
      { name: "intimationOfDisapproval", label: "Intimation of Disapproval" },
      { name: "intimationOfApproval", label: "Intimation of Approval" },
      { name: "rera", label: "RERA" },
    ],
  },
  LEGAL: {
    title: "Legal Document Details",
    fields: [
      { name: "caseType", label: "Case Type" },
      { name: "caseNo", label: "Case No" },
      { name: "caseDate", label: "Case Date", props: { type: "date" } },
      { name: "court", label: "Court" },
      { name: "applicant", label: "Applicant" },
      { name: "petitioner", label: "Petitioner" },
      { name: "respondent", label: "Respondent" },
      { name: "plaintiff", label: "Plaintiff" },
      { name: "defendant", label: "Defendant" },
      { name: "advocateName", label: "Advocate Name" },
      { name: "judicature", label: "Judicature" },
      { name: "coram", label: "Coram" },
    ],
  },
};

const DocumentInfoEditor = ({ document, setDocument, disabled }) => {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formValues, setFormValues] = useState(() => buildInitialFormState(document));

  useEffect(() => {
    if (open) {
      setFormValues(buildInitialFormState(document));
    }
  }, [document, open]);

  const selectedType = (formValues.type || "").toUpperCase();

  const handleFieldChange = (field, value) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleInputChange = (field) => (event) => {
    handleFieldChange(field, event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!document?.id) return;
    setIsSaving(true);
    try {
      const response = await axios.put(`/api/v1/documents/${document.id}`, {
        ...formValues,
        type: formValues.type ? formValues.type.toUpperCase() : "",
      });

      if (response.status === 200) {
        setDocument(response.data.document);
        toast({
          title: "Document updated",
          description: "Document information saved successfully.",
        });
        setOpen(false);
      }
    } catch (err) {
      console.error("Document update failed", err);
      let description = "Please try again in a moment.";
      if (err.response?.status === 404) {
        description = "Document not found. It may have been deleted.";
      } else if (err.response?.status === 401 || err.response?.status === 403) {
        description = "You don't have permission to edit this document.";
      } else if (err.response?.data?.error) {
        description = err.response.data.error;
      } else if (!navigator.onLine) {
        description = "Please check your internet connection and try again.";
      }
      toast({
        title: "Failed to save document",
        description,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderInput = (name, label, props = {}) => (
    <div className="space-y-1" key={name}>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        value={formValues[name] ?? ""}
        onChange={handleInputChange(name)}
        {...props}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          Edit Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit Document Information</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {renderInput("title", "Title")}
            {renderInput("documentNumberLabel", "Document Number Label")}
            {renderInput("documentNumber", "Document Number")}
            <div className="space-y-1">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formValues.type || undefined}
                onValueChange={(value) => handleFieldChange("type", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {renderInput("promisor", "Promisor")}
            {renderInput("promisee", "Promisee")}
            {renderInput("documentValue", "Value", { type: "number", step: "any" })}
            {renderInput("date", "Date", { type: "date" })}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {renderInput("country", "Country")}
            {renderInput("state", "State")}
            {renderInput("city", "City")}
            {renderInput("location", "Location")}
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formValues.description ?? ""}
              onChange={handleInputChange("description")}
              rows={4}
            />
          </div>

          {selectedType && FIELD_GROUPS[selectedType] && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">
                {FIELD_GROUPS[selectedType].title}
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {FIELD_GROUPS[selectedType].fields.map(({ name, label, props }) =>
                  renderInput(name, label, props)
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};