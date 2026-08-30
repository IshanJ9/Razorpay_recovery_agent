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
