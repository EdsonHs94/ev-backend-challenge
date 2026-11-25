import { Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';

const { Pool } = pg;

export class Database extends Pool implements OnApplicationShutdown {
  constructor(connectionString: string) {
    super({ connectionString, connectionTimeoutMillis: 2000 });

    const logger = new Logger(Database.name);
    this.on('error', (error) => logger.warn(error.message));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.end();
  }
}
