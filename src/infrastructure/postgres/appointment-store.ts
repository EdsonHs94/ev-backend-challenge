import type { Pool, PoolClient } from 'pg';
import type {
  Appointment, AppointmentInput, AppointmentStore, AppointmentTransaction,
} from '../../application/appointments.js';
import type { ReminderSchedule } from '../../domain/reminder-scheduling.js';
import { withTransaction } from './transaction.js';

type AppointmentRecord = Omit<Appointment, 'reminders'>;
type Sql = Pick<Pool, 'query'>;
type SnapshotRow = AppointmentRecord & {
  history: Array<Omit<Appointment['reminders'][number], 'scheduledFor' | 'sentAt'> & {
    scheduledFor: string;
    sentAt: string | null;
  }>;
};

const appointmentFields = 'a.id, a.clinic_id AS "clinicId", a.patient_id AS "patientId", a.starts_at AS "startsAt", a.status';

export class PostgresAppointmentStore implements AppointmentStore {
  constructor(private readonly database: Pool) {}

  findAppointment(id: string): Promise<Appointment | undefined> {
    return findAppointment(this.database, id);
  }

  transact<T>(operation: (transaction: AppointmentTransaction) => Promise<T>): Promise<T> {
    return withTransaction(this.database, (client) => operation(new PostgresAppointmentTransaction(client)));
  }
}

class PostgresAppointmentTransaction implements AppointmentTransaction {
  constructor(private readonly client: PoolClient) {}

  async insertAppointment(input: AppointmentInput): Promise<string> {
    const result = await this.client.query<{ id: string }>(
      'INSERT INTO appointments (clinic_id, patient_id, starts_at) VALUES ($1, $2, $3) RETURNING id',
      [input.clinicId, input.patientId, input.startsAt],
    );

    return result.rows[0]!.id;
  }

  async lockAppointment(id: string): Promise<(AppointmentRecord & { timezone: string }) | undefined> {
    const result = await this.client.query<AppointmentRecord & { timezone: string }>(
      `SELECT ${appointmentFields}, c.timezone FROM appointments a
       JOIN clinics c ON c.id = a.clinic_id WHERE a.id = $1 FOR UPDATE OF a`,
      [id],
    );

    return result.rows[0];
  }

  async rescheduleAppointment(id: string, startsAt: Date): Promise<void> {
    await this.client.query(
      "UPDATE appointments SET starts_at = $2, status = 'scheduled' WHERE id = $1", [id, startsAt],
    );
  }

  async cancelAppointment(id: string): Promise<void> {
    await this.client.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [id]);
  }

  async cancelPendingReminder(appointmentId: string): Promise<void> {
    await this.client.query(
      "UPDATE reminders SET status = 'cancelled' WHERE appointment_id = $1 AND status = 'pending'",
      [appointmentId],
    );
  }

  async insertReminder(appointmentId: string, schedule: ReminderSchedule): Promise<void> {
    await this.client.query(
      'INSERT INTO reminders (appointment_id, scheduled_for, status, skip_reason) VALUES ($1, $2, $3, $4)',
      [appointmentId, schedule.scheduledFor, schedule.status, schedule.skipReason],
    );
  }

  findAppointment(id: string): Promise<Appointment | undefined> {
    return findAppointment(this.client, id);
  }
}

async function findAppointment(sql: Sql, id: string): Promise<Appointment | undefined> {
  const result = await sql.query<SnapshotRow>(
    `SELECT ${appointmentFields},
       COALESCE(json_agg(json_build_object(
         'id', r.id,
         'scheduledFor', r.scheduled_for,
         'status', r.status,
         'attempts', r.attempts,
         'sentAt', r.sent_at,
         'skipReason', r.skip_reason
       ) ORDER BY r.history_order) FILTER (WHERE r.id IS NOT NULL), '[]'::json) AS history
     FROM appointments a
     LEFT JOIN reminders r ON r.appointment_id = a.id
     WHERE a.id = $1
     GROUP BY a.id`,
    [id],
  );

  const row = result.rows[0];
  if (!row) return undefined;

  const { history, ...appointment } = row;
  return {
    ...appointment,
    reminders: history.map((reminder) => ({
      ...reminder,
      scheduledFor: new Date(reminder.scheduledFor),
      sentAt: reminder.sentAt === null ? null : new Date(reminder.sentAt),
    })),
  };
}
