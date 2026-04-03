-- BHI ERP Initial Schema
-- Run this in your Supabase SQL Editor

-- ─── Enums ───

CREATE TYPE order_status AS ENUM (
  'pending', 'acknowledged', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'
);

CREATE TYPE channel_source AS ENUM (
  'dsco', 'ebay', 'shopify', 'wayfair', 'commercehub', 'manual'
);

CREATE TYPE user_role AS ENUM (
  'admin', 'warehouse', 'finance', 'cs', 'manager'
);

CREATE TYPE warranty_status AS ENUM (
  'open', 'diagnosing', 'approved', 'rejected', 'resolved'
);

-- ─── User Profiles ───

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'cs',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Buyers ───

CREATE TABLE buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform channel_source NOT NULL,
  compliance_config JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Brands ───

CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Products ───

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  model_number TEXT NOT NULL DEFAULT '',
  specs JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── SKUs ───

CREATE TABLE skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  sku_code TEXT NOT NULL,
  buyer_id UUID REFERENCES buyers(id),
  upc TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  weight_lbs NUMERIC(8,2),
  dimensions JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sku_code, buyer_id)
);

-- ─── Customers ───

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Orders ───

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_source channel_source NOT NULL,
  channel_order_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  status order_status NOT NULL DEFAULT 'pending',
  order_date TIMESTAMPTZ NOT NULL,
  ship_by_date TIMESTAMPTZ,
  shipping_address JSONB NOT NULL DEFAULT '{}',
  shipping_method TEXT,
  tracking_number TEXT,
  carrier TEXT,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_source, channel_order_id)
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_channel ON orders(channel_source);
CREATE INDEX idx_orders_date ON orders(order_date DESC);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);

-- ─── Order Items ───

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id TEXT NOT NULL DEFAULT '',
  sku_code TEXT NOT NULL,
  product_name TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ─── Shipments ───

CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  shipping_method TEXT NOT NULL DEFAULT '',
  shipped_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_transit',
  label_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shipments_order ON shipments(order_id);

-- ─── Warranties ───

CREATE TABLE warranties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  customer_id UUID REFERENCES customers(id),
  product_id UUID REFERENCES products(id),
  sku_id UUID REFERENCES skus(id),
  status warranty_status NOT NULL DEFAULT 'open',
  claim_type TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_warranties_status ON warranties(status);
CREATE INDEX idx_warranties_order ON warranties(order_id);

-- ─── Suppliers ───

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Purchase Orders ───

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft',
  items JSONB NOT NULL DEFAULT '[]',
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  expected_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Inventory ───

CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES skus(id) UNIQUE,
  warehouse_location TEXT NOT NULL DEFAULT 'main',
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Channel Sync Logs ───

CREATE TABLE channel_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel channel_source NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  message TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_logs_channel ON channel_sync_logs(channel, created_at DESC);

-- ─── RLS Policies ───

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_sync_logs ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "admin_full_access" ON user_profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- All authenticated users can read orders (filtered by role in app layer)
CREATE POLICY "authenticated_read_orders" ON orders
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_order_items" ON order_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_products" ON products
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_skus" ON skus
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_customers" ON customers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_shipments" ON shipments
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_warranties" ON warranties
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_inventory" ON inventory
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_buyers" ON buyers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_brands" ON brands
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_suppliers" ON suppliers
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_purchase_orders" ON purchase_orders
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated_read_sync_logs" ON channel_sync_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Write policies for admin and manager roles
CREATE POLICY "admin_manager_write_orders" ON orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "admin_manager_write_products" ON products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "admin_manager_write_customers" ON customers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Warehouse can update order status and shipments
CREATE POLICY "warehouse_write_shipments" ON shipments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'warehouse'))
  );

CREATE POLICY "warehouse_write_inventory" ON inventory
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'warehouse'))
  );

-- CS can write warranties
CREATE POLICY "cs_write_warranties" ON warranties
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager', 'cs'))
  );

-- ─── Auto-create user profile on signup ───

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'cs'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Updated_at trigger ───

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER warranties_updated_at
  BEFORE UPDATE ON warranties FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER inventory_updated_at
  BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
