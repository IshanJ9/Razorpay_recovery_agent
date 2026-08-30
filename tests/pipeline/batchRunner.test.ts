// tests/pipeline/batchRunner.test.ts
import { describe, it, expect } from 'vitest';
import { createBatch } from '../../src/pipeline/createBatch';
import { runBatch } from '../../src/pipeline/batchRunner';
import { prisma } from '../../src/db/client';

describe('runBatch', () => {
  it('resolves every event to RECOVERED or ESCALATED and respects the compliance caps', async () => {
    const [batch] = await createBatch(20, 101, 'AGENT');
    await runBatch(batch.id);

    const events = await prisma.paymentEvent.findMany({
      where: { batchId: batch.id },
      include: { attempts: true },
    });
    expect(events.length).toBe(20);
    for (const event of events) {
      expect(['RECOVERED', 'ESCALATED']).toContain(event.status);
      expect(event.failureReason).not.toBeNull();
      expect(event.attempts.length).toBeLessThanOrEqual(3);
      const messageCount = event.attempts.filter((a) => a.messageSent).length;
      expect(messageCount).toBeLessThanOrEqual(3);
    }

    const updatedBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(updatedBatch.status).toBe('COMPLETE');
  });

  it('the tailored agent strategy recovers at least as much ₹ value as the naive retry-everything baseline on the same synthetic batch', async () => {
    const [agentBatch, naiveBatch] = await createBatch(100, 202, 'BOTH');
    await runBatch(agentBatch.id);
    await runBatch(naiveBatch.id);

    const sumRecoveredPaise = async (batchId: string) => {
      const recovered = await prisma.paymentEvent.findMany({ where: { batchId, status: 'RECOVERED' } });
      return recovered.reduce((sum, e) => sum + e.amountPaise, 0);
    };

    const agentRecovered = await sumRecoveredPaise(agentBatch.id);
    const naiveRecovered = await sumRecoveredPaise(naiveBatch.id);

    expect(agentRecovered).toBeGreaterThanOrEqual(naiveRecovered);

    // Margin assertion: a regression that collapses the two strategies to a near-tie
    // (e.g. accidentally routing both through the same decision table) should fail
    // loudly rather than sneak by on a >= check.
    expect(agentRecovered).toBeGreaterThan(naiveRecovered * 1.05);

    // Mechanism assertion: the agent's advantage should be demonstrable specifically on
    // the failure reasons where its tailored action differs from "always retry"
    // (CARD_EXPIRED and INVALID_CARD_DETAILS both call for SEND_MESSAGE, not RETRY) --
    // this proves the "diagnose before acting" thesis mechanistically, not just in
    // aggregate ₹ recovered.
    const agentEvents = await prisma.paymentEvent.findMany({ where: { batchId: agentBatch.id } });
    const naiveEvents = await prisma.paymentEvent.findMany({ where: { batchId: naiveBatch.id } });

    const recoveryRateByReason = (events: typeof agentEvents, reason: string) => {
      const subset = events.filter((e) => e.failureReason === reason);
      if (subset.length === 0) return 0;
      const recoveredCount = subset.filter((e) => e.status === 'RECOVERED').length;
      return recoveredCount / subset.length;
    };

    for (const reason of ['CARD_EXPIRED', 'INVALID_CARD_DETAILS']) {
      const agentRate = recoveryRateByReason(agentEvents, reason);
      const naiveRate = recoveryRateByReason(naiveEvents, reason);
      expect(agentRate).toBeGreaterThan(naiveRate);
    }

    // Some events should reach ESCALATED (e.g. RISK_DECLINED events, or anything that
    // exhausts its attempts), and no event should exceed the 3-attempt compliance cap.
    const escalatedCount = agentEvents.filter((e) => e.status === 'ESCALATED').length;
    expect(escalatedCount).toBeGreaterThan(0);

    const agentEventsWithAttempts = await prisma.paymentEvent.findMany({
      where: { batchId: agentBatch.id },
      include: { attempts: true },
    });
    for (const event of agentEventsWithAttempts) {
      expect(event.attempts.length).toBeLessThanOrEqual(3);
    }
  });

  it('records a full DETECTED -> DIAGNOSED -> ... audit trail for every event', async () => {
    const [batch] = await createBatch(3, 303, 'AGENT');
    await runBatch(batch.id);
    const events = await prisma.paymentEvent.findMany({ where: { batchId: batch.id } });
    for (const event of events) {
      const entries = await prisma.auditLogEntry.findMany({
        where: { eventId: event.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries[0].step).toBe('DETECTED');
      expect(entries[1].step).toBe('DIAGNOSED');
      expect(entries.length).toBeGreaterThanOrEqual(4);
    }
  });
});
