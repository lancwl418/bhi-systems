-- Returns tracking — linked to order, invoice, and adjustment
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  invoice_id UUID REFERENCES order_invoices(id),
  remittance_line_id UUID REFERENCES remittance_lines(id),
  po_number TEXT,
  invoice_number TEXT,
  adjustment_number TEXT NOT NULL,
  adjustment_date DATE,
  adjustment_reason TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  retailer TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, confirmed, disputed
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_returns_order ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_invoice ON returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_returns_adjustment ON returns(adjustment_number);

ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/finance full access returns" ON returns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
  );
