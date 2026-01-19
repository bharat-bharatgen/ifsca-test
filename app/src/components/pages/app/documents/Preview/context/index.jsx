"use client";

import { createContext, useContext, useState } from "react";
import dynamic from "next/dynamic";
import { DocumentDetails } from "../document-details";
import { DocumentChat } from "../document-chat";

// Dynamic import with SSR disabled to avoid canvas native module issues
const PdfWorker = dynamic(() => import("../pdf-worker").then(mod => mod.PdfWorker), {
  ssr: false,
  loading: () => (
    <div className="h-[90vh] flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  ),
});

const DocumentContext = createContext();

export const useDocumentContext = () => useContext(DocumentContext);

export const DocumentProvider = ({
  children,
  documentData,
  documentInfoData,
  documentSummaryData,
  documentChatsData,
  session,
  isGuest,
}) => {
  const [document, setDocument] = useState(documentData);
  const [documentInfo, setDocumentInfo] = useState(documentInfoData);
  const [documentSummary, setDocumentSummary] = useState(documentSummaryData);
  const [documentChats, setDocumentChats] = useState(documentChatsData);
  const [sendMessageToAI, setSendMessageToAI] = useState({
    caller: async () => {},
  });

  const value = {
    document,
    setDocument,
    documentInfo,
    setDocumentInfo,
    documentSummary,
    setDocumentSummary,
    documentChats,
    setDocumentChats,
    session,
    sendMessageToAI,
    setSendMessageToAI,
    isGuest,
  };

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
};

export const DocumentWrapper = ({
  document,
  documentInfo,
  documentSummary,
  documentChats,
  session,
  isGuest,
}) => (
  <DocumentProvider
    documentData={document}
    documentInfoData={documentInfo}
    documentSummaryData={documentSummary}
    documentChatsData={documentChats}
    session={session}
    isGuest={isGuest}
  >
    <div className="p-8 space-y-8">
      <DocumentDetails />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {document.documentType === "UPLOADED" && (
          <PdfWorker />
        )}
        <div className="flex flex-col gap-8">
          <DocumentChat />
        </div>
      </div>
    </div>
  </DocumentProvider>
);

