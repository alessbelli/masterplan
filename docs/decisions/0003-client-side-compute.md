# 0003 — Compute on the client; server is catalog + persistence

- **Status:** accepted
- **Date:** 2026-07-27
- **Deciders:** performance pass

## Context

Measuring the live PoC showed the cost is **round-trips, not work**: a no-DB
`/health` took ~308 ms while a 368-row `/api/foods` query took ~331 ms — i.e. the
server + D1 do ~20 ms of work and the rest is network latency. The first UI was
chatty: a request per search keystroke, three round-trips to optimize a day, two
per gram edit, one for the shopping list — each a full round-trip for trivial,
pure computation.

## Decision

Move computation to the browser and use the server only for the catalog and
background persistence.

- **One-shot load.** `GET /api/catalog` (foods + recipes + ingredients, ~28 KB
  gzipped) and `GET /api/state` (targets, day items, extras) are fetched once on
  boot. Search, macro totals, the **day optimizer**, and the shopping rollup then
  run locally.
- **Shared code, one implementation.** The pure domain modules (`src/domain/*`)
  are bundled to the browser as `public/planner-core.js` via esbuild
  (`pnpm build:client`) — the exact code that's unit-tested for the server, so
  there's no second implementation to keep in sync.
- **Background persistence.** State changes (targets, a day's items) are written
  fire-and-forget (`PUT /api/targets`, `PUT /api/days/:weekday` — one batched
  write per day). The UI updates from local compute immediately and never blocks
  on a save.
- **Measurement stays in.** The Worker emits a `Server-Timing` header and the UI
  shows a network-vs-server readout, so regressions are visible.

## Consequences

- After boot, search / optimize / macro recompute / shopping make **zero**
  requests and feel instant; optimize went from ~3 round-trips to a sub-millisecond
  local call.
- The client bundle is a build artifact (git-ignored); `dev`, the e2e webServer,
  and `deploy` all run `build:client` first.
- Trade-offs to revisit post-PoC: the catalog is refetched per session (fine at
  this size; could be cached/paginated if it grows a lot), and background saves
  are best-effort (acceptable for an anonymous PoC; add ordering/conflict handling
  if multi-device editing becomes real).
