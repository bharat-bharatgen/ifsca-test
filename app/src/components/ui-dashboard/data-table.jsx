import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ChevronDown } from "lucide-react";
import Link from "next/link";

export function DataTable({ data }) {
  const getStatusBadge = (status) => null;

  const getActionButton = (action, documentId) => {
    if (action === "download") {
      return (
        <Button size="sm" variant="outline" className="gap-2">
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      );
    } else if (action === "review") {
      return (
        <Link href={`/documents/${documentId}`} className="text-primary">
          View
        </Link>
      );
    }
    return null;
  };

  // Apply light background to specific columns to match the visual
  const columnBgClasses = [
    "", // File #
    "", // Date
    "bg-muted/40", // Type of Document
    "", // Customer Name
    "bg-muted/40", // Location
    "", // Summary
    "", // Review Status
    "", // Actions
  ];

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader className="bg-secondary/40">
          <TableRow className="hover:bg-secondary/40">
            <TableHead className="font-semibold">
              File # <ChevronDown className="inline h-4 w-4 ml-1" />
            </TableHead>
            <TableHead className="font-semibold">
              Date <ChevronDown className="inline h-4 w-4 ml-1" />
            </TableHead>
            <TableHead className="font-semibold">Type of Document</TableHead>
            <TableHead className="font-semibold">Customer Name</TableHead>
            <TableHead className="font-semibold">Location</TableHead>
            <TableHead className="font-semibold">Summary</TableHead>
            <TableHead className="font-semibold">Actions</TableHead>
            
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                No documents found. Upload your first document to get started.
              </TableCell>
            </TableRow>
          ) : (
            data.map((file, index) => (
              <TableRow 
                key={file.documentId || `row-${index}`} 
                className={`border-dotted hover:bg-muted/50`}
              >
                <TableCell className={`font-medium ${columnBgClasses[0]}`}>{file.id}</TableCell>
                <TableCell className={`${columnBgClasses[1]}`}>{file.date}</TableCell>
                <TableCell className={`${columnBgClasses[2]}`}>{file.type}</TableCell>
                <TableCell className={`${columnBgClasses[3]}`}>{file.customerName}</TableCell>
                <TableCell className={`${columnBgClasses[4]}`}>{file.location}</TableCell>
                <TableCell className={`${columnBgClasses[5]} max-w-[220px] truncate`} title={file.summary}>{file.summary}</TableCell>
                <TableCell className={`${columnBgClasses[7]}`}>{getActionButton(file.action, file.documentId)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
