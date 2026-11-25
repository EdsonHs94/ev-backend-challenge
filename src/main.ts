import { startApi } from './api.js';

const { DATABASE_URL, CLOCK_MODE } = process.env;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const app = await startApi({ databaseUrl: DATABASE_URL, clockMode: CLOCK_MODE, port: 3000 });
app.enableShutdownHooks();
