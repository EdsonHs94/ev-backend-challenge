import { BadRequestException, Body, Controller, HttpCode, Inject, Put } from '@nestjs/common';
import { z } from 'zod';
import { CLOCK } from '../../application/clock.js';
import type { AdjustableClock } from '../../application/clock.js';
import { isoDateTimeWithZone } from './input.js';

const clockInput = z.object({
  now: isoDateTimeWithZone,
});

@Controller('test/clock')
export class TestClockController {
  constructor(@Inject(CLOCK) private readonly clock: AdjustableClock) {}

  @Put()
  @HttpCode(204)
  async set(@Body() body: unknown): Promise<void> {
    const input = clockInput.safeParse(body);

    if (!input.success) {
      throw new BadRequestException('now must be an ISO 8601 date-time with a timezone');
    }

    await this.clock.set(new Date(input.data.now));
  }
}
