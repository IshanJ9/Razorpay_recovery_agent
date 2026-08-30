# Design Decisions

This document records the significant choices made while building the Revenue Recovery Agent, and why the alternatives were rejected. It's organized roughly in the order the decisions came up.

## Scope: which track directions to cover

**Chose:** Payment failure root-cause recovery + failed-subscription dunning, as one combined build.

**Why:** Both are, mechanically, the same problem — a payment attempt failed, something needs to diagnose why and respond. One classifier and one decision engine serves both, so building them together doesn't cost extra and it lets one demo prove the thesis (diagnose before acting) across both a one-off checkout and a recurring subscription context.

**Why not the other five directions** (checkout drop-off, B2B receivables, UPI Autopay/e-mandate retry-window compliance, Hinglish voice calling, promise-to-pay tracking): each is a genuinely different problem — different data shape, different action space, different compliance regime (e.g. e-mandate retry windows are a distinct regulatory mechanic, not a variant of dunning). Picking one focused, provable slice beats a shallow pass across all seven.

## Persistence and architecture: server + Postgres, not a CLI + JSON file

**Chose:** A full Express server with PostgreSQL via Prisma, and a web dashboard.

**Why:** This was an explicit, deliberate pivot mid-build — the initial plan was a lightweight CLI tool writing to a local JSON file, scoped for a ~24-hour hackathon budget. The decision was made to optimize for a stronger, more complete submission instead of the time budget: a real server with a real relational database and a browser-based dashboard demonstrates persistence, queryability, and a production-shaped architecture that a CLI script can't. A hackathon judge sees "this could actually run in production" rather than "this is a proof-of-concept script."

**Why not a JSON file or SQLite:** relational integrity between events, retry attempts, and audit entries (each event has many attempts, each attempt and each lifecycle step is its own row) is exactly what a JSON blob makes awkward and a JSON store makes error-prone to query for the report aggregations. Postgres+Prisma gives migrations, a strongly-typed client, and real joins for a task that's inherently relational.

**Why Prisma specifically:** schema-first, type-safe query results, and a migration workflow that's fast to set up for a project this size. The alternative (raw SQL or a lower-level query builder) would have meant hand-writing types and migrations for no real benefit at this scale.

## Language and runtime: Node.js + TypeScript

**Chose:** Node 18+, TypeScript throughout, `tsx` for running TypeScript directly (no separate transpile step in dev).

**Why:** TypeScript's static types are load-bearing here — the domain layer has a long chain of interfaces that must line up exactly across many small files (`FailureReason` produced by the classifier, consumed by the decision table, the dunning policy, the LLM client, and the batch runner; `IdealDecision` produced by the decision table, consumed by the dunning policy and the batch runner). A type error at any of those seams is caught at compile time instead of surfacing as a runtime mismatch deep in a batch run. A dynamically-typed language would have made the many-small-files decomposition riskier.

## The core hybrid: deterministic rules decide, the LLM only writes text

**Chose:** All retry/escalate/give-up decisions come from plain, deterministic TypeScript functions (`decisionTable.ts`, `dunningPolicy.ts`). The LLM (`LLMClient` interface) is only ever asked to draft a customer message or write a one-line explanation — both return a plain `string`, nothing else.

