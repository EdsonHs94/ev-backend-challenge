import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { CLOCK } from './application/clock.js';
import { Database } from './infrastructure/postgres/database.js';
import { migrate } from './infrastructure/postgres/migrate.js';
import { PostgresTestClock } from './infrastructure/postgres/test-clock.js';
import { systemClock } from './infrastructure/system-clock.js';
import { HttpErrorFilter } from './interface/http/error.filter.js';
import { HealthController } from './interface/http/health.controller.js';
import { TestClockController } from './interface/http/test-clock.controller.js';

interface ApiOptions {
  databaseUrl: string;
  clockMode?: string;
  port: number;
  quiet?: boolean;
}

export async function startApi({ databaseUrl, clockMode, port, quiet = false }: ApiOptions) {
  await migrate(databaseUrl, quiet);
  const testMode = clockMode === 'test';

  @Module({
    controllers: testMode ? [HealthController, TestClockController] : [HealthController],
    providers: [
      { provide: Database, useFactory: () => new Database(databaseUrl) },
      {
        provide: CLOCK,
        inject: [Database],
        useFactory: (database: Database) => (
          testMode ? new PostgresTestClock(database, systemClock) : systemClock
        ),
      },
    ],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
    logger: quiet ? false : undefined,
  });
  app.useGlobalFilters(new HttpErrorFilter(app.get(HttpAdapterHost)));

  try {
    await app.listen(port, '0.0.0.0');
  } catch (error) {
    await app.close();
    throw error;
  }

  return app;
}
