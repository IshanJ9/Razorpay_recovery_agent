import { describe, it, expect } from 'vitest';
import { createBatch } from '../../src/pipeline/createBatch';
import { runBatch } from '../../src/pipeline/batchRunner';
import { computeReport } from '../../src/api/report';

describe('computeReport', () => {
  it('produces internally consistent totals and breakdowns', async () => {
    const [batch] = await createBatch(20, 404, 'AGENT');
    await runBatch(batch.id);
    const report = await computeReport(batch.id);

    expect(report.atRiskPaise).toBeGreaterThan(0);
    expect(report.recoveredPaise).toBeLessThanOrEqual(report.atRiskPaise);
    expect(report.recoveryRate).toBeGreaterThanOrEqual(0);
    expect(report.recoveryRate).toBeLessThanOrEqual(1);

    const sumByReason = report.byFailureReason.reduce((s, r) => s + r.atRiskPaise, 0);
    expect(sumByReason).toBe(report.atRiskPaise);

    const sumByType = report.byType.reduce((s, r) => s + r.atRiskPaise, 0);
    expect(sumByType).toBe(report.atRiskPaise);

    const countByType = report.byType.reduce((s, r) => s + r.count, 0);
    expect(countByType).toBe(20);
  });
});
