import type { ReminderProvider } from '../../application/reminder-delivery.js';

export class HttpReminderProvider implements ReminderProvider {
  private readonly endpoint: URL;

  constructor(providerUrl: string) {
    this.endpoint = new URL('/messages', providerUrl);
  }

  async send({ key, to, text }: { key: string; to: string; text: string }) {
    let response: Response;

    try {
      response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ to, text }),
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return 'retry' as const;
    }

    void response.body?.cancel().catch(() => {});
    if (response.status === 200 || response.status === 202) return 'accepted';
    if (response.status >= 500) return 'retry';
    return 'rejected';
  }
}
