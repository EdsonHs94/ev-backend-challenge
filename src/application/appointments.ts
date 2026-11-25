import { scheduleReminder } from '../domain/reminder-scheduling.js';
import type { ReminderSchedule } from '../domain/reminder-scheduling.js';
import { BookingError } from './booking-error.js';
import type { Clock } from './clock.js';
import type { RegistrationStore } from './registration.js';

export interface AppointmentInput {
  clinicId: string;
  patientId: string;
  startsAt: Date;
}

interface AppointmentRecord extends AppointmentInput {
  id: string;
  status: 'scheduled' | 'confirmed' | 'cancelled';
}

export interface Reminder {
  id: string;
  scheduledFor: Date;
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'cancelled';
  attempts: number;
  sentAt: Date | null;
  skipReason: 'too_late' | 'no_phone' | 'opted_out' | null;
}

export interface Appointment extends AppointmentRecord {
  reminders: Reminder[];
}

export interface AppointmentTransaction {
  insertAppointment(input: AppointmentInput): Promise<string>;
  lockAppointment(id: string): Promise<(AppointmentRecord & { timezone: string }) | undefined>;
  rescheduleAppointment(id: string, startsAt: Date): Promise<void>;
  cancelAppointment(id: string): Promise<void>;
  cancelPendingReminder(appointmentId: string): Promise<void>;
  insertReminder(appointmentId: string, schedule: ReminderSchedule): Promise<void>;
  findAppointment(id: string): Promise<Appointment | undefined>;
}

export interface AppointmentStore {
  findAppointment(id: string): Promise<Appointment | undefined>;
  transact<T>(operation: (transaction: AppointmentTransaction) => Promise<T>): Promise<T>;
}

export class Appointments {
  constructor(
    private readonly store: AppointmentStore,
    private readonly registration: Pick<RegistrationStore, 'findClinic' | 'findPatient'>,
    private readonly clock: Clock,
  ) {}

  async create(input: AppointmentInput): Promise<Appointment> {
    const now = await this.clock.now();
    requireFuture(input.startsAt, now);

    const [clinic, patient] = await Promise.all([
      this.registration.findClinic(input.clinicId),
      this.registration.findPatient(input.patientId),
    ]);

    if (!clinic) throw new BookingError('missing', 'Clinic not found');
    if (!patient) throw new BookingError('missing', 'Patient not found');
    if (patient.clinicId !== clinic.id) {
      throw new BookingError('invalid', 'Patient does not belong to the clinic');
    }

    const schedule = scheduleReminder(input.startsAt, clinic.timezone, now);

    return this.store.transact(async (transaction) => {
      const id = await transaction.insertAppointment(input);
      await transaction.insertReminder(id, schedule);
      return requireAppointment(await transaction.findAppointment(id));
    });
  }

  async get(id: string): Promise<Appointment> {
    return requireAppointment(await this.store.findAppointment(id));
  }

  async reschedule(id: string, startsAt: Date): Promise<Appointment> {
    // Sample the clock before acquiring a transaction connection.
    const now = await this.clock.now();
    requireFuture(startsAt, now);

    return this.store.transact(async (transaction) => {
      const appointment = requireAppointment(await transaction.lockAppointment(id));

      if (appointment.status === 'cancelled' || appointment.startsAt <= now) {
        throw new BookingError('conflict', 'Appointment is cancelled or has already started');
      }

      if (appointment.startsAt.getTime() !== startsAt.getTime()) {
        await transaction.rescheduleAppointment(id, startsAt);
        await transaction.cancelPendingReminder(id);
        await transaction.insertReminder(id, scheduleReminder(startsAt, appointment.timezone, now));
      }

      return requireAppointment(await transaction.findAppointment(id));
    });
  }

  cancel(id: string): Promise<Appointment> {
    return this.store.transact(async (transaction) => {
      const appointment = requireAppointment(await transaction.lockAppointment(id));

      if (appointment.status !== 'cancelled') {
        await transaction.cancelAppointment(id);
        await transaction.cancelPendingReminder(id);
      }

      return requireAppointment(await transaction.findAppointment(id));
    });
  }
}

function requireFuture(startsAt: Date, now: Date): void {
  if (startsAt <= now) throw new BookingError('invalid', 'startsAt must be in the future');
}

function requireAppointment<T>(appointment: T | undefined): T {
  if (!appointment) throw new BookingError('missing', 'Appointment not found');
  return appointment;
}
