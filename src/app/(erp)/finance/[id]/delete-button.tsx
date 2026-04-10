"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function DeleteRemittanceButton({ id, fileName }: { id: string; fileName: string }) {
  const [state, setState] = useState<"idle" | "confirm" | "deleting">("idle");
  const router = useRouter();

  const handleDelete = async () => {
    setState("deleting");
    try {
      const res = await fetch(`/api/finance/remittance/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(`Delete failed: ${data.error}`);
        setState("idle");
        return;
      }
      router.push("/finance/payments");
      router.refresh();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
      setState("idle");
    }
  };

  if (state === "deleting") {
    return (
      <Button variant="destructive" size="sm" disabled className="gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Deleting...
      </Button>
    );
  }

  if (state === "confirm") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-red-600">Delete &quot;{fileName}&quot;? This cannot be undone.</span>
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Confirm
        </Button>
        <Button variant="outline" size="sm" onClick={() => setState("idle")}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
      onClick={() => setState("confirm")}
    >
      <Trash2 className="h-4 w-4" />
      Delete
    </Button>
  );
}
