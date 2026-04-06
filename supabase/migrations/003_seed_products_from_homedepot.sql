-- Seed BHI products from Home Depot listing data
-- Source: Home Depot BHI brand page (22 products)

-- ─── Brand ───
INSERT INTO brands (id, name)
VALUES ('b0000000-0000-0000-0000-000000000001', 'BHI')
ON CONFLICT (name) DO NOTHING;

-- ─── Products ───
-- Mini Split Systems (16 products)
INSERT INTO products (id, brand_id, name, category, model_number, specs) VALUES
  -- 20.5 SEER2 Series
  ('a0000000-0000-0000-0001-000000000001', 'b0000000-0000-0000-0000-000000000001',
   '12,000 BTU 20.5 SEER2 Ductless Mini Split Air Conditioner with Heat Pump 115-Volt',
   'Mini Split Systems', 'BHI-12K115V-US-A',
   '{"btu_cooling": 12000, "btu_heating": 12000, "seer2": 20.5, "voltage": 115, "zones": 1, "tons": 1, "coverage_sqft": 600, "wifi": false, "lineset_ft": 16.4, "returnable": "90-Day", "hd_item_id": "318800055"}'),

  ('a0000000-0000-0000-0001-000000000002', 'b0000000-0000-0000-0000-000000000001',
   '12,000 BTU 20.5 SEER2 Ductless Mini Split Air Conditioner with Heat Pump Wi-Fi 115-Volt',
   'Mini Split Systems', 'BHI-12K115V-US-C',
   '{"btu_cooling": 12000, "btu_heating": 12000, "seer2": 20.5, "voltage": 115, "zones": 1, "tons": 1, "coverage_sqft": 600, "wifi": true, "lineset_ft": 16.4, "returnable": "90-Day", "hd_item_id": "318799965"}'),

  ('a0000000-0000-0000-0001-000000000003', 'b0000000-0000-0000-0000-000000000001',
   '12,000 BTU 115-Volt, 20.5 SEER2, 600 sq.ft. Ductless Mini Split Air Conditioner with Heat Pump, 1-Ton, 25 ft. Lineset',
   'Mini Split Systems', 'BHI-12K115V-US-B',
   '{"btu_cooling": 12000, "btu_heating": 12000, "seer2": 20.5, "voltage": 115, "zones": 1, "tons": 1, "coverage_sqft": 600, "wifi": false, "lineset_ft": 25, "returnable": "90-Day", "hd_item_id": "331429029"}'),

  ('a0000000-0000-0000-0001-000000000004', 'b0000000-0000-0000-0000-000000000001',
   '12,000 BTU 115-Volt, 20.5 SEER2, WiFi Control, 600 sq. ft. Ductless Mini Split AC with Heat Pump, 1-Ton, 25 ft. Lineset',
   'Mini Split Systems', 'BHI-12K115V-US-D',
   '{"btu_cooling": 12000, "btu_heating": 12000, "seer2": 20.5, "voltage": 115, "zones": 1, "tons": 1, "coverage_sqft": 600, "wifi": true, "lineset_ft": 25, "returnable": "90-Day", "hd_item_id": "331429160"}'),

  -- 17 SEER2 Series - 12K BTU
  ('a0000000-0000-0000-0001-000000000005', 'b0000000-0000-0000-0000-000000000001',
   '12,000 BTU 115-Volt, 17 SEER2, 600 sq. ft. Ductless Mini Split Air Conditioner with Heat Pump, 16.4 ft. (5m) Lineset',
   'Mini Split Systems', 'BHI-T17-12K115V-US-A',
   '{"btu_cooling": 12000, "btu_heating": 12000, "seer2": 17, "voltage": 115, "zones": 1, "tons": 1, "coverage_sqft": 600, "wifi": false, "lineset_ft": 16.4, "returnable": "90-Day", "hd_item_id": "329355324"}'),

  ('a0000000-0000-0000-0001-000000000006', 'b0000000-0000-0000-0000-000000000001',
   '12,000 BTU 115-Volt, 17 SEER2, 600 sq. ft. Ductless Mini Split Air Conditioner with Heat Pump, 1-Ton, 25 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-12K115V-US-B',
   '{"btu_cooling": 12000, "btu_heating": 12000, "seer2": 17, "voltage": 115, "zones": 1, "tons": 1, "coverage_sqft": 600, "wifi": false, "lineset_ft": 25, "returnable": "90-Day", "hd_item_id": "329355336"}'),

  ('a0000000-0000-0000-0001-000000000007', 'b0000000-0000-0000-0000-000000000001',
   '12,000 BTU 115-Volt, 17 SEER2, Wi-Fi, 600 sq. ft. Ductless Mini Split Air Conditioner with Heat Pump, 16.4 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-12K115V-US-C',
   '{"btu_cooling": 12000, "btu_heating": 12000, "seer2": 17, "voltage": 115, "zones": 1, "tons": 1, "coverage_sqft": 600, "wifi": true, "lineset_ft": 16.4, "returnable": "90-Day", "hd_item_id": "329355342"}'),

  ('a0000000-0000-0000-0001-000000000008', 'b0000000-0000-0000-0000-000000000001',
   '12,000 BTU 115-Volt, 17 SEER2, Wi-Fi, 600 sq. ft. Ductless Mini Split Air Conditioner with Heat Pump, 25 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-12K115V-US-D',
   '{"btu_cooling": 12000, "btu_heating": 12000, "seer2": 17, "voltage": 115, "zones": 1, "tons": 1, "coverage_sqft": 600, "wifi": true, "lineset_ft": 25, "returnable": "90-Day", "hd_item_id": "329355346"}'),

  -- 17 SEER2 Series - 24K BTU
  ('a0000000-0000-0000-0001-000000000009', 'b0000000-0000-0000-0000-000000000001',
   '24,000 BTU 230-Volt, 17 SEER2, 1200 sq. ft. Inverter Ductless Mini Split Air Conditioner w/Heat Pump, 16.4 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-24K230V-CHN-US-A',
   '{"btu_cooling": 24000, "btu_heating": 24000, "seer2": 17, "voltage": 230, "zones": 1, "tons": 2, "coverage_sqft": 1200, "wifi": false, "lineset_ft": 16.4, "returnable": "90-Day", "hd_item_id": "338293040"}'),

  ('a0000000-0000-0000-0001-000000000010', 'b0000000-0000-0000-0000-000000000001',
   '24,000 BTU 230-Volt, 17 SEER2, 1200 sq. ft. Inverter Ductless Mini Split Air Conditioner w/ Heat Pump, 25 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-24K230V-CHN-US-B',
   '{"btu_cooling": 24000, "btu_heating": 24000, "seer2": 17, "voltage": 230, "zones": 1, "tons": 2, "coverage_sqft": 1200, "wifi": false, "lineset_ft": 25, "returnable": "90-Day", "hd_item_id": "338293046"}'),

  ('a0000000-0000-0000-0001-000000000011', 'b0000000-0000-0000-0000-000000000001',
   '24,000 BTU 230V, 17 SEER2, 1200 sq. ft. Inverter Wi-Fi Ductless Mini Split Air Conditioner w/ Heat Pump 16.4 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-24K230V-CHN-US-C',
   '{"btu_cooling": 24000, "btu_heating": 24000, "seer2": 17, "voltage": 230, "zones": 1, "tons": 2, "coverage_sqft": 1200, "wifi": true, "lineset_ft": 16.4, "returnable": "90-Day", "hd_item_id": "338293058"}'),

  ('a0000000-0000-0000-0001-000000000012', 'b0000000-0000-0000-0000-000000000001',
   '24,000 BTU 230-Volt 17 SEER2 1200 sq. ft. Inverter Wi-Fi Ductless Mini Split Air Conditioner w/Heat Pump 25 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-24K230V-CHN-US-D',
   '{"btu_cooling": 24000, "btu_heating": 24000, "seer2": 17, "voltage": 230, "zones": 1, "tons": 2, "coverage_sqft": 1200, "wifi": true, "lineset_ft": 25, "returnable": "90-Day", "hd_item_id": "338293070"}'),

  -- 17 SEER2 Series - 36K BTU
  ('a0000000-0000-0000-0001-000000000013', 'b0000000-0000-0000-0000-000000000001',
   '36,000 BTU 230-Volt, 17 SEER2 1800-sq. ft. Inverter Ductless Mini Split Air Conditioner with Heat Pump, 16.4 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-36K230V-US-A',
   '{"btu_cooling": 36000, "btu_heating": 36000, "seer2": 17, "voltage": 230, "zones": 1, "tons": 3, "coverage_sqft": 1800, "wifi": false, "lineset_ft": 16.4, "returnable": "90-Day", "hd_item_id": "338293089"}'),

  ('a0000000-0000-0000-0001-000000000014', 'b0000000-0000-0000-0000-000000000001',
   '36,000 BTU 230-Volt, 17 SEER2, 1800-sq. ft. Inverter Ductless Mini Split Air Conditioner with Heat Pump, 25 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-36K230V-US-B',
   '{"btu_cooling": 36000, "btu_heating": 36000, "seer2": 17, "voltage": 230, "zones": 1, "tons": 3, "coverage_sqft": 1800, "wifi": false, "lineset_ft": 25, "returnable": "90-Day", "hd_item_id": "338293096"}'),

  ('a0000000-0000-0000-0001-000000000015', 'b0000000-0000-0000-0000-000000000001',
   '36,000 BTU 230-Volt 17 SEER2 1800 sq. ft. Inverter Wifi Ductless Mini Split Air Conditioner w/Heat Pump 16.4 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-36K230V-US-C',
   '{"btu_cooling": 36000, "btu_heating": 36000, "seer2": 17, "voltage": 230, "zones": 1, "tons": 3, "coverage_sqft": 1800, "wifi": true, "lineset_ft": 16.4, "returnable": "90-Day", "hd_item_id": "338293108"}'),

  ('a0000000-0000-0000-0001-000000000016', 'b0000000-0000-0000-0000-000000000001',
   '36,000 BTU 230-Volt 17 SEER2 1800 sq. ft. Inverter Wi-Fi Ductless Mini Split Air Conditioner w/ Heat Pump 25 ft. Lineset',
   'Mini Split Systems', 'BHI-T17-36K230V-US-D',
   '{"btu_cooling": 36000, "btu_heating": 36000, "seer2": 17, "voltage": 230, "zones": 1, "tons": 3, "coverage_sqft": 1800, "wifi": true, "lineset_ft": 25, "returnable": "90-Day", "hd_item_id": "338293113"}'),

  -- Mini Split Parts
  ('a0000000-0000-0000-0002-000000000001', 'b0000000-0000-0000-0000-000000000001',
   '3.5 in. x 6.5 ft. LineSet Cover Tubing Kits for Central Air Conditioner, Ductless Mini Split Air Conditioner',
   'Mini Split Parts', 'BHI-PARTS-LINESET',
   '{"type": "lineset_cover", "returnable": "90-Day", "hd_item_id": "315146704"}'),

  ('a0000000-0000-0000-0002-000000000002', 'b0000000-0000-0000-0000-000000000001',
   'Universal Wall Mounting Bracket for Ductless Mini Split Air Conditioner Outdoor Unit (for 9K BTU to 36K BTU Condenser)',
   'Mini Split Parts', 'BHI-PARTS-BRACKET',
   '{"type": "mounting_bracket", "compatible_btu_range": "9000-36000", "returnable": "90-Day", "hd_item_id": "315146599"}'),

  -- Chest Coolers
  ('a0000000-0000-0000-0003-000000000001', 'b0000000-0000-0000-0000-000000000001',
   '20 qt. (18.9 Liter, up to 30 Cans) Roto-Molded Insulated Chester Cooler Box, up to 5 Days for Ice Retention',
   'Chest Coolers', 'BHI-KUER-B-20',
   '{"capacity_qt": 20, "capacity_liters": 18.9, "can_capacity": 30, "ice_retention_days": 5, "features": ["Locking Lid", "UV treated", "Attached bottle opener"], "returnable": "90-Day", "hd_item_id": "338199136"}'),

  ('a0000000-0000-0000-0003-000000000002', 'b0000000-0000-0000-0000-000000000001',
   '35 qt. (33.1 Liter, up to 48 Cans) Roto-Molded Insulated Chester Cooler Box, up to 5 Days for Ice Retention',
   'Chest Coolers', 'BHI-KUER-B-35',
   '{"capacity_qt": 35, "capacity_liters": 33.1, "can_capacity": 48, "ice_retention_days": 5, "features": ["Locking Lid", "UV treated", "Attached bottle opener"], "returnable": "90-Day", "hd_item_id": "338199651"}'),

  ('a0000000-0000-0000-0003-000000000003', 'b0000000-0000-0000-0000-000000000001',
   '45 qt. (42.6 Liter, up to 64 Cans) Roto-Molded Insulated Chester Cooler Box, up to 5 Days for Ice Retention',
   'Chest Coolers', 'BHI-KUER-B-45',
   '{"capacity_qt": 45, "capacity_liters": 42.6, "can_capacity": 64, "ice_retention_days": 5, "features": ["Locking Lid", "UV treated", "Attached bottle opener"], "returnable": "90-Day", "hd_item_id": "338199669"}'),

  -- Condensate Pump
  ('a0000000-0000-0000-0004-000000000001', 'b0000000-0000-0000-0000-000000000001',
   '1/250 HP 100 ~ 240-Volt Plastic Condensate Removal Pump',
   'Condensate Pumps', 'BHI-PC-24A',
   '{"hp": 0.004, "voltage_range": "100-240", "housing_material": "Thermoplastic", "vertical_lift_ft": 32.8, "returnable": "90-Day", "hd_item_id": "329362071"}');


