-- ─── Redesign warranties table for real-world warranty records ───
-- Records come from Shopify warranty orders (email-based, with parts and notes)

-- Drop old foreign keys that don't apply (data comes from email, not linked to ERP orders)
ALTER TABLE warranties
  DROP COLUMN IF EXISTS order_id,
  DROP COLUMN IF EXISTS customer_id,
  DROP COLUMN IF EXISTS product_id,
  DROP COLUMN IF EXISTS sku_id;

-- Add new columns
ALTER TABLE warranties
  ADD COLUMN IF NOT EXISTS warranty_number TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_email TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS shipping_name TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT,
  ADD COLUMN IF NOT EXISTS financial_status TEXT,
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shopify_id TEXT,
  ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_warranties_number ON warranties(warranty_number);
CREATE INDEX IF NOT EXISTS idx_warranties_email ON warranties(customer_email);
CREATE INDEX IF NOT EXISTS idx_warranties_shopify ON warranties(shopify_id);

-- ─── Warranty Parts (line items associated with each warranty record) ───

CREATE TABLE IF NOT EXISTS warranty_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id UUID NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  part_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) DEFAULT 0,
  sku TEXT,
  fulfillment_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_warranty_parts_warranty ON warranty_parts(warranty_id);

-- RLS for warranty_parts
ALTER TABLE warranty_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_warranty_parts" ON warranty_parts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cs_write_warranty_parts" ON warranty_parts
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','cs','manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','cs','manager'))
  );
