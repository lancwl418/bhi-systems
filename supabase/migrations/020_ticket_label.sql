-- ─── Ticket label ───
--
-- Coarse workflow label on top of the finer-grained progress field:
-- pending (待处理), in_progress (处理中), completed (已完成).

CREATE TYPE ticket_label AS ENUM ('pending', 'in_progress', 'completed');

ALTER TABLE support_tickets
  ADD COLUMN label ticket_label NOT NULL DEFAULT 'pending';

CREATE INDEX idx_support_tickets_label ON support_tickets(label);
