-- ─── Attachments on ticket notes ───
--
-- Internal notes can carry file attachments. Files live in the private
-- "ticket-attachments" storage bucket (created via the storage API, not SQL);
-- this column stores their metadata:
--   [{ "filename": "...", "mime_type": "...", "size": 123, "path": "<ticket_id>/<uuid>-name" }]
-- The detail page renders them via short-lived signed URLs.

ALTER TABLE ticket_notes
  ADD COLUMN attachments JSONB NOT NULL DEFAULT '[]';
