# masterplan

A tiny meal-planner web app on **Cloudflare Workers + D1** (Hono) — a rebuild of
the `MasterPlan3.1.xlsm` workbook. Build a week of meals from a food/recipe
catalog, let the optimizer tune ingredient grams to hit your macro targets, and
roll it up into a shopping list.

**Live PoC:** https://masterplan.aless-jeant.workers.dev

> Built with the [`product-builder`](https://github.com/alessbelli/product-builder)
> playbook, kept deliberately light: single package, no market/competitive
> research. Agents read `product-builder/guidance/*` (like a skill) before
> planning or building. **Never commit to `main`** — branch → CI → human review → merge.

## Quick start

```bash
pnpm install
pnpm typecheck
pnpm test            # unit + handler tests against a real local D1 (ms)

pnpm db:setup:local  # migrate + seed the local D1 (368 foods, 356 recipes)
pnpm dev             # wrangler dev — the app at http://127.0.0.1:8787

# e2e (records a Playwright trace). Locally, reuse the sandbox browser:
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e
```

## What it does

- `GET /` — the single-page UI (from `public/`).
- `/api/foods`, `/api/recipes` — the catalog: a shared **global** library plus
  per-workspace foods and copy-on-write **variants**; names via locale captions.
- `/api/targets`, `/api/plan`, `/api/days/:d/build`, `/api/days/:d/optimize` —
  set macro targets, plan recipes into the week, expand a day, and run the LP
  **optimizer** (own tiny simplex) to hit macros within tolerance.
- `/api/shopping` — grams per food across the week, grouped by category.
- `GET /health` — liveness; pings D1. Anonymous per-workspace (cookie), no signup.

Every request emits one structured JSON log line with a correlation id.

## Layout

```
src/domain/    Pure TS: macros, simplex LP, day optimizer, shopping, i18n
src/index.ts   Hono API (workspace-scoped)   src/seed.ts  test seeding
public/        Single-page UI
migrations/    D1 schema   db/seed-reference.sql  generated catalog seed
fixtures/      Catalog + golden scenario (also test data)
test/ e2e/     Vitest (real local D1) + one Playwright spec/trace
docs/          spec.md, build-plan.md, roadmap, status, decisions
```

## Deploy

Already deployed (see `docs/planning/status.md` for the exact commands). The D1
`database_id` is in `wrangler.jsonc` (an identifier, not a secret). CI deploys on
merge to `main`, gated on `CLOUDFLARE_API_TOKEN`; add it as a GitHub Actions
secret to enable auto-deploy.

## Status

See [`docs/planning/status.md`](docs/planning/status.md) and
[`docs/planning/roadmap.md`](docs/planning/roadmap.md).
