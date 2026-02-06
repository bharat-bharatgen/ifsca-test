"use client";

import { SummaryCards } from "@/components/ui-dashboard/summary-cards";
import { FilterControls } from "@/components/ui-dashboard/filter-controls";
import { DataTable } from "@/components/ui-dashboard/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContractUploadCard } from "@/components/pages/app/contract-upload-card";
import { TaskRestore } from "@/components/pages/app/task-restore";
import { useState } from "react";
import { Plus, User, RefreshCw, RotateCcw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useDocuments } from "@/hooks/use-documents";
import { useAiChatCount } from "@/hooks/use-ai-chat-count";
import { createUrlUpdater, parseDateParams, createFilterHandlers } from "@/lib/url-utils";
import { applyFilters } from "@/lib/filter-utils";

export default function UIDashboard() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const { documents, isLoading, error, refresh } = useDocuments();
  const { count: aiChatCount, resolvedCount, isLoading: isChatCountLoading, refresh: refreshChatCount } = useAiChatCount();
  
  // Get filters from URL params
  const customerNameFilter = searchParams.get('customerName') || '';
  const { fromDate, toDate } = parseDateParams(searchParams);

  // Create reusable URL updater and filter handlers
  const urlUpdater = useCallback(createUrlUpdater(searchParams, router.push), [searchParams, router.push]);
  const { handleCustomerNameChange, handleDateRangeChange } = useMemo(
    () => createFilterHandlers(urlUpdater),
    [urlUpdater]
  );

  const hasActiveFilters = !!(customerNameFilter || fromDate || toDate);
  const handleResetFilters = useCallback(() => {
    urlUpdater({ customerName: null, fromDate: null, toDate: null });
  }, [urlUpdater]);

  // Filter documents using reusable filter utilities
  const filteredDocuments = useMemo(() => {
    return applyFilters(documents, {
      customerName: customerNameFilter,
      fromDate,
      toDate,
    });
  }, [documents, customerNameFilter, fromDate, toDate]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  const summaryData = useMemo(() => {
    const totalFiles = filteredDocuments.length;
    const uniqueTypes = new Set(filteredDocuments.map((d) => d.type || "")).size;
    
    return {
      totalFiles,
      pendingFiles: aiChatCount, // Number of queries raised equals to the number of AI chats by user
      approvedFiles: resolvedCount, // Number of queries resolved (total - unresolved)
      // This key name comes from SummaryCards; label shown there is "Total types of Documents"
      rejectedFiles: uniqueTypes,
    };
  }, [filteredDocuments, aiChatCount, resolvedCount]);

  const tableRows = filteredDocuments.map((d, index) => ({
    id: d.documentName || `document-${d.id}`,
    documentId: d.id,
    date: formatDate(d.date),
    type: d.type || "",
    customerName: d.promisee || "",
    location: d.city || d.state || d.country || "",
    summary: d.description || "",
    reviewStatus: "",
    action: "review",
  }));

  return (
    <div className="p-6 space-y-6 bg-background">
      {/* Task Restore - Always mounted to restore pending tasks on page load */}
      <TaskRestore />
      
      {/* Header Section with Refresh */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">User Dashboard</h1>
          <p className="text-muted-foreground">
            Upload documents, and view status for quick action.
          </p>
        </div>
        <Button
          aria-label="Refresh"
          variant="ghost"
          size="sm"
          className="h-16 w-16 p-0 hover:bg-muted rounded-full"
          onClick={() => {
            refresh();
            refreshChatCount();
          }}
          disabled={isLoading || isChatCountLoading}
          title="Refresh data"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading || isChatCountLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Summary Cards */}
      <SummaryCards data={summaryData} />

      {/* Filter Controls and Create Button */}
      <div className="lg:flex items-center justify-between">
        <div className="lg:w-1/2">
        <div className="lg:flex items-center gap-5">
          <div className="lg:w-2/3">
          <FilterControls 
            customerName={customerNameFilter}
            onCustomerNameChange={handleCustomerNameChange}
            fromDate={fromDate}
            toDate={toDate}
            onDateRangeChange={handleDateRangeChange}
          />
          </div>
          <div className="lg:w-1/3">
          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-12 py-5 w-full"
              onClick={handleResetFilters}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          )}
          </div>
        </div>
        </div>
        <div className="lg:w-1/2 flex justify-center lg:justify-end">
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm flex items-center lg:w-80 w-full"
            onClick={() => setIsUploadOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            <User className="h-4 w-4 mr-2" />
            Upload New Document
          </Button>
        </div>

      </div>

      {/* Data Table */}
      <DataTable data={tableRows} />

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Upload and Analyze Document</DialogTitle>
          </DialogHeader>
          <ContractUploadCard onUploadComplete={() => setIsUploadOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
