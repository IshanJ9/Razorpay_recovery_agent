import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { createBatch } from '../../src/pipeline/createBatch';
import { runBatch } from '../../src/pipeline/batchRunner';

describe('events and audit endpoints', () => {
  it('lists events with their diagnosed failure reason and final status', async () => {
    const [batch] = await createBatch(5, 505, 'AGENT');
    await runBatch(batch.id);

    const res = await request(app).get(`/api/batches/${batch.id}/events`);
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBe(5);
    for (const event of res.body.events) {
      expect(event.failureReason).not.toBeNull();
      expect(['RECOVERED', 'ESCALATED']).toContain(event.status);
    }
  });

  it('returns the ordered audit trail for one event', async () => {
    const [batch] = await createBatch(1, 606, 'AGENT');
    await runBatch(batch.id);
    const eventsRes = await request(app).get(`/api/batches/${batch.id}/events`);
    const eventId = eventsRes.body.events[0].id;

    const res = await request(app).get(`/api/events/${eventId}/audit`);
    expect(res.status).toBe(200);
    expect(res.body.entries[0].step).toBe('DETECTED');
    expect(res.body.entries[1].step).toBe('DIAGNOSED');
    const steps = res.body.entries.map((e: { step: string }) => e.step);
    expect(steps).toContain('TRACKED');
  });
});
