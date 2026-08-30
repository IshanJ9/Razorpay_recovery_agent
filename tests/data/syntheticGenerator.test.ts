import { describe, it, expect } from 'vitest';
import { generateSyntheticEvents, REASON_PROFILES } from '../../src/data/syntheticGenerator';

describe('generateSyntheticEvents', () => {
  it('is deterministic for the same seed', () => {
    const a = generateSyntheticEvents(50, 42);
    const b = generateSyntheticEvents(50, 42);
    expect(a).toEqual(b);
  });

  it('produces different events for a different seed', () => {
    const a = generateSyntheticEvents(50, 42);
    const b = generateSyntheticEvents(50, 43);
    expect(a).not.toEqual(b);
  });

  it('covers every known failure reason across a large sample', () => {
    const events = generateSyntheticEvents(2000, 7);
    const knownCodes = new Set(REASON_PROFILES.flatMap((p) => p.codes.map(([code]) => code)));
    const seenCodes = new Set(events.map((e) => e.gatewayErrorCode));
    for (const profile of REASON_PROFILES) {
      const anyCodeSeen = profile.codes.some(([code]) => seenCodes.has(code));
      expect(anyCodeSeen).toBe(true);
    }
    for (const code of seenCodes) {
      expect(knownCodes.has(code)).toBe(true);
    }
  });

  it('produces positive amounts within realistic bounds for each type', () => {
    const events = generateSyntheticEvents(200, 99);
    for (const e of events) {
      expect(e.amountPaise).toBeGreaterThan(0);
      if (e.type === 'ONE_OFF') {
        expect(e.amountPaise).toBeGreaterThanOrEqual(50000);
        expect(e.amountPaise).toBeLessThanOrEqual(500000);
      } else {
        expect(e.amountPaise).toBeGreaterThanOrEqual(19900);
        expect(e.amountPaise).toBeLessThanOrEqual(199900);
      }
    }
  });
});
