-- Add eft_number to remittance_lines for per-line EFT tracking
ALTER TABLE remittance_lines ADD COLUMN IF NOT EXISTS eft_number TEXT;

-- Add payment_date per line (each line can have different payment date)
ALTER TABLE remittance_lines ADD COLUMN IF NOT EXISTS payment_date DATE;

-- Unique constraint to prevent duplicate invoice imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_remittance_lines_eft_invoice
  ON remittance_lines(eft_number, invoice_number)
  WHERE eft_number IS NOT NULL AND invoice_number IS NOT NULL AND invoice_number != '';
