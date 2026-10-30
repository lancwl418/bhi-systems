-- ─── Support Tickets ───
--
-- Customer support cases tracked by the CS team (currently maintained in a
-- weekly Excel sheet, e.g. "BHI Support Cases (2026-10-21 - 10-23).xlsx").
-- Each row is one customer issue with reply/progress tracking.

CREATE TYPE ticket_reply_status AS ENUM ('not_replied', 'in_progress', 'replied');

CREATE TYPE ticket_progress AS ENUM (
  'in_progress',
  'awaiting_customer',
  'awaiting_internal',
  'awaiting_third_party',
  'resolved'
);

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_date DATE,
  -- Original date label from the sheet, e.g. "10-21 ~ 10-23" (a case can span days)
  date_label TEXT,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT,
  -- Where the case came in from, free text: "Direct email", "Lowe's",
  -- "Forwarded by Home Depot", "Website (Shopify) contact form", ...
  source TEXT,
  issue_summary TEXT NOT NULL DEFAULT '',
  reply_status ticket_reply_status NOT NULL DEFAULT 'not_replied',
  progress ticket_progress NOT NULL DEFAULT 'in_progress',
  stuck BOOLEAN NOT NULL DEFAULT false,
  next_step TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_case_date ON support_tickets(case_date DESC);
CREATE INDEX idx_support_tickets_progress ON support_tickets(progress);
CREATE INDEX idx_support_tickets_email ON support_tickets(customer_email);

CREATE OR REPLACE FUNCTION set_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_support_ticket_updated_at();
