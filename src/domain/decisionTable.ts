import { FailureReason } from './failureClassifier';

export type AgentActionType = 'RETRY' | 'SEND_MESSAGE' | 'ESCALATE';

export interface IdealDecision {
  action: AgentActionType;
  delayDays: number;
  messageSent: boolean;
}

export function decideAgentAction(reason: FailureReason, attemptNumber: number): IdealDecision {
  switch (reason) {
    case 'BANK_SERVER_ERROR':
      return { action: 'RETRY', delayDays: 0, messageSent: false };
    case 'INSUFFICIENT_FUNDS':
      return { action: 'RETRY', delayDays: 3, messageSent: true };
    case 'OTP_FAILED':
      return attemptNumber === 1
        ? { action: 'RETRY', delayDays: 0, messageSent: false }
        : { action: 'SEND_MESSAGE', delayDays: 0, messageSent: true };
    case 'CARD_EXPIRED':
      return { action: 'SEND_MESSAGE', delayDays: 0, messageSent: true };
    case 'INVALID_CARD_DETAILS':
      return { action: 'SEND_MESSAGE', delayDays: 0, messageSent: true };
    case 'DAILY_LIMIT_EXCEEDED':
      return { action: 'RETRY', delayDays: 1, messageSent: false };
    case 'RISK_DECLINED':
      return { action: 'ESCALATE', delayDays: 0, messageSent: false };
  }
}
