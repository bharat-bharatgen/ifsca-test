"use client";

import React, { useState, useEffect } from "react";
import {
  Viewer,
  Worker,
} from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import {
  ZoomIn,
  ZoomOut,
  LoaderIcon,
} from "lucide-react";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDocumentContext } from "./context";

import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";

export const PdfWorker = () => {
  const { document } = useDocumentContext();
  const [fileType, setFileType] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (document) {
      setIsLoading(false);
      // Detect file type from URL
      const url = document.documentUrl?.toLowerCase();
      if (url?.endsWith('.pdf')) {
        setFileType('pdf');
      } else if (url?.endsWith('.jpg') || url?.endsWith('.jpeg') || url?.endsWith('.png')) {
        setFileType('image');
      }
    }
  }, [document]);

  const transform = (slot) => ({
    ...slot,
    Open: () => <></>,
    Print: () => <></>,
    Download: () => <></>,
    DownloadMenuItem: () => <></>,
  });

  const defaultLayoutPluginInstance = defaultLayoutPlugin({});

  const { renderDefaultToolbar } =
    defaultLayoutPluginInstance.toolbarPluginInstance;

  const renderToolbar = (Toolbar) => (
    <Toolbar>{renderDefaultToolbar(transform)}</Toolbar>
  );

  // Recreate plugin with toolbar
  const defaultLayoutPluginWithToolbar = defaultLayoutPlugin({
    renderToolbar,
  });

  // Create an Image Viewer component
  const ImageViewer = () => {
    const [scale, setScale] = useState(1);
    
    const handleZoomIn = () => {
      setScale(prev => Math.min(prev + 0.1, 3));
    };
    
    const handleZoomOut = () => {
      setScale(prev => Math.max(prev - 0.1, 0.5));
    };
  
    return (
      <div className="h-[90vh] flex flex-col">
        <div className="flex justify-end gap-2 p-2 bg-gray-100 dark:bg-gray-900">
          <ShadcnButton onClick={handleZoomOut} variant="outline" size="sm">
            <ZoomOut className="w-4 h-4" />
          </ShadcnButton>
          <ShadcnButton onClick={handleZoomIn} variant="outline" size="sm">
            <ZoomIn className="w-4 h-4" />
          </ShadcnButton>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="relative flex items-center justify-center min-h-full">
            <img
              src={document.documentUrl}
              alt="Document"
              className="object-contain transition-transform duration-200"
              style={{ 
                transform: `scale(${scale})`,
                maxHeight: '85vh'
              }}
            />
          </div>
        </div>
      </div>
    );
  };

  if (isLoading || !document?.documentUrl) {
    return (
      <Card className="h-[90vh] flex items-center justify-center">
        <LoaderIcon className="w-8 h-8 animate-spin" />
      </Card>
    );
  }

  if (fileType === 'image') {
    return <ImageViewer />;
  }

  return (
    <Card className="h-[90vh] overflow-hidden">
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
        <Viewer
          fileUrl={document.documentUrl}
          plugins={[defaultLayoutPluginWithToolbar]}
        />
      </Worker>
    </Card>
  );
};