-- ─── SKUs (Home Depot channel SKUs with pricing) ───
-- Using Home Depot store SKU numbers as sku_code
-- buyer_id left NULL = internal/default SKU

INSERT INTO skus (id, product_id, sku_code, price, cost) VALUES
  -- 20.5 SEER2 Series
  ('c0000000-0000-0000-0001-000000000001', 'a0000000-0000-0000-0001-000000000001', 'BHI-12K115V-US-A', 790.00, 0),
  ('c0000000-0000-0000-0001-000000000002', 'a0000000-0000-0000-0001-000000000002', 'BHI-12K115V-US-C', 840.00, 0),
  ('c0000000-0000-0000-0001-000000000003', 'a0000000-0000-0000-0001-000000000003', 'BHI-12K115V-US-B', 840.00, 0),
  ('c0000000-0000-0000-0001-000000000004', 'a0000000-0000-0000-0001-000000000004', 'BHI-12K115V-US-D', 890.00, 0),

  -- 17 SEER2 Series - 12K
  ('c0000000-0000-0000-0001-000000000005', 'a0000000-0000-0000-0001-000000000005', 'BHI-T17-12K115V-US-A', 730.00, 0),
  ('c0000000-0000-0000-0001-000000000006', 'a0000000-0000-0000-0001-000000000006', 'BHI-T17-12K115V-US-B', 770.00, 0),
  ('c0000000-0000-0000-0001-000000000007', 'a0000000-0000-0000-0001-000000000007', 'BHI-T17-12K115V-US-C', 770.00, 0),
  ('c0000000-0000-0000-0001-000000000008', 'a0000000-0000-0000-0001-000000000008', 'BHI-T17-12K115V-US-D', 820.00, 0),

  -- 17 SEER2 Series - 24K
  ('c0000000-0000-0000-0001-000000000009', 'a0000000-0000-0000-0001-000000000009', 'BHI-T17-24K230V-CHN-US-A', 1200.00, 0),
  ('c0000000-0000-0000-0001-000000000010', 'a0000000-0000-0000-0001-000000000010', 'BHI-T17-24K230V-CHN-US-B', 1400.00, 0),
  ('c0000000-0000-0000-0001-000000000011', 'a0000000-0000-0000-0001-000000000011', 'BHI-T17-24K230V-CHN-US-C', 1400.00, 0),
  ('c0000000-0000-0000-0001-000000000012', 'a0000000-0000-0000-0001-000000000012', 'BHI-T17-24K230V-CHN-US-D', 1600.00, 0),

  -- 17 SEER2 Series - 36K
  ('c0000000-0000-0000-0001-000000000013', 'a0000000-0000-0000-0001-000000000013', 'BHI-T17-36K230V-US-A', 2100.00, 0),
  ('c0000000-0000-0000-0001-000000000014', 'a0000000-0000-0000-0001-000000000014', 'BHI-T17-36K230V-US-B', 2300.00, 0),
  ('c0000000-0000-0000-0001-000000000015', 'a0000000-0000-0000-0001-000000000015', 'BHI-T17-36K230V-US-C', 2300.00, 0),
  ('c0000000-0000-0000-0001-000000000016', 'a0000000-0000-0000-0001-000000000016', 'BHI-T17-36K230V-US-D', 2400.00, 0),

  -- Parts
  ('c0000000-0000-0000-0002-000000000001', 'a0000000-0000-0000-0002-000000000001', 'BHI-PARTS-LINESET', 55.00, 0),
  ('c0000000-0000-0000-0002-000000000002', 'a0000000-0000-0000-0002-000000000002', 'BHI-PARTS-BRACKET', 35.00, 0),

  -- Coolers
  ('c0000000-0000-0000-0003-000000000001', 'a0000000-0000-0000-0003-000000000001', 'BHI-KUER-B-20', 129.00, 0),
  ('c0000000-0000-0000-0003-000000000002', 'a0000000-0000-0000-0003-000000000002', 'BHI-KUER-B-35', 159.00, 0),
  ('c0000000-0000-0000-0003-000000000003', 'a0000000-0000-0000-0003-000000000003', 'BHI-KUER-B-45', 179.00, 0),

  -- Pump
  ('c0000000-0000-0000-0004-000000000001', 'a0000000-0000-0000-0004-000000000001', 'BHI-PC-24A', 62.10, 0);


