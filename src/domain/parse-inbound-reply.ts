export type Reply = 'SI' | 'NO';

const replyPattern = /^[\p{White_Space}\p{P}\p{S}]*(SI|NO)[\p{White_Space}\p{P}\p{S}]*$/u;

export function parseInboundReply(text: string): Reply | undefined {
  const normalized = text.normalize('NFD').replace(/\p{Mark}/gu, '').toUpperCase();
  const reply = replyPattern.exec(normalized)?.[1];

  if (reply === 'SI' || reply === 'NO') return reply;
  return undefined;
}
