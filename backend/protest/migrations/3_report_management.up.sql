ALTER TABLE reports
ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high'));

ALTER TABLE reports
ADD COLUMN admin_notes TEXT NOT NULL DEFAULT '';

CREATE INDEX reports_status_priority_created_at_idx ON reports (status, priority, created_at DESC);
