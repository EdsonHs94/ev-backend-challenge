import { Body, Controller, Get, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Appointments } from '../../application/appointments.js';
import { isoDateTimeWithZone, nonEmptyText, parseBody } from './input.js';

const startsAt = isoDateTimeWithZone.transform((value) => new Date(value));
const newAppointment = z.object({ clinicId: nonEmptyText, patientId: nonEmptyText, startsAt });
const rescheduleAppointment = z.object({ startsAt });

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: Appointments) {}

  @Post()
  create(@Body() body: unknown) {
    return this.appointments.create(parseBody(newAppointment, body));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.appointments.get(readId(id));
  }

  @Patch(':id')
  reschedule(@Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(rescheduleAppointment, body);
    return this.appointments.reschedule(readId(id), input.startsAt);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.appointments.cancel(readId(id));
  }
}

function readId(id: string): string {
  if (!nonEmptyText.safeParse(id).success) throw new NotFoundException('Appointment not found');
  return id;
}
