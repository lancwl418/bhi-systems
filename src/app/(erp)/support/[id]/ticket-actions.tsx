"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CASE_TYPES, CASE_TYPE_LABELS } from "@/lib/support/case-types";
import type { SupportTicket } from "../page";

export function TicketActions({ ticket }: { ticket: SupportTicket }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (updates: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Update failed");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        defaultValue={ticket.case_type}
        onValueChange={(v) => patch({ case_type: v })}
        disabled={busy}
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CASE_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {CASE_TYPE_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {ticket.closed_at ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => patch({ closed_at: null, progress: "in_progress" })}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Reopen
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            patch({ closed_at: new Date().toISOString(), progress: "resolved" })
          }
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Close Ticket
        </Button>
      )}
    </div>
  );
}
