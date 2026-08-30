# System Flow

This document walks through how a payment failure moves through the system, end to end: from synthetic generation, through the recovery pipeline, to what a person sees on the dashboard.

## 1. High-level pipeline

The whole project implements one loop, applied to every failed payment event:

```
DETECT  ->  DIAGNOSE  ->  DECIDE  ->  ACT  ->  TRACK
```

- **Detect** — a payment failure exists (in this project, synthetically generated rather than received from a real gateway).
- **Diagnose** — classify *why* it failed (bank timeout? expired card? insufficient funds?).
- **Decide** — pick the right response for that specific reason, subject to compliance limits.
- **Act** — carry out the decision (retry the payment, send a message, or escalate to a human).
- **Track** — record the outcome and repeat, or stop.

Every one of these five steps is written as an `AuditLogEntry` row, so the full history for any single event can be reconstructed later.

## 2. Generating the synthetic dataset

**File:** `src/data/syntheticGenerator.ts`, seeded by `src/data/rng.ts` (`mulberry32`)

```
generateSyntheticEvents(count, seed)
  for each of `count` events:
    1. pick event type      -> ONE_OFF (60%) or SUBSCRIPTION (40%)
    2. pick an amount       -> ₹500-5000 (one-off) or ₹199-1999 (subscription), in paise
    3. pick a failure reason -> weighted draw over 7 reasons (REASON_PROFILES)
    4. pick a gateway error code/message for that reason
    5. draw a hidden groundTruthRecoverable probability from that reason's range
  return the list of GeneratedEvent objects
```

`mulberry32(seed)` returns a deterministic pseudo-random generator: the exact same `(count, seed)` always produces byte-identical events. `groundTruthRecoverable` is never shown anywhere — it's the hidden "ground truth" the outcome simulator uses later to decide whether an action actually succeeds.

**The seven failure reasons and their profiles:**

| Reason | Recoverable via retry? | Ground-truth range |
|---|---|---|
| `BANK_SERVER_ERROR` | Yes, transient | 0.75 - 0.95 |
| `INSUFFICIENT_FUNDS` | Yes, if delayed | 0.35 - 0.55 |
| `OTP_FAILED` | Yes, once | 0.50 - 0.70 |
| `CARD_EXPIRED` | No — needs new card | 0.40 - 0.60 (only via SEND_MESSAGE, not retry) |
| `INVALID_CARD_DETAILS` | No — needs correction | 0.45 - 0.65 (only via SEND_MESSAGE) |
| `DAILY_LIMIT_EXCEEDED` | Yes, next day | 0.60 - 0.80 |
| `RISK_DECLINED` | No — human review only | 0 (never) |

## 3. Creating a batch

**Endpoint:** `POST /api/batches` &rarr; **File:** `src/pipeline/createBatch.ts`

```
createBatch(count, seed, strategy)
  events = generateSyntheticEvents(count, seed)     // called ONCE
  for each strategy in (strategy === 'BOTH' ? [AGENT, NAIVE] : [strategy]):
    create a Batch row (seed, eventCount, strategy, status: PENDING)
    for each event in `events`:
      create a Customer row
      create a PaymentEvent row (amountPaise, gatewayErrorCode, groundTruthRecoverable, ...)
  return the created Batch row(s)
```

The critical detail: when `strategy` is `'BOTH'`, `generateSyntheticEvents` is called **exactly once**, and the same in-memory array is written into both batches. This is what makes the AGENT and NAIVE batches directly comparable — they don't just share a seed, they share the literal same generated events (same amounts, same error codes, same hidden recoverability), so any difference in outcome is attributable purely to the decision strategy, not to different random draws.

## 4. Running a batch — the core loop

**Endpoint:** `POST /api/batches/:id/run` &rarr; **File:** `src/pipeline/batchRunner.ts`

This is where every domain module gets wired together. For each `PaymentEvent` in the batch, in a fixed, deterministic order (`orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]`):

