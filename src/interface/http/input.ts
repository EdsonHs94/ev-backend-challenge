import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const isoDateTimeWithZone = z.string().toUpperCase().pipe(z.iso.datetime({ offset: true }));

export const nonEmptyText = z.string().min(1).refine((value) => !value.includes('\0'));

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join('.');
    throw new BadRequestException(field ? `Invalid field: ${field}` : 'Invalid request body');
  }

  return result.data;
}
