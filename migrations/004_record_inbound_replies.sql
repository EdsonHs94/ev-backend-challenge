-- Up Migration
CREATE TABLE inbound_message_receipts (
    message_id_hash bytea PRIMARY KEY
);

ALTER TABLE reminders ADD COLUMN sent_order bigint;
CREATE SEQUENCE reminder_sent_order_seq AS bigint OWNED BY reminders.sent_order;

CREATE INDEX patients_by_phone ON patients (phone) WHERE phone IS NOT NULL;
CREATE INDEX appointments_by_patient ON appointments (patient_id);
CREATE INDEX sent_reminders_by_appointment
    ON reminders (appointment_id, sent_at DESC, sent_order DESC NULLS LAST, history_order DESC)
    WHERE status = 'sent' AND sent_at IS NOT NULL;

-- Down Migration
DROP INDEX sent_reminders_by_appointment;
DROP INDEX appointments_by_patient;
DROP INDEX patients_by_phone;
ALTER TABLE reminders DROP COLUMN sent_order;
DROP TABLE inbound_message_receipts;
