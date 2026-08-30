import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('dashboard static files', () => {
  it('serves the dashboard HTML at /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Run Agent vs Naive');
  });
});
