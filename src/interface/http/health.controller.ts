import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Database } from '../../infrastructure/postgres/database.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: Database) {}

  @Get()
  async check(): Promise<{ status: string }> {
    try {
      const query = { text: 'SELECT 1', query_timeout: 2000 };
      await this.database.query(query);
    } catch {
      throw new ServiceUnavailableException('PostgreSQL is unavailable');
    }

    return { status: 'ok' };
  }
}
