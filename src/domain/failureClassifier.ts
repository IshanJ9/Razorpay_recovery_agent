import { REASON_PROFILES } from '../data/syntheticGenerator';

export type FailureReason =
  | 'BANK_SERVER_ERROR'
  | 'INSUFFICIENT_FUNDS'
  | 'OTP_FAILED'
  | 'CARD_EXPIRED'
  | 'INVALID_CARD_DETAILS'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'RISK_DECLINED';

const CODE_TO_REASON: Record<string, FailureReason> = {};
for (const profile of REASON_PROFILES) {
  for (const [code] of profile.codes) {
    CODE_TO_REASON[code] = profile.reason as FailureReason;
  }
}

export function classifyFailure(gatewayErrorCode: string): FailureReason {
  const reason = CODE_TO_REASON[gatewayErrorCode];
  if (!reason) {
    throw new Error(`Unknown gateway error code: ${gatewayErrorCode}`);
  }
  return reason;
}