-- ─── Inventory (initial stock from HD listing data) ───

INSERT INTO inventory (sku_id, warehouse_location, quantity_on_hand, quantity_reserved, reorder_point) VALUES
  ('c0000000-0000-0000-0001-000000000001', 'main', 1000, 0, 50),
  ('c0000000-0000-0000-0001-000000000002', 'main', 500, 0, 50),
  ('c0000000-0000-0000-0001-000000000003', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0001-000000000004', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0001-000000000005', 'main', 993, 0, 50),
  ('c0000000-0000-0000-0001-000000000006', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0001-000000000007', 'main', 999, 0, 50),
  ('c0000000-0000-0000-0001-000000000008', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0001-000000000009', 'main', 499, 0, 30),
  ('c0000000-0000-0000-0001-000000000010', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0001-000000000011', 'main', 500, 0, 30),
  ('c0000000-0000-0000-0001-000000000012', 'main', 99, 0, 20),
  ('c0000000-0000-0000-0001-000000000013', 'main', 500, 0, 30),
  ('c0000000-0000-0000-0001-000000000014', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0001-000000000015', 'main', 500, 0, 30),
  ('c0000000-0000-0000-0001-000000000016', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0002-000000000001', 'main', 1000, 0, 100),
  ('c0000000-0000-0000-0002-000000000002', 'main', 994, 0, 100),
  ('c0000000-0000-0000-0003-000000000001', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0003-000000000002', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0003-000000000003', 'main', 100, 0, 20),
  ('c0000000-0000-0000-0004-000000000001', 'main', 600, 0, 50);
