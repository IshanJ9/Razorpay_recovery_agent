// tests/pipeline/createBatch.test.ts
import { describe, it, expect } from 'vitest';
import { createBatch } from '../../src/pipeline/createBatch';
import { prisma } from '../../src/db/client';

describe('createBatch', () => {
  it('creates one batch and matching payment events for a single strategy', async () => {
    const [batch] = await createBatch(5, 111, 'AGENT');
    expect(batch.strategy).toBe('AGENT');
    const events = await prisma.paymentEvent.findMany({ where: { batchId: batch.id } });
    expect(events.length).toBe(5);
  });

  it('creates two batches sharing the same seed with identical event sets for "BOTH"', async () => {
    const [agentBatch, naiveBatch] = await createBatch(5, 222, 'BOTH');
    expect(agentBatch.seed).toBe(222);
    expect(naiveBatch.seed).toBe(222);
    expect(agentBatch.strategy).toBe('AGENT');
    expect(naiveBatch.strategy).toBe('NAIVE');

    const agentEvents = await prisma.paymentEvent.findMany({ where: { batchId: agentBatch.id }, orderBy: { createdAt: 'asc' } });
    const naiveEvents = await prisma.paymentEvent.findMany({ where: { batchId: naiveBatch.id }, orderBy: { createdAt: 'asc' } });
    expect(agentEvents.length).toBe(5);
    expect(naiveEvents.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(agentEvents[i].amountPaise).toBe(naiveEvents[i].amountPaise);
      expect(agentEvents[i].gatewayErrorCode).toBe(naiveEvents[i].gatewayErrorCode);
    }
  });
});
