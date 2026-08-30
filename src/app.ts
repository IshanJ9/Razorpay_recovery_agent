import express from 'express';
import path from 'path';
import { batchesRouter } from './api/routes/batches';
import { eventsRouter } from './api/routes/events';

export const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/batches', batchesRouter);
app.use('/api/events', eventsRouter);
