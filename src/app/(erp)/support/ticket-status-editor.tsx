"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { SupportTicket } from "./page";

const REPLY_OPTIONS = [
  { value: "not_replied", label: "Not replied" },
  { value: "in_progress", label: "In progress" },
  { value: "replied", label: "Replied" },
];

const PROGRESS_OPTIONS = [
  { value: "in_progress", label: "In progress" },
  { value: "awaiting_customer", label: "Awaiting customer" },
  { value: "awaiting_internal", label: "Awaiting internal" },
  { value: "awaiting_third_party", label: "Awaiting third party" },
  { value: "resolved", label: "Resolved" },
];

const replyColors: Record<string, string> = {
  not_replied: "text-red-700",
  in_progress: "text-blue-700",
  replied: "text-green-700",
};

const progressColors: Record<string, string> = {
  in_progress: "text-blue-700",
  awaiting_customer: "text-yellow-700",
  awaiting_internal: "text-orange-700",
  awaiting_third_party: "text-purple-700",
  resolved: "text-gray-500",
};

export function TicketStatusEditor({ ticket }: { ticket: SupportTicket }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const update = async (field: "reply_status" | "progress", value: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/support/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Update failed");
      }
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[150px]">
      <Select
        defaultValue={ticket.reply_status}
        onValueChange={(v) => update("reply_status", v as string)}
        disabled={saving}
      >
        <SelectTrigger
          className={`h-7 text-xs ${replyColors[ticket.reply_status] ?? ""}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPLY_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        defaultValue={ticket.progress}
        onValueChange={(v) => update("progress", v as string)}
        disabled={saving}
      >
        <SelectTrigger
          className={`h-7 text-xs ${progressColors[ticket.progress] ?? ""}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROGRESS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
