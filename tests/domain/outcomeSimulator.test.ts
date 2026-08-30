import { describe, it, expect } from 'vitest';
import { simulateOutcome } from '../../src/domain/outcomeSimulator';
import { mulberry32 } from '../../src/data/rng';

describe('simulateOutcome', () => {
  it('succeeds at roughly the ground-truth rate when the action matches the ideal one', () => {
    const rng = mulberry32(1234);
    let successes = 0;
    for (let i = 0; i < 5000; i++) {
      if (simulateOutcome(0.8, true, rng) === 'SUCCESS') successes++;
    }
    expect(successes).toBeGreaterThan(3800);
    expect(successes).toBeLessThan(4200);
  });

  it('rarely succeeds when the action does not match the ideal one, regardless of ground truth', () => {
    const rng = mulberry32(5678);
    let successes = 0;
    for (let i = 0; i < 5000; i++) {
      if (simulateOutcome(0.9, false, rng) === 'SUCCESS') successes++;
    }
    expect(successes).toBeLessThan(300);
  });

  it('never succeeds on a mismatched action when groundTruthRecoverable is 0 (e.g. RISK_DECLINED)', () => {
    const rng = mulberry32(91011);
    let successes = 0;
    for (let i = 0; i < 500; i++) {
      if (simulateOutcome(0, false, rng) === 'SUCCESS') successes++;
    }
    expect(successes).toBe(0);
  });
});
