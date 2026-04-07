"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

const PRESETS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "This month", value: "this_month" },
  { label: "Last month", value: "last_month" },
  { label: "This year", value: "this_year" },
  { label: "All time", value: "all" },
];

export function DateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = searchParams.get("period") || "all";
  const customFrom = searchParams.get("from") || "";
  const customTo = searchParams.get("to") || "";

  const setFilter = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v) sp.set(k, v);
      }
      const qs = sp.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    },
    [router, pathname]
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => setFilter({ period: p.value })}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            active === p.value && !customFrom
              ? "bg-primary text-primary-foreground border-primary"
              : "hover:bg-accent"
          }`}
        >
          {p.label}
        </button>
      ))}
      <span className="text-sm text-muted-foreground ml-2">or</span>
      <input
        type="date"
        value={customFrom}
        onChange={(e) =>
          setFilter({ from: e.target.value, to: customTo || new Date().toISOString().slice(0, 10) })
        }
        className="rounded-md border px-2 py-1.5 text-sm bg-transparent"
      />
      <span className="text-sm text-muted-foreground">–</span>
      <input
        type="date"
        value={customTo}
        onChange={(e) =>
          setFilter({ from: customFrom, to: e.target.value })
        }
        className="rounded-md border px-2 py-1.5 text-sm bg-transparent"
      />
    </div>
  );
}
