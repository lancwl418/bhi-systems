"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface ImportResult {
  ok: boolean;
  retailer: string;
  csvRows: number;
  uniqueOrders: number;
  newProducts: number;
  newSkus: number;
  inserted: number;
  skipped: number;
  errors: number;
  errorMessages: string[];
  error?: string;
}

export function ImportCSV() {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState("uploading");
    setProgress(`Uploading ${file.name} (${(file.size / 1024).toFixed(0)} KB)...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/orders/import", {
        method: "POST",
        body: formData,
      });

      const data: ImportResult = await res.json();

      if (!res.ok || data.error) {
        setState("error");
        setResult(data);
        return;
      }

      setState("done");
      setResult(data);

      // Refresh the page after short delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      setState("error");
      setResult({ error: err.message } as ImportResult);
    }

    // Reset file input
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
        id="csv-upload"
      />

      {state === "idle" && (
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      )}

      {state === "uploading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {progress}
        </div>
      )}

      {state === "done" && result && (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-green-800">
              Import complete — {result.retailer}
            </p>
            <p className="text-green-700 mt-1">
              {result.inserted.toLocaleString()} orders imported,{" "}
              {result.skipped.toLocaleString()} skipped (duplicates)
              {result.newProducts > 0 && `, ${result.newProducts} new products`}
              {result.errors > 0 && `, ${result.errors} errors`}
            </p>
            <p className="text-green-600 mt-1 text-xs">Refreshing page...</p>
          </div>
        </div>
      )}

      {state === "error" && result && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-red-800">Import failed</p>
            <p className="text-red-700 mt-1">{result.error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setState("idle");
                setResult(null);
              }}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
