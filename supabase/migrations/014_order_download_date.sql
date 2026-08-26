-- ─── Order download / processing date ───
--
-- OrderStream (CommerceHub) exports carry a "Download Date/Time" — the moment we
-- pulled the order into our system. That is the day we actually process the
-- order, which can differ from the merchant's order date (e.g. an order placed
-- late on the 24th is downloaded on the 25th). Sales reports bucket by this
-- processing day rather than the raw order date.

ALTER TABLE orders ADD COLUMN download_date TIMESTAMPTZ;

-- Calendar day an order counts toward in reports: the download day when known,
-- otherwise the order day. Kept as a plain DATE so report queries compare by
-- calendar day with no timezone math. Maintained by a trigger (below) so every
-- insert path — OrderStream import, channel sync, manual — stays consistent.
ALTER TABLE orders ADD COLUMN report_date DATE;

CREATE OR REPLACE FUNCTION set_order_report_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.report_date := (COALESCE(NEW.download_date, NEW.order_date) AT TIME ZONE 'UTC')::date;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_order_report_date
  BEFORE INSERT OR UPDATE OF download_date, order_date ON orders
  FOR EACH ROW EXECUTE FUNCTION set_order_report_date();

-- Backfill existing rows (no download timestamp yet → order date).
UPDATE orders
  SET report_date = (order_date AT TIME ZONE 'UTC')::date
  WHERE report_date IS NULL;

CREATE INDEX idx_orders_report_date ON orders(report_date DESC);
CREATE INDEX idx_orders_download_date ON orders(download_date DESC);
