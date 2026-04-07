-- Remittance uploads (one per file uploaded)
CREATE TABLE IF NOT EXISTS remittances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer TEXT NOT NULL,                    -- 'Home Depot', 'Lowe''s'
  payment_date DATE,                         -- When payment was sent
  eft_number TEXT,                            -- EFT/check reference
  balance_due NUMERIC(12,2) DEFAULT 0,       -- Total payment amount
  total_paid NUMERIC(12,2) DEFAULT 0,        -- Sum of positive lines
  total_deductions NUMERIC(12,2) DEFAULT 0,  -- Sum of negative lines
  file_name TEXT,                             -- Original file name
  uploaded_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual remittance line items
CREATE TABLE IF NOT EXISTS remittance_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remittance_id UUID NOT NULL REFERENCES remittances(id) ON DELETE CASCADE,
  line_number INT,
  order_id UUID REFERENCES orders(id),       -- Matched order (null if unmatched)
  po_number TEXT,                             -- Purchase Order Number from XLS
  invoice_number TEXT,
  invoice_date DATE,
  invoice_amount NUMERIC(12,2) DEFAULT 0,    -- Gross invoice amount
  line_amount NUMERIC(12,2) DEFAULT 0,       -- Net amount (after discount/adj)
  discount NUMERIC(12,2) DEFAULT 0,
  adjustment_number TEXT,
  adjustment_date DATE,
  adjustment_reason TEXT,
  line_type TEXT NOT NULL DEFAULT 'payment',  -- 'payment', 'deduction', 'adjustment'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_remittance_lines_remittance ON remittance_lines(remittance_id);
CREATE INDEX IF NOT EXISTS idx_remittance_lines_order ON remittance_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_remittance_lines_po ON remittance_lines(po_number);

-- RLS
ALTER TABLE remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE remittance_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/finance full access remittances" ON remittances
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
  );

CREATE POLICY "Admin/finance full access remittance_lines" ON remittance_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'finance'))
  );
