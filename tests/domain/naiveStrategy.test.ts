import { describe, it, expect } from 'vitest';
import { decideNaiveAction } from '../../src/domain/naiveStrategy';

describe('decideNaiveAction', () => {
  it('always retries immediately regardless of failure reason or attempt number', () => {
    const reasons = ['BANK_SERVER_ERROR', 'CARD_EXPIRED', 'RISK_DECLINED', 'INSUFFICIENT_FUNDS'] as const;
    for (const reason of reasons) {
      expect(decideNaiveAction(reason, 1)).toEqual({ action: 'RETRY', delayDays: 0, messageSent: false });
      expect(decideNaiveAction(reason, 2)).toEqual({ action: 'RETRY', delayDays: 0, messageSent: false });
    }
  });
});
