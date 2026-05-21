-- Daily sales report manual entries
-- Automatic sales continue to be derived from orders + order_items.

CREATE TABLE IF NOT EXISTS daily_sales_manual_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_date DATE NOT NULL,
  platform TEXT NOT NULL CHECK (char_length(trim(platform)) > 0),
  model_number TEXT NOT NULL CHECK (char_length(trim(model_number)) > 0),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sales_date, platform, model_number)
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_manual_date
  ON daily_sales_manual_entries(sales_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_sales_manual_platform
  ON daily_sales_manual_entries(platform);

CREATE INDEX IF NOT EXISTS idx_daily_sales_manual_model
  ON daily_sales_manual_entries(model_number);

ALTER TABLE daily_sales_manual_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_daily_sales_manual_entries"
  ON daily_sales_manual_entries
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin_manager_write_daily_sales_manual_entries"
  ON daily_sales_manual_entries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
    )
  );
