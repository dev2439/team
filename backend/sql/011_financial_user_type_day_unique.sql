ALTER TABLE financial
  ADD COLUMN IF NOT EXISTS day DATE;

UPDATE financial
SET day = created_at::date
WHERE day IS NULL;

ALTER TABLE financial
  ALTER COLUMN day SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS financial_user_type_day_uidx
ON financial (user_id, type, day);
