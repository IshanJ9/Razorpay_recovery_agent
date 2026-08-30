import { mulberry32 } from './rng';

export type EventType = 'ONE_OFF' | 'SUBSCRIPTION';

export interface GeneratedEvent {
  type: EventType;
  amountPaise: number;
  gatewayErrorCode: string;
  gatewayErrorMessage: string;
  groundTruthRecoverable: number;
  customerName: string;
  customerContact: string;
}

interface ReasonProfile {
  reason: string;
  codes: [string, string][];
  recoverableRange: [number, number];
  weight: number;
}

export const REASON_PROFILES: ReasonProfile[] = [
  { reason: 'BANK_SERVER_ERROR', codes: [['BANK_TIMEOUT_502', 'Bank server timed out'], ['GATEWAY_TIMEOUT_504', 'Payment gateway timed out']], recoverableRange: [0.75, 0.95], weight: 0.2 },
  { reason: 'INSUFFICIENT_FUNDS', codes: [['INSUFFICIENT_FUNDS', 'Insufficient balance in account']], recoverableRange: [0.35, 0.55], weight: 0.25 },
  { reason: 'OTP_FAILED', codes: [['OTP_MISMATCH', 'OTP did not match'], ['OTP_TIMEOUT', 'OTP entry timed out']], recoverableRange: [0.5, 0.7], weight: 0.15 },
  { reason: 'CARD_EXPIRED', codes: [['CARD_EXPIRED', 'Card has expired']], recoverableRange: [0.4, 0.6], weight: 0.15 },
  { reason: 'INVALID_CARD_DETAILS', codes: [['CVV_MISMATCH', 'CVV did not match'], ['INVALID_EXPIRY', 'Card expiry details invalid']], recoverableRange: [0.45, 0.65], weight: 0.1 },
  { reason: 'DAILY_LIMIT_EXCEEDED', codes: [['VELOCITY_LIMIT_EXCEEDED', 'Daily transaction limit exceeded']], recoverableRange: [0.6, 0.8], weight: 0.1 },
  { reason: 'RISK_DECLINED', codes: [['RISK_ENGINE_DECLINE', 'Declined by risk engine']], recoverableRange: [0, 0], weight: 0.05 },
];

function pickWeighted(rng: () => number, items: ReasonProfile[]): ReasonProfile {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    if (r < item.weight) return item;
    r -= item.weight;
  }
  return items[items.length - 1];
}

function pickOne<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function generateSyntheticEvents(count: number, seed: number): GeneratedEvent[] {
  const rng = mulberry32(seed);
  const events: GeneratedEvent[] = [];
  for (let i = 0; i < count; i++) {
    const type: EventType = rng() < 0.6 ? 'ONE_OFF' : 'SUBSCRIPTION';
    const amountPaise =
      type === 'ONE_OFF'
        ? Math.floor(50000 + rng() * (500000 - 50000))
        : Math.floor(19900 + rng() * (199900 - 19900));
    const profile = pickWeighted(rng, REASON_PROFILES);
    const [code, message] = pickOne(rng, profile.codes);
    const [lo, hi] = profile.recoverableRange;
    const groundTruthRecoverable = lo + rng() * (hi - lo);
    events.push({
      type,
      amountPaise,
      gatewayErrorCode: code,
      gatewayErrorMessage: message,
      groundTruthRecoverable,
      customerName: `Customer ${i + 1}`,
      customerContact: `customer${i + 1}@example.com`,
    });
  }
  return events;
}
