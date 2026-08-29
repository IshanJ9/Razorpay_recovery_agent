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