```
1. DETECTED   — log the raw gateway error code/message
2. classify the failure reason (src/domain/failureClassifier.ts)
   DIAGNOSED  — log the diagnosed reason, persist it on the event

3. loop (attempt 1, 2, 3, ... up to a hard safety cap of 10):
   a. compute the "ideal" action for this attempt:
        - AGENT strategy  -> decideAgentAction(reason, attemptNumber)   [tailored per reason]
        - NAIVE strategy  -> decideNaiveAction(reason, attemptNumber)   [always: retry, no message]
      ALSO always compute trueIdeal = decideAgentAction(...) regardless of
      strategy — this is the yardstick both strategies get scored against.

   b. apply compliance policy: applyDunningPolicy(ideal, dunningState)
        - forces ESCALATE once attemptNumber > 3
        - forces ESCALATE if a message-only reason has exhausted its contact
          budget (max 3 total contacts, max 1 per simulated day) — never
          silently drops the message, always escalates instead
        - otherwise passes the ideal action through, attaching a tone
          (GENTLE -> FIRM -> FINAL) if a message will be sent
      DECIDED    — log the final action/tone for this attempt

   c. if the final action is ESCALATE:
        ACTED    — log the escalation + an LLM-written one-line explanation
        TRACKED  — log the outcome as ESCALATED
        stop this event's loop, final status = ESCALATED

   d. otherwise, act:
        - if a message should be sent, draft it via the LLM client
          (see section 6) and log the drafted text
        ACTED    — log the action taken + message text (if any) + explanation

   e. simulate whether the action succeeds:
        actionMatchesIdeal = (final.action === trueIdeal.action)
        outcome = simulateOutcome(event.groundTruthRecoverable, actionMatchesIdeal, rng)
          - if the action matches what the agent would have done: succeeds
            with probability = groundTruthRecoverable
          - if it doesn't match (this is how the naive strategy loses ground):
            succeeds with a small fixed floor probability (2%), capped so it
            can never exceed the event's own groundTruthRecoverable (an event
            that can NEVER recover, like RISK_DECLINED, still never recovers
            even on a mismatched action)
      TRACKED    — log the outcome
      persist a RetryAttempt row (attemptNumber, action, outcome, timestamps)

   f. if outcome is SUCCESS: stop, final status = RECOVERED
      otherwise: advance the simulated day by the ideal action's delay,
      increment attemptNumber, loop again

4. persist the event's final status (RECOVERED or ESCALATED)

(after all events) mark the Batch COMPLETE
```

**Failure handling:** the whole run is wrapped in a try/catch. If anything throws partway through, the batch is marked `FAILED` (not left stuck at `RUNNING` forever) and the error propagates up to the API layer. Individual LLM calls (drafting a message, writing an explanation) are separately wrapped so a transient LLM API hiccup degrades to a placeholder string instead of aborting the whole batch.

## 5. Why the agent beats the naive baseline

This is the flagship claim, and it falls directly out of the mechanics above, not a hardcoded result:

- The **agent** strategy's `ideal.action` is always `trueIdeal.action` (they're the same function), so `actionMatchesIdeal` is always true for the agent — it always gets scored at its full `groundTruthRecoverable` probability.
- The **naive** strategy's `ideal.action` is always `RETRY` regardless of reason. For reasons where the truly-ideal action is something else (`CARD_EXPIRED`, `INVALID_CARD_DETAILS` &rarr; `SEND_MESSAGE`; `RISK_DECLINED` &rarr; `ESCALATE`), naive's action mismatches `trueIdeal`, so it gets floored at the low 2% probability (or 0% for `RISK_DECLINED`) instead of its real recoverability — it wastes every attempt.
- Naive also never sends a message (`decideNaiveAction` always returns `messageSent: false`), so it never benefits from the reminder-driven recovery that `INSUFFICIENT_FUNDS`/`OTP_FAILED` events get from the agent.

Run through 100+ events, this produces a consistent, non-marginal recovery-rate gap in the agent's favor — proven automatically by an integration test (`tests/pipeline/batchRunner.test.ts`, seed 202, n=100), not just observed anecdotally.

## 6. Where the LLM fits in (and where it doesn't)

**Files:** `src/llm/llmClient.ts` (interface), `src/llm/templateClient.ts`, `src/llm/openAICompatibleClient.ts`, `src/llm/index.ts` (factory)

```
getLLMClient()
  if LLM_API_KEY is set:  return OpenAICompatibleLLMClient  (real network calls)
  else:                   return TemplateLLMClient          (deterministic, offline)
```

