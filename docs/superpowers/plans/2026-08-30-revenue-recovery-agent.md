# Revenue Recovery Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node/TypeScript + Express + PostgreSQL (Prisma) service with a web dashboard that runs a synthetic batch of failed payments through a detect→diagnose→decide→act→track recovery pipeline, and proves the pipeline beats a naive "retry everything the same way" baseline with a real recovered-₹ number.

**Architecture:** A pure-function domain layer (failure classifier, decision table, dunning/compliance policy, outcome simulator) with no I/O, wrapped by a batch-runner pipeline that persists every step to Postgres via Prisma, exposed over a small REST API, driven by a static HTML/JS dashboard. An `LLMClient` interface drafts customer messages and audit explanations only — it never makes the retry/escalate decision.

**Tech Stack:** Node.js ≥18, TypeScript, Express, Prisma + PostgreSQL, Vitest + Supertest, `tsx` for running TS directly, vanilla HTML/CSS/JS for the dashboard (no frontend build step).

**Spec:** [docs/superpowers/specs/2026-08-30-revenue-recovery-agent-design.md](../specs/2026-08-30-revenue-recovery-agent-design.md)

## Global Constraints

- Money is always stored and computed in paise (`amountPaise`, integer) — never floats — and only converted to rupees for display.
- The LLM is used exclusively to draft customer-facing message text and one-line audit explanations. It never decides whether to retry, escalate, or give up — that is deterministic rule logic (spec §3).
- Compliance caps are hard limits, enforced in code, not merely displayed: maximum 3 retry attempts per event, maximum 3 total customer contacts per event, maximum 1 contact per simulated calendar day, tone ladder GENTLE → FIRM → FINAL as contacts increase (spec §7).
- All synthetic data generation is seeded (`generateSyntheticEvents(count, seed)`); the same `(count, seed)` must always produce the same events, so demos and tests are reproducible (spec §5).
- No real payment gateway, email, SMS, or voice integration — all actions are simulated and logged (spec §11).
- Every event's full lifecycle (detected/diagnosed/decided/acted/tracked) is persisted as ordered `AuditLogEntry` rows (spec §4, §9).

---

## Task 1: Project scaffolding + health check endpoint

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore`, `docker-compose.yml`, `README.md`
- Create: `src/app.ts`, `src/server.ts`
- Test: `tests/app.health.test.ts`

**Interfaces:**
- Produces: `export const app: express.Express` from `src/app.ts` — every later task mounts routes onto this instance.

- [ ] **Step 1: Initialize the project and install dependencies**

```bash
npm init -y
npm install express dotenv @prisma/client
npm install -D typescript tsx vitest supertest @types/node @types/express @types/supertest prisma
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src", "scripts", "tests"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
```

- [ ] **Step 4: Write the failing health-check test**

```ts
// tests/app.health.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('GET /api/health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run tests/app.health.test.ts`
Expected: FAIL — `src/app.ts` does not exist yet.

- [ ] **Step 6: Write `src/app.ts` and `src/server.ts`**

```ts
// src/app.ts
import express from 'express';

export const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
```

```ts
// src/server.ts
import 'dotenv/config';
import { app } from './app';

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Revenue recovery agent listening on port ${PORT}`);
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tests/app.health.test.ts`
Expected: PASS

- [ ] **Step 8: Write `.env.example`, `.gitignore`, `docker-compose.yml`**

```bash
# .env.example
DATABASE_URL="postgresql://recovery:recovery@localhost:5433/recovery"
PORT=3000
LLM_API_KEY=
LLM_BASE_URL=https://api.x.ai/v1
LLM_MODEL=grok-beta
```

```
# .gitignore
node_modules/
dist/
.env
```

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: recovery
      POSTGRES_PASSWORD: recovery
      POSTGRES_DB: recovery
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

- [ ] **Step 9: Add npm scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "prisma:migrate": "prisma migrate dev",
    "demo": "tsx scripts/demo.ts"
  }
}
```

- [ ] **Step 10: Write a starter `README.md`**

```markdown
# Revenue Recovery Agent

## Setup
1. `cp .env.example .env`
2. `docker compose up -d` (starts Postgres on port 5433)
3. `npm install`
4. `npx prisma migrate dev` (run after Task 2 adds `prisma/schema.prisma`)
5. `npm run dev` — starts the server on http://localhost:3000
6. Open http://localhost:3000 for the dashboard.

## Tests
`npm test` — requires the Postgres container from step 2 to be running (several tests hit the database).

## Demo (CLI, no browser needed)
`npm run demo -- 300 42` — generates a 300-event synthetic batch (seed 42), runs it through both the agent and naive-baseline strategies, and prints the recovered-₹ comparison.
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example .gitignore docker-compose.yml README.md src/app.ts src/server.ts tests/app.health.test.ts
git commit -m "Scaffold project with Express health check"
git push
```

---

## Task 2: Prisma schema, migration, and DB client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/db/client.ts`
- Test: `tests/db/client.test.ts`

**Interfaces:**
- Produces: `export const prisma: PrismaClient` from `src/db/client.ts` — every task that touches the database imports this.
- Produces (via generated Prisma Client): `Customer`, `Batch`, `PaymentEvent`, `RetryAttempt`, `AuditLogEntry` models and the `EventType`, `FailureReason`, `EventStatus`, `BatchStrategy`, `BatchStatus`, `AttemptAction`, `AttemptOutcome`, `AuditStep` enums, used by name in every later domain/pipeline task.

**Design note:** the spec's data model lists `FAILED` (event status) and `GIVE_UP` (attempt action) as possible values, but the pipeline built in Task 10 only ever produces `RECOVERED` or `ESCALATED` as terminal event states (the attempt cap always routes to escalation, never a bare "failed" or "give up" — see spec §7's stopping rule), so those two values are dropped here to avoid dead enum cases.

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum EventType {
  ONE_OFF
  SUBSCRIPTION
}

enum FailureReason {
  BANK_SERVER_ERROR
  INSUFFICIENT_FUNDS
  OTP_FAILED
  CARD_EXPIRED
  INVALID_CARD_DETAILS
  DAILY_LIMIT_EXCEEDED
  RISK_DECLINED
}

enum EventStatus {
  OPEN
  RECOVERED
  ESCALATED
}

enum BatchStrategy {
  AGENT
  NAIVE
}

enum BatchStatus {
  PENDING
  RUNNING
  COMPLETE
}

enum AttemptAction {
  RETRY
  SEND_MESSAGE
  ESCALATE
}

enum AttemptOutcome {
  SUCCESS
  FAILURE
}

enum AuditStep {
  DETECTED
  DIAGNOSED
  DECIDED
  ACTED
  TRACKED
}

model Customer {
  id        String         @id @default(cuid())
  name      String
  contact   String
  createdAt DateTime       @default(now())
  events    PaymentEvent[]
}

model Batch {
  id         String         @id @default(cuid())
  seed       Int
  eventCount Int
  strategy   BatchStrategy
  status     BatchStatus    @default(PENDING)
  createdAt  DateTime       @default(now())
  events     PaymentEvent[]
}

model PaymentEvent {
  id                     String          @id @default(cuid())
  batchId                String
  batch                  Batch           @relation(fields: [batchId], references: [id])
  customerId             String
  customer               Customer        @relation(fields: [customerId], references: [id])
  type                   EventType
  amountPaise            Int
  gatewayErrorCode       String
  gatewayErrorMessage    String
  failureReason          FailureReason?
  groundTruthRecoverable Float
  status                 EventStatus     @default(OPEN)
  createdAt              DateTime        @default(now())
  attempts               RetryAttempt[]
  auditEntries           AuditLogEntry[]
}

model RetryAttempt {
  id            String         @id @default(cuid())
  eventId       String
  event         PaymentEvent   @relation(fields: [eventId], references: [id])
  attemptNumber Int
  action        AttemptAction
  messageSent   Boolean        @default(false)
  scheduledFor  DateTime
  executedAt    DateTime
  outcome       AttemptOutcome
}

model AuditLogEntry {
  id        String       @id @default(cuid())
  eventId   String
  event     PaymentEvent @relation(fields: [eventId], references: [id])
  step      AuditStep
  detail    Json
  createdAt DateTime
}
```

- [ ] **Step 2: Run the migration** (requires `docker compose up -d` from Task 1 to be running)

Run: `npx prisma migrate dev --name init`
Expected: migration applies cleanly, Prisma Client is generated into `node_modules/@prisma/client`.

- [ ] **Step 3: Write `src/db/client.ts`**

```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 4: Write the failing test**

```ts
// tests/db/client.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../src/db/client';

describe('prisma client', () => {
  it('can create and read a Customer', async () => {
    const customer = await prisma.customer.create({
      data: { name: 'Test Customer', contact: 'test@example.com' },
    });
    const found = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(found?.name).toBe('Test Customer');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run tests/db/client.test.ts`
