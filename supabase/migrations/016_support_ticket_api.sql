-- ─── Support ticket details for the external API ───
--
-- Extends support_tickets for programmatic use (Gmail automation agent):
-- order identifiers for dedup lookups, assignee, close tracking, plus
-- email logs, internal notes (timeline), and reply drafts.

ALTER TABLE support_tickets
  ADD COLUMN customer_phone TEXT,
  ADD COLUMN model_number TEXT,
  ADD COLUMN po_number TEXT,
  ADD COLUMN order_number TEXT,
  -- Purchase channel (Home Depot, Lowe's, Shopify, ...) — distinct from
  -- `source`, which records how the case reached us (direct email, forwarded)
  ADD COLUMN channel TEXT,
  ADD COLUMN assignee TEXT,
  ADD COLUMN closed_at TIMESTAMPTZ;

CREATE INDEX idx_support_tickets_po ON support_tickets(po_number);
CREATE INDEX idx_support_tickets_order_no ON support_tickets(order_number);

-- ─── Internal notes / timeline ───
-- kind 'note' = human/agent note; kind 'event' = automatic entries written by
-- the API on status changes, close/reopen, etc.

CREATE TABLE ticket_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'note',
  author TEXT NOT NULL DEFAULT 'api',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_notes_ticket ON ticket_notes(ticket_id, created_at);

-- ─── Email log ───
-- One row per original email tied to a ticket. The system never sends mail;
-- outbound rows are written back by the agent after it sends via Gmail.

CREATE TABLE ticket_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  from_addr TEXT,
  to_addr TEXT,
  cc TEXT,
  sent_at TIMESTAMPTZ,
  subject TEXT,
  body TEXT,
  message_id TEXT,
  thread_id TEXT,
  -- [{ "filename": "...", "mime_type": "...", "size": 123, "url": "..." }]
  attachments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same email never logged twice
CREATE UNIQUE INDEX idx_ticket_emails_message_id
  ON ticket_emails(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_ticket_emails_ticket ON ticket_emails(ticket_id, sent_at);
CREATE INDEX idx_ticket_emails_thread ON ticket_emails(thread_id);

-- ─── Reply drafts ───
-- Stored by the agent for review; sending happens outside the system.

CREATE TABLE ticket_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  subject TEXT,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'api',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_drafts_ticket ON ticket_drafts(ticket_id, created_at DESC);
