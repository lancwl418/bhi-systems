-- Track invoices submitted per order (one order can have multiple invoices)
CREATE TABLE IF NOT EXISTS order_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  po_number TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date TIMESTAMPTZ,
  invoice_amount NUMERIC(12,2) DEFAULT 0,
  sku_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_order_invoices_order ON order_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_order_invoices_po ON order_invoices(po_number);
CREATE INDEX IF NOT EXISTS idx_order_invoices_invoice ON order_invoices(invoice_number);

-- RLS
ALTER TABLE order_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/finance full access order_invoices" ON order_invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
  );
