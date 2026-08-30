import { describe, it, expect } from 'vitest';
import { applyDunningPolicy } from '../../src/domain/dunningPolicy';
import { IdealDecision } from '../../src/domain/decisionTable';

const silentRetry: IdealDecision = { action: 'RETRY', delayDays: 0, messageSent: false };
const retryWithMessage: IdealDecision = { action: 'RETRY', delayDays: 3, messageSent: true };
const sendMessageOnly: IdealDecision = { action: 'SEND_MESSAGE', delayDays: 0, messageSent: true };
const escalate: IdealDecision = { action: 'ESCALATE', delayDays: 0, messageSent: false };

describe('applyDunningPolicy', () => {
  it('forces escalation once the attempt cap (3) is exceeded, regardless of the ideal action', () => {
    const result = applyDunningPolicy(silentRetry, { attemptNumber: 4, totalContactsSoFar: 0, lastContactDay: null, currentDay: 10 });
    expect(result).toEqual({ action: 'ESCALATE', messageSent: false, tone: null });
  });

  it('passes an already-escalate ideal decision straight through', () => {
    const result = applyDunningPolicy(escalate, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: null, currentDay: 0 });
    expect(result).toEqual({ action: 'ESCALATE', messageSent: false, tone: null });
  });

  it('passes a silent retry through unchanged when under all caps', () => {
    const result = applyDunningPolicy(silentRetry, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: null, currentDay: 0 });
    expect(result).toEqual({ action: 'RETRY', messageSent: false, tone: null });
  });

  it('escalates the tone ladder GENTLE -> FIRM -> FINAL as total contacts increase', () => {
    const gentle = applyDunningPolicy(retryWithMessage, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: null, currentDay: 0 });
    expect(gentle).toEqual({ action: 'RETRY', messageSent: true, tone: 'GENTLE' });

    const firm = applyDunningPolicy(retryWithMessage, { attemptNumber: 2, totalContactsSoFar: 1, lastContactDay: 0, currentDay: 3 });
    expect(firm).toEqual({ action: 'RETRY', messageSent: true, tone: 'FIRM' });

    const final = applyDunningPolicy(retryWithMessage, { attemptNumber: 3, totalContactsSoFar: 2, lastContactDay: 3, currentDay: 6 });
    expect(final).toEqual({ action: 'RETRY', messageSent: true, tone: 'FINAL' });
  });

  it('downgrades to a silent retry once the total-contact cap (3) is exhausted, if retrying is still possible', () => {
    const result = applyDunningPolicy(retryWithMessage, { attemptNumber: 4 - 1, totalContactsSoFar: 3, lastContactDay: 6, currentDay: 9 });
    expect(result).toEqual({ action: 'RETRY', messageSent: false, tone: null });
  });

  it('escalates once the total-contact cap is exhausted for a reason whose only recourse is messaging', () => {
    const result = applyDunningPolicy(sendMessageOnly, { attemptNumber: 1, totalContactsSoFar: 3, lastContactDay: 0, currentDay: 0 });
    expect(result).toEqual({ action: 'ESCALATE', messageSent: false, tone: null });
  });

  it('suppresses a same-simulated-day second contact and downgrades to a silent retry when possible', () => {
    const result = applyDunningPolicy(retryWithMessage, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: 0, currentDay: 0 });
    expect(result).toEqual({ action: 'RETRY', messageSent: false, tone: null });
  });

  it('escalates on a same-simulated-day collision for a message-only reason', () => {
    const result = applyDunningPolicy(sendMessageOnly, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: 0, currentDay: 0 });
    expect(result).toEqual({ action: 'ESCALATE', messageSent: false, tone: null });
  });
});
