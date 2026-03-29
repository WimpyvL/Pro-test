DROP INDEX IF EXISTS reports_status_priority_created_at_idx;

ALTER TABLE reports
DROP COLUMN IF EXISTS admin_notes;

ALTER TABLE reports
DROP COLUMN IF EXISTS priority;
