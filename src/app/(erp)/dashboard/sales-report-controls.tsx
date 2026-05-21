"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SalesReportControlsProps {
  salesDate: string;
  manualModels: string[];
  manualPlatforms: string[];
  manualQuantities: Record<string, Record<string, number>>;
}

interface ManualEntryRow {
  id: string;
  platform: string;
  model: string;
  quantity: string;
}

function makeBlankRow(
  platforms: string[],
  models: string[],
  id = "blank-0"
): ManualEntryRow {
  return {
    id,
    platform: platforms[0] ?? "",
    model: models[0] ?? "",
    quantity: "",
  };
}

function getInitialRows(
  platforms: string[],
  models: string[],
  quantities: Record<string, Record<string, number>>
): ManualEntryRow[] {
  const modelSet = new Set(models);
  const rows: ManualEntryRow[] = [];

  for (const platform of platforms) {
    for (const [model, quantity] of Object.entries(quantities[platform] ?? {})) {
      if (!modelSet.has(model) || quantity <= 0) continue;
      rows.push({
        id: `${platform}|||${model}`,
        platform,
        model,
        quantity: String(quantity),
      });
    }
  }

  return rows.length > 0 ? rows : [makeBlankRow(platforms, models)];
}

export function SalesReportControls({
  salesDate,
  manualModels,
  manualPlatforms,
  manualQuantities,
}: SalesReportControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() =>
    getInitialRows(manualPlatforms, manualModels, manualQuantities)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setRows(getInitialRows(manualPlatforms, manualModels, manualQuantities));
    setMessage(null);
  }, [salesDate, manualModels, manualPlatforms, manualQuantities]);

  const totalUnits = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const quantity = Number(row.quantity || 0);
        return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
      }, 0),
    [rows]
  );

  const setSalesDate = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("salesDate", value);
    else params.delete("salesDate");
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const updateRow = (id: string, updates: Partial<ManualEntryRow>) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );
  };

  const addRow = () => {
    setRows((current) => [
      ...current,
      makeBlankRow(manualPlatforms, manualModels, `new-${Date.now()}`),
    ]);
  };

  const removeRow = (id: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length > 0 ? next : [makeBlankRow(manualPlatforms, manualModels)];
    });
  };

  const saveManualEntries = async () => {
    setSaving(true);
    setMessage(null);

    const entries = rows
      .filter((row) => row.platform && row.model)
      .map((row) => ({
        platform: row.platform,
        model: row.model,
        quantity: Number(row.quantity || 0),
      }));

    try {
      const response = await fetch("/api/reports/sales/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesDate, entries, replaceExisting: true }),
      });
      const result = await response.json();

      if (!response.ok || result.error) {
        setMessage(result.error || "Failed to save manual sales");
        return;
      }

      setOpen(false);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save manual sales");
    } finally {
      setSaving(false);
    }
  };

  const hasModels = manualModels.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="date"
        value={salesDate}
        onChange={(event) => setSalesDate(event.target.value)}
        className="w-[150px]"
      />
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!hasModels}
      >
        <Pencil className="h-4 w-4" />
        Manual Entry
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manual Sales Entry</DialogTitle>
            <DialogDescription>
              {salesDate}
            </DialogDescription>
          </DialogHeader>

          {!hasModels ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              Add report models first, then enter daily manual sales here.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Select platform, model, and quantity for non-auto channels.
                </p>
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-4 w-4" />
                  Add Row
                </Button>
              </div>

              <div className="max-h-[55vh] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-40">Platform</TableHead>
                      <TableHead className="min-w-56">Model</TableHead>
                      <TableHead className="w-28 text-right">Qty</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Select
                            value={row.platform}
                            onValueChange={(value) =>
                              updateRow(row.id, { platform: value as string })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Platform" />
                            </SelectTrigger>
                            <SelectContent>
                              {manualPlatforms.map((platform) => (
                                <SelectItem key={platform} value={platform}>
                                  {platform}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.model}
                            onValueChange={(value) =>
                              updateRow(row.id, { model: value as string })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Model" />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              {manualModels.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={row.quantity}
                            onChange={(event) =>
                              updateRow(row.id, { quantity: event.target.value })
                            }
                            className="ml-auto h-8 w-24 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeRow(row.id)}
                            aria-label="Remove row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end text-sm">
                <span className="text-muted-foreground">Manual total:&nbsp;</span>
                <span className="font-mono font-semibold">
                  {totalUnits.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {message && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {message}
            </p>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={saving} />}>
              Cancel
            </DialogClose>
            <Button onClick={saveManualEntries} disabled={saving || !hasModels}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
