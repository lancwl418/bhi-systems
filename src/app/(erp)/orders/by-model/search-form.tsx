"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ModelSearchForm({ initialModel }: { initialModel: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialModel);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = value.trim();
    router.push(term ? `/orders/by-model?model=${encodeURIComponent(term)}` : "/orders/by-model");
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        placeholder="Enter model number / SKU (e.g. BHI-TWAC-12KR115V)"
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
