# masterplan — status snapshot

> Human-readable snapshot only. **GitHub Issues are the source of truth** for
> task status (`product-builder/guidance/07`).

_Last updated: 2026-07-26_

## Now
- Bootstrap complete: Workers + D1 (Hono) app with a D1-backed notes slice,
  Vitest suite (real local D1), one Playwright e2e trace, and CI. Draft PR open.
- Product spec reverse-engineered from `MasterPlan3.1.xlsm` → `spec.md`; the
  Workers + D1 rebuild is planned in `build-plan.md`. The 4 build decisions are
  **resolved** (§9): hybrid global+personal libraries, own TS simplex optimizer,
  i18n-from-day-one (English UI, translatable captions), calculator post-PoC.

## Next
1. On go-ahead: generate fixtures + migrations from the workbook, then build the
   meal-planner slices in `build-plan.md` §6 order (i18n → food/recipe DB →
   manual targets → planning → day build → optimizer → shopping list →
   progression), each behind fixture-backed tests.
2. Human: provision Cloudflare D1 + Worker, then first deploy (see below).

## Blocked / needs a human
- **Cloudflare D1 not provisioned.** The Cloudflare token + account id are
  present in the environment, but per `guidance/09` I did not create cloud
  resources without a go-ahead. To provision:
  ```bash
  wrangler d1 create masterplan          # prints a database_id
  # paste that id into wrangler.jsonc (replaces the 000…000 placeholder)
  wrangler d1 migrations apply masterplan --remote
  ```
  Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions
  secrets (least-privilege: Workers + D1). CI deploy skips cleanly until both the
  token and a real `database_id` exist.

## Recently done
- Repo scaffolded from the product-builder playbook (kept light: single package,
  no market/technical research). See `docs/decisions/`.
