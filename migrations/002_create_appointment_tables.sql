-- Up Migration
CREATE TABLE clinics (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name text NOT NULL,
    timezone text NOT NULL
);

CREATE TABLE patients (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    clinic_id text NOT NULL REFERENCES clinics(id),
    name text NOT NULL,
    phone text,
    accepts_reminders boolean NOT NULL,
    UNIQUE (id, clinic_id)
);

CREATE TABLE appointments (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    clinic_id text NOT NULL,
    patient_id text NOT NULL,
    starts_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled')),
    FOREIGN KEY (patient_id, clinic_id) REFERENCES patients(id, clinic_id)
);

CREATE TABLE reminders (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    history_order bigint GENERATED ALWAYS AS IDENTITY,
    appointment_id text NOT NULL REFERENCES appointments(id),
    scheduled_for timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'cancelled')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    sent_at timestamptz,
    skip_reason text CHECK (skip_reason IN ('too_late', 'no_phone', 'opted_out')),
    CHECK ((status = 'skipped') = (skip_reason IS NOT NULL))
);

CREATE INDEX reminders_by_appointment ON reminders (appointment_id, history_order);
CREATE UNIQUE INDEX one_pending_reminder_per_appointment ON reminders (appointment_id) WHERE status = 'pending';

-- Down Migration
DROP TABLE reminders;
DROP TABLE appointments;
DROP TABLE patients;
DROP TABLE clinics;
