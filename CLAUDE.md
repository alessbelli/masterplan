# masterplan — agent context

masterplan is a tiny web app on Cloudflare Workers + D1. This file orients an
agent working in this repo.

## Pull the playbook first

You start with two repos in context: **this repo** and **product-builder**. Treat
`product-builder` like a skill — read its `guidance/*` before planning or
building. Start at `product-builder/CLAUDE.md`. Prime directives:

- **Never commit to `main`.** Branch → draft PR → CI green → human review → merge.
- **Check the environment/credentials first**; ask for what's missing (`guidance/09`).
- **Iteration loops < 1s** wherever possible; ≤ 30–60s for complex flows.
- **Prove web progress with one Playwright trace** of an e2e behavioral spec.
- **Observability-first**, like test-first (`guidance/10`).
- **Be frugal** with CI minutes/tokens; run tests locally before pushing.

## Intentionally lighter than the full playbook

This project's scope is known, so we skip the heavy discovery: **no
`docs/research/` (market or technical), no competitive analysis**. We also keep a
**single package** (no pnpm workspace / `apps` + `services` + `packages` split)
because the app is tiny. Both deviations are recorded in `docs/decisions/`.

## Where things are

- `src/index.ts` — the Hono Worker (routes, D1 access, request logging).
- `src/notes.ts` — pure domain logic (validation), unit-tested in microseconds.
- `src/log.ts` — structured JSON logging.
- `migrations/` — D1 schema. `public/` — static UI.
- `test/` — Vitest against a real local D1 (`@cloudflare/vitest-pool-workers`).
- `e2e/` — one Playwright spec + traces.
- `docs/planning/` — roadmap, status. `docs/decisions/` — ADRs.

## The loops

```
pnpm install
pnpm test        # unit + handler tests (ms) — the inner loop
pnpm typecheck
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e  # web e2e + trace
```

## Working here

- Claim a `status:ready`, unassigned GitHub Issue (assign self →
  `status:in-progress`). One issue = one branch = one draft PR (`guidance/07`).
- Keep tasks self-contained; prefer adding files over editing shared ones.
- Record reusable learnings back in `product-builder/learnings/` (`guidance/11`).

## Deployed

- Live at https://masterplan.aless-jeant.workers.dev. D1 is provisioned
  (`wrangler.jsonc` has the real `database_id`) and seeded from
  `db/seed-reference.sql`. CI auto-deploy on merge needs `CLOUDFLARE_API_TOKEN`
  as a GitHub Actions secret (skips cleanly without it). See `docs/planning/status.md`.

## Post-PoC (planned)

- Macro calculator, progression log + CSV import, recipe create/edit UI, food
  category management, translations. See `docs/planning/build-plan.md`.
