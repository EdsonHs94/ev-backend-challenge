export class BookingError extends Error {
  constructor(
    readonly kind: 'invalid' | 'missing' | 'conflict',
    message: string,
  ) {
    super(message);
    this.name = 'BookingError';
  }
}
