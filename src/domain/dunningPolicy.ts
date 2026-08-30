import { IdealDecision, AgentActionType } from './decisionTable';

export type Tone = 'GENTLE' | 'FIRM' | 'FINAL';

export interface DunningState {
  attemptNumber: number;
  totalContactsSoFar: number;
  lastContactDay: number | null;
  currentDay: number;
}

export interface FinalDecision {
  action: AgentActionType;
  messageSent: boolean;
  tone: Tone | null;
}

const MAX_ATTEMPTS = 3;
const MAX_TOTAL_CONTACTS = 3;
const TONE_LADDER: Tone[] = ['GENTLE', 'FIRM', 'FINAL'];

function suppressContact(ideal: IdealDecision): FinalDecision {
  if (ideal.action === 'SEND_MESSAGE') {
    return { action: 'ESCALATE', messageSent: false, tone: null };
  }
  return { action: ideal.action, messageSent: false, tone: null };
}

export function applyDunningPolicy(ideal: IdealDecision, state: DunningState): FinalDecision {
  if (state.attemptNumber > MAX_ATTEMPTS) {
    return { action: 'ESCALATE', messageSent: false, tone: null };
  }
  if (ideal.action === 'ESCALATE') {
    return { action: 'ESCALATE', messageSent: false, tone: null };
  }
  if (!ideal.messageSent) {
    return { action: ideal.action, messageSent: false, tone: null };
  }
  if (state.totalContactsSoFar >= MAX_TOTAL_CONTACTS) {
    return suppressContact(ideal);
  }
  if (state.lastContactDay !== null && state.lastContactDay === state.currentDay) {
    return suppressContact(ideal);
  }
  const toneIndex = Math.min(state.totalContactsSoFar, TONE_LADDER.length - 1);
  return { action: ideal.action, messageSent: true, tone: TONE_LADDER[toneIndex] };
}
