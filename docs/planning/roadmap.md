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

### Phase 2 — The actual product
Replace the placeholder notes slice with the real feature set. Keep the same
loops (Vitest + local D1 for the inner loop, one Playwright trace per slice).

## Guardrails (from product-builder)
- Never commit to `main`; branch → CI → human review → merge.
- Loops < 1s; prove web progress with one Playwright trace; observability-first.
- Be frugal with CI minutes and tokens.
- Confirm every production deploy / destructive Cloudflare op with a human first.
