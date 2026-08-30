import { describe, it, expect } from 'vitest';
import { decideAgentAction } from '../../src/domain/decisionTable';

describe('decideAgentAction', () => {
  it('retries transient bank errors same-day with no message', () => {
    expect(decideAgentAction('BANK_SERVER_ERROR', 1)).toEqual({ action: 'RETRY', delayDays: 0, messageSent: false });
  });

  it('delays insufficient-funds retries and sends a reminder', () => {
    expect(decideAgentAction('INSUFFICIENT_FUNDS', 1)).toEqual({ action: 'RETRY', delayDays: 3, messageSent: true });
  });

  it('retries OTP failure once, then falls back to updating payment method', () => {
    expect(decideAgentAction('OTP_FAILED', 1)).toEqual({ action: 'RETRY', delayDays: 0, messageSent: false });
    expect(decideAgentAction('OTP_FAILED', 2)).toEqual({ action: 'SEND_MESSAGE', delayDays: 0, messageSent: true });
  });

  it('never retries an expired card or invalid card details, only prompts for update', () => {
    expect(decideAgentAction('CARD_EXPIRED', 1)).toEqual({ action: 'SEND_MESSAGE', delayDays: 0, messageSent: true });
    expect(decideAgentAction('INVALID_CARD_DETAILS', 1)).toEqual({ action: 'SEND_MESSAGE', delayDays: 0, messageSent: true });
  });

  it('waits a day before retrying a daily limit breach', () => {
    expect(decideAgentAction('DAILY_LIMIT_EXCEEDED', 1)).toEqual({ action: 'RETRY', delayDays: 1, messageSent: false });
  });

  it('escalates risk-declined events immediately, never retries', () => {
    expect(decideAgentAction('RISK_DECLINED', 1)).toEqual({ action: 'ESCALATE', delayDays: 0, messageSent: false });
  });
});
