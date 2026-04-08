-- ─── Warranty Registrations ───
-- Stores customer warranty registration submissions (from Google Form / CSV imports)

CREATE TABLE IF NOT EXISTS warranty_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  indoor_model TEXT,
  indoor_serial TEXT,
  outdoor_model TEXT,
  outdoor_serial TEXT,
  purchase_date DATE,
  purchase_from TEXT,
  order_number TEXT,
  contractor_name TEXT,
  contractor_phone TEXT,
  contractor_email TEXT,
  license_type TEXT,
  license_no TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_warranty_reg_email ON warranty_registrations(customer_email);
CREATE INDEX idx_warranty_reg_order ON warranty_registrations(order_number);
CREATE INDEX idx_warranty_reg_customer_name ON warranty_registrations(customer_name);

-- Add registration_id to existing warranties table
ALTER TABLE warranties ADD COLUMN IF NOT EXISTS registration_id UUID REFERENCES warranty_registrations(id);
CREATE INDEX idx_warranties_registration ON warranties(registration_id);

-- ─── RLS ───

ALTER TABLE warranty_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_warranty_registrations" ON warranty_registrations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cs_write_warranty_registrations" ON warranty_registrations
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','cs','manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','cs','manager'))
  );

-- Updated at trigger
CREATE TRIGGER warranty_registrations_updated_at
  BEFORE UPDATE ON warranty_registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