Expected: FAIL before migration/client exist; after Steps 1–3, proceed to Step 6.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/db/client.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add prisma src/db package.json package-lock.json README.md
git commit -m "Add Prisma schema, migration, and DB client"
git push
```

---

## Task 3: Seeded RNG + synthetic event generator

**Files:**
- Create: `src/data/rng.ts`
- Create: `src/data/syntheticGenerator.ts`
- Test: `tests/data/syntheticGenerator.test.ts`

**Interfaces:**
- Produces: `mulberry32(seed: number): () => number` from `src/data/rng.ts` — reused by `batchRunner` (Task 10) for outcome rolls.
- Produces: `generateSyntheticEvents(count: number, seed: number): GeneratedEvent[]`, `REASON_PROFILES`, and the `GeneratedEvent` / `EventType` types from `src/data/syntheticGenerator.ts` — consumed by `createBatch` (Task 9) and `failureClassifier` (Task 4, which reuses `REASON_PROFILES` as its code→reason source of truth).

- [ ] **Step 1: Write `src/data/rng.ts`**

```ts
export function mulberry32(seed: number): () => number {
  let a = seed;
  return function (): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: Write the failing test for determinism and coverage**

```ts
// tests/data/syntheticGenerator.test.ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/data/syntheticGenerator.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 4: Write `src/data/syntheticGenerator.ts`**

```ts
import { mulberry32 } from './rng';

export type EventType = 'ONE_OFF' | 'SUBSCRIPTION';

export interface GeneratedEvent {
  type: EventType;
  amountPaise: number;
  gatewayErrorCode: string;
  gatewayErrorMessage: string;
  groundTruthRecoverable: number;
  customerName: string;
  customerContact: string;
}

interface ReasonProfile {
  reason: string;
  codes: [string, string][];
  recoverableRange: [number, number];
  weight: number;
}

export const REASON_PROFILES: ReasonProfile[] = [
  { reason: 'BANK_SERVER_ERROR', codes: [['BANK_TIMEOUT_502', 'Bank server timed out'], ['GATEWAY_TIMEOUT_504', 'Payment gateway timed out']], recoverableRange: [0.75, 0.95], weight: 0.2 },
  { reason: 'INSUFFICIENT_FUNDS', codes: [['INSUFFICIENT_FUNDS', 'Insufficient balance in account']], recoverableRange: [0.35, 0.55], weight: 0.25 },
  { reason: 'OTP_FAILED', codes: [['OTP_MISMATCH', 'OTP did not match'], ['OTP_TIMEOUT', 'OTP entry timed out']], recoverableRange: [0.5, 0.7], weight: 0.15 },
  { reason: 'CARD_EXPIRED', codes: [['CARD_EXPIRED', 'Card has expired']], recoverableRange: [0.4, 0.6], weight: 0.15 },
  { reason: 'INVALID_CARD_DETAILS', codes: [['CVV_MISMATCH', 'CVV did not match'], ['INVALID_EXPIRY', 'Card expiry details invalid']], recoverableRange: [0.45, 0.65], weight: 0.1 },
  { reason: 'DAILY_LIMIT_EXCEEDED', codes: [['VELOCITY_LIMIT_EXCEEDED', 'Daily transaction limit exceeded']], recoverableRange: [0.6, 0.8], weight: 0.1 },
  { reason: 'RISK_DECLINED', codes: [['RISK_ENGINE_DECLINE', 'Declined by risk engine']], recoverableRange: [0, 0], weight: 0.05 },
];

function pickWeighted(rng: () => number, items: ReasonProfile[]): ReasonProfile {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    if (r < item.weight) return item;
    r -= item.weight;
  }
  return items[items.length - 1];
}

