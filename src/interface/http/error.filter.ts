import { Catch, HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { BookingError } from '../../application/booking-error.js';

const bookingStatus = { invalid: 400, missing: 404, conflict: 409 };

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const { httpAdapter } = this.adapterHost;

    if (exception instanceof HttpException) {
      httpAdapter.reply(response, { error: exception.message }, exception.getStatus());
      return;
    }

    if (exception instanceof BookingError) {
      httpAdapter.reply(response, { error: exception.message }, bookingStatus[exception.kind]);
      return;
    }

    this.logger.error(exception);
    httpAdapter.reply(response, { error: 'Internal server error' }, 500);
  }
}
