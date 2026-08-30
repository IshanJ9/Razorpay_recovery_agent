import { describe, it, expect } from 'vitest';
import { classifyFailure } from '../../src/domain/failureClassifier';

describe('classifyFailure', () => {
  it.each([
    ['BANK_TIMEOUT_502', 'BANK_SERVER_ERROR'],
    ['GATEWAY_TIMEOUT_504', 'BANK_SERVER_ERROR'],
    ['INSUFFICIENT_FUNDS', 'INSUFFICIENT_FUNDS'],
    ['OTP_MISMATCH', 'OTP_FAILED'],
    ['OTP_TIMEOUT', 'OTP_FAILED'],
    ['CARD_EXPIRED', 'CARD_EXPIRED'],
    ['CVV_MISMATCH', 'INVALID_CARD_DETAILS'],
    ['INVALID_EXPIRY', 'INVALID_CARD_DETAILS'],
    ['VELOCITY_LIMIT_EXCEEDED', 'DAILY_LIMIT_EXCEEDED'],
    ['RISK_ENGINE_DECLINE', 'RISK_DECLINED'],
  ])('maps %s to %s', (code, expected) => {
    expect(classifyFailure(code)).toBe(expected);
  });

  it('throws on an unknown code', () => {
    expect(() => classifyFailure('SOMETHING_UNKNOWN')).toThrow();
  });
});
