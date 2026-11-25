import { BookingError } from './booking-error.js';

export interface ClinicInput {
  name: string;
  timezone: string;
}

export interface Clinic extends ClinicInput {
  id: string;
}

export interface PatientInput {
  clinicId: string;
  name: string;
  phone: string | null;
  acceptsReminders: boolean;
}

export interface Patient extends PatientInput {
  id: string;
}

export interface RegistrationStore {
  insertClinic(input: ClinicInput): Promise<Clinic>;
  insertPatient(input: PatientInput): Promise<Patient>;
  findClinic(id: string): Promise<Clinic | undefined>;
  findPatient(id: string): Promise<Patient | undefined>;
}

export class Registration {
  constructor(private readonly store: RegistrationStore) {}

  createClinic(input: ClinicInput): Promise<Clinic> {
    return this.store.insertClinic(input);
  }

  async createPatient(input: PatientInput): Promise<Patient> {
    const clinic = await this.store.findClinic(input.clinicId);
    if (!clinic) throw new BookingError('missing', 'Clinic not found');
    return this.store.insertPatient(input);
  }
}
