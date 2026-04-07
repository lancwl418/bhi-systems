"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

const typeColors: Record<string, string> = {
  payment: "bg-green-100 text-green-800",
  deduction: "bg-red-100 text-red-800",
  adjustment: "bg-orange-100 text-orange-800",
};

interface RemittanceLine {
  id: string;
  line_number: number;
  line_type: string;
  po_number: string;
  invoice_number: string;
  adjustment_number: string;
  invoice_amount: string;
  line_amount: string;
  discount: string;
  adjustment_date: string;
  adjustment_reason: string;
  order_id: string | null;
  remittance_id: string;
  orders?: { channel_order_id: string; status: string; total: string } | null;
}

interface OrderGroup {
  po_number: string;
  order_id: string | null;
  order_po: string | null;
  order_total: number;
  invoiceTotal: number;
  deductions: number;
  net: number;
  lines: RemittanceLine[];
}

export function LineTabs({
  lines,
  noPOLines,
}: {
  lines: RemittanceLine[];
  noPOLines: RemittanceLine[];
}) {
  const [tab, setTab] = useState<"orders" | "lines">("orders");

  // Group lines by PO number
  const groupMap: Record<string, OrderGroup> = {};
  for (const l of lines) {
    if (!l.po_number) continue;
    if (!groupMap[l.po_number]) {
      groupMap[l.po_number] = {
        po_number: l.po_number,
        order_id: l.order_id,
        order_po: l.orders?.channel_order_id || null,
        order_total: parseFloat(l.orders?.total || "0"),
        invoiceTotal: 0,
        deductions: 0,
        net: 0,
        lines: [],
      };
    }
    const g = groupMap[l.po_number];
    g.lines.push(l);
    g.invoiceTotal += parseFloat(l.invoice_amount) || 0;
    g.deductions += parseFloat(l.discount) || 0;
    g.net += parseFloat(l.line_amount) || 0;
    if (l.order_id && !g.order_id) {
      g.order_id = l.order_id;
      g.order_po = l.orders?.channel_order_id || null;
      g.order_total = parseFloat(l.orders?.total || "0");
    }
  }
  const groups = Object.values(groupMap).sort((a, b) => b.invoiceTotal - a.invoiceTotal);

  return (
    <>
      {/* No-PO Adjustments */}
      {noPOLines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Standalone Adjustments (No PO)
              <Badge variant="destructive">{noPOLines.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Adjustment #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {noPOLines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{l.line_number}</TableCell>
                    <TableCell className="font-mono text-sm">{l.adjustment_number || "—"}</TableCell>
                    <TableCell className="text-sm">{l.adjustment_date || "—"}</TableCell>
                    <TableCell className="text-sm">{l.adjustment_reason || "—"}</TableCell>
                    <TableCell className={`text-right font-mono text-sm font-medium ${parseFloat(l.line_amount) < 0 ? "text-red-600" : "text-green-600"}`}>
                      ${parseFloat(l.line_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tab switcher */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("orders")}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            tab === "orders" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          }`}
        >
          By Order ({groups.length})
        </button>
        <button
          onClick={() => setTab("lines")}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            tab === "lines" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          }`}
        >
          All Line Items ({lines.length})
        </button>
      </div>

      {/* By Order view */}
      {tab === "orders" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By Order</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Order Total</TableHead>
                  <TableHead className="text-right">Invoice Amount</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net Payment</TableHead>
                  <TableHead>Lines</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.po_number}>
                    <TableCell>
                      {g.order_id ? (
                        <Link href={`/orders/${g.order_id}`} className="font-mono text-sm font-medium hover:underline text-blue-600">
                          {g.po_number}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm font-medium">{g.po_number}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {g.order_id ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">Matched</Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600 border-orange-300">Unmatched</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {g.order_id ? `$${g.order_total.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${g.invoiceTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600">
                      {g.deductions > 0 ? `-$${g.deductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-medium ${g.net < 0 ? "text-red-600" : "text-green-600"}`}>
                      ${g.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{g.lines.length}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* All Lines view */}
      {tab === "lines" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">All Line Items</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Adjustment #</TableHead>
                  <TableHead className="text-right">Invoice Amt</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Net Amount</TableHead>
                  <TableHead>Order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const amt = parseFloat(l.line_amount);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{l.line_number}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={typeColors[l.line_type] || ""}>
                          {l.line_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{l.po_number || "—"}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{l.invoice_number || "—"}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{l.adjustment_number || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {parseFloat(l.invoice_amount) ? `$${parseFloat(l.invoice_amount).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {parseFloat(l.discount) > 0 ? `-$${parseFloat(l.discount).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${amt < 0 ? "text-red-600" : "text-green-600"}`}>
                        ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        {l.order_id ? (
                          <Link href={`/orders/${l.order_id}`} className="text-sm hover:underline text-blue-600">
                            {l.orders?.channel_order_id || "View"}
                          </Link>
                        ) : l.po_number ? (
                          <Badge variant="outline" className="text-orange-600 border-orange-300">Unmatched</Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
