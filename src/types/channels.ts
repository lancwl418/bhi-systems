// Channel connector interfaces — each platform implements this contract

import { Order, ChannelSource } from "./database";

/**
 * Standardized order from any channel, before mapping to internal Order
 */
export interface ChannelOrder {
  channel: ChannelSource;
  channelOrderId: string;
  orderDate: string;
  customerName: string;
  customerEmail: string | null;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  items: ChannelOrderItem[];
  shippingMethod: string | null;
  shipByDate: string | null;
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  rawPayload: Record<string, unknown>;
}

export interface ChannelOrderItem {
  channelItemId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ShipmentConfirmation {
  channelOrderId: string;
  carrier: string;
  trackingNumber: string;
  shippingMethod: string;
  shippedDate: string;
  items: { sku: string; quantity: number }[];
}

export interface InventoryUpdate {
  sku: string;
  quantityAvailable: number;
  warehouseId?: string;
}

/**
 * Every channel connector must implement this interface.
 * This is the contract between ERP core and each platform.
 */
export interface ChannelConnector {
  readonly channel: ChannelSource;

  /** Pull new/updated orders from the channel */
  fetchOrders(since?: Date): Promise<ChannelOrder[]>;

  /** Send shipment confirmation back to the channel */
  confirmShipment(confirmation: ShipmentConfirmation): Promise<void>;

  /** Push inventory levels to the channel */
  syncInventory(updates: InventoryUpdate[]): Promise<void>;

  /** Test connectivity / credentials */
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

/**
 * Channel configuration stored in DB or env
 */
export interface ChannelConfig {
  channel: ChannelSource;
  enabled: boolean;
  credentials: Record<string, string>;
  settings: Record<string, unknown>;
}
