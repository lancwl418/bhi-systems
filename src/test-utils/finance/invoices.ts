export function buildInvoiceCsvRow() {
  return [
    "Invoice Number,PO Number,Invoice Date,Invoice Total,Vendor SKU,Merchant,Invoice Unit Cost,Quantity,Order Date",
    "INV-001,PO-001,01/10/2025,$120.00,SKU-1,Lowes,$60.00,2,01/09/2025",
  ].join("\n");
}

export function createInvoicesSupabaseMock(options?: { insertError?: string }) {
  const insertError = options?.insertError;

  return {
    from(table: string) {
      if (table === "order_invoices") {
        return {
          select() {
            return {
              in: async () => ({ data: [] as unknown[] }),
            };
          },
          insert() {
            return {
              select: async () => ({
                data: insertError ? null : [{ id: "inv-1", invoice_number: "INV-001" }],
                error: insertError ? new Error(insertError) : null,
              }),
            };
          },
        };
      }

      if (table === "orders") {
        return {
          select() {
            return {
              in: async () => ({
                data: [{ id: "order-1", channel_order_id: "PO-001" }],
              }),
            };
          },
        };
      }

      if (table === "order_invoice_items") {
        return {
          insert: async () => ({ error: null }),
        };
      }

      return {};
    },
  };
}
