import { parseInboundReply } from '../domain/parse-inbound-reply.js';

export interface InboundNotification {
  messageId: string;
  from: string;
  text: string;
}

export interface ReplyTransaction {
  findLatestAppointment(phone: string): Promise<string | undefined>;
  confirmAppointment(id: string): Promise<void>;
  cancelAppointment(id: string): Promise<void>;
}

export interface InboundReplyStore {
  processOnce(messageId: string, process: (transaction: ReplyTransaction) => Promise<void>): Promise<void>;
}

export class InboundReplies {
  constructor(private readonly store: InboundReplyStore) {}

  handle(notification: InboundNotification): Promise<void> {
    const reply = parseInboundReply(notification.text);

    return this.store.processOnce(notification.messageId, async (transaction) => {
      if (!reply) return;

      const id = await transaction.findLatestAppointment(notification.from);
      if (id === undefined) return;

      if (reply === 'SI') {
        await transaction.confirmAppointment(id);
      } else {
        await transaction.cancelAppointment(id);
      }
    });
  }
}
