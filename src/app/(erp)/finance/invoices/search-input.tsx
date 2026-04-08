"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";

export function InvoiceSearch({ defaultValue }: { defaultValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue || "");

  const doSearch = (q: string) => {
    if (q.trim()) {
      router.push(`/finance/invoices?q=${encodeURIComponent(q.trim())}`);
    } else {
      router.push("/finance/invoices");
    }
  };

  return (
    <div className="relative flex items-center">
      <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search invoice # or PO..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") doSearch(value); }}
        className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      {value && (
        <button onClick={() => { setValue(""); doSearch(""); }} className="absolute right-2 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
