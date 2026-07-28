"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ModelSearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = value.trim();
    router.push(term ? `/orders/by-model?q=${encodeURIComponent(term)}` : "/orders/by-model");
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        placeholder="Model / SKU or customer name (e.g. BHI-TWAC-12KR115V or John Smith)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-96"
        autoFocus
      />
      <Button type="submit">
        <Search className="h-4 w-4" />
        Search
      </Button>
    </form>
  );
}
