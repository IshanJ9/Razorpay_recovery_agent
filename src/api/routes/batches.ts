import { Router } from 'express';
import { createBatch } from '../../pipeline/createBatch';
import { runBatch } from '../../pipeline/batchRunner';
import { prisma } from '../../db/client';

export const batchesRouter = Router();

batchesRouter.post('/', async (req, res) => {
  const { count, seed, strategy } = req.body;
  if (!Number.isInteger(count) || count <= 0) {
    return res.status(400).json({ error: 'count must be a positive integer' });
  }
  if (!Number.isInteger(seed)) {
    return res.status(400).json({ error: 'seed must be an integer' });
  }
  if (!['AGENT', 'NAIVE', 'BOTH'].includes(strategy)) {
    return res.status(400).json({ error: 'strategy must be AGENT, NAIVE, or BOTH' });
  }
  const batches = await createBatch(count, seed, strategy);
  res.status(201).json({ batches });
});

batchesRouter.post('/:id/run', async (req, res) => {
  await runBatch(req.params.id);
  const batch = await prisma.batch.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ batch });
});

batchesRouter.get('/:id', async (req, res) => {
  const batch = await prisma.batch.findUnique({ where: { id: req.params.id } });
  if (!batch) return res.status(404).json({ error: 'not found' });
  res.json({ batch });
});
