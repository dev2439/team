-- Scope: day (default), week, or month plan items.
ALTER TABLE plan_item
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'day';

ALTER TABLE plan_item
  DROP CONSTRAINT IF EXISTS plan_item_scope_check;

ALTER TABLE plan_item
  ADD CONSTRAINT plan_item_scope_check
  CHECK (scope IN ('day', 'week', 'month'));

CREATE INDEX IF NOT EXISTS plan_item_scope_plan_date_idx
  ON plan_item (scope, plan_date);
