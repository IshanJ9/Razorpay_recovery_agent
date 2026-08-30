import { AttemptAction, AttemptOutcome, AuditStep, EventStatus } from '@prisma/client';
import { prisma } from '../db/client';
import { mulberry32 } from '../data/rng';
import { classifyFailure } from '../domain/failureClassifier';
import { decideAgentAction } from '../domain/decisionTable';
import { decideNaiveAction } from '../domain/naiveStrategy';
import { applyDunningPolicy, DunningState } from '../domain/dunningPolicy';
import { simulateOutcome } from '../domain/outcomeSimulator';
import { getLLMClient } from '../llm';

const MAX_LOOP_SAFETY = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const llm = getLLMClient();

function addAuditEntry(eventId: string, step: AuditStep, detail: unknown, simulatedAt: Date) {
  return prisma.auditLogEntry.create({
    data: { eventId, step, detail: detail as any, createdAt: simulatedAt },
  });
}

// A transient hiccup calling a real LLM API (rate limit, timeout, network blip) should
// degrade this one event's message/explanation gracefully rather than throwing and
// killing the entire batch run (which would trip the FAILED-status path above for what
// is often a recoverable, one-off failure).
async function safeDraftMessage(...args: Parameters<typeof llm.draftMessage>): Promise<string> {
  try {
    return await llm.draftMessage(...args);
  } catch (err) {
    console.error('draftMessage failed, falling back to template text:', err);
    return '[message drafting unavailable]';
  }
}

async function safeExplainDecision(...args: Parameters<typeof llm.explainDecision>): Promise<string> {
  try {
    return await llm.explainDecision(...args);
  } catch (err) {
    console.error('explainDecision failed, falling back to template text:', err);
    return '[explanation unavailable]';
  }
}

export async function runBatch(batchId: string): Promise<void> {
  const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
  await prisma.batch.update({ where: { id: batchId }, data: { status: 'RUNNING' } });

  try {
    await runBatchInner(batch, batchId);
  } catch (err) {
    await prisma.batch.update({ where: { id: batchId }, data: { status: 'FAILED' } });
    throw err;
  }
}

async function runBatchInner(batch: { seed: number; strategy: 'AGENT' | 'NAIVE' }, batchId: string): Promise<void> {
  // Order deterministically: without an explicit orderBy, Postgres does not guarantee
  // row order, which would silently break the seeded RNG's pairing between the AGENT
  // and NAIVE batches of a 'BOTH' run (both share `batch.seed`, so reproducibility and
  // the fairness of the naive-vs-agent comparison depend on processing events in the
  // same (creation) order every time). A compound sort with `id` as tiebreaker guards
  // against same-millisecond `createdAt` collisions from the sequential batch-insert loop.
  const events = await prisma.paymentEvent.findMany({
    where: { batchId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const rng = mulberry32(batch.seed + 1);

  for (const event of events) {
    // Multiple audit steps can share the same simulated "day" (e.g. DETECTED and
    // DIAGNOSED both happen on day 0). AuditLogEntry.createdAt drives the audit
    // trail's ORDER BY, so give same-day entries a strictly increasing millisecond
    // offset — otherwise ties leave the read-back order to Postgres's discretion,
    // which is not guaranteed to match insertion order under concurrent load.
    let auditSeq = 0;
    const stampAudit = (base: Date): Date => {
      const stamped = new Date(base.getTime() + auditSeq);
      auditSeq += 1;
      return stamped;
    };

    await addAuditEntry(event.id, 'DETECTED', {
      gatewayErrorCode: event.gatewayErrorCode,
      gatewayErrorMessage: event.gatewayErrorMessage,
    }, stampAudit(event.createdAt));

    const reason = classifyFailure(event.gatewayErrorCode);
    await prisma.paymentEvent.update({ where: { id: event.id }, data: { failureReason: reason } });
    await addAuditEntry(event.id, 'DIAGNOSED', { failureReason: reason }, stampAudit(event.createdAt));

    let currentDay = 0;
    let totalContacts = 0;
    let lastContactDay: number | null = null;
    let attemptNumber = 1;
    let finalStatus: EventStatus = 'ESCALATED';

    while (attemptNumber <= MAX_LOOP_SAFETY) {
      const ideal = batch.strategy === 'AGENT' ? decideAgentAction(reason, attemptNumber) : decideNaiveAction(reason, attemptNumber);
      const trueIdeal = decideAgentAction(reason, attemptNumber);

      const state: DunningState = { attemptNumber, totalContactsSoFar: totalContacts, lastContactDay, currentDay };
      const final = applyDunningPolicy(ideal, state);
      const simulatedAt = new Date(event.createdAt.getTime() + currentDay * MS_PER_DAY);

      await addAuditEntry(event.id, 'DECIDED', { attemptNumber, action: final.action, tone: final.tone }, stampAudit(simulatedAt));

      if (final.action === 'ESCALATE') {
        const explanation = await safeExplainDecision({ reason, action: 'ESCALATE', attemptNumber });
        await addAuditEntry(event.id, 'ACTED', { action: 'ESCALATE', explanation }, stampAudit(simulatedAt));
        await addAuditEntry(event.id, 'TRACKED', { outcome: 'ESCALATED' }, stampAudit(simulatedAt));
        finalStatus = 'ESCALATED';
        break;
      }

      let messageText: string | null = null;
      if (final.messageSent) {
        messageText = await safeDraftMessage({
          reason,
          tone: final.tone!,
          amountRupees: event.amountPaise / 100,
          isSubscription: event.type === 'SUBSCRIPTION',
        });
        totalContacts += 1;
        lastContactDay = currentDay;
      }
      const explanation = await safeExplainDecision({ reason, action: final.action, attemptNumber });
      await addAuditEntry(event.id, 'ACTED', { action: final.action, messageText, explanation }, stampAudit(simulatedAt));

      const actionMatchesIdeal = final.action === trueIdeal.action;
      const outcome = simulateOutcome(event.groundTruthRecoverable, actionMatchesIdeal, rng);

      await prisma.retryAttempt.create({
        data: {
          eventId: event.id,
          attemptNumber,
          action: final.action as AttemptAction,
          messageSent: final.messageSent,
          scheduledFor: simulatedAt,
          executedAt: simulatedAt,
          outcome: outcome as AttemptOutcome,
        },
      });
      await addAuditEntry(event.id, 'TRACKED', { outcome }, stampAudit(simulatedAt));

      if (outcome === 'SUCCESS') {
        finalStatus = 'RECOVERED';
        break;
      }

      currentDay += ideal.delayDays;
      attemptNumber += 1;
    }

    await prisma.paymentEvent.update({ where: { id: event.id }, data: { status: finalStatus } });
  }

  await prisma.batch.update({ where: { id: batchId }, data: { status: 'COMPLETE' } });
}
