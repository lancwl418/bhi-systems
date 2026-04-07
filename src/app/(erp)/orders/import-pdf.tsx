"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface ImportResult {
  ok?: boolean;
  totalFiles?: number;
  inserted?: number;
  updated?: number;
  errors?: number;
  newProducts?: number;
  newSkus?: number;
  errorMessages?: string[];
  error?: string;
}

export function ImportPDF() {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setState("uploading");
    setProgress(
      `Uploading ${files.length} PDF${files.length > 1 ? "s" : ""} (${Array.from(files)
        .reduce((sum, f) => sum + f.size, 0) / 1024 | 0} KB)...`
    );

    try {
      const formData = new FormData();
      for (const file of Array.from(files)) {
        formData.append("files", file);
      }

      const res = await fetch("/api/orders/import-pdf", {
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

      setTimeout(() => {
        window.location.reload();
      }, 3000);
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
        accept=".pdf"
        multiple
        onChange={handleUpload}
        className="hidden"
        id="pdf-upload"
      />

      {state === "idle" && (
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          className="gap-2"
        >
          <FileText className="h-4 w-4" />
          Import PDF
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
              PDF import complete — {result.totalFiles} file{(result.totalFiles ?? 0) > 1 ? "s" : ""}
            </p>
            <p className="text-green-700 mt-1">
              {result.inserted} orders imported
              {(result.updated ?? 0) > 0 && `, ${result.updated} updated`}
              {(result.newProducts ?? 0) > 0 && `, ${result.newProducts} new products`}
              {(result.errors ?? 0) > 0 && `, ${result.errors} errors`}
            </p>
            {result.errorMessages && result.errorMessages.length > 0 && (
              <ul className="text-yellow-700 mt-1 text-xs list-disc pl-4">
                {result.errorMessages.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            )}
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
            {result.errorMessages && result.errorMessages.length > 0 && (
              <ul className="text-red-600 mt-1 text-xs list-disc pl-4">
                {result.errorMessages.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            )}
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
