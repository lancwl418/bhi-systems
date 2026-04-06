"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";

interface ProductFiltersProps {
  categories: string[];
}

export function ProductFilters({ categories }: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(name, value);
      } else {
        params.delete(name);
      }
      return params.toString();
    },
    [searchParams]
  );

  const updateFilter = (name: string, value: string) => {
    const qs = createQueryString(name, value);
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Input
        placeholder="Search products..."
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => {
          const timeout = setTimeout(() => {
            updateFilter("search", e.target.value);
          }, 400);
          return () => clearTimeout(timeout);
        }}
        className="w-64"
      />
      <Select
        defaultValue={searchParams.get("category") ?? "all"}
        onValueChange={(v) => updateFilter("category", v as string)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat} value={cat}>
              {cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        defaultValue={searchParams.get("status") ?? "all"}
        onValueChange={(v) => updateFilter("status", v as string)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="inactive">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
