"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export const DuplicateUploadDialog = ({
  open,
  fileName,
  existingName,
  onConfirm,
  onCancel,
}) => {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        // If user closes the dialog via overlay/close button, treat as cancel
        if (!isOpen && open) {
          onCancel?.();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate document detected</DialogTitle>
          <DialogDescription>
            A document with the same content already exists
            {existingName ? ` (${existingName})` : ""}. Do you still want to
            upload <span className="font-medium">{fileName}</span>?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Don&apos;t upload
          </Button>
          <Button type="button" onClick={onConfirm}>
            Upload anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
