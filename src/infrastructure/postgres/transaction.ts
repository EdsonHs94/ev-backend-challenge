import type { Pool, PoolClient } from 'pg';

export async function withTransaction<T>(
  database: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database.connect();
  let discardClient = false;
  const onClientError = () => { discardClient = true; };
  client.on('error', onClientError);

  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discardClient = true;
    }
    throw error;
  } finally {
    client.release(discardClient);
    client.off('error', onClientError);
  }
}
