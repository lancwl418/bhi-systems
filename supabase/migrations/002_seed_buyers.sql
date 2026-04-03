-- Seed initial buyer records for each channel

INSERT INTO buyers (name, platform, compliance_config) VALUES
  ('DSCO / AAFES', 'dsco', '{"requires_sscc": true, "ship_from_required": true}'),
  ('eBay', 'ebay', '{}'),
  ('Shopify (Direct)', 'shopify', '{}'),
  ('Wayfair', 'wayfair', '{"requires_asn": true, "label_format": "wayfair_standard"}'),
  ('Home Depot (via CommerceHub)', 'commercehub', '{"edi_version": "850", "requires_asn": true}'),
  ('Lowes (via CommerceHub)', 'commercehub', '{"edi_version": "850", "requires_asn": true}');
