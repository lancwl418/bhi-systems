"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function UploadInvoices() {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState("uploading");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/finance/invoices", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setState("error");
        setResult(data);
        return;
      }

      setState("done");
      setResult(data);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      setState("error");
      setResult({ error: err.message });
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={handleUpload}
        className="hidden"
        id="invoice-upload"
      />

      {state === "idle" && (
        <Button onClick={() => fileRef.current?.click()} variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Import Invoice Report
        </Button>
      )}

      {state === "uploading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing...
        </div>
      )}

      {state === "done" && result && (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-green-800">
              {result.inserted} invoices imported
              {result.skipped > 0 && `, ${result.skipped} skipped (duplicates)`}
            </p>
            {result.unmatched > 0 && (
              <p className="text-green-700 mt-1">{result.unmatched} invoices have no matching order</p>
            )}
          </div>
        </div>
      )}

      {state === "error" && result && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-red-800">Upload failed</p>
            <p className="text-red-700 mt-1">{result.error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { setState("idle"); setResult(null); }}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
