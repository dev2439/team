-- Keep one row per (user_id, project_id): newest wins, then update amount path works.
DELETE FROM eta a
USING eta b
WHERE a.user_id = b.user_id
  AND a.project_id = b.project_id
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS eta_user_project_uidx
  ON eta (user_id, project_id);
