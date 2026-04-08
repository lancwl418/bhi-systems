-- ─── Warranty Comments (timeline) ───

CREATE TABLE IF NOT EXISTS warranty_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id UUID NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  author TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_warranty_comments_warranty ON warranty_comments(warranty_id);

ALTER TABLE warranty_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_warranty_comments" ON warranty_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cs_write_warranty_comments" ON warranty_comments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','cs','manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin','cs','manager'))
  );
