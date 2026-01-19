"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const USAGE_ACCOUNT_EMAIL = "usage@example.com";

// Gemini 2.0 Flash pricing (per 1M tokens)
const INPUT_TOKEN_PRICE_PER_MILLION = 0.10; // $0.10 per 1M input tokens
const OUTPUT_TOKEN_PRICE_PER_MILLION = 0.40; // $0.40 per 1M output tokens

// Calculate cost from tokens
const calculateCost = (inputTokens, outputTokens) => {
  const inputCost = (inputTokens / 1_000_000) * INPUT_TOKEN_PRICE_PER_MILLION;
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_TOKEN_PRICE_PER_MILLION;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
};

// Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(amount);
};

export default function UsagePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [tokenUsage, setTokenUsage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "loading") return;
    
    // Check if user is authenticated and is the usage account
    // Allow access even if email is not verified (for usage account)
    if (!session || session.user?.email !== USAGE_ACCOUNT_EMAIL) {
      router.push("/login");
      return;
    }

    // Fetch users list
    fetchUsers();
  }, [session, status, router]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/v1/usage/users");
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTokenUsage = async (userId) => {
    if (!userId) {
      setTokenUsage(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/v1/usage/tokens?userId=${userId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch token usage");
      }
      const data = await response.json();
      setTokenUsage(data);
    } catch (err) {
      setError(err.message);
      setTokenUsage(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUserChange = (userId) => {
    setSelectedUserId(userId);
    fetchTokenUsage(userId);
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!session || session.user?.email !== USAGE_ACCOUNT_EMAIL) {
    return null;
  }

  return (
    <div className="p-6 space-y-6 bg-background">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Token Usage Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor input and output token usage for users
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Select User</CardTitle>
          <CardDescription>Choose a user to view their token usage statistics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedUserId} onValueChange={handleUserChange} disabled={loading}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name || user.email} ({user.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {tokenUsage && (
            <div className="mt-6 space-y-6">
              {/* Overall Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Overall Summary</CardTitle>
                  <CardDescription>Total token usage across all endpoints</CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const overallCost = calculateCost(
                      tokenUsage.totalInputTokens,
                      tokenUsage.totalOutputTokens
                    );
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Input Tokens</p>
                          <p className="text-2xl font-bold text-primary">
                            {tokenUsage.totalInputTokens.toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(overallCost.inputCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Output Tokens</p>
                          <p className="text-2xl font-bold text-primary">
                            {tokenUsage.totalOutputTokens.toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(overallCost.outputCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Total Tokens</p>
                          <p className="text-2xl font-bold text-primary">
                            {tokenUsage.totalTokens.toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(overallCost.totalCost)}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Document Chat Usage */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Document Chat</CardTitle>
                  <CardDescription>
                    Token usage for document-specific queries ({tokenUsage.documentChat?.recordCount || 0} requests)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const docChatCost = calculateCost(
                      tokenUsage.documentChat?.inputTokens || 0,
                      tokenUsage.documentChat?.outputTokens || 0
                    );
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Input Tokens</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {(tokenUsage.documentChat?.inputTokens || 0).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(docChatCost.inputCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Output Tokens</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {(tokenUsage.documentChat?.outputTokens || 0).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(docChatCost.outputCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Total Tokens</p>
                          <p className="text-2xl font-bold text-blue-600">
                            {(tokenUsage.documentChat?.totalTokens || 0).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(docChatCost.totalCost)}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Global Chat Usage */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Global Chat</CardTitle>
                  <CardDescription>
                    Token usage for global semantic search queries ({tokenUsage.globalChat?.recordCount || 0} requests)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const globalChatCost = calculateCost(
                      tokenUsage.globalChat?.inputTokens || 0,
                      tokenUsage.globalChat?.outputTokens || 0
                    );
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Input Tokens</p>
                          <p className="text-2xl font-bold text-green-600">
                            {(tokenUsage.globalChat?.inputTokens || 0).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(globalChatCost.inputCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Output Tokens</p>
                          <p className="text-2xl font-bold text-green-600">
                            {(tokenUsage.globalChat?.outputTokens || 0).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(globalChatCost.outputCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Total Tokens</p>
                          <p className="text-2xl font-bold text-green-600">
                            {(tokenUsage.globalChat?.totalTokens || 0).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(globalChatCost.totalCost)}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Document Upload Usage */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Document Upload</CardTitle>
                  <CardDescription>
                    Token usage for document processing and classification ({tokenUsage.documentUpload?.recordCount || 0} uploads)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const uploadCost = calculateCost(
                      tokenUsage.documentUpload?.inputTokens || 0,
                      tokenUsage.documentUpload?.outputTokens || 0
                    );
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Input Tokens</p>
                          <p className="text-2xl font-bold text-purple-600">
                            {(tokenUsage.documentUpload?.inputTokens || 0).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(uploadCost.inputCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Output Tokens</p>
                          <p className="text-2xl font-bold text-purple-600">
                            {(tokenUsage.documentUpload?.outputTokens || 0).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(uploadCost.outputCost)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Total Tokens</p>
                          <p className="text-2xl font-bold text-purple-600">
                            {(tokenUsage.documentUpload?.totalTokens || 0).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(uploadCost.totalCost)}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          )}

          {selectedUserId && !tokenUsage && !loading && (
            <div className="text-center text-muted-foreground py-8">
              No token usage data found for this user.
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

