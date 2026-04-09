"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function UploadRemittance() {
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<any>(null);
  const [uploadTarget, setUploadTarget] = useState<"hd" | "lowes">("hd");
  const hdFileRef = useRef<HTMLInputElement>(null);
  const lowesFileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: "hd" | "lowes") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState("uploading");
    setUploadTarget(target);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint = target === "lowes"
        ? "/api/finance/remittance/lowes"
        : "/api/finance/remittance";

      const res = await fetch(endpoint, {
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

    if (hdFileRef.current) hdFileRef.current.value = "";
    if (lowesFileRef.current) lowesFileRef.current.value = "";
  };

  return (
    <div>
      <input
        ref={hdFileRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        onChange={(e) => handleUpload(e, "hd")}
        className="hidden"
        id="remittance-upload-hd"
      />
      <input
        ref={lowesFileRef}
        type="file"
        accept=".xls,.xlsx,.csv"
        onChange={(e) => handleUpload(e, "lowes")}
        className="hidden"
        id="remittance-upload-lowes"
      />

      {state === "idle" && (
        <div className="flex gap-2">
          <Button onClick={() => hdFileRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" />
            Upload HD Remittance
          </Button>
          <Button onClick={() => lowesFileRef.current?.click()} variant="outline" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Lowe's Remittance
          </Button>
        </div>
      )}

      {state === "uploading" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing {uploadTarget === "lowes" ? "Lowe's" : "Home Depot"} remittance...
        </div>
      )}

      {state === "done" && result && (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-green-800">
              {result.retailer} — {result.remittance_count} EFT record{result.remittance_count > 1 ? "s" : ""}
            </p>
            <p className="text-green-700 mt-1">
              {result.lines} lines: {result.matched} matched, {result.unmatched} unmatched, {result.no_po} no PO
              {result.duplicates_skipped > 0 && `, ${result.duplicates_skipped} duplicates skipped`}
            </p>
            <p className="text-green-700">
              Paid: ${result.total_paid?.toLocaleString()} | Deductions: ${result.total_deductions?.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {state === "error" && result && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-red-800">Upload failed</p>
            <p className="text-red-700 mt-1">{result.error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => { setState("idle"); setResult(null); }}
            >
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
