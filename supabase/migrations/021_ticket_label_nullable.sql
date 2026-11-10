-- ─── Ticket label: no default, allow empty ───
--
-- The label should start unset rather than defaulting to 'pending'.
-- Clear the 'pending' values backfilled by migration 020.

ALTER TABLE support_tickets ALTER COLUMN label DROP DEFAULT;
ALTER TABLE support_tickets ALTER COLUMN label DROP NOT NULL;

UPDATE support_tickets SET label = NULL WHERE label = 'pending';
