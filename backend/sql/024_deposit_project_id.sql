-- Replace free-text project_name with project_id (FK). Bid rows keep project_id NULL.
ALTER TABLE deposit
  ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES project (id) ON DELETE CASCADE;

UPDATE deposit d
SET project_id = p.id
FROM project p
WHERE d.project_id IS NULL
  AND p.user_id = d.user_id
  AND p.name = d.project_name;

DELETE FROM deposit
WHERE project_id IS NULL
  AND LOWER(TRIM(project_name)) <> 'bid';

ALTER TABLE deposit
  DROP COLUMN IF EXISTS project_name;

CREATE INDEX IF NOT EXISTS deposit_project_id_idx ON deposit (project_id);
