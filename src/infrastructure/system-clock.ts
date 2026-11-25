import type { Clock } from '../application/clock.js';

export const systemClock: Clock = {
  async now() {
    return new Date();
  },
};
