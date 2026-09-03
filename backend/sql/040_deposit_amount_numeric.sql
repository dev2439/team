-- Store deposit amounts as fixed-precision decimals (avoid float noise like 5.2000000000003).
ALTER TABLE deposit
  ALTER COLUMN amount TYPE NUMERIC(14, 3)
  USING ROUND(amount::numeric, 3);
