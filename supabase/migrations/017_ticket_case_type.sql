-- ─── Ticket case types ───
--
-- Categorizes tickets (shipping damage, warranty claim, parts, refund, ...).
-- Kept as TEXT (not enum) so the taxonomy can evolve without a migration;
-- the app validates against the list in src/lib/support/case-types.ts.

ALTER TABLE support_tickets
  ADD COLUMN case_type TEXT NOT NULL DEFAULT 'other';

CREATE INDEX idx_support_tickets_case_type ON support_tickets(case_type);

-- Backfill existing rows with the same keyword rules the importer uses
-- (first match wins, most specific first).
UPDATE support_tickets SET case_type = CASE
  WHEN issue_summary ~* 'warranty registration|register (the |his |her |my )?(unit|warranty|product)|app setup|wifi setup'
    THEN 'registration'
  WHEN issue_summary ~* 'damaged (in|during) (transit|shipping)|arrived damaged|delivered .{0,40}damaged|dented|crushed|shipping damage|box (was )?(open|damaged)'
    THEN 'shipping_damage'
  WHEN issue_summary ~* 'refund|return (the |a |his |her |my )?(unit|order|item|it)|chargeback|cancel (the |my )?order'
    THEN 'refund_return'
  WHEN issue_summary ~* 'part number|replacement part|spare part|send (a |the |him |her |them )?(new |replacement )?(part|remote|sensor|valve|board|pcb)|missing (part|hardware|accessor)'
    THEN 'parts_request'
  WHEN issue_summary ~* 'warranty (claim|exception|company|replacement)|claim #|under warranty|first american|home warranty'
    THEN 'warranty_claim'
  WHEN issue_summary ~* 'tracking|where is (my|the) order|delivery (date|eta|status)|not (yet )?(arrived|delivered)|shipment status'
    THEN 'order_status'
  WHEN issue_summary ~* 'not (working|cooling|heating|running|turning|powering)|error code|troubleshoot|noise|leak|compressor|pressure|shuts? off|won''t (start|turn)|stopped working|fault'
    THEN 'technical_support'
  ELSE 'other'
END
WHERE case_type = 'other';
