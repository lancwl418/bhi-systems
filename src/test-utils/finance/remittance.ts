import * as XLSX from "xlsx";

export function createRemittanceSupabaseMock(options: {
  remittanceId: string;
  lineInsertError?: string;
}) {
  const lineInsertError = options.lineInsertError;

  return {
    from(table: string) {
      if (table === "remittance_lines") {
        return {
          select(columns: string) {
            if (columns.includes("eft_number")) {
              return {
                in: async () => ({ data: [] as unknown[] }),
              };
            }
            if (columns === "invoice_number, order_id, po_number") {
              return {
                in: async () => ({ data: [] as unknown[] }),
              };
            }
            if (columns === "id, adjustment_number") {
              return {
                in() {
                  return {
                    is: async () => ({ data: [] as unknown[] }),
                  };
                },
              };
            }
            return {};
          },
          insert: async () => ({
            error: lineInsertError ? new Error(lineInsertError) : null,
          }),
          update() {
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      if (table === "orders") {
        return {
          select() {
            return {
              in: async () => ({ data: [] as unknown[] }),
            };
          },
        };
      }

      if (table === "order_invoices") {
        return {
          select() {
            return {
              in: async () => ({ data: [] as unknown[] }),
            };
          },
        };
      }

      if (table === "remittances") {
        return {
          select() {
            return {
              in: async () => ({ data: [] as unknown[] }),
            };
          },
          insert() {
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: options.remittanceId },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      return {};
    },
  };
}

function buildWorkbookBuffer(rows: Array<Array<string | number>>) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function buildHomeDepotRemittanceWorkbookBuffer() {
  const rows: Array<Array<string | number>> = [
    [
      "Merchant",
      "EFT Number",
      "Purchase Order Number",
      "Invoice Number",
      "Invoice Amount",
      "Line Balance Due",
      "Line Discount",
      "Payment Date",
      "Invoice Date",
      "Transaction Line Number",
      "Invoice Adjustment Number",
      "Invoice Adjustment Date",
      "Invoice Adjustment Reason Code",
    ],
    [
      "The Home Depot Inc",
      "EFT-HD-001",
      "PO-HD-001",
      "INV-HD-001",
      120,
      115,
      5,
      "20260406",
      "04/03/2026",
      1,
      "",
      "",
      "",
    ],
  ];

  return buildWorkbookBuffer(rows);
}

export function buildLowesRemittanceWorkbookBuffer() {
  const rows: Array<Array<string | number>> = [
    [
      "Invoice Number",
      "Check Number",
      "Invoice Amount",
      "Check Amount",
      "PO Number",
      "Invoice Date",
      "Discount",
      "Check Date",
    ],
    [
      "INV-L-001",
      "CHK-L-001",
      200,
      190,
      "PO-L-001",
      "04/04/2026",
      10,
      "20260406",
    ],
  ];

  return buildWorkbookBuffer(rows);
}
