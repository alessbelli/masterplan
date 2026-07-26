# masterplan — roadmap

A tiny web app on Cloudflare Workers + D1.

Kept light on purpose: scope is known, so there's no research/de-risking phase
(see `docs/decisions/0002-lighter-single-package-setup.md`).

## Phases

### Phase 0 — Bootstrap ✅ (this PR)
Repo structure, playbook link, and a live end-to-end slice (D1-backed notes)
with a passing Vitest suite and one Playwright trace. **Status: done pending
review.**

### Phase 1 — Provision + first deploy
Human creates the D1 database and Cloudflare Worker; paste the `database_id`
into `wrangler.jsonc`; first `wrangler deploy` (confirmed per `guidance/09`).

### Phase 2 — The actual product: a macro-based meal planner
Rebuild the `MasterPlan3.1.xlsm` workbook as a tiny web app — food + recipe
databases, a macro calculator, weekly planning, a per-day macro **optimizer**
(LP, replacing Excel Solver), a shopping-list rollup, and weight progression.
See `spec.md` (what it does + how the workbook implements it) and
`build-plan.md` (Workers + D1 architecture, schema/migrations, fixtures, the
feature-by-feature port, gaps, and open decisions). PoC scope: no signup,
anonymous per-workspace data, every feature tested with fixtures lifted from the
spreadsheet. Keep the same loops (Vitest + local D1 inner loop, one Playwright
trace per slice).

## Guardrails (from product-builder)
- Never commit to `main`; branch → CI → human review → merge.
- Loops < 1s; prove web progress with one Playwright trace; observability-first.
- Be frugal with CI minutes and tokens.
- Confirm every production deploy / destructive Cloudflare op with a human first.
