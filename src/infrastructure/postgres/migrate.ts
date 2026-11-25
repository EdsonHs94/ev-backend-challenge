import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

export async function migrate(connectionString: string, quiet: boolean): Promise<void> {
  await runner({
    databaseUrl: { connectionString, connectionTimeoutMillis: 5000 },
    dir: fileURLToPath(new URL('../../../migrations/', import.meta.url)),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    advisoryLockMode: 'wait',
    log: quiet ? () => {} : undefined,
  });
}