Both implementations expose exactly two methods, both returning plain strings:

```
draftMessage(reason, tone, amountRupees, isSubscription)   -> string
explainDecision(reason, action, attemptNumber)              -> string
```

The LLM is called **after** `applyDunningPolicy` has already fully decided the action — it only ever writes the customer-facing message text or a one-line "why" explanation for the audit log. It has no way to influence what happens next; the decision boundary is structural (the interface can't return anything but a string), not just a convention.

## 7. Computing a report

**Endpoint:** `GET /api/batches/:id/report` &rarr; **File:** `src/api/report.ts`

```
computeReport(batchId)
  fetch all PaymentEvents for the batch
  atRiskPaise    = sum of every event's amountPaise
  recoveredPaise = sum of amountPaise where status === RECOVERED
  recoveryRate   = recoveredPaise / atRiskPaise
  escalatedCount = count where status === ESCALATED
  byFailureReason = breakdown grouped by diagnosed reason
  byType          = breakdown grouped by ONE_OFF / SUBSCRIPTION
```

The agent-vs-naive **comparison** itself isn't computed server-side in one response — the caller (dashboard or CLI demo script) fetches both batches' reports separately and diffs them client-side. Both reports share the same `atRiskPaise` because both batches were built from the identical generated event set.

## 8. The dashboard's view of all this

**Files:** `public/index.html`, `public/dashboard.css`, `public/dashboard.js`

```
User clicks "Run Agent vs Naive"
  -> POST /api/batches  { count, seed, strategy: 'BOTH' }      => two Batch ids
  -> POST /api/batches/:agentId/run                            => runs agent strategy
  -> POST /api/batches/:naiveId/run                            => runs naive strategy
  -> GET  /api/batches/:agentId/report  +  :naiveId/report      => both reports, in parallel
       -> populate the 4 summary cards (at risk / agent / naive / delta)
       -> render two bar charts: recovery rate by failure reason, and by event type
  -> GET  /api/batches/:agentId/events                          => populate the events table
       -> any ESCALATED event also appears in the "Escalated to human" list
  User clicks "View audit" on a row
  -> GET  /api/events/:id/audit                                 => the ordered DETECTED..TRACKED trail
       -> rendered in a <dialog> drawer
```

Every fetch checks the response status; a failure at any step stops the sequence and shows an explicit error message instead of silently proceeding (important, since a run that fails partway through should never be presented as if it succeeded).

## 9. API surface, at a glance

| Method & path | Purpose |
|---|---|
| `POST /api/batches` | Generate a synthetic batch (or a paired AGENT+NAIVE batch) and persist it |
| `POST /api/batches/:id/run` | Run the pipeline for that batch; `409` if it isn't `PENDING` |
| `GET /api/batches/:id` | Poll a batch's status |
| `GET /api/batches/:id/report` | At-risk/recovered totals, recovery rate, breakdowns |
| `GET /api/batches/:id/events` | List every event's diagnosed reason and final status |
| `GET /api/events/:id/audit` | The full ordered audit trail for one event |
| `GET /api/health` | Liveness check |

## 10. One event, start to finish (worked example)

A `₹1,000` subscription renewal fails with an `INSUFFICIENT_FUNDS` gateway error, in an AGENT-strategy batch:

1. `DETECTED` — gateway said "Insufficient balance in account."
2. Classified as `INSUFFICIENT_FUNDS`. `DIAGNOSED`.
3. **Attempt 1:** agent decides `RETRY` with a 3-day delay and `messageSent: true`. Dunning policy allows it (no caps hit yet), assigns tone `GENTLE`. `DECIDED`. LLM drafts a gentle reminder message. `ACTED`. Action matches the agent's own ideal (it *is* the agent), so it's scored at the event's real recoverability — say it fails. `TRACKED`. Simulated day advances by 3.
4. **Attempt 2** (day 3): same reason, same ideal action. Dunning policy now assigns tone `FIRM` (second contact). `DECIDED` &rarr; `ACTED` &rarr; outcome: succeeds this time. `TRACKED` — `SUCCESS`.
5. Event's final status: `RECOVERED`. Two `RetryAttempt` rows and roughly ten `AuditLogEntry` rows now exist for this one event, fully reconstructable via `GET /api/events/:id/audit`.
