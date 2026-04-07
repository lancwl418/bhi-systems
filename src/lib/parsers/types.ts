export interface ParsedOrderItem {
  sku_code: string;
  product_name: string;
  quantity: number;
  internet_number?: string;
  item_number?: string;
}

export interface ParsedOrder {
  retailer: "Home Depot" | "Lowes";
  channel_order_id: string;       // PO Number
  consumer_order_id: string;      // Customer Order Number
  order_date: string;             // ISO date string
  ship_via: string | null;
  ship_to: {
    name: string;
    line1: string;
    line2?: string;
    company?: string;
    city: string;
    state: string;
    zip: string;
    phone?: string;
    address_type?: string;
  };
  items: ParsedOrderItem[];
}
