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
  { value: "ignored", label: "Ignored" },
];

const LABEL_OPTIONS = [
  { value: "pending", label: "待处理" },
  { value: "in_progress", label: "处理中" },
  { value: "completed", label: "已完成" },
];

const labelColors: Record<string, string> = {
  pending: "bg-red-100 text-red-800 border-red-300 font-medium",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-green-50 text-green-700 border-green-200",
};

const replyColors: Record<string, string> = {
  not_replied: "bg-red-100 text-red-800 border-red-300 font-medium",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  replied: "bg-green-50 text-green-700 border-green-200",
};

const progressColors: Record<string, string> = {
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  awaiting_customer: "bg-yellow-50 text-yellow-800 border-yellow-300",
  awaiting_internal: "bg-orange-100 text-orange-800 border-orange-300 font-medium",
  awaiting_third_party: "bg-purple-50 text-purple-700 border-purple-200",
  resolved: "bg-gray-100 text-gray-500 border-gray-200",
  ignored: "bg-gray-100 text-gray-400 border-gray-200",
};

export function TicketStatusEditor({ ticket }: { ticket: SupportTicket }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const update = async (
    field: "reply_status" | "progress" | "label",
    value: string
  ) => {
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
        defaultValue={ticket.label ?? "pending"}
        onValueChange={(v) => update("label", v as string)}
        disabled={saving}
      >
        <SelectTrigger
          className={`h-7 text-xs ${labelColors[ticket.label] ?? ""}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LABEL_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