function pickOne<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function generateSyntheticEvents(count: number, seed: number): GeneratedEvent[] {
  const rng = mulberry32(seed);
  const events: GeneratedEvent[] = [];
  for (let i = 0; i < count; i++) {
    const type: EventType = rng() < 0.6 ? 'ONE_OFF' : 'SUBSCRIPTION';
    const amountPaise =
      type === 'ONE_OFF'
        ? Math.floor(50000 + rng() * (500000 - 50000))
        : Math.floor(19900 + rng() * (199900 - 19900));
    const profile = pickWeighted(rng, REASON_PROFILES);
    const [code, message] = pickOne(rng, profile.codes);
    const [lo, hi] = profile.recoverableRange;
    const groundTruthRecoverable = lo + rng() * (hi - lo);
    events.push({
      type,
      amountPaise,
      gatewayErrorCode: code,
      gatewayErrorMessage: message,
      groundTruthRecoverable,
      customerName: `Customer ${i + 1}`,
      customerContact: `customer${i + 1}@example.com`,
    });
  }
  return events;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/data/syntheticGenerator.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/data tests/data
git commit -m "Add seeded synthetic payment event generator"
git push
```

---

## Task 4: Failure classifier

**Files:**
- Create: `src/domain/failureClassifier.ts`
- Test: `tests/domain/failureClassifier.test.ts`

**Interfaces:**
- Consumes: `REASON_PROFILES` from `src/data/syntheticGenerator.ts` (Task 3).
- Produces: `classifyFailure(gatewayErrorCode: string): FailureReason` and the `FailureReason` type — consumed by `decisionTable.ts` (Task 5), `dunningPolicy.ts` (Task 6), `llmClient.ts` (Task 8), and `batchRunner.ts` (Task 10).

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/failureClassifier.test.ts
import { describe, it, expect } from 'vitest';
import { classifyFailure } from '../../src/domain/failureClassifier';

describe('classifyFailure', () => {
  it.each([
    ['BANK_TIMEOUT_502', 'BANK_SERVER_ERROR'],
    ['GATEWAY_TIMEOUT_504', 'BANK_SERVER_ERROR'],
    ['INSUFFICIENT_FUNDS', 'INSUFFICIENT_FUNDS'],
    ['OTP_MISMATCH', 'OTP_FAILED'],
    ['OTP_TIMEOUT', 'OTP_FAILED'],
    ['CARD_EXPIRED', 'CARD_EXPIRED'],
    ['CVV_MISMATCH', 'INVALID_CARD_DETAILS'],
    ['INVALID_EXPIRY', 'INVALID_CARD_DETAILS'],
    ['VELOCITY_LIMIT_EXCEEDED', 'DAILY_LIMIT_EXCEEDED'],
    ['RISK_ENGINE_DECLINE', 'RISK_DECLINED'],
  ])('maps %s to %s', (code, expected) => {
    expect(classifyFailure(code)).toBe(expected);
  });

  it('throws on an unknown code', () => {
    expect(() => classifyFailure('SOMETHING_UNKNOWN')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/failureClassifier.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/domain/failureClassifier.ts`**

```ts
import { REASON_PROFILES } from '../data/syntheticGenerator';

export type FailureReason =
  | 'BANK_SERVER_ERROR'
  | 'INSUFFICIENT_FUNDS'
  | 'OTP_FAILED'
  | 'CARD_EXPIRED'
  | 'INVALID_CARD_DETAILS'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'RISK_DECLINED';

const CODE_TO_REASON: Record<string, FailureReason> = {};
for (const profile of REASON_PROFILES) {
  for (const [code] of profile.codes) {
    CODE_TO_REASON[code] = profile.reason as FailureReason;
  }
}

export function classifyFailure(gatewayErrorCode: string): FailureReason {
  const reason = CODE_TO_REASON[gatewayErrorCode];
  if (!reason) {
    throw new Error(`Unknown gateway error code: ${gatewayErrorCode}`);
  }
  return reason;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/failureClassifier.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/failureClassifier.ts tests/domain/failureClassifier.test.ts
git commit -m "Add rule-based failure classifier"
git push
```

---

## Task 5: Decision table (agent strategy) + naive baseline strategy

**Files:**
- Create: `src/domain/decisionTable.ts`
- Create: `src/domain/naiveStrategy.ts`
- Test: `tests/domain/decisionTable.test.ts`
- Test: `tests/domain/naiveStrategy.test.ts`

**Interfaces:**
- Consumes: `FailureReason` from `src/domain/failureClassifier.ts` (Task 4).
- Produces: `decideAgentAction(reason: FailureReason, attemptNumber: number): IdealDecision`, `decideNaiveAction(reason: FailureReason, attemptNumber: number): IdealDecision`, and the `IdealDecision` / `AgentActionType` types from `decisionTable.ts` — consumed by `dunningPolicy.ts` (Task 6) and `batchRunner.ts` (Task 10). Both functions share the exact signature `(reason: FailureReason, attemptNumber: number) => IdealDecision` so the batch runner can call either interchangeably.

- [ ] **Step 1: Write the failing test for the decision table**

```ts
// tests/domain/decisionTable.test.ts
import { describe, it, expect } from 'vitest';
import { decideAgentAction } from '../../src/domain/decisionTable';

describe('decideAgentAction', () => {
  it('retries transient bank errors same-day with no message', () => {
    expect(decideAgentAction('BANK_SERVER_ERROR', 1)).toEqual({ action: 'RETRY', delayDays: 0, messageSent: false });
  });

  it('delays insufficient-funds retries and sends a reminder', () => {
    expect(decideAgentAction('INSUFFICIENT_FUNDS', 1)).toEqual({ action: 'RETRY', delayDays: 3, messageSent: true });
  });

  it('retries OTP failure once, then falls back to updating payment method', () => {
    expect(decideAgentAction('OTP_FAILED', 1)).toEqual({ action: 'RETRY', delayDays: 0, messageSent: false });
    expect(decideAgentAction('OTP_FAILED', 2)).toEqual({ action: 'SEND_MESSAGE', delayDays: 0, messageSent: true });
  });

  it('never retries an expired card or invalid card details, only prompts for update', () => {
    expect(decideAgentAction('CARD_EXPIRED', 1)).toEqual({ action: 'SEND_MESSAGE', delayDays: 0, messageSent: true });
    expect(decideAgentAction('INVALID_CARD_DETAILS', 1)).toEqual({ action: 'SEND_MESSAGE', delayDays: 0, messageSent: true });
  });

  it('waits a day before retrying a daily limit breach', () => {
    expect(decideAgentAction('DAILY_LIMIT_EXCEEDED', 1)).toEqual({ action: 'RETRY', delayDays: 1, messageSent: false });
  });

  it('escalates risk-declined events immediately, never retries', () => {
    expect(decideAgentAction('RISK_DECLINED', 1)).toEqual({ action: 'ESCALATE', delayDays: 0, messageSent: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/decisionTable.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/domain/decisionTable.ts`**

```ts
import { FailureReason } from './failureClassifier';

export type AgentActionType = 'RETRY' | 'SEND_MESSAGE' | 'ESCALATE';

export interface IdealDecision {
  action: AgentActionType;
  delayDays: number;
  messageSent: boolean;
}

export function decideAgentAction(reason: FailureReason, attemptNumber: number): IdealDecision {
  switch (reason) {
    case 'BANK_SERVER_ERROR':
      return { action: 'RETRY', delayDays: 0, messageSent: false };
    case 'INSUFFICIENT_FUNDS':
      return { action: 'RETRY', delayDays: 3, messageSent: true };
    case 'OTP_FAILED':
      return attemptNumber === 1
        ? { action: 'RETRY', delayDays: 0, messageSent: false }
        : { action: 'SEND_MESSAGE', delayDays: 0, messageSent: true };
    case 'CARD_EXPIRED':
      return { action: 'SEND_MESSAGE', delayDays: 0, messageSent: true };
    case 'INVALID_CARD_DETAILS':
      return { action: 'SEND_MESSAGE', delayDays: 0, messageSent: true };
    case 'DAILY_LIMIT_EXCEEDED':
      return { action: 'RETRY', delayDays: 1, messageSent: false };
    case 'RISK_DECLINED':
      return { action: 'ESCALATE', delayDays: 0, messageSent: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/decisionTable.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the naive strategy**

```ts
// tests/domain/naiveStrategy.test.ts
import { describe, it, expect } from 'vitest';
import { decideNaiveAction } from '../../src/domain/naiveStrategy';

describe('decideNaiveAction', () => {
  it('always retries immediately regardless of failure reason or attempt number', () => {
    const reasons = ['BANK_SERVER_ERROR', 'CARD_EXPIRED', 'RISK_DECLINED', 'INSUFFICIENT_FUNDS'] as const;
    for (const reason of reasons) {
      expect(decideNaiveAction(reason, 1)).toEqual({ action: 'RETRY', delayDays: 0, messageSent: false });
      expect(decideNaiveAction(reason, 2)).toEqual({ action: 'RETRY', delayDays: 0, messageSent: false });
    }
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/domain/naiveStrategy.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 7: Write `src/domain/naiveStrategy.ts`**

```ts
import { FailureReason } from './failureClassifier';
import { IdealDecision } from './decisionTable';

export function decideNaiveAction(_reason: FailureReason, _attemptNumber: number): IdealDecision {
  return { action: 'RETRY', delayDays: 0, messageSent: false };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/domain/naiveStrategy.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/domain/decisionTable.ts src/domain/naiveStrategy.ts tests/domain/decisionTable.test.ts tests/domain/naiveStrategy.test.ts
git commit -m "Add per-reason agent decision table and naive baseline strategy"
git push
```

---

## Task 6: Dunning policy (compliance caps + stopping rules)

**Files:**
- Create: `src/domain/dunningPolicy.ts`
- Test: `tests/domain/dunningPolicy.test.ts`

**Interfaces:**
- Consumes: `IdealDecision`, `AgentActionType` from `src/domain/decisionTable.ts` (Task 5).
- Produces: `applyDunningPolicy(ideal: IdealDecision, state: DunningState): FinalDecision`, and the `DunningState`, `FinalDecision`, `Tone` types — consumed by `batchRunner.ts` (Task 10).

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/dunningPolicy.test.ts
import { describe, it, expect } from 'vitest';
import { applyDunningPolicy } from '../../src/domain/dunningPolicy';
import { IdealDecision } from '../../src/domain/decisionTable';

const silentRetry: IdealDecision = { action: 'RETRY', delayDays: 0, messageSent: false };
const retryWithMessage: IdealDecision = { action: 'RETRY', delayDays: 3, messageSent: true };
const sendMessageOnly: IdealDecision = { action: 'SEND_MESSAGE', delayDays: 0, messageSent: true };
const escalate: IdealDecision = { action: 'ESCALATE', delayDays: 0, messageSent: false };

describe('applyDunningPolicy', () => {
  it('forces escalation once the attempt cap (3) is exceeded, regardless of the ideal action', () => {
    const result = applyDunningPolicy(silentRetry, { attemptNumber: 4, totalContactsSoFar: 0, lastContactDay: null, currentDay: 10 });
    expect(result).toEqual({ action: 'ESCALATE', messageSent: false, tone: null });
  });

  it('passes an already-escalate ideal decision straight through', () => {
    const result = applyDunningPolicy(escalate, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: null, currentDay: 0 });
    expect(result).toEqual({ action: 'ESCALATE', messageSent: false, tone: null });
  });

  it('passes a silent retry through unchanged when under all caps', () => {
    const result = applyDunningPolicy(silentRetry, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: null, currentDay: 0 });
    expect(result).toEqual({ action: 'RETRY', messageSent: false, tone: null });
  });

  it('escalates the tone ladder GENTLE -> FIRM -> FINAL as total contacts increase', () => {
    const gentle = applyDunningPolicy(retryWithMessage, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: null, currentDay: 0 });
    expect(gentle).toEqual({ action: 'RETRY', messageSent: true, tone: 'GENTLE' });

    const firm = applyDunningPolicy(retryWithMessage, { attemptNumber: 2, totalContactsSoFar: 1, lastContactDay: 0, currentDay: 3 });
    expect(firm).toEqual({ action: 'RETRY', messageSent: true, tone: 'FIRM' });

    const final = applyDunningPolicy(retryWithMessage, { attemptNumber: 3, totalContactsSoFar: 2, lastContactDay: 3, currentDay: 6 });
    expect(final).toEqual({ action: 'RETRY', messageSent: true, tone: 'FINAL' });
  });

  it('downgrades to a silent retry once the total-contact cap (3) is exhausted, if retrying is still possible', () => {
    const result = applyDunningPolicy(retryWithMessage, { attemptNumber: 4 - 1, totalContactsSoFar: 3, lastContactDay: 6, currentDay: 9 });
    expect(result).toEqual({ action: 'RETRY', messageSent: false, tone: null });
  });

  it('escalates once the total-contact cap is exhausted for a reason whose only recourse is messaging', () => {
    const result = applyDunningPolicy(sendMessageOnly, { attemptNumber: 1, totalContactsSoFar: 3, lastContactDay: 0, currentDay: 0 });
    expect(result).toEqual({ action: 'ESCALATE', messageSent: false, tone: null });
  });

  it('suppresses a same-simulated-day second contact and downgrades to a silent retry when possible', () => {
    const result = applyDunningPolicy(retryWithMessage, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: 0, currentDay: 0 });
    expect(result).toEqual({ action: 'RETRY', messageSent: false, tone: null });
  });

  it('escalates on a same-simulated-day collision for a message-only reason', () => {
    const result = applyDunningPolicy(sendMessageOnly, { attemptNumber: 1, totalContactsSoFar: 0, lastContactDay: 0, currentDay: 0 });
    expect(result).toEqual({ action: 'ESCALATE', messageSent: false, tone: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/dunningPolicy.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/domain/dunningPolicy.ts`**

```ts
import { IdealDecision, AgentActionType } from './decisionTable';

export type Tone = 'GENTLE' | 'FIRM' | 'FINAL';

export interface DunningState {
  attemptNumber: number;
  totalContactsSoFar: number;
  lastContactDay: number | null;
  currentDay: number;
}

export interface FinalDecision {
  action: AgentActionType;
  messageSent: boolean;
  tone: Tone | null;
}

const MAX_ATTEMPTS = 3;
const MAX_TOTAL_CONTACTS = 3;
const TONE_LADDER: Tone[] = ['GENTLE', 'FIRM', 'FINAL'];

export function applyDunningPolicy(ideal: IdealDecision, state: DunningState): FinalDecision {
  if (state.attemptNumber > MAX_ATTEMPTS) {
    return { action: 'ESCALATE', messageSent: false, tone: null };
  }
  if (ideal.action === 'ESCALATE') {
    return { action: 'ESCALATE', messageSent: false, tone: null };
  }
  if (!ideal.messageSent) {
    return { action: ideal.action, messageSent: false, tone: null };
  }
  if (state.totalContactsSoFar >= MAX_TOTAL_CONTACTS) {
    if (ideal.action === 'SEND_MESSAGE') {
      return { action: 'ESCALATE', messageSent: false, tone: null };
    }
    return { action: ideal.action, messageSent: false, tone: null };
  }
  if (state.lastContactDay !== null && state.lastContactDay === state.currentDay) {
    if (ideal.action === 'SEND_MESSAGE') {
      return { action: 'ESCALATE', messageSent: false, tone: null };
    }
    return { action: ideal.action, messageSent: false, tone: null };
  }
  const toneIndex = Math.min(state.totalContactsSoFar, TONE_LADDER.length - 1);
  return { action: ideal.action, messageSent: true, tone: TONE_LADDER[toneIndex] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/dunningPolicy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/dunningPolicy.ts tests/domain/dunningPolicy.test.ts
git commit -m "Add dunning policy enforcing retry/contact caps and tone ladder"
git push
```

---

## Task 7: Outcome simulator

**Files:**
- Create: `src/domain/outcomeSimulator.ts`
- Test: `tests/domain/outcomeSimulator.test.ts`

**Interfaces:**
- Consumes: `mulberry32` from `src/data/rng.ts` (Task 3, test-only).
- Produces: `simulateOutcome(groundTruthRecoverable: number, actionMatchesIdeal: boolean, rng: () => number): 'SUCCESS' | 'FAILURE'` — consumed by `batchRunner.ts` (Task 10).

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/outcomeSimulator.test.ts
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/domain/outcomeSimulator.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/domain/outcomeSimulator.ts`**

```ts
const MISMATCHED_ACTION_FLOOR = 0.02;

export function simulateOutcome(
  groundTruthRecoverable: number,
  actionMatchesIdeal: boolean,
  rng: () => number
): 'SUCCESS' | 'FAILURE' {
  const successProbability = actionMatchesIdeal ? groundTruthRecoverable : MISMATCHED_ACTION_FLOOR;
  return rng() < successProbability ? 'SUCCESS' : 'FAILURE';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/domain/outcomeSimulator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/outcomeSimulator.ts tests/domain/outcomeSimulator.test.ts
git commit -m "Add outcome simulator rewarding correct diagnosis over blind retries"
git push
```

---

## Task 8: LLM client (template fallback + OpenAI-compatible implementation)

**Files:**
- Create: `src/llm/llmClient.ts`
- Create: `src/llm/templateClient.ts`
- Create: `src/llm/openAICompatibleClient.ts`
- Create: `src/llm/index.ts`
- Test: `tests/llm/templateClient.test.ts`
- Test: `tests/llm/index.test.ts`

**Interfaces:**
- Consumes: `FailureReason` from `src/domain/failureClassifier.ts` (Task 4), `Tone` from `src/domain/dunningPolicy.ts` (Task 6).
- Produces: `LLMClient` interface, `MessageContext`, `ExplanationContext` types (`llmClient.ts`); `TemplateLLMClient` class (`templateClient.ts`); `OpenAICompatibleLLMClient` class (`openAICompatibleClient.ts`); `getLLMClient(): LLMClient` factory (`index.ts`) — consumed by `batchRunner.ts` (Task 10).

- [ ] **Step 1: Write `src/llm/llmClient.ts`**

```ts
import { FailureReason } from '../domain/failureClassifier';
import { Tone } from '../domain/dunningPolicy';

export interface MessageContext {
  reason: FailureReason;
  tone: Tone;
  amountRupees: number;
  isSubscription: boolean;
}

export interface ExplanationContext {
  reason: FailureReason;
  action: string;
  attemptNumber: number;
}

export interface LLMClient {
  draftMessage(ctx: MessageContext): Promise<string>;
  explainDecision(ctx: ExplanationContext): Promise<string>;
}
```

- [ ] **Step 2: Write the failing test for the template client**

```ts
// tests/llm/templateClient.test.ts
import { describe, it, expect } from 'vitest';
import { TemplateLLMClient } from '../../src/llm/templateClient';

describe('TemplateLLMClient', () => {
  const client = new TemplateLLMClient();
  const reasons = ['BANK_SERVER_ERROR', 'INSUFFICIENT_FUNDS', 'OTP_FAILED', 'CARD_EXPIRED', 'INVALID_CARD_DETAILS', 'DAILY_LIMIT_EXCEEDED', 'RISK_DECLINED'] as const;

  it('drafts a non-empty, amount-referencing message for every failure reason', async () => {
    for (const reason of reasons) {
      const message = await client.draftMessage({ reason, tone: 'GENTLE', amountRupees: 499, isSubscription: false });
      expect(message.length).toBeGreaterThan(10);
      expect(message).toContain('499');
    }
  });

  it('changes the message prefix as tone escalates', async () => {
    const gentle = await client.draftMessage({ reason: 'CARD_EXPIRED', tone: 'GENTLE', amountRupees: 999, isSubscription: true });
    const final = await client.draftMessage({ reason: 'CARD_EXPIRED', tone: 'FINAL', amountRupees: 999, isSubscription: true });
    expect(gentle).not.toBe(final);
  });

  it('explains a decision for every failure reason', async () => {
    for (const reason of reasons) {
      const explanation = await client.explainDecision({ reason, action: 'RETRY', attemptNumber: 1 });
      expect(explanation.length).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/llm/templateClient.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Write `src/llm/templateClient.ts`**

```ts
import { LLMClient, MessageContext, ExplanationContext } from './llmClient';

const TONE_PREFIX: Record<string, string> = {
  GENTLE: 'Just a reminder — ',
  FIRM: 'Following up again — ',
  FINAL: 'Final notice — ',
};

const REASON_MESSAGE: Record<string, (ctx: MessageContext) => string> = {
  BANK_SERVER_ERROR: (ctx) => `we're retrying your ₹${ctx.amountRupees} payment now that the bank/gateway issue should have cleared.`,
  INSUFFICIENT_FUNDS: (ctx) =>
    `we tried to collect ₹${ctx.amountRupees} for your ${ctx.isSubscription ? 'subscription renewal' : 'order'} but the payment didn't go through due to insufficient balance. We'll retry automatically in a few days.`,
  OTP_FAILED: (ctx) => `we couldn't confirm the OTP for your ₹${ctx.amountRupees} payment. Please update your payment method to try again.`,
  CARD_EXPIRED: (ctx) => `your card on file has expired, so we couldn't collect ₹${ctx.amountRupees}. Please update your payment method to avoid interruption.`,
  INVALID_CARD_DETAILS: (ctx) => `we couldn't verify your card details for the ₹${ctx.amountRupees} payment. Please re-enter your card details.`,
  DAILY_LIMIT_EXCEEDED: (ctx) => `your ₹${ctx.amountRupees} payment hit your daily transaction limit. We'll retry once the limit resets.`,
  RISK_DECLINED: (ctx) => `your ₹${ctx.amountRupees} payment was flagged for manual review. Our team will follow up shortly.`,
};

const REASON_EXPLANATION: Record<string, string> = {
  BANK_SERVER_ERROR: 'the failure looked transient (bank/gateway timeout), so a same-day retry is likely to succeed without contacting the customer.',
  INSUFFICIENT_FUNDS: 'the account likely needs time to be topped up, so we wait a few days and send a reminder rather than retrying immediately.',
  OTP_FAILED: 'a single OTP failure is often a one-off entry error, so we retry once before assuming the payment method needs updating.',
  CARD_EXPIRED: 'an expired card cannot succeed on retry, so we go straight to asking the customer to update their payment method.',
  INVALID_CARD_DETAILS: 'invalid card details cannot succeed on retry, so we go straight to asking the customer to re-enter them.',
  DAILY_LIMIT_EXCEEDED: 'the limit resets daily, so waiting a day before retrying is more likely to succeed than an immediate retry.',
  RISK_DECLINED: 'a risk-engine decline cannot be resolved by retrying and needs human judgment, so this goes straight to escalation.',
};

export class TemplateLLMClient implements LLMClient {
  async draftMessage(ctx: MessageContext): Promise<string> {
    const prefix = TONE_PREFIX[ctx.tone];
    const body = REASON_MESSAGE[ctx.reason](ctx);
    return `${prefix}${body}`;
  }

  async explainDecision(ctx: ExplanationContext): Promise<string> {
    const why = REASON_EXPLANATION[ctx.reason];
    return `Attempt ${ctx.attemptNumber}: chose ${ctx.action} because ${why}`;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/llm/templateClient.test.ts`
Expected: PASS

- [ ] **Step 6: Write `src/llm/openAICompatibleClient.ts`** (no dedicated unit test — it makes a real network call, exercised manually during the demo per Global Constraints)

```ts
import { LLMClient, MessageContext, ExplanationContext } from './llmClient';

export class OpenAICompatibleLLMClient implements LLMClient {
  constructor(private baseUrl: string, private apiKey: string, private model: string) {}

  private async chat(prompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
    });
    if (!res.ok) {
      throw new Error(`LLM request failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.choices[0].message.content.trim();
  }

  async draftMessage(ctx: MessageContext): Promise<string> {
    const prompt = `Write a short, ${ctx.tone.toLowerCase()}-tone payment reminder message (1-2 sentences) to a customer whose ₹${ctx.amountRupees} ${ctx.isSubscription ? 'subscription renewal' : 'payment'} failed due to: ${ctx.reason}. Do not include a greeting or signature.`;
    return this.chat(prompt);
  }

  async explainDecision(ctx: ExplanationContext): Promise<string> {
    const prompt = `In one sentence, explain why a payment recovery agent chose the action "${ctx.action}" on attempt ${ctx.attemptNumber} for a payment failure reason of "${ctx.reason}".`;
    return this.chat(prompt);
  }
}
```

- [ ] **Step 7: Write the failing test for the factory**

```ts
// tests/llm/index.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getLLMClient } from '../../src/llm';
import { TemplateLLMClient } from '../../src/llm/templateClient';
import { OpenAICompatibleLLMClient } from '../../src/llm/openAICompatibleClient';

describe('getLLMClient', () => {
  const originalKey = process.env.LLM_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = originalKey;
  });

  it('returns the template client when no API key is configured', () => {
    delete process.env.LLM_API_KEY;
    expect(getLLMClient()).toBeInstanceOf(TemplateLLMClient);
  });

  it('returns the OpenAI-compatible client when an API key is configured', () => {
    process.env.LLM_API_KEY = 'test-key';
    expect(getLLMClient()).toBeInstanceOf(OpenAICompatibleLLMClient);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run tests/llm/index.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 9: Write `src/llm/index.ts`**

```ts
import { LLMClient } from './llmClient';
import { TemplateLLMClient } from './templateClient';
import { OpenAICompatibleLLMClient } from './openAICompatibleClient';

export function getLLMClient(): LLMClient {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return new TemplateLLMClient();
  }
  const baseUrl = process.env.LLM_BASE_URL ?? 'https://api.x.ai/v1';
  const model = process.env.LLM_MODEL ?? 'grok-beta';
  return new OpenAICompatibleLLMClient(baseUrl, apiKey, model);
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run tests/llm/index.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/llm tests/llm
git commit -m "Add LLM client with Grok-compatible and template implementations"
git push
```

---

## Task 9: Batch creation (synthetic events → DB) + `POST /api/batches`

**Files:**
- Create: `src/pipeline/createBatch.ts`
- Create: `src/api/routes/batches.ts`
- Modify: `src/app.ts` (mount the batches router)
- Test: `tests/pipeline/createBatch.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `generateSyntheticEvents` (Task 3).
- Produces: `createBatch(count: number, seed: number, strategy: 'AGENT' | 'NAIVE' | 'BOTH'): Promise<Batch[]>` from `src/pipeline/createBatch.ts` — consumed by the API route in this task and by `runBatch` callers/tests in Task 10, and by `scripts/demo.ts` in Task 15.

- [ ] **Step 1: Write the failing test**

```ts
// tests/pipeline/createBatch.test.ts
import { describe, it, expect } from 'vitest';
import { createBatch } from '../../src/pipeline/createBatch';
import { prisma } from '../../src/db/client';

describe('createBatch', () => {
  it('creates one batch and matching payment events for a single strategy', async () => {
    const [batch] = await createBatch(5, 111, 'AGENT');
    expect(batch.strategy).toBe('AGENT');
    const events = await prisma.paymentEvent.findMany({ where: { batchId: batch.id } });
    expect(events.length).toBe(5);
  });

  it('creates two batches sharing the same seed with identical event sets for "BOTH"', async () => {
    const [agentBatch, naiveBatch] = await createBatch(5, 222, 'BOTH');
    expect(agentBatch.seed).toBe(222);
    expect(naiveBatch.seed).toBe(222);
    expect(agentBatch.strategy).toBe('AGENT');
    expect(naiveBatch.strategy).toBe('NAIVE');

    const agentEvents = await prisma.paymentEvent.findMany({ where: { batchId: agentBatch.id }, orderBy: { createdAt: 'asc' } });
    const naiveEvents = await prisma.paymentEvent.findMany({ where: { batchId: naiveBatch.id }, orderBy: { createdAt: 'asc' } });
    expect(agentEvents.length).toBe(5);
    expect(naiveEvents.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(agentEvents[i].amountPaise).toBe(naiveEvents[i].amountPaise);
      expect(agentEvents[i].gatewayErrorCode).toBe(naiveEvents[i].gatewayErrorCode);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline/createBatch.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/pipeline/createBatch.ts`**

```ts
import { Batch, BatchStrategy } from '@prisma/client';
import { prisma } from '../db/client';
import { generateSyntheticEvents } from '../data/syntheticGenerator';

export type CreateBatchStrategy = 'AGENT' | 'NAIVE' | 'BOTH';

export async function createBatch(count: number, seed: number, strategy: CreateBatchStrategy): Promise<Batch[]> {
  const events = generateSyntheticEvents(count, seed);
  const strategies: BatchStrategy[] = strategy === 'BOTH' ? ['AGENT', 'NAIVE'] : [strategy];
  const batches: Batch[] = [];

  for (const s of strategies) {
    const batch = await prisma.batch.create({
      data: { seed, eventCount: count, strategy: s, status: 'PENDING' },
    });
    for (const ev of events) {
      const customer = await prisma.customer.create({
        data: { name: ev.customerName, contact: ev.customerContact },
      });
      await prisma.paymentEvent.create({
        data: {
          batchId: batch.id,
          customerId: customer.id,
          type: ev.type,
          amountPaise: ev.amountPaise,
          gatewayErrorCode: ev.gatewayErrorCode,
          gatewayErrorMessage: ev.gatewayErrorMessage,
          groundTruthRecoverable: ev.groundTruthRecoverable,
        },
      });
    }
    batches.push(batch);
  }

  return batches;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pipeline/createBatch.test.ts`
Expected: PASS

- [ ] **Step 5: Write `src/api/routes/batches.ts` and mount it**

```ts
// src/api/routes/batches.ts
import { Router } from 'express';
import { createBatch } from '../../pipeline/createBatch';

export const batchesRouter = Router();

batchesRouter.post('/', async (req, res) => {
  const { count, seed, strategy } = req.body;
  if (!Number.isInteger(count) || count <= 0) {
    return res.status(400).json({ error: 'count must be a positive integer' });
  }
  if (!Number.isInteger(seed)) {
    return res.status(400).json({ error: 'seed must be an integer' });
  }
  if (!['AGENT', 'NAIVE', 'BOTH'].includes(strategy)) {
    return res.status(400).json({ error: 'strategy must be AGENT, NAIVE, or BOTH' });
  }
  const batches = await createBatch(count, seed, strategy);
  res.status(201).json({ batches });
});
```

```ts
// src/app.ts (add these lines)
import { batchesRouter } from './api/routes/batches';
// ...after app.get('/api/health', ...):
app.use('/api/batches', batchesRouter);
```

- [ ] **Step 6: Manually verify the endpoint**

Run: `npm run dev`, then in another terminal:
```bash
curl -X POST http://localhost:3000/api/batches -H "Content-Type: application/json" -d "{\"count\":5,\"seed\":1,\"strategy\":\"BOTH\"}"
```
Expected: HTTP 201 with a `batches` array of two objects.

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/createBatch.ts src/api/routes/batches.ts src/app.ts tests/pipeline/createBatch.test.ts
git commit -m "Add batch creation pipeline and POST /api/batches"
git push
```

---

## Task 10: Batch runner pipeline + run/status endpoints + naive-vs-agent proof test

**Files:**
- Create: `src/pipeline/batchRunner.ts`
- Modify: `src/api/routes/batches.ts` (add `POST /:id/run` and `GET /:id`)
- Test: `tests/pipeline/batchRunner.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `mulberry32` (Task 3), `classifyFailure` (Task 4), `decideAgentAction`/`decideNaiveAction` (Task 5), `applyDunningPolicy` (Task 6), `simulateOutcome` (Task 7), `getLLMClient` (Task 8), `createBatch` (Task 9, test-only).
- Produces: `runBatch(batchId: string): Promise<void>` from `src/pipeline/batchRunner.ts` — consumed by the API route in this task, by `computeReport`'s tests (Task 11), the events/audit endpoints' tests (Task 12), and `scripts/demo.ts` (Task 15).

This is the core of the whole system: it is the only place all the domain pieces are wired together, and it is what makes the spec's headline claim ("recovered ₹X of ₹Y, beating a naive baseline") checkable.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/pipeline/batchRunner.test.ts
import { describe, it, expect } from 'vitest';
import { createBatch } from '../../src/pipeline/createBatch';
import { runBatch } from '../../src/pipeline/batchRunner';
import { prisma } from '../../src/db/client';

describe('runBatch', () => {
  it('resolves every event to RECOVERED or ESCALATED and respects the compliance caps', async () => {
    const [batch] = await createBatch(20, 101, 'AGENT');
    await runBatch(batch.id);

    const events = await prisma.paymentEvent.findMany({
      where: { batchId: batch.id },
      include: { attempts: true },
    });
    expect(events.length).toBe(20);
    for (const event of events) {
      expect(['RECOVERED', 'ESCALATED']).toContain(event.status);
      expect(event.failureReason).not.toBeNull();
      expect(event.attempts.length).toBeLessThanOrEqual(3);
      const messageCount = event.attempts.filter((a) => a.messageSent).length;
      expect(messageCount).toBeLessThanOrEqual(3);
    }

    const updatedBatch = await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(updatedBatch.status).toBe('COMPLETE');
  });

  it('the tailored agent strategy recovers at least as much ₹ value as the naive retry-everything baseline on the same synthetic batch', async () => {
    const [agentBatch, naiveBatch] = await createBatch(100, 202, 'BOTH');
    await runBatch(agentBatch.id);
    await runBatch(naiveBatch.id);

    const sumRecoveredPaise = async (batchId: string) => {
      const recovered = await prisma.paymentEvent.findMany({ where: { batchId, status: 'RECOVERED' } });
      return recovered.reduce((sum, e) => sum + e.amountPaise, 0);
    };

    const agentRecovered = await sumRecoveredPaise(agentBatch.id);
    const naiveRecovered = await sumRecoveredPaise(naiveBatch.id);

    expect(agentRecovered).toBeGreaterThanOrEqual(naiveRecovered);
  });

  it('records a full DETECTED -> DIAGNOSED -> ... audit trail for every event', async () => {
    const [batch] = await createBatch(3, 303, 'AGENT');
    await runBatch(batch.id);
    const events = await prisma.paymentEvent.findMany({ where: { batchId: batch.id } });
    for (const event of events) {
      const entries = await prisma.auditLogEntry.findMany({
        where: { eventId: event.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries[0].step).toBe('DETECTED');
      expect(entries[1].step).toBe('DIAGNOSED');
      expect(entries.length).toBeGreaterThanOrEqual(4);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pipeline/batchRunner.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/pipeline/batchRunner.ts`**

```ts
import { AttemptAction, AttemptOutcome, AuditStep, EventStatus } from '@prisma/client';
import { prisma } from '../db/client';
import { mulberry32 } from '../data/rng';
import { classifyFailure } from '../domain/failureClassifier';
import { decideAgentAction } from '../domain/decisionTable';
import { decideNaiveAction } from '../domain/naiveStrategy';
import { applyDunningPolicy, DunningState } from '../domain/dunningPolicy';
import { simulateOutcome } from '../domain/outcomeSimulator';
import { getLLMClient } from '../llm';

const MAX_LOOP_SAFETY = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const llm = getLLMClient();

function addAuditEntry(eventId: string, step: AuditStep, detail: unknown, simulatedAt: Date) {
  return prisma.auditLogEntry.create({
    data: { eventId, step, detail: detail as any, createdAt: simulatedAt },
  });
}

export async function runBatch(batchId: string): Promise<void> {
  const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
  await prisma.batch.update({ where: { id: batchId }, data: { status: 'RUNNING' } });

  const events = await prisma.paymentEvent.findMany({ where: { batchId } });
  const rng = mulberry32(batch.seed + 1);

  for (const event of events) {
    await addAuditEntry(event.id, 'DETECTED', {
      gatewayErrorCode: event.gatewayErrorCode,
      gatewayErrorMessage: event.gatewayErrorMessage,
    }, event.createdAt);

    const reason = classifyFailure(event.gatewayErrorCode);
    await prisma.paymentEvent.update({ where: { id: event.id }, data: { failureReason: reason } });
    await addAuditEntry(event.id, 'DIAGNOSED', { failureReason: reason }, event.createdAt);

    let currentDay = 0;
    let totalContacts = 0;
    let lastContactDay: number | null = null;
    let attemptNumber = 1;
    let finalStatus: EventStatus = 'ESCALATED';

    while (attemptNumber <= MAX_LOOP_SAFETY) {
      const ideal = batch.strategy === 'AGENT' ? decideAgentAction(reason, attemptNumber) : decideNaiveAction(reason, attemptNumber);
      const trueIdeal = decideAgentAction(reason, attemptNumber);

      const state: DunningState = { attemptNumber, totalContactsSoFar: totalContacts, lastContactDay, currentDay };
      const final = applyDunningPolicy(ideal, state);
      const simulatedAt = new Date(event.createdAt.getTime() + currentDay * MS_PER_DAY);

      await addAuditEntry(event.id, 'DECIDED', { attemptNumber, action: final.action, tone: final.tone }, simulatedAt);

      if (final.action === 'ESCALATE') {
        const explanation = await llm.explainDecision({ reason, action: 'ESCALATE', attemptNumber });
        await addAuditEntry(event.id, 'ACTED', { action: 'ESCALATE', explanation }, simulatedAt);
        await addAuditEntry(event.id, 'TRACKED', { outcome: 'ESCALATED' }, simulatedAt);
        finalStatus = 'ESCALATED';
        break;
      }

      let messageText: string | null = null;
      if (final.messageSent) {
        messageText = await llm.draftMessage({
          reason,
          tone: final.tone!,
          amountRupees: event.amountPaise / 100,
          isSubscription: event.type === 'SUBSCRIPTION',
        });
        totalContacts += 1;
        lastContactDay = currentDay;
      }
      const explanation = await llm.explainDecision({ reason, action: final.action, attemptNumber });
      await addAuditEntry(event.id, 'ACTED', { action: final.action, messageText, explanation }, simulatedAt);

      const actionMatchesIdeal = final.action === trueIdeal.action;
      const outcome = simulateOutcome(event.groundTruthRecoverable, actionMatchesIdeal, rng);

      await prisma.retryAttempt.create({
        data: {
          eventId: event.id,
          attemptNumber,
          action: final.action as AttemptAction,
          messageSent: final.messageSent,
          scheduledFor: simulatedAt,
          executedAt: simulatedAt,
          outcome: outcome as AttemptOutcome,
        },
      });
      await addAuditEntry(event.id, 'TRACKED', { outcome }, simulatedAt);

      if (outcome === 'SUCCESS') {
        finalStatus = 'RECOVERED';
        break;
      }

      currentDay += ideal.delayDays;
      attemptNumber += 1;
    }

    await prisma.paymentEvent.update({ where: { id: event.id }, data: { status: finalStatus } });
  }

  await prisma.batch.update({ where: { id: batchId }, data: { status: 'COMPLETE' } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pipeline/batchRunner.test.ts`
Expected: PASS. Note: this test suite makes real calls through `getLLMClient()`; with no `LLM_API_KEY` set in `.env` it resolves to `TemplateLLMClient`, which is synchronous-fast and requires no network — keep it that way for this test run and for CI.

- [ ] **Step 5: Add the run/status routes**

```ts
// src/api/routes/batches.ts (add below the existing POST '/' handler)
import { runBatch } from '../../pipeline/batchRunner';
import { prisma } from '../../db/client';

batchesRouter.post('/:id/run', async (req, res) => {
  await runBatch(req.params.id);
  const batch = await prisma.batch.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ batch });
});

batchesRouter.get('/:id', async (req, res) => {
  const batch = await prisma.batch.findUnique({ where: { id: req.params.id } });
  if (!batch) return res.status(404).json({ error: 'not found' });
  res.json({ batch });
});
```

- [ ] **Step 6: Manually verify end-to-end**

Run: `npm run dev`, then:
```bash
curl -X POST http://localhost:3000/api/batches -H "Content-Type: application/json" -d "{\"count\":10,\"seed\":9,\"strategy\":\"AGENT\"}"
```
Take the returned batch id and:
```bash
curl -X POST http://localhost:3000/api/batches/<id>/run
```
Expected: response batch status is `COMPLETE`.

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/batchRunner.ts src/api/routes/batches.ts tests/pipeline/batchRunner.test.ts
git commit -m "Add batch runner pipeline proving agent beats naive baseline"
git push
```

---

## Task 11: Report aggregation + `GET /api/batches/:id/report`

**Files:**
- Create: `src/api/report.ts`
- Modify: `src/api/routes/batches.ts` (add `GET /:id/report`)
- Test: `tests/api/report.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `runBatch`/`createBatch` (test-only, Tasks 9–10).
- Produces: `computeReport(batchId: string): Promise<BatchReport>` and the `BatchReport`/`ReportBreakdownRow` types from `src/api/report.ts` — consumed by the route in this task and by `scripts/demo.ts` (Task 15).

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/report.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/report.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/api/report.ts`**

```ts
import { PaymentEvent } from '@prisma/client';
import { prisma } from '../db/client';

export interface ReportBreakdownRow {
  key: string;
  atRiskPaise: number;
  recoveredPaise: number;
  count: number;
  recoveredCount: number;
}

export interface BatchReport {
  batchId: string;
  atRiskPaise: number;
  recoveredPaise: number;
  recoveryRate: number;
  escalatedCount: number;
  byFailureReason: ReportBreakdownRow[];
  byType: ReportBreakdownRow[];
}

function breakdown(events: PaymentEvent[], keyFn: (e: PaymentEvent) => string): ReportBreakdownRow[] {
  const map = new Map<string, ReportBreakdownRow>();
  for (const e of events) {
    const key = keyFn(e);
    const row = map.get(key) ?? { key, atRiskPaise: 0, recoveredPaise: 0, count: 0, recoveredCount: 0 };
    row.atRiskPaise += e.amountPaise;
    row.count += 1;
    if (e.status === 'RECOVERED') {
      row.recoveredPaise += e.amountPaise;
      row.recoveredCount += 1;
    }
    map.set(key, row);
  }
  return Array.from(map.values());
}

export async function computeReport(batchId: string): Promise<BatchReport> {
  const events = await prisma.paymentEvent.findMany({ where: { batchId } });

  const atRiskPaise = events.reduce((sum, e) => sum + e.amountPaise, 0);
  const recoveredPaise = events.filter((e) => e.status === 'RECOVERED').reduce((sum, e) => sum + e.amountPaise, 0);
  const escalatedCount = events.filter((e) => e.status === 'ESCALATED').length;

  return {
    batchId,
    atRiskPaise,
    recoveredPaise,
    recoveryRate: atRiskPaise === 0 ? 0 : recoveredPaise / atRiskPaise,
    escalatedCount,
    byFailureReason: breakdown(events, (e) => e.failureReason ?? 'UNKNOWN'),
    byType: breakdown(events, (e) => e.type),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/report.test.ts`
Expected: PASS

- [ ] **Step 5: Add the report route**

```ts
// src/api/routes/batches.ts (add)
import { computeReport } from '../report';

batchesRouter.get('/:id/report', async (req, res) => {
  const report = await computeReport(req.params.id);
  res.json(report);
});
```

- [ ] **Step 6: Commit**

```bash
git add src/api/report.ts src/api/routes/batches.ts tests/api/report.test.ts
git commit -m "Add recovery report aggregation and GET /api/batches/:id/report"
git push
```

---

## Task 12: Events list + audit-trail endpoints

**Files:**
- Create: `src/api/routes/events.ts`
- Modify: `src/api/routes/batches.ts` (add `GET /:id/events`)
- Modify: `src/app.ts` (mount the events router)
- Test: `tests/api/events.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `createBatch`/`runBatch` (test-only).
- Produces: nothing consumed by later tasks in code, but this is what Tasks 13–14's dashboard calls over HTTP (`GET /api/batches/:id/events`, `GET /api/events/:id/audit`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/events.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/events.test.ts`
Expected: FAIL — `src/api/routes/events.ts` does not exist.

- [ ] **Step 3: Write `src/api/routes/events.ts` and wire it up**

```ts
// src/api/routes/events.ts
import { Router } from 'express';
import { prisma } from '../../db/client';

export const eventsRouter = Router();

eventsRouter.get('/:id/audit', async (req, res) => {
  const entries = await prisma.auditLogEntry.findMany({
    where: { eventId: req.params.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ entries });
});
```

```ts
// src/api/routes/batches.ts (add)
batchesRouter.get('/:id/events', async (req, res) => {
  const events = await prisma.paymentEvent.findMany({ where: { batchId: req.params.id } });
  res.json({ events });
});
```

```ts
// src/app.ts (add)
import { eventsRouter } from './api/routes/events';
app.use('/api/events', eventsRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/events.ts src/api/routes/batches.ts src/app.ts tests/api/events.test.ts
git commit -m "Add events list and per-event audit trail endpoints"
git push
```

---

## Task 13: Dashboard skeleton — run control + summary cards

**Files:**
- Create: `public/index.html`
- Create: `public/dashboard.css`
- Create: `public/dashboard.js`
- Modify: `src/app.ts` (serve the `public` directory)
- Test: `tests/app.static.test.ts`

**Interfaces:**
- Consumes (over HTTP, from the browser): `POST /api/batches`, `POST /api/batches/:id/run`, `GET /api/batches/:id/report` (Tasks 9–11).
- Produces: the `loadReport()` JS function and the `#summary-cards`/`#at-risk-value`/`#agent-recovered-value`/`#naive-recovered-value`/`#delta-value` DOM elements that Task 14 extends.

- [ ] **Step 1: Write the failing static-serving test**

```ts
// tests/app.static.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app.static.test.ts`
Expected: FAIL — no static files served yet.

- [ ] **Step 3: Write `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Revenue Recovery Agent</title>
  <link rel="stylesheet" href="dashboard.css" />
</head>
<body>
  <h1>Revenue Recovery Agent</h1>

  <section id="run-control">
    <label>Count <input id="count-input" type="number" value="300" min="1" /></label>
    <label>Seed <input id="seed-input" type="number" value="42" /></label>
    <button id="run-both-btn">Run Agent vs Naive</button>
    <span id="run-status"></span>
  </section>

  <section id="summary-cards" hidden>
    <div class="card"><h3>At Risk</h3><p id="at-risk-value">-</p></div>
    <div class="card"><h3>Recovered (Agent)</h3><p id="agent-recovered-value">-</p></div>
    <div class="card"><h3>Recovered (Naive)</h3><p id="naive-recovered-value">-</p></div>
    <div class="card"><h3>Recovery Rate Delta</h3><p id="delta-value">-</p></div>
  </section>

  <script src="dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write `public/dashboard.css`**

```css
body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
#run-control { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
#summary-cards { display: flex; gap: 1rem; margin: 1rem 0; }
.card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; min-width: 160px; }
.card h3 { margin: 0 0 0.5rem; font-size: 0.85rem; color: #666; text-transform: uppercase; }
.card p { margin: 0; font-size: 1.2rem; font-weight: 600; }
```

- [ ] **Step 5: Write `public/dashboard.js`**

```js
const runBtn = document.getElementById('run-both-btn');
const runStatus = document.getElementById('run-status');
let agentBatchId = null;
let naiveBatchId = null;

runBtn.addEventListener('click', async () => {
  const count = Number(document.getElementById('count-input').value);
  const seed = Number(document.getElementById('seed-input').value);
  runBtn.disabled = true;
  runStatus.textContent = 'Creating batches...';

  const createRes = await fetch('/api/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, seed, strategy: 'BOTH' }),
  });
  const { batches } = await createRes.json();
  agentBatchId = batches.find((b) => b.strategy === 'AGENT').id;
  naiveBatchId = batches.find((b) => b.strategy === 'NAIVE').id;

  runStatus.textContent = 'Running agent strategy...';
  await fetch(`/api/batches/${agentBatchId}/run`, { method: 'POST' });
  runStatus.textContent = 'Running naive baseline...';
  await fetch(`/api/batches/${naiveBatchId}/run`, { method: 'POST' });

  runStatus.textContent = 'Loading report...';
  await loadReport();
  runBtn.disabled = false;
  runStatus.textContent = 'Done';
});

function formatRupees(paise) {
  return `₹${(paise / 100).toFixed(2)}`;
}

async function loadReport() {
  const [agentReportRes, naiveReportRes] = await Promise.all([
    fetch(`/api/batches/${agentBatchId}/report`),
    fetch(`/api/batches/${naiveBatchId}/report`),
  ]);
  const agentReport = await agentReportRes.json();
  const naiveReport = await naiveReportRes.json();

  document.getElementById('summary-cards').hidden = false;
  document.getElementById('at-risk-value').textContent = formatRupees(agentReport.atRiskPaise);
  document.getElementById('agent-recovered-value').textContent =
    `${formatRupees(agentReport.recoveredPaise)} (${(agentReport.recoveryRate * 100).toFixed(1)}%)`;
  document.getElementById('naive-recovered-value').textContent =
    `${formatRupees(naiveReport.recoveredPaise)} (${(naiveReport.recoveryRate * 100).toFixed(1)}%)`;
  const delta = (agentReport.recoveryRate - naiveReport.recoveryRate) * 100;
  document.getElementById('delta-value').textContent = `+${delta.toFixed(1)} pts`;
}
```

- [ ] **Step 6: Serve the `public` directory from `src/app.ts`**

```ts
// src/app.ts (add near the top, after app.use(express.json()))
import path from 'path';
app.use(express.static(path.join(__dirname, '..', 'public')));
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/app.static.test.ts`
Expected: PASS

- [ ] **Step 8: Manually verify in a browser**

Run: `npm run dev`, open `http://localhost:3000`, click "Run Agent vs Naive" with the default count/seed, and confirm the four summary cards populate with plausible ₹ figures within a few seconds.

- [ ] **Step 9: Commit**

```bash
git add public src/app.ts tests/app.static.test.ts
git commit -m "Add dashboard skeleton with run control and summary cards"
git push
```

---

## Task 14: Dashboard — events table, audit-trail drawer, breakdown chart, escalation queue

**Files:**
- Modify: `public/index.html` (add chart/table/drawer/escalation markup)
- Modify: `public/dashboard.css` (styling for the additions)
- Modify: `public/dashboard.js` (rendering logic)
- Test: `tests/app.static.test.ts` (extend)

**Interfaces:**
- Consumes (over HTTP): `GET /api/batches/:id/events`, `GET /api/events/:id/audit` (Task 12); `byFailureReason` from the report response (Task 11).

- [ ] **Step 1: Extend the failing static test**

```ts
// tests/app.static.test.ts (add this test to the existing describe block)
it('includes the audit drawer and events table markup', async () => {
  const res = await request(app).get('/');
  expect(res.text).toContain('audit-drawer');
  expect(res.text).toContain('events-table');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app.static.test.ts`
Expected: FAIL — markup not present yet.

- [ ] **Step 3: Extend `public/index.html`** (insert before `<script src="dashboard.js">`)

```html
<section id="breakdown-section" hidden>
  <h2>Recovery rate by failure reason</h2>
  <svg id="breakdown-chart" width="600" height="240"></svg>
</section>

<section id="events-section" hidden>
  <h2>Events (agent run)</h2>
  <table id="events-table">
    <thead>
      <tr><th>Amount</th><th>Type</th><th>Failure reason</th><th>Status</th><th></th></tr>
    </thead>
    <tbody id="events-body"></tbody>
  </table>
</section>

<section id="escalation-section" hidden>
  <h2>Escalated to human</h2>
  <ul id="escalation-list"></ul>
</section>

<dialog id="audit-drawer">
  <h2>Audit trail</h2>
  <ol id="audit-list"></ol>
  <button id="close-drawer-btn">Close</button>
</dialog>
```

- [ ] **Step 4: Extend `public/dashboard.css`**

```css
table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
dialog { width: 500px; max-height: 80vh; overflow-y: auto; }
#audit-list li { margin-bottom: 0.5rem; }
#breakdown-chart rect { fill: #4a7dfc; }
#breakdown-chart text { font-size: 10px; }
```

- [ ] **Step 5: Extend `public/dashboard.js`**

```js
// dashboard.js (add after loadReport's definition; call loadEvents() from the click handler,
// right after the existing `await loadReport();` line)

function renderBreakdownChart(rows) {
  const svg = document.getElementById('breakdown-chart');
  document.getElementById('breakdown-section').hidden = false;
  svg.innerHTML = '';
  const barWidth = 60;
  rows.forEach((row, i) => {
    const rate = row.count === 0 ? 0 : row.recoveredCount / row.count;
    const barHeight = rate * 180;
    const x = i * (barWidth + 20) + 20;
    const y = 200 - barHeight;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', barWidth);
    rect.setAttribute('height', barHeight);
    svg.appendChild(rect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', 220);
    label.textContent = row.key;
    svg.appendChild(label);
  });
}

async function loadEvents() {
  const res = await fetch(`/api/batches/${agentBatchId}/events`);
  const { events } = await res.json();
  document.getElementById('events-section').hidden = false;
  document.getElementById('escalation-section').hidden = false;

  const body = document.getElementById('events-body');
  body.innerHTML = '';
  const escalationList = document.getElementById('escalation-list');
  escalationList.innerHTML = '';

  for (const event of events) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatRupees(event.amountPaise)}</td>
      <td>${event.type}</td>
      <td>${event.failureReason ?? '-'}</td>
      <td>${event.status}</td>
      <td><button data-event-id="${event.id}" class="view-audit-btn">View audit</button></td>
    `;
    body.appendChild(row);

    if (event.status === 'ESCALATED') {
      const li = document.createElement('li');
      li.textContent = `${formatRupees(event.amountPaise)} - ${event.failureReason}`;
      escalationList.appendChild(li);
    }
  }

  document.querySelectorAll('.view-audit-btn').forEach((btn) => {
    btn.addEventListener('click', () => showAuditTrail(btn.dataset.eventId));
  });
}

async function showAuditTrail(eventId) {
  const res = await fetch(`/api/events/${eventId}/audit`);
  const { entries } = await res.json();
  const list = document.getElementById('audit-list');
  list.innerHTML = '';
  for (const entry of entries) {
    const li = document.createElement('li');
    li.textContent = `[${entry.step}] ${new Date(entry.createdAt).toLocaleString()} - ${JSON.stringify(entry.detail)}`;
    list.appendChild(li);
  }
  document.getElementById('audit-drawer').showModal();
}

document.getElementById('close-drawer-btn').addEventListener('click', () => {
  document.getElementById('audit-drawer').close();
});
```

Also update `loadReport()`'s last line and the click handler to wire the new pieces in:

```js
// dashboard.js: inside loadReport(), after setting #delta-value, add:
  renderBreakdownChart(agentReport.byFailureReason);
```

```js
// dashboard.js: inside the runBtn click handler, replace the line
//   await loadReport();
// with:
  await loadReport();
  await loadEvents();
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/app.static.test.ts`
Expected: PASS

- [ ] **Step 7: Manually verify in a browser**

Run: `npm run dev`, open `http://localhost:3000`, run a batch, then confirm: the breakdown chart renders bars per failure reason, the events table lists every event, clicking "View audit" opens a dialog with the ordered DETECTED→…→TRACKED trail, and any `ESCALATED` events appear in the escalation list.

- [ ] **Step 8: Commit**

```bash
git add public tests/app.static.test.ts
git commit -m "Add events table, audit-trail drawer, breakdown chart, and escalation queue to dashboard"
git push
```

---

## Task 15: Demo CLI script + README finalization

**Files:**
- Create: `scripts/demo.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `createBatch` (Task 9), `runBatch` (Task 10), `computeReport` (Task 11).

- [ ] **Step 1: Write `scripts/demo.ts`**

```ts
import 'dotenv/config';
import { createBatch } from '../src/pipeline/createBatch';
import { runBatch } from '../src/pipeline/batchRunner';
import { computeReport } from '../src/api/report';
import { prisma } from '../src/db/client';

async function main() {
  const count = Number(process.argv[2] ?? 300);
  const seed = Number(process.argv[3] ?? 42);

  const [agentBatch, naiveBatch] = await createBatch(count, seed, 'BOTH');
  await runBatch(agentBatch.id);
  await runBatch(naiveBatch.id);

  const agentReport = await computeReport(agentBatch.id);
  const naiveReport = await computeReport(naiveBatch.id);

  const toRupees = (paise: number) => (paise / 100).toFixed(2);

  console.log(`\nBatch of ${count} synthetic failed payments (seed ${seed})`);
  console.log(`Total at risk: Rs ${toRupees(agentReport.atRiskPaise)}`);
  console.log(`Agent strategy recovered: Rs ${toRupees(agentReport.recoveredPaise)} (${(agentReport.recoveryRate * 100).toFixed(1)}%)`);
  console.log(`Naive retry-everything baseline recovered: Rs ${toRupees(naiveReport.recoveredPaise)} (${(naiveReport.recoveryRate * 100).toFixed(1)}%)`);
  console.log(`Agent escalated to human review: ${agentReport.escalatedCount} of ${count} events`);
  console.log('\nAgent recovery rate by failure reason:');
  for (const row of agentReport.byFailureReason) {
    const rate = row.count === 0 ? 0 : (row.recoveredCount / row.count) * 100;
    console.log(`  ${row.key}: ${rate.toFixed(1)}% (${row.recoveredCount}/${row.count})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Run the demo script**

Run: `npm run demo -- 300 42`
Expected: prints the batch summary, the agent-vs-naive ₹ comparison, escalation count, and the per-failure-reason breakdown, with the agent's recovery rate at or above the naive baseline's.

- [ ] **Step 3: Finalize `README.md`** — replace the placeholder README from Task 1 with the full version:

```markdown
# Revenue Recovery Agent

Closes the loop on failed payments: detect -> diagnose -> decide -> act -> track,
for both one-off checkout failures and recurring subscription dunning, and proves
it against a naive "retry everything the same way" baseline on a synthetic batch.

## Setup
1. `cp .env.example .env`
2. `docker compose up -d` (starts Postgres on port 5433)
3. `npm install`
4. `npx prisma migrate dev`
5. `npm run dev` -- starts the server on http://localhost:3000
6. Open http://localhost:3000 for the dashboard.

To use a real LLM for message drafting/explanations (optional -- the app works
end-to-end without this via a template fallback), set `LLM_API_KEY` in `.env`.
The client is OpenAI-chat-completions-compatible, so an xAI Grok key works with
the default `LLM_BASE_URL`/`LLM_MODEL` in `.env.example`.

## Tests
`npm test` -- requires the Postgres container from step 2 to be running.

## Demo (CLI, no browser needed)
`npm run demo -- 300 42` -- generates a 300-event synthetic batch (seed 42),
runs it through both the agent and naive-baseline strategies, and prints the
recovered-Rs comparison plus a per-failure-reason breakdown.

## Design
See [docs/superpowers/specs/2026-08-30-revenue-recovery-agent-design.md](docs/superpowers/specs/2026-08-30-revenue-recovery-agent-design.md).
```

- [ ] **Step 4: Commit**

```bash
git add scripts/demo.ts README.md package.json
git commit -m "Add demo CLI script and finalize README"
git push
```
