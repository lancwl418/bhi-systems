-- ─── "Ignored" progress status ───
--
-- For tickets that need no action (spam, duplicates, junk rows from imports).
-- Ignored tickets are grayed out in the list and excluded from the open /
-- stuck / not-replied counts.

ALTER TYPE ticket_progress ADD VALUE IF NOT EXISTS 'ignored';
