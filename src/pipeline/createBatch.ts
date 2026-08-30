import { Batch, BatchStrategy } from '@prisma/client';
import { prisma } from '../db/client';
import { generateSyntheticEvents } from '../data/syntheticGenerator';

export type CreateBatchStrategy = 'AGENT' | 'NAIVE' | 'BOTH';

export async function createBatch(count: number, seed: number, strategy: CreateBatchStrategy): Promise<Batch[]> {
  const events = generateSyntheticEvents(count, seed);
  const strategies: BatchStrategy[] = strategy === 'BOTH' ? ['AGENT', 'NAIVE'] : [strategy];
  const batches: Batch[] = [];

  for (const s of strategies) {
    const batch = await prisma.batch.create({
      data: { seed, eventCount: count, strategy: s, status: 'PENDING' },
    });
    for (const ev of events) {
      const customer = await prisma.customer.create({
        data: { name: ev.customerName, contact: ev.customerContact },
      });
      await prisma.paymentEvent.create({
        data: {
          batchId: batch.id,
          customerId: customer.id,
          type: ev.type,
          amountPaise: ev.amountPaise,
          gatewayErrorCode: ev.gatewayErrorCode,
          gatewayErrorMessage: ev.gatewayErrorMessage,
          groundTruthRecoverable: ev.groundTruthRecoverable,
        },
      });
    }
    batches.push(batch);
  }

  return batches;
}
