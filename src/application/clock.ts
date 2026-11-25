export const CLOCK = Symbol('Clock');

export interface Clock {
  now(): Promise<Date>;
}

export interface AdjustableClock extends Clock {
  set(now: Date): Promise<void>;
}
