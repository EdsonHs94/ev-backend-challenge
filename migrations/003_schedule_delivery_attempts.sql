-- Up Migration
ALTER TABLE reminders ADD COLUMN next_run_at timestamptz;

CREATE INDEX pending_reminders_by_due_time
    ON reminders (COALESCE(next_run_at, scheduled_for), history_order)
    WHERE status = 'pending';

-- Down Migration
DROP INDEX pending_reminders_by_due_time;

ALTER TABLE reminders DROP COLUMN next_run_at;