**Why:** The compliance requirements here are hard constraints, not preferences — a maximum retry count, a maximum contact count, a hard cap of one contact per day, an escalation ladder. Those need to be provably enforced, testable with ordinary unit tests, and reproducible run to run. An LLM making that call would be neither reliably testable nor deterministic, and "an LLM decided to retry a ninth time" is not an auditable answer to a compliance question. Splitting the two lets the decision logic be fully unit-tested (see `dunningPolicy.test.ts`'s 8 branch-covering cases) while still getting natural-language output where it actually adds value — the customer-facing copy.

**Why not let the LLM draft messages *and* pick the tone/timing:** the tone ladder (GENTLE &rarr; FIRM &rarr; FINAL) and the timing (3-day delay for insufficient funds, next-day for a limit breach) are themselves part of the compliance/business logic being demonstrated — they needed to be as deterministic and auditable as the retry decision itself, not just the text wrapped around them.

## LLM provider: an OpenAI-compatible interface, not an Anthropic-specific one

**Chose:** `LLMClient` is a generic interface; `OpenAICompatibleLLMClient` calls any OpenAI-chat-completions-compatible endpoint via `fetch`, configured entirely through environment variables (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). The default configuration points at xAI's Grok, since that's the key available for this build, but nothing in the code is Grok-specific.

**Why:** xAI's Grok API happens to speak the same wire format OpenAI popularized, so one small client works for Grok, OpenAI itself, or any other compatible provider — swapping providers is a `.env` change, not a code change.

**Why also build a template-based fallback (`TemplateLLMClient`):** the whole system needed to run and be demoable with zero external credentials — a judge or reviewer cloning the repo shouldn't need an API key just to see the pipeline work end to end. `getLLMClient()` picks the template client automatically whenever `LLM_API_KEY` is unset, so the default experience needs nothing but `docker compose up` and `npm install`. This also made the automated test suite fully offline: tests exercise the template client's real behavior, and the network-calling client is deliberately excluded from the automated suite (no live API calls in CI).

## Money as integer paise, never floating-point rupees

**Chose:** every amount is stored and computed as an integer number of paise (`amountPaise`). The only place a value is divided by 100 is display text (LLM prompts, the dashboard, the CLI printout).

**Why:** this is a payments project; floating-point rupee arithmetic accumulating rounding error across thousands of synthetic events would be an obviously wrong default, and it's the kind of bug that's invisible until it silently skews an aggregate. Integer cents/paise is the standard, boring, correct choice for money in code, so it was enforced as a hard rule from the first task and specifically checked for in every code review afterward.

## Synthetic data instead of a real payment gateway

**Chose:** all payment attempts are simulated against a seeded synthetic dataset with a hidden "ground truth recoverability" per event; nothing calls Razorpay or any real gateway.

**Why:** a hackathon-scope demo can't ethically or practically run real payment attempts, and a real gateway integration would add an external dependency (accounts, sandbox credentials, rate limits) that adds risk without adding to the actual thing being demonstrated — the decision-making logic. Synthetic data lets the demo be reproducible on any machine with just Docker and Node, and lets the ground-truth recoverability be deliberately designed so the naive-vs-agent comparison is meaningful (see below) rather than left to the luck of real-world data.

**Why seeded/deterministic, not truly random:** a judge should be able to run the exact same batch twice and get the exact same numbers — reproducibility is itself part of the demo's credibility. A `mulberry32(seed)` PRNG makes `(count, seed)` a complete, deterministic specification of a batch.

## Proving the comparison honestly, not asserting it

**Chose:** when a "both" batch is requested, `generateSyntheticEvents` is called exactly once and the same in-memory event list is persisted into both the AGENT and NAIVE batches — not called twice with the same seed.

**Why not just reseed the naive batch with the same seed and regenerate:** calling the generator twice with the same seed *would* also produce identical events in principle, but reusing the single generated array is a strictly stronger and simpler guarantee — there's no chance of accidental drift from, say, a future change to the generator's internal consumption order. It also makes the two batches' shared `atRiskPaise` trivially true rather than something that has to be separately proven.

**Chose:** the batch runner always computes `trueIdeal = decideAgentAction(...)` regardless of which strategy is actually running, and scores every attempt's success probability against whether the *actual* action matched that true ideal — not against whatever the running strategy considers ideal for itself.

**Why this matters:** if the naive strategy's actions were instead scored against its own notion of "ideal" (which is always just "retry"), every naive action would trivially "match" and the entire comparison would collapse to nothing — naive would look just as good as the agent. Scoring both strategies against the same yardstick (what the agent would have done) is what makes "the agent recovers more" a real, checkable claim rather than an assumption baked into the scoring itself. This was verified explicitly in code review by tracing the RISK_DECLINED case: agent escalates immediately (0 wasted attempts), naive keeps retrying against a true ideal of ESCALATE, mismatches every time, and is capped at a tiny fixed success probability instead of its real (zero) recoverability.

**Chose:** a fixed, low "mismatched action" floor probability (2%) for any action that doesn't match the true ideal — but capped so it never exceeds the event's own ground-truth recoverability.

**Why the floor exists at all**, rather than mismatched actions simply always failing: a small amount of noise is more realistic (a blind retry occasionally still works by luck) and avoids the flagship test being trivially true by construction (100% vs 0%) rather than a meaningful, demonstrable margin.

**Why it's capped at the ground truth** (added during final review, after the initial version applied the floor unconditionally): an event whose true recoverability is exactly zero (`RISK_DECLINED` — genuinely can never be recovered by retrying, only by human review) was, in the first version, still occasionally "recovering" for the naive baseline at the flat 2% floor. That's a fidelity bug — the model's own stated semantics say zero is zero — and it happened to bias the flagship comparison slightly *in the naive baseline's favor*, which is the worst direction for a bug like that to point. Capping the floor at `min(0.02, groundTruthRecoverable)` closes that gap without touching any other case.

## Compliance caps: hardcoded constants, not configuration

**Chose:** max 3 retry attempts, max 3 total customer contacts, max 1 contact per simulated day, and the 3-step tone ladder are all literal constants in `dunningPolicy.ts`, not database-configurable or LLM-adjustable.

**Why:** these numbers come directly from the track's stated judging bar ("enforce compliant escalation," "enforce stopping rules"), and the point being demonstrated is that they're *enforced in code*, not just described in documentation or left as a suggestion an LLM might or might not follow. Making them configurable would be solving a problem nobody asked for at this stage; hardcoding them made the enforcement trivially testable (`dunningPolicy.test.ts` has one test per branch of the cap logic) and impossible to accidentally bypass.

## Dashboard: plain HTML/CSS/JS, no framework, no build step

**Chose:** `public/index.html` + `dashboard.css` + `dashboard.js`, served directly by Express's static middleware, using vanilla DOM APIs and `fetch`.

**Why:** the dashboard's job is narrow — trigger a run, show four numbers, two bar charts, a table, and an audit drawer. A framework (React, Vue, etc.) would add a build pipeline, a bundler, and a dependency tree for a UI surface this small, all cost with no benefit at this scope. No build step also means `npm install && npm run dev` is the entire setup — one less thing that can break during a live demo.

**Why the chart is hand-rolled SVG instead of a charting library:** the chart is seven bars at most (one per failure reason) or two (by event type) — `document.createElementNS` calls to build `<rect>`/`<text>` elements directly is a dozen lines of code, versus pulling in and configuring an entire charting dependency for something this simple.

## Development process: subagent-driven development, TDD, working directly on `main`

**Chose:** the implementation plan was executed as 15 discrete tasks, each implemented by a fresh subagent from a self-contained brief, each reviewed by an independent subagent before moving to the next task, followed by one whole-branch review at the end (which surfaced and required fixing a cross-task compounding bug that no single task-level review could have caught).

**Why:** a large chain of small, interdependent files (the exact scenario described above under "Language and runtime") benefits from strict test-first development and a fresh, unbiased reviewer for every unit of work — a reviewer who wrote the code is bad at spotting its own mistakes. The two-tier review (per-task, then whole-branch) exists because some defects are genuinely invisible at task scope: the final review's most serious finding was four separately-reasonable, separately-accepted minor gaps from four different tasks compounding into a real silent-failure risk that only became visible once the whole system was considered together.

**Why directly on `main`, not an isolated branch or worktree:** this was a fresh repository with no other work in progress and no other branches to protect — the isolation a branch/worktree provides exists to protect other in-flight work, which didn't exist here. Skipping it avoided the overhead of merging back at the end for zero actual risk reduction in this specific case.

## Explicitly out of scope

Real payment gateway integration, real outbound communication (email/SMS/voice — messages are drafted and logged, never sent), authentication on the dashboard, and the other five track directions. Each of these is a legitimate next step but a different piece of work with its own design questions; bolting them on partially would have diluted the one thing this build sets out to prove cleanly.
