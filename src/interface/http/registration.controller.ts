import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { Registration } from '../../application/registration.js';
import { nonEmptyText, parseBody } from './input.js';

const timeZone = z.string().refine((zone) => {
  if (/^[+-]/.test(zone)) return false;

  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
});

const clinicBody = z.object({
  name: nonEmptyText,
  timezone: timeZone,
});

const patientBody = z.object({
  clinicId: nonEmptyText,
  name: nonEmptyText,
  phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).nullable().optional(),
  acceptsReminders: z.boolean(),
});

@Controller()
export class RegistrationController {
  constructor(private readonly registration: Registration) {}

  @Post('clinics')
  createClinic(@Body() body: unknown) {
    return this.registration.createClinic(parseBody(clinicBody, body));
  }

  @Post('patients')
  createPatient(@Body() body: unknown) {
    const input = parseBody(patientBody, body);
    return this.registration.createPatient({ ...input, phone: input.phone ?? null });
  }
}
