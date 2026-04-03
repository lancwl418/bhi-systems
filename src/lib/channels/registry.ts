/**
 * Channel Registry — single entry point for all channel connectors
 */

import type { ChannelConnector } from "@/types/channels";
import type { ChannelSource } from "@/types/database";
import { dscoConnector } from "./dsco/client";
import { ebayConnector } from "./ebay/client";
import { shopifyConnector } from "./shopify/client";
import { wayfairConnector } from "./wayfair/client";

const connectors: Map<ChannelSource, ChannelConnector> = new Map([
  ["dsco", dscoConnector],
  ["ebay", ebayConnector],
  ["shopify", shopifyConnector],
  ["wayfair", wayfairConnector],
  // ["commercehub", commercehubConnector], // TODO: SFTP/XML integration
]);

export function getConnector(channel: ChannelSource): ChannelConnector {
  const connector = connectors.get(channel);
  if (!connector) {
    throw new Error(`No connector registered for channel: ${channel}`);
  }
  return connector;
}

export function getAllConnectors(): ChannelConnector[] {
  return Array.from(connectors.values());
}

export function getEnabledChannels(): ChannelSource[] {
  // In production, read from DB/config which channels are enabled
  return Array.from(connectors.keys());
}
