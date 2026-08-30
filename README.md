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
the default `LLM_BASE_URL`/`LLM_MODEL` in `.env.example`. A 300-event run with a
real `LLM_API_KEY` configured makes many sequential API calls and takes
significantly longer than template-fallback mode -- use a smaller count (e.g.
20-50) when demoing with a real LLM key.

## Tests
`npm test` -- requires the Postgres container from step 2 to be running.

## Known audit findings
`npm audit` reports vulnerabilities entirely within the `prisma` CLI's
devDependency chain (via `@prisma/config` -> `deepmerge-ts`), which is not part
of the deployed app's runtime dependencies and therefore does not affect the
running service.

## Demo (CLI, no browser needed)
`npm run demo -- 300 42` -- generates a 300-event synthetic batch (seed 42),
runs it through both the agent and naive-baseline strategies, and prints the
recovered-Rs comparison plus a per-failure-reason breakdown.

## Design
See [docs/superpowers/specs/2026-08-30-revenue-recovery-agent-design.md](docs/superpowers/specs/2026-08-30-revenue-recovery-agent-design.md).
