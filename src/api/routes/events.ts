import { Router } from 'express';
import { prisma } from '../../db/client';

export const eventsRouter = Router();

eventsRouter.get('/:id/audit', async (req, res) => {
  const entries = await prisma.auditLogEntry.findMany({
    where: { eventId: req.params.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ entries });
});
