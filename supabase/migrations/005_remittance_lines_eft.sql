-- Add eft_number to remittance_lines for per-line EFT tracking
ALTER TABLE remittance_lines ADD COLUMN IF NOT EXISTS eft_number TEXT;

-- Add payment_date per line (each line can have different payment date)
ALTER TABLE remittance_lines ADD COLUMN IF NOT EXISTS payment_date DATE;

-- Duplicate detection is handled in application code (same EFT+invoice
-- can have multiple legitimate lines, e.g. payment + deduction)
CREATE INDEX IF NOT EXISTS idx_remittance_lines_eft ON remittance_lines(eft_number);

