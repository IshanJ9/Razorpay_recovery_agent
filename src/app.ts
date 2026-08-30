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

// Last-resort error handler. Without this, a thrown/rejected error (e.g. runBatch
// dying mid-run) falls through to Express's default HTML 500 page, which the
// dashboard's fetch calls can't distinguish from a real JSON response. Keep the body
// generic — never leak err.stack/err.message to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});
