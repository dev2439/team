-- BigBoss publishes Test Result proposal list for Member / SubBoss / Tester.
ALTER TABLE bid_test
  ADD COLUMN IF NOT EXISTS results_visible BOOLEAN NOT NULL DEFAULT FALSE;
