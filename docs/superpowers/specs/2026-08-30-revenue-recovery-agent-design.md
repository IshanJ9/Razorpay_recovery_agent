# Revenue Recovery Agent — Design Spec

Date: 2026-08-30
Status: Approved for planning

## 1. Problem & scope

Revenue leaks out through a chain of small failures: degraded payments, abandoned checkouts, failed subscription auto-debits, and unpaid B2B invoices. The hackathon track asks for an agent that closes the loop — detect → diagnose → decide → act → track — rather than a dashboard that only flags problems, or a script that retries everything the same way.

This project covers two of the seven example directions, chosen because they share the same underlying mechanics (a payment attempt failing) and let one classifier/decision engine serve both:

- **Payment degradation → root cause → recovery action**: a one-off checkout payment fails for a specific reason (insufficient funds, expired card, bank timeout, wrong OTP, risk decline, limit exceeded); the agent diagnoses the reason and picks a different fix per reason instead of a generic retry.
- **Failed-subscription recovery (dunning)**: a recurring auto-debit fails; the agent runs a bounded retry/notify schedule (dunning) with frequency caps, tone escalation, and a give-up/escalate-to-human point.

Out of scope for this build: checkout drop-off re-engagement, B2B receivables chasing, India-specific e-mandate retry-window compliance (UPI Autopay/NACH), Hinglish voice calling, and promise-to-pay tracking. These are documented in the track brief but not part of this project's deliverable.

## 2. Success criteria (from the track's judging bar)

1. The agent must actually act on events (schedule retries, send messages, escalate), not just classify/flag them.
2. Report a real recovered-vs-at-risk number across a batch of synthetic events, e.g. "recovered ₹X of ₹Y at risk."
3. Prove the "diagnose then tailor the response" thesis, not just assert it: run the same batch through a naive baseline (always retry the same way) and through the tailored agent, and report the delta between the two. This is the single most important demo artifact — it's the direct, measurable evidence for the track's "why now" claim.
4. Enforce compliant escalation: contact-frequency caps, a tone-escalation ladder, and a maximum retry count.
5. Enforce stopping rules: after retries/contacts are exhausted, the event is escalated to a human queue — never retried indefinitely.
6. Produce a full, queryable audit trail: every event's detected → diagnosed → decided → acted → tracked steps, persisted and reviewable per event.

## 3. Architecture

Node.js + TypeScript throughout.

