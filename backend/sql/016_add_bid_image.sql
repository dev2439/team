-- Store pasted bid images as text (data URL / base64).
ALTER TABLE bid
  ADD COLUMN IF NOT EXISTS image TEXT NULL;
