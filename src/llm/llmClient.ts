import { FailureReason } from '../domain/failureClassifier';
import { Tone } from '../domain/dunningPolicy';

export interface MessageContext {
  reason: FailureReason;
  tone: Tone;
  amountRupees: number;
  isSubscription: boolean;
}

export interface ExplanationContext {
  reason: FailureReason;
  action: string;
  attemptNumber: number;
}

export interface LLMClient {
  draftMessage(ctx: MessageContext): Promise<string>;
  explainDecision(ctx: ExplanationContext): Promise<string>;
}
