-- Shared day plans for the Plan dashboard (month → week → day).
CREATE TABLE IF NOT EXISTS plan_item (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'not_done')),
  note TEXT NOT NULL DEFAULT '',
  not_done_reason TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plan_item_not_done_reason_check
    CHECK (
      status <> 'not_done'
      OR length(trim(not_done_reason)) > 0
    )
);

CREATE INDEX IF NOT EXISTS plan_item_plan_date_idx
  ON plan_item (plan_date);

CREATE INDEX IF NOT EXISTS plan_item_user_id_idx
  ON plan_item (user_id);