- **Backend**: Express server, REST API.
- **Persistence**: PostgreSQL via Prisma ORM (schema-driven, migrations, relational integrity between events/attempts/audit entries).
- **Frontend**: a single-page dashboard served by Express (plain HTML/CSS/JS + a lightweight chart library), calling the REST API. No separate frontend build pipeline.
- **LLM integration**: an `LLMClient` interface with two implementations:
  - An OpenAI-compatible client, configured via env vars (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) — this works as-is with an xAI Grok key (Grok's API is OpenAI-chat-completions-compatible at `https://api.x.ai/v1`) or any other OpenAI-compatible provider.
  - A template-based fallback with no external call, used automatically when no API key is configured, so the full pipeline (including the dashboard) runs end-to-end without any credentials.
  - The LLM is used **only** to draft the customer-facing message text and to write a one-line plain-English "why the agent did this" explanation for the audit log. It never makes the retry/escalate/give-up decision — that is deterministic rule logic, so the agent's core behavior is reproducible and auditable independent of the LLM.

Nothing here needs to be real-time; the primary interaction is "start a batch run, watch it process, inspect the results," so a request/response API (not websockets) is sufficient — the dashboard polls the batch status endpoint while a run is in progress.

## 4. Data model (Prisma schema)

- `Customer` — id, name, contact (email/phone, synthetic).
- `Batch` — id, seed, eventCount, strategy (`agent` | `naive`), status (`pending`/`running`/`complete`), createdAt. Requesting `strategy: "both"` creates two `Batch` rows sharing the same seed; the generator is deterministic, so each batch gets its own copy of an identical event set (same amounts, error codes, groundTruthRecoverable), making the two runs directly comparable even though they own separate `PaymentEvent` rows.
- `PaymentEvent` — id, batchId, customerId, type (`one_off` | `subscription`), amount, currency (INR), gatewayErrorCode, gatewayErrorMessage, failureReason (populated by the classifier), groundTruthRecoverable (a hidden probability baked in at generation time — see §5), status (`open`/`recovered`/`failed`/`escalated`), createdAt.
- `RetryAttempt` — id, eventId, attemptNumber, action (`retry`/`send_message`/`escalate`/`give_up`), scheduledFor, executedAt, outcome (`success`/`failure`/`pending`).
- `AuditLogEntry` — id, eventId, step (`detected`/`diagnosed`/`decided`/`acted`/`tracked`), detail (JSON — includes the decision rationale and, where applicable, the LLM-drafted message/explanation), createdAt.

## 5. Synthetic dataset

Generated by a seeded RNG (`--seed`, default reproducible seed) so a run can be repeated exactly. Default batch size: **300 events** (~180 one-off checkout failures, ~120 subscription renewal failures) — large enough for a statistically meaningful recovery percentage, small enough to process and render in seconds. The generator also accepts a smaller count (e.g. 20) for a live walkthrough during the demo itself.

Each event is generated with:
- A gateway error code/message drawn from a realistic failure-reason distribution (see §6).
- A hidden `groundTruthRecoverable` probability, set per failure reason (e.g. transient errors like `bank_server_error` have a high chance of succeeding on a well-timed retry; `card_expired`/`invalid_card_details` have near-zero chance of succeeding on *any* retry and only recover if the agent's action is "prompt for new payment method"; `risk_declined` never recovers via retry and only resolves via human review).

This hidden probability is what makes the naive-vs-agent comparison meaningful: the naive baseline retries every event the same way regardless of reason, so it "wins" only on the transient-error subset and wastes attempts (and contact-frequency budget) on events that can never succeed via retry; the agent looks up the right action per reason and wins across all subsets.

## 6. Failure-reason taxonomy & decision table

| failureReason | Retryable? | Agent's action | Naive baseline's action |
|---|---|---|---|
| `bank_server_error` / `gateway_timeout` | Yes (transient) | Auto-retry after short delay, no customer contact | Immediate retry |
| `insufficient_funds` | Delayed | Wait ~3 days, retry + gentle reminder message | Immediate retry |
| `otp_failed` | Yes, once | Immediate retry once, then fall back to "update payment method" | Immediate retry |
| `card_expired` | No | Skip retry, send "update payment method" link immediately | Immediate retry (always fails) |
| `invalid_card_details` | No | Skip retry, send "update payment method" link immediately | Immediate retry (always fails) |
| `daily_limit_exceeded` | Delayed | Wait until next day, then retry | Immediate retry (fails same day) |
| `risk_declined` | No | Skip retry, escalate to human review immediately | Immediate retry (always fails, and re-triggers risk checks) |

## 7. Dunning schedule, compliance caps, stopping rules

Applies to both one-off and subscription events (subscriptions simply have more retry cycles because they recur):

- Maximum **3 retry attempts** per event before escalating to the human queue.
- Maximum **1 customer contact (message) per day** per customer.
- Maximum **3 total customer contacts** per dunning cycle.
- Tone escalation ladder as contacts increase: gentle reminder → firmer reminder → final notice.
- Non-retryable failure reasons never consume a retry attempt on a doomed action — they go straight to the correct action (update-payment-method prompt or human escalation), which is the concrete, auditable expression of "diagnose before acting."
- After caps are exhausted (3 retries or 3 contacts) without recovery, the event's status becomes `escalated` and it stops being auto-processed — never retried indefinitely.

## 8. API endpoints

- `POST /api/batches` — body `{ count, seed, strategy: "agent" | "naive" | "both" }`; generates the synthetic event set from `(count, seed)` and persists it as one `Batch` (or two, sharing the seed, when `strategy: "both"` — see §4); returns the created batch(es)' metadata.
- `POST /api/batches/:id/run` — executes the pipeline for that batch's strategy, persisting `RetryAttempt` and `AuditLogEntry` rows; batch status moves `pending` → `running` → `complete`.
- `GET /api/batches/:id` — batch status (for dashboard polling while running).
- `GET /api/batches/:id/report` — aggregated ₹ at risk, ₹ recovered, recovery %, broken down by failure reason and event type; when a paired naive/agent batch exists, includes the side-by-side comparison.
- `GET /api/batches/:id/events` — event list with status/failure reason/outcome for the table view.
- `GET /api/events/:id/audit` — full ordered audit trail for one event.

## 9. Dashboard

Single page:
- **Run control**: count + seed inputs, "Run agent," "Run naive baseline," "Run both" (creates the paired comparison batches).
- **Summary cards**: ₹ at risk, ₹ recovered (agent), ₹ recovered (naive), recovery % and the delta between strategies.
- **Breakdown chart**: recovery % by failure reason and by event type (one-off vs subscription).
- **Events table**: status, failure reason, action taken, outcome; clicking a row opens an audit-trail drawer showing the detect → diagnose → decide → act → track steps in order, including the LLM-drafted message/explanation where applicable.
- **Escalation queue view**: events with status `escalated`, i.e. the human-in-the-loop handoff.

## 10. Testing approach

- Unit tests for the failure classifier (error code → failure reason) and the decision table (failure reason + context → action), since these are the deterministic core the whole result depends on.
- Unit tests for the compliance caps and stopping rules (retry count cap, daily contact cap, total contact cap, escalation trigger) — these map directly to judged criteria, so they need explicit coverage.
- An integration test that runs a small seeded batch (e.g. 20 events) end-to-end through both strategies and asserts the agent's recovery total is ≥ the naive baseline's on that fixed seed.
- The LLM client's template fallback is exercised in tests (no live API calls in the test suite); the OpenAI-compatible implementation is only exercised manually/in the demo.

## 11. Out of scope / explicit non-goals

- Real payment gateway integration (Razorpay or otherwise) — all payment attempts are simulated against the synthetic dataset's ground-truth recoverability.
- Real outbound communication (email/SMS/voice) — messages are drafted and logged, not actually sent.
- The other five track directions (checkout drop-off, B2B receivables, mandate retry sequencing, Hinglish voice, promise-to-pay tracking).
- Authentication/authorization on the dashboard — single-user local/demo tool.
