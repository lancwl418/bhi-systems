"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export interface ModelSearchExportRow {
  poNumber: string;
  consumerOrder: string;
  channel: string;
  status: string;
  orderDate: string;
  orderTotal: number | null;
  skuCode: string;
  productName: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shipAddress1: string;
  shipAddress2: string;
  shipAddress3: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipCountry: string;
}

const HEADERS: { key: keyof ModelSearchExportRow; label: string }[] = [
  { key: "poNumber", label: "PO Number" },
  { key: "consumerOrder", label: "Consumer Order" },
  { key: "channel", label: "Channel" },
  { key: "status", label: "Status" },
  { key: "orderDate", label: "Order Date" },
  { key: "orderTotal", label: "Order Total" },
  { key: "skuCode", label: "SKU / Model" },
  { key: "productName", label: "Product Name" },
  { key: "quantity", label: "Qty" },
  { key: "unitPrice", label: "Unit Price" },
  { key: "lineTotal", label: "Line Total" },
  { key: "customerName", label: "Customer Name" },
  { key: "customerEmail", label: "Customer Email" },
  { key: "customerPhone", label: "Customer Phone" },
  { key: "shipAddress1", label: "Ship Address 1" },
  { key: "shipAddress2", label: "Ship Address 2" },
  { key: "shipAddress3", label: "Ship Address 3" },
  { key: "shipCity", label: "Ship City" },
  { key: "shipState", label: "Ship State" },
  { key: "shipZip", label: "Ship Zip" },
  { key: "shipCountry", label: "Ship Country" },
];

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ModelSearchExportButton({
  rows,
  model,
}: {
  rows: ModelSearchExportRow[];
  model: string;
}) {
  const exportCsv = () => {
    const lines = [
      HEADERS.map((h) => h.label).join(","),
      ...rows.map((row) => HEADERS.map((h) => csvCell(row[h.key])).join(",")),
    ];
    // Prepend BOM so Excel reads UTF-8 (customer names) correctly.
    const blob = new Blob(["﻿" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const slug = model.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "") || "all";
    const link = document.createElement("a");
    link.href = url;
    link.download = `orders-by-model-${slug}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  return (
    <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
      <Download className="h-4 w-4" />
      Export CSV
    </Button>
  );
}
