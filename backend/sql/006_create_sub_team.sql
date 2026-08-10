CREATE TABLE IF NOT EXISTS sub_team (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  user_ids INTEGER[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS sub_team_user_ids_gin_idx ON sub_team USING GIN (user_ids);
