-- Convert project.eta from DATE to numeric (ETA is a number, not a date).
-- Kept for migration history; eta column is later removed in 021_drop_project_eta.sql.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'project'
      AND column_name = 'eta'
      AND data_type = 'date'
  ) THEN
    ALTER TABLE project
      ALTER COLUMN eta TYPE DOUBLE PRECISION
      USING 0;
  END IF;
END $$;
