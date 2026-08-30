import { FailureReason } from './failureClassifier';
import { IdealDecision } from './decisionTable';

export function decideNaiveAction(_reason: FailureReason, _attemptNumber: number): IdealDecision {
  return { action: 'RETRY', delayDays: 0, messageSent: false };
}
