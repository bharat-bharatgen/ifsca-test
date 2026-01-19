"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { Plus, Trash2, Copy, Check, Key } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState(null);
  const [copiedKeyId, setCopiedKeyId] = useState(null);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/v1/api-keys");
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data.apiKeys || []);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch API keys",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
      toast({
        title: "Error",
        description: "Failed to fetch API keys",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for the API key",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewlyCreatedKey(data.apiKey);
        setNewKeyName("");
        setIsCreateDialogOpen(false);
        fetchApiKeys();
        toast({
          title: "Success",
          description: "API key created successfully! Copy it now - it won't be shown again.",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to create API key",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error creating API key:", error);
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteKey = async (keyId) => {
    if (!confirm("Are you sure you want to delete this API key? This action cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/api-keys?id=${keyId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "API key deleted successfully",
        });
        fetchApiKeys();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to delete API key",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting API key:", error);
      toast({
        title: "Error",
        description: "Failed to delete API key",
        variant: "destructive",
      });
    }
  };

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key);
    setCopiedKeyId(key);
    toast({
      title: "Copied!",
      description: "API key copied to clipboard",
    });
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-6 space-y-6 bg-background">
      <div className="md:flex items-center justify-between space-y-5">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold dark:text-white flex items-center gap-2">
            <Key className="h-8 w-8" />
            API Keys
          </h3>
          <p className="text-muted-foreground">
            Manage your API keys for accessing the public API endpoints.
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {newlyCreatedKey && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <AlertDescription className="space-y-4">
            <div>
              <p className="font-semibold text-green-900 dark:text-green-100 mb-2">
                ⚠️ Important: Save this API key now!
              </p>
              <p className="text-sm text-green-800 dark:text-green-200 mb-4">
                This is the only time you'll be able to see this key. Copy it and store it securely.
              </p>
            </div>
            <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded border border-green-300 dark:border-green-700">
              <code className="flex-1 text-sm font-mono break-all">
                {newlyCreatedKey.key}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCopyKey(newlyCreatedKey.key)}
              >
                {copiedKeyId === newlyCreatedKey.key ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewlyCreatedKey(null)}
            >
              I've saved it
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading API keys...</p>
        </div>
      ) : apiKeys.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold dark:text-white">No API Keys</CardTitle>
            <CardDescription>
              <p>
                You haven't created any API keys yet. Create one to get started.
              </p>
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {apiKeys.map((key) => (
            <Card key={key.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{key.name || "Untitled Key"}</CardTitle>
                    <CardDescription className="mt-1">
                      Created: {formatDate(key.createdAt)}
                      {key.lastUsedAt && ` • Last used: ${formatDate(key.lastUsedAt)}`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        key.isActive
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {key.isActive ? "Active" : "Inactive"}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteKey(key.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Public Documents API Integration Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold dark:text-white">Public Documents API Integration</CardTitle>
          <CardDescription>
            Use your API key to process documents via the public API from your backend or workflows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground p-6">
          <div>
            <h3 className="text-lg font-semibold dark:text-white">Base URL</h3>
            <p>
              <code>https://dms.outriskai.com</code>
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold dark:text-white">Endpoint</h3>
            <p>
              <code>POST /api/v1/public/documents/process</code>
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold dark:text-white">Authentication</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Header <code>X-API-Key: dms_xxx...</code>
              </li>
              <li>
                Or header <code>Authorization: Bearer dms_xxx...</code>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold dark:text-white">Request Body (JSON)</h3>
            <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs">
              <code>
          {`{
            "documentUrl": "https://your-bucket/path/to/document.pdf",
            "metadata": [
              "registration_no",
              "gut_no",
              "MTR_Form_Number",
              "office_name",
              "type_of_payment",
              "pan_no"
            ],
            "webhookUrl": "https://your-app.com/webhooks/dms",
            "documentName": "Release Deed.pdf"
          }`}
              </code>
            </pre>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li>
                <code>documentUrl</code> – public or signed URL to the PDF/image to be processed.
              </li>
              <li>
                <code>metadata</code> – optional array of field names you want the AI to extract and store as explicit metadata.
              </li>
              <li>
                <code>webhookUrl</code> – optional URL to receive a callback when processing completes.
              </li>
              <li>
                <code>documentName</code> – optional friendly name shown in the dashboard.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold dark:text-white">Response</h3>
            <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs">
              <code>
          {`{
            "jobId": "job_abc123...",
            "status": "PENDING",
            "documentId": "cmxxxxx...",
            "message": "Document processing started"
          }`}
              </code>
            </pre>
            <p className="mt-2">
              Use <code>jobId</code> with{" "}
              <code className="block max-w-xs truncate">
                GET /api/v1/public/documents/status/{"{jobId}"}
              </code>{" "}
              to poll the status and
              retrieve the processed document and explicit metadata.
            </p>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Give your API key a name to help you identify it later. You'll be able to copy the key after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g., Production API Key"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateKey();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setNewKeyName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateKey} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

