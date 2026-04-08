// Core ERP database types — mirrors Supabase schema

export type OrderStatus =
  | "pending"
  | "acknowledged"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "returned";

export type ChannelSource =
  | "dsco"
  | "ebay"
  | "shopify"
  | "wayfair"
  | "commercehub"
  | "manual";

export type UserRole = "admin" | "warehouse" | "finance" | "cs" | "manager";

export type WarrantyStatus =
  | "open"
  | "diagnosing"
  | "approved"
  | "rejected"
  | "resolved";

// ─── Core Tables ───

export interface Buyer {
  id: string;
  name: string;
  platform: ChannelSource;
  compliance_config: Record<string, unknown>;
  active: boolean;
  created_at: string;
}

export interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  brand_id: string;
  name: string;
  category: string;
  model_number: string;
  specs: Record<string, unknown>;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SKU {
  id: string;
  product_id: string;
  sku_code: string;
  buyer_id: string | null;
  upc: string | null;
  price: number;
  cost: number;
  weight_lbs: number | null;
  dimensions: { length: number; width: number; height: number } | null;
  active: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: Address;
  created_at: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Order {
  id: string;
  channel_source: ChannelSource;
  channel_order_id: string;
  buyer_id: string;
  customer_id: string;
  status: OrderStatus;
  order_date: string;
  ship_by_date: string | null;
  shipping_address: Address;
  shipping_method: string | null;
  tracking_number: string | null;
  carrier: string | null;
  subtotal: number;
  shipping_cost: number;
  tax: number;
  total: number;
  notes: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  sku_id: string;
  sku_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Shipment {
  id: string;
  order_id: string;
  carrier: string;
  tracking_number: string;
  shipping_method: string;
  shipped_date: string;
  delivered_date: string | null;
  status: string;
  label_url: string | null;
  created_at: string;
}

export interface WarrantyRegistration {
  id: string;
  customer_name: string;
  customer_email: string | null;
  indoor_model: string | null;
  indoor_serial: string | null;
  outdoor_model: string | null;
  outdoor_serial: string | null;
  purchase_date: string | null;
  purchase_from: string | null;
  order_number: string | null;
  contractor_name: string | null;
  contractor_phone: string | null;
  contractor_email: string | null;
  license_type: string | null;
  license_no: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Warranty {
  id: string;
  warranty_number: string | null;
  registration_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_name: string | null;
  shipping_address: Record<string, string>;
  status: WarrantyStatus;
  claim_type: string;
  description: string;
  notes: string | null;
  resolution: string | null;
  fulfillment_status: string | null;
  financial_status: string | null;
  subtotal: number;
  shipping_cost: number;
  total: number;
  discount_code: string | null;
  discount_amount: number;
  shopify_id: string | null;
  order_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarrantyPart {
  id: string;
  warranty_id: string;
  part_name: string;
  quantity: number;
  unit_price: number;
  sku: string | null;
  fulfillment_status: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: Address | null;
  active: boolean;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  status: "draft" | "sent" | "confirmed" | "received" | "cancelled";
  items: PurchaseOrderItem[];
  total: number;
  expected_date: string | null;
  created_at: string;
}

export interface PurchaseOrderItem {
  sku_id: string;
  sku_code: string;
  quantity: number;
  unit_cost: number;
}

export interface InventoryRecord {
  id: string;
  sku_id: string;
  warehouse_location: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  reorder_point: number;
  updated_at: string;
}

// ─── Channel Sync ───

export interface ChannelSyncLog {
  id: string;
  channel: ChannelSource;
  direction: "inbound" | "outbound";
  entity_type: "order" | "inventory" | "shipment" | "product";
  entity_id: string | null;
  status: "success" | "error" | "skipped";
  message: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

// ─── User / Auth ───

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}
