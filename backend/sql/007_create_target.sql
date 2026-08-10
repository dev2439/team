CREATE TYPE target_des AS ENUM ('In', 'UMS', 'Out');

CREATE TABLE IF NOT EXISTS target (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day DATE NOT NULL,
  des target_des NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  UNIQUE (user_id, day, des)
);

CREATE INDEX IF NOT EXISTS target_user_id_idx ON target (user_id);
CREATE INDEX IF NOT EXISTS target_day_idx ON target (day);
