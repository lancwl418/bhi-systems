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
import { normalizeRetailer } from "@/lib/retailers";

interface MonthData {
  month: string;
  orderCount: number;
  orderTotal: number;
  invoiceTotal: number;
  deductions: number;
  netReceived: number;
  outstanding: number;
  pctCollected: number;
  byChannel: Record<string, { orderCount: number; orderTotal: number; invoiceTotal: number; deductions: number; netReceived: number }>;
  orders: any[];
  lines: any[];
  unmatchedLines: any[];
  noPOLines: any[];
}

export function MonthDetail({ month, monthLabel, data, channelFilter }: { month: string; monthLabel: string; data: MonthData; channelFilter: string }) {
  const [tab, setTab] = useState<"orders" | "payments" | "issues">("orders");
  const [orderPage, setOrderPage] = useState(0);
  const PAGE_SIZE = 100;

  // Build payment map per order
  const paymentByOrder: Record<string, { paid: number; deducted: number; net: number }> = {};
  for (const l of data.lines) {
    if (!l.order_id) continue;
    if (!paymentByOrder[l.order_id]) paymentByOrder[l.order_id] = { paid: 0, deducted: 0, net: 0 };
    const amt = parseFloat(l.line_amount) || 0;
    paymentByOrder[l.order_id].paid += parseFloat(l.invoice_amount) || 0;
    paymentByOrder[l.order_id].deducted += parseFloat(l.discount) || 0;
    if (amt < 0) paymentByOrder[l.order_id].deducted += Math.abs(amt);
    paymentByOrder[l.order_id].net += amt;
  }

  // Enrich orders
  let enrichedOrders = data.orders.map((o: any) => {
    const payment = paymentByOrder[o.id];
    return {
      ...o,
      orderTotal: parseFloat(o.total) || 0,
      paid: payment?.paid || 0,
      deducted: payment?.deducted || 0,
      net: payment?.net || 0,
      hasPayment: !!payment,
      retailer: normalizeRetailer(o.raw_payload?.retailer || ""),
    };
  });

  // Apply channel filter
  if (channelFilter !== "all") {
    enrichedOrders = enrichedOrders.filter(o => o.retailer === channelFilter);
  }

  // Sort: paid first, then by order amount descending
  enrichedOrders.sort((a, b) => {
    if (a.hasPayment !== b.hasPayment) return a.hasPayment ? -1 : 1;
    return b.orderTotal - a.orderTotal;
  });

  const paidOrders = enrichedOrders.filter(o => o.hasPayment);
  const unpaidOrders = enrichedOrders.filter(o => !o.hasPayment);

  // Filter lines by channel
  const filteredLines = channelFilter !== "all"
    ? data.lines.filter((l: any) => normalizeRetailer(l.remittances?.retailer || "") === channelFilter)
    : data.lines;
  const filteredUnmatched = channelFilter !== "all"
    ? data.unmatchedLines.filter((l: any) => normalizeRetailer(l.remittances?.retailer || "") === channelFilter)
    : data.unmatchedLines;
  const filteredNoPO = channelFilter !== "all"
    ? data.noPOLines.filter((l: any) => normalizeRetailer(l.remittances?.retailer || "") === channelFilter)
    : data.noPOLines;
  const issueCount = filteredUnmatched.length + filteredNoPO.length;

  // Channel sub-totals for this month
  const channelEntries = Object.entries(data.byChannel).sort(([, a], [, b]) => b.orderTotal - a.orderTotal);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{monthLabel} Detail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Channel sub-totals */}
        {channelFilter === "all" && channelEntries.length > 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            {channelEntries.map(([ch, stats]) => {
              const pct = stats.orderTotal > 0 ? Math.max(0, Math.min((stats.netReceived / stats.orderTotal) * 100, 100)) : 0;
              return (
                <div key={ch} className="rounded-lg border p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-base font-semibold">{ch}</p>
                    <Badge variant="outline">{stats.orderCount.toLocaleString()} orders</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Received: <span className="font-medium text-green-600">${stats.netReceived.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                    <span className="text-muted-foreground">Order Total: <span className="font-medium text-foreground">${stats.orderTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-red-600 font-medium">
                      {stats.deductions > 0 ? `-$${stats.deductions.toLocaleString(undefined, { maximumFractionDigits: 0 })} deducted` : ""}
                    </span>
                    <span className="font-semibold">{pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab("orders")}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${tab === "orders" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
          >
            Orders ({enrichedOrders.length})
          </button>
          <button
            onClick={() => setTab("payments")}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${tab === "payments" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
          >
            Payments ({filteredLines.length})
          </button>
          {issueCount > 0 && (
            <button
              onClick={() => setTab("issues")}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${tab === "issues" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
            >
              Issues
              <Badge variant="destructive" className="ml-2 text-xs px-1.5 py-0">{issueCount}</Badge>
            </button>
          )}
        </div>

        {/* Orders tab */}
        {tab === "orders" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-600 font-medium">{paidOrders.length} paid</span>
              <span className="text-muted-foreground">{unpaidOrders.length} pending</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-green-500"
                  style={{ width: `${enrichedOrders.length > 0 ? (paidOrders.length / enrichedOrders.length) * 100 : 0}%` }} />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Retailer</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead className="text-right">Order Amount</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Net Received</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrichedOrders.slice(orderPage * PAGE_SIZE, (orderPage + 1) * PAGE_SIZE).map(o => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/orders/${o.id}`} className="font-mono text-sm hover:underline text-blue-600">
                        {o.channel_order_id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{o.retailer}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{(o.order_date || "").slice(0, 10)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${o.orderTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {o.paid > 0 ? `$${o.paid.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600">
                      {o.deducted > 0 ? `-$${o.deducted.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-medium ${o.net > 0 ? "text-green-600" : ""}`}>
                      {o.net !== 0 ? `$${o.net.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      {o.hasPayment ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">Paid</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {enrichedOrders.length > PAGE_SIZE && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-4">
                      <div className="flex items-center justify-center gap-4 text-sm">
                        <button
                          onClick={() => setOrderPage(p => p - 1)}
                          disabled={orderPage === 0}
                          className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Previous
                        </button>
                        <span className="text-muted-foreground">
                          {orderPage * PAGE_SIZE + 1}–{Math.min((orderPage + 1) * PAGE_SIZE, enrichedOrders.length)} of {enrichedOrders.length}
                        </span>
                        <button
                          onClick={() => setOrderPage(p => p + 1)}
                          disabled={(orderPage + 1) * PAGE_SIZE >= enrichedOrders.length}
                          className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none"
                        >
                          Next
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Payments tab */}
        {tab === "payments" && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>Retailer</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Adj Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Invoice Amt</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Net Amount</TableHead>
                <TableHead>Match</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLines.map((l: any) => {
                const amt = parseFloat(l.line_amount);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Badge variant="secondary" className={
                        l.line_type === "payment" ? "bg-green-100 text-green-800" :
                        l.line_type === "deduction" ? "bg-red-100 text-red-800" :
                        "bg-orange-100 text-orange-800"
                      }>{l.line_type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{l.po_number || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{l.remittances?.retailer || "—"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{l.invoice_number || l.adjustment_number || "—"}</TableCell>
                    <TableCell className="text-sm">{l.adjustment_date || "—"}</TableCell>
                    <TableCell>
                      <Link href={`/finance/${l.remittance_id}`} className="text-xs hover:underline text-blue-600">
                        {l.remittances?.file_name || l.remittances?.eft_number}
                      </Link>
                    </TableCell>
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
                        <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">Matched</Badge>
                      ) : l.po_number ? (
                        <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">Unmatched</Badge>
                      ) : (
                        <Badge variant="outline" className="text-red-600 border-red-300 text-xs">No PO</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredLines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">No remittance data for this month</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {/* Issues tab */}
        {tab === "issues" && (
          <div className="space-y-4">
            {filteredUnmatched.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  Unmatched PO Lines <Badge variant="destructive">{filteredUnmatched.length}</Badge>
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Retailer</TableHead>
                      <TableHead>Invoice / Adj #</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUnmatched.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-sm font-medium">{l.po_number}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={parseFloat(l.line_amount) < 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
                            {l.line_type}
                          </Badge>
                        </TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{l.remittances?.retailer || "—"}</Badge></TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">{l.invoice_number || l.adjustment_number || "—"}</TableCell>
                        <TableCell>
                          <Link href={`/finance/${l.remittance_id}`} className="text-xs hover:underline text-blue-600">{l.remittances?.file_name}</Link>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${parseFloat(l.line_amount) < 0 ? "text-red-600" : "text-green-600"}`}>
                          ${parseFloat(l.line_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {filteredNoPO.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  No PO Adjustments <Badge variant="outline" className="text-red-600 border-red-300">{filteredNoPO.length}</Badge>
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adjustment #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Retailer</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNoPO.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-sm">{l.adjustment_number || "—"}</TableCell>
                        <TableCell className="text-sm">{l.adjustment_date || "—"}</TableCell>
                        <TableCell className="text-sm">{l.adjustment_reason || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{l.remittances?.retailer || "—"}</Badge></TableCell>
                        <TableCell>
                          <Link href={`/finance/${l.remittance_id}`} className="text-xs hover:underline text-blue-600">{l.remittances?.file_name}</Link>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${parseFloat(l.line_amount) < 0 ? "text-red-600" : "text-green-600"}`}>
                          ${parseFloat(l.line_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {issueCount === 0 && (
              <p className="text-center text-muted-foreground py-8">No issues for this month</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
