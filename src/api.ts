import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { Appointments } from './application/appointments.js';
import { CLOCK } from './application/clock.js';
import type { Clock } from './application/clock.js';
import { Registration } from './application/registration.js';
import { PostgresAppointmentStore } from './infrastructure/postgres/appointment-store.js';
import { Database } from './infrastructure/postgres/database.js';
import { migrate } from './infrastructure/postgres/migrate.js';
import { PostgresRegistrationStore } from './infrastructure/postgres/registration-store.js';
import { PostgresTestClock } from './infrastructure/postgres/test-clock.js';
import { systemClock } from './infrastructure/system-clock.js';
import { AppointmentsController } from './interface/http/appointments.controller.js';
import { HttpErrorFilter } from './interface/http/error.filter.js';
import { HealthController } from './interface/http/health.controller.js';
import { RegistrationController } from './interface/http/registration.controller.js';
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
    controllers: [
      HealthController,
      RegistrationController,
      AppointmentsController,
      ...(testMode ? [TestClockController] : []),
    ],
    providers: [
      { provide: Database, useFactory: () => new Database(databaseUrl) },
      {
        provide: CLOCK,
        inject: [Database],
        useFactory: (database: Database) => (
          testMode ? new PostgresTestClock(database, systemClock) : systemClock
        ),
      },
      {
        provide: PostgresRegistrationStore,
        inject: [Database],
        useFactory: (database: Database) => new PostgresRegistrationStore(database),
      },
      {
        provide: Registration,
        inject: [PostgresRegistrationStore],
        useFactory: (store: PostgresRegistrationStore) => new Registration(store),
      },
      {
        provide: Appointments,
        inject: [Database, PostgresRegistrationStore, CLOCK],
        useFactory: (database: Database, registration: PostgresRegistrationStore, clock: Clock) => (
          new Appointments(new PostgresAppointmentStore(database), registration, clock)
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
