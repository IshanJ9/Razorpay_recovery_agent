import { describe, it, expect } from 'vitest';
import { TemplateLLMClient } from '../../src/llm/templateClient';

describe('TemplateLLMClient', () => {
  const client = new TemplateLLMClient();
  const reasons = ['BANK_SERVER_ERROR', 'INSUFFICIENT_FUNDS', 'OTP_FAILED', 'CARD_EXPIRED', 'INVALID_CARD_DETAILS', 'DAILY_LIMIT_EXCEEDED', 'RISK_DECLINED'] as const;

  it('drafts a non-empty, amount-referencing message for every failure reason', async () => {
    for (const reason of reasons) {
      const message = await client.draftMessage({ reason, tone: 'GENTLE', amountRupees: 499, isSubscription: false });
      expect(message.length).toBeGreaterThan(10);
      expect(message).toContain('499');
    }
  });

  it('changes the message prefix as tone escalates', async () => {
    const gentle = await client.draftMessage({ reason: 'CARD_EXPIRED', tone: 'GENTLE', amountRupees: 999, isSubscription: true });
    const final = await client.draftMessage({ reason: 'CARD_EXPIRED', tone: 'FINAL', amountRupees: 999, isSubscription: true });
    expect(gentle).not.toBe(final);
  });

  it('explains a decision for every failure reason', async () => {
    for (const reason of reasons) {
      const explanation = await client.explainDecision({ reason, action: 'RETRY', attemptNumber: 1 });
      expect(explanation.length).toBeGreaterThan(10);
    }
  });
});
