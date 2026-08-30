import express from 'express';
import { batchesRouter } from './api/routes/batches';

export const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/batches', batchesRouter);
