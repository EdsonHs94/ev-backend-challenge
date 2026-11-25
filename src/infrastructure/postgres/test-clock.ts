import type { Pool } from 'pg';
import type { AdjustableClock, Clock } from '../../application/clock.js';

export class PostgresTestClock implements AdjustableClock {
  constructor(
    private readonly database: Pool,
    private readonly fallback: Clock,
  ) {}

  async now(): Promise<Date> {
    const result = await this.database.query<{ now: Date }>(
      'SELECT now FROM test_clock WHERE singleton',
    );
    return result.rows[0]?.now ?? this.fallback.now();
  }

  async set(now: Date): Promise<void> {
    await this.database.query(
      `INSERT INTO test_clock (singleton, now) VALUES (true, $1)
       ON CONFLICT (singleton) DO UPDATE SET now = EXCLUDED.now`,
      [now],
    );
  }
}
