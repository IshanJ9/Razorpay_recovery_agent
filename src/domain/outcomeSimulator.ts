const MISMATCHED_ACTION_FLOOR = 0.02;

export function simulateOutcome(
  groundTruthRecoverable: number,
  actionMatchesIdeal: boolean,
  rng: () => number
): 'SUCCESS' | 'FAILURE' {
  const successProbability = actionMatchesIdeal ? groundTruthRecoverable : MISMATCHED_ACTION_FLOOR;
  return rng() < successProbability ? 'SUCCESS' : 'FAILURE';
}
