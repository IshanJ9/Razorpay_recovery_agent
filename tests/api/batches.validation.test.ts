import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';

describe('POST /api/batches validation', () => {
  it('rejects a non-positive/non-integer count', async () => {
    const res = await request(app)
      .post('/api/batches')
      .send({ count: 0, seed: 1, strategy: 'AGENT' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'count must be a positive integer' });

    const resFloat = await request(app)
      .post('/api/batches')
      .send({ count: 2.5, seed: 1, strategy: 'AGENT' });
    expect(resFloat.status).toBe(400);
    expect(resFloat.body).toEqual({ error: 'count must be a positive integer' });

    const resNegative = await request(app)
      .post('/api/batches')
      .send({ count: -5, seed: 1, strategy: 'AGENT' });
    expect(resNegative.status).toBe(400);
    expect(resNegative.body).toEqual({ error: 'count must be a positive integer' });
  });

  it('rejects a non-integer seed', async () => {
    const res = await request(app)
      .post('/api/batches')
      .send({ count: 5, seed: 1.5, strategy: 'AGENT' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'seed must be an integer' });
  });

  it('rejects an invalid strategy', async () => {
    const res = await request(app)
      .post('/api/batches')
      .send({ count: 5, seed: 1, strategy: 'BOGUS' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'strategy must be AGENT, NAIVE, or BOTH' });
  });
});
