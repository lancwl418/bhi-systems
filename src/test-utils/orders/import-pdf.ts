export function createImportPdfSupabaseMock(options?: {
  customerExists?: boolean;
  orderInsertError?: string;
}) {
  const customerExists = options?.customerExists ?? true;
  const orderInsertError = options?.orderInsertError;
  let customersInserted = 0;

  return {
    get stats() {
      return { customersInserted };
    },
    from(table: string) {
      if (table === "brands") {
        return {
          select: async () => ({ data: [{ id: "brand-1", name: "BHI" }] }),
        };
      }

      if (table === "skus") {
        return {
          select: async () => ({
            data: [{ id: "sku-1", sku_code: "BHI-TEST-1", product_id: "prod-1" }],
          }),
        };
      }

      if (table === "orders") {
        return {
          select() {
            return {
              in() {
                return {
                  range: async () => ({ data: [] as unknown[] }),
                };
              },
            };
          },
          insert() {
            return {
              select() {
                return {
                  single: async () => ({
                    data: orderInsertError ? null : { id: "order-pdf-1" },
                    error: orderInsertError ? new Error(orderInsertError) : null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "buyers") {
        return {
          select() {
            return {
              ilike: async () => ({ data: [{ id: "buyer-1" }] }),
            };
          },
        };
      }

      if (table === "customers") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      limit() {
                        return {
                          maybeSingle: async () => ({
                            data: customerExists ? { id: "customer-1" } : null,
                          }),
                        };
                      },
                    };
                  },
                  limit() {
                    return {
                      maybeSingle: async () => ({
                        data: customerExists ? { id: "customer-1" } : null,
                      }),
                    };
                  },
                };
              },
            };
          },
          insert() {
            return {
              select() {
                return {
                  single: async () => {
                    customersInserted += 1;
                    return { data: { id: "customer-new-1" }, error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "order_items") {
        return {
          insert: async () => ({ error: null }),
        };
      }

      return {
        select: async () => ({ data: [] as unknown[] }),
      };
    },
  };
}

export const defaultLowesParsedOrders = [
  {
    retailer: "Lowes" as const,
    channel_order_id: "PO-PDF-001",
    consumer_order_id: "CO-001",
    order_date: "2025-01-10",
    ship_via: "Ground",
    ship_to: {
      name: "John Doe",
      line1: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "73301",
      phone: "5125551111",
      address_type: "Residential",
    },
    items: [
      {
        sku_code: "BHI-TEST-1",
        product_name: "Test Product",
        quantity: 1,
      },
    ],
  },
];
