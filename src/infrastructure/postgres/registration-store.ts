import type { Pool } from 'pg';
import type { Clinic, ClinicInput, Patient, PatientInput, RegistrationStore } from '../../application/registration.js';

const clinicFields = 'id, name, timezone';
const patientFields = 'id, clinic_id AS "clinicId", name, phone, accepts_reminders AS "acceptsReminders"';

export class PostgresRegistrationStore implements RegistrationStore {
  constructor(private readonly database: Pool) {}

  async insertClinic(input: ClinicInput): Promise<Clinic> {
    const result = await this.database.query<Clinic>(
      `INSERT INTO clinics (name, timezone) VALUES ($1, $2) RETURNING ${clinicFields}`,
      [input.name, input.timezone],
    );

    return result.rows[0]!;
  }

  async insertPatient(input: PatientInput): Promise<Patient> {
    const result = await this.database.query<Patient>(
      `INSERT INTO patients (clinic_id, name, phone, accepts_reminders)
       VALUES ($1, $2, $3, $4) RETURNING ${patientFields}`,
      [input.clinicId, input.name, input.phone, input.acceptsReminders],
    );

    return result.rows[0]!;
  }

  async findClinic(id: string): Promise<Clinic | undefined> {
    const result = await this.database.query<Clinic>(
      `SELECT ${clinicFields} FROM clinics WHERE id = $1`, [id],
    );

    return result.rows[0];
  }

  async findPatient(id: string): Promise<Patient | undefined> {
    const result = await this.database.query<Patient>(
      `SELECT ${patientFields} FROM patients WHERE id = $1`, [id],
    );

    return result.rows[0];
  }
}
