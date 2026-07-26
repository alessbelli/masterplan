# 0002 — Lighter, single-package setup

- **Status:** accepted
- **Date:** 2026-07-26
- **Deciders:** project bootstrap (with the human's explicit direction)

## Context

The `product-builder` playbook defaults to a pnpm **workspace monorepo**
(`apps/` + `services/` + `packages/` + `e2e/`) and a discovery process that
includes `docs/research/` (market/competitive + technical viability). masterplan
is a **tiny** app whose scope is already known — "we know exactly what we're
building" — so the full ceremony would be overhead, not leverage.

## Decision

Deviate from the playbook in two ways, keeping everything else (Workers + D1 +
Hono, Vitest inner loop, one Playwright trace, gated CI/deploy, observability):

1. **Single package.** One `package.json` at the repo root; `src/`, `test/`,
   `e2e/`, `migrations/`, `public/` — no workspace split. If the app grows enough
   to need shared packages or multiple deployables, a superseding ADR introduces
   workspaces.
2. **No research phase.** Skip `docs/research/` (market and technical). Keep
   `docs/planning/` (roadmap, status) and `docs/decisions/` (ADRs).

## Consequences

- Faster to navigate and cheaper to run for a small app; less structure to
  maintain.
- The playbook's monorepo conventions still apply *if* we later split; this ADR
  is the record of why we started flat.
- Reviewers should not treat the missing `apps/services/packages` layout or the
  absent `docs/research/` as an oversight — it's intentional and scoped here.
