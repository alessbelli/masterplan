# masterplan — status snapshot

> Human-readable snapshot only. **GitHub Issues are the source of truth** for
> task status (`product-builder/guidance/07`).

_Last updated: 2026-07-26_

## Now
- **PoC is built and deployed:** https://masterplan.aless-jeant.workers.dev
  (Cloudflare Workers + D1). The core loop works end to end — food/recipe
  catalog (368 foods, 356 recipes seeded), manual macro targets, week planning,
  day build, the LP **optimizer** (own TS simplex), and shopping-list rollup.
- 22 tests (domain + handler vs real D1) + one Playwright e2e trace; all green.
- Spec/plan: `spec.md`, `build-plan.md` (decisions resolved in §9).

## Next
1. Post-PoC per `build-plan.md`: the **macro calculator** (feature 9),
   **progression** log + CSV import (feature 10), recipe create/edit UI, food
   category management, and filling in translations.
2. Optional hardening: auth/durable users, global-catalog moderation, Imperial
   units, charts.

## Blocked / needs a human
- **CI auto-deploy needs GitHub secrets.** D1 is provisioned (`wrangler.jsonc`
  has the real `database_id`) and the app is deployed manually. For the CI
  deploy-on-merge job to run, add `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets (least-privilege: Workers +
  D1). Without them the deploy job skips cleanly; `main` stays green.

## Provisioning / deploy (done; recorded for reproducibility)
```bash
wrangler d1 create masterplan            # → database_id (now in wrangler.jsonc)
pnpm gen:seed                            # fixtures → db/seed-reference.sql
wrangler d1 migrations apply masterplan --remote
pnpm db:seed:remote                      # one-time load of the shared catalog
wrangler deploy
```

## Recently done
- Built + deployed the meal-planner PoC (domain, API, UI, tests). Live at
  https://masterplan.aless-jeant.workers.dev
- Repo scaffolded from the product-builder playbook (kept light: single package,
  no market/technical research). See `docs/decisions/`.
