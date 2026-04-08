-- Invoice line items (one invoice can have multiple SKUs)
CREATE TABLE IF NOT EXISTS order_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES order_invoices(id) ON DELETE CASCADE,
  sku_code TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12,2) DEFAULT 0,
  line_total NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON order_invoice_items(invoice_id);

ALTER TABLE order_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/finance full access order_invoice_items" ON order_invoice_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
  );
