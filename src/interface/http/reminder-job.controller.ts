import { Controller, HttpCode, Post } from '@nestjs/common';
import { ReminderDelivery } from '../../application/reminder-delivery.js';

@Controller('jobs/reminders')
export class ReminderJobController {
  constructor(private readonly delivery: ReminderDelivery) {}

  @Post('run')
  @HttpCode(200)
  run(): Promise<{ processed: number }> {
    return this.delivery.run();
  }
}
