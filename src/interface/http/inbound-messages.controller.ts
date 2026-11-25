import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { InboundReplies } from '../../application/inbound-replies.js';
import { isoDateTimeWithZone, parseBody } from './input.js';

const inboundMessage = z.object({
  messageId: z.string(),
  from: z.string(),
  text: z.string(),
  receivedAt: isoDateTimeWithZone,
});

@Controller('webhooks/inbound-messages')
export class InboundMessagesController {
  constructor(private readonly replies: InboundReplies) {}

  @Post()
  @HttpCode(200)
  handle(@Body() body: unknown): Promise<void> {
    return this.replies.handle(parseBody(inboundMessage, body));
  }
}
