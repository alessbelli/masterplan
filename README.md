# masterplan

A tiny web app on **Cloudflare Workers + D1** (Hono).

> Built with the [`product-builder`](https://github.com/alessbelli/product-builder)
> playbook, kept deliberately light: single package, no market/competitive
> research. Agents read `product-builder/guidance/*` (like a skill) before
> planning or building. **Never commit to `main`** — branch → CI → human review → merge.

## Quick start

```bash
pnpm install
pnpm typecheck
pnpm test            # unit + handler tests against a real local D1 (ms)
pnpm dev             # wrangler dev — the app at http://127.0.0.1:8787

# e2e (records a Playwright trace). Locally, reuse the sandbox browser:
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e
```

## What it does

- `GET /` — the tiny UI (static, from `public/`).
- `GET /api/notes` / `POST /api/notes` — a D1-backed notes list (the vertical
  slice that proves Worker ↔ D1 wiring).
- `GET /health` — liveness; pings D1.
- `POST /client-error` — client-error beacon (observability).

Every request emits one structured JSON log line with a correlation id.

## Layout

```
src/           Worker: Hono app (index.ts), pure domain logic (notes.ts), logging
public/        Static UI served by the Worker's asset binding
migrations/    D1 schema migrations
test/          Vitest (real local D1 via @cloudflare/vitest-pool-workers)
e2e/           One Playwright behavioral spec + traces
docs/          planning (roadmap, status) + decisions (ADRs)
.github/       CI workflow, issue + PR templates
```

## Deploying (needs a human first)

The Cloudflare D1 database isn't provisioned yet. See
[`docs/planning/status.md`](docs/planning/status.md) for the exact one-time steps.
CI deploys on merge to `main`, gated on `CLOUDFLARE_API_TOKEN` and a real
`database_id` in `wrangler.jsonc`; until then it skips cleanly.

## Status

See [`docs/planning/status.md`](docs/planning/status.md) and
[`docs/planning/roadmap.md`](docs/planning/roadmap.md).
