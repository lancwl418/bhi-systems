"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Search, CheckCircle } from "lucide-react";

export function ResolveAllButton() {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [result, setResult] = useState<any>(null);

  const handleResolve = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/finance/resolve-deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setResult(data);
      setState("done");
      if (data.resolved > 0) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch {
      setState("idle");
    }
  };

  if (state === "done" && result) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <span>{result.resolved} resolved, {result.still_unresolved} still unresolved</span>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleResolve} disabled={state === "loading"} className="gap-2">
      {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
      Auto-resolve All
    </Button>
  );
}

export function ResolveSingleButton({ lineId }: { lineId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "notfound">("idle");

  const handleResolve = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/finance/resolve-deductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId }),
      });
      const data = await res.json();
      if (data.resolved > 0) {
        setState("done");
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setState("notfound");
      }
    } catch {
      setState("idle");
    }
  };

  if (state === "done") return <span className="text-green-600 text-xs font-medium">Resolved</span>;
  if (state === "notfound") return <span className="text-muted-foreground text-xs">No match</span>;

  return (
    <Button variant="ghost" size="sm" onClick={handleResolve} disabled={state === "loading"} className="h-7 px-2 text-xs gap-1">
      {state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
      Find
    </Button>
  );
}
