UPDATE reports
SET image = ''
WHERE image IS NULL;

ALTER TABLE reports
ALTER COLUMN image SET NOT NULL;
