"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

interface OrderFiltersProps {
  statusCounts: Record<string, number>;
}

const statusLabels: Record<string, string> = {
  all: "All",
  pending: "Pending",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  processing: "Processing",
  acknowledged: "Acknowledged",
  returned: "Returned",
};

export function OrderFilters({ statusCounts }: OrderFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeStatus = searchParams.get("status") || "all";

  const updateFilter = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(name, value);
      } else {
        params.delete(name);
      }
      params.delete("page");
      router.push(`${pathname}${params.toString() ? `?${params}` : ""}`);
    },
    [router, pathname, searchParams]
  );

  // Only show tabs with counts > 0
  const visibleStatuses = Object.entries(statusCounts)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => {
      const order = ["all", "pending", "processing", "shipped", "delivered", "cancelled", "returned"];
      return order.indexOf(a) - order.indexOf(b);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {visibleStatuses.map(([status, count]) => (
          <button
            key={status}
            onClick={() => updateFilter("status", status)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              activeStatus === status
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-accent"
            }`}
          >
            {statusLabels[status] || status}
            <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
              {count.toLocaleString()}
            </Badge>
          </button>
        ))}
      </div>
      <Input
        placeholder="Search PO number or consumer order..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => {
          const timeout = setTimeout(() => {
            updateFilter("search", e.target.value);
          }, 400);
          return () => clearTimeout(timeout);
        }}
        className="w-80"
      />
    </div>
  );
}
