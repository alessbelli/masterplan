# Deployment

masterplan runs on **Cloudflare Workers + D1**, deployed automatically by
**Workers Builds** — the Cloudflare GitHub app — reading `wrangler.jsonc`.

**Live:** <https://masterplan.aless-jeant.workers.dev>

## How deploys happen

```
branch push ──▶ Workers Builds ──▶ preview version   (wrangler versions upload)
merge to main ─▶ Workers Builds ──▶ production deploy (wrangler deploy)
```

Previously deploys were manual (`pnpm deploy` locally). They're now automatic on
merge to `main`. GitHub Actions **only verifies** and holds no Cloudflare
credentials — `CLOUDFLARE_API_TOKEN` never enters Actions, because Workers Builds
authenticates through the installed GitHub app.

### What actually protects production

Workers Builds deploys on push to `main` — it does **not** wait for the Actions
run. That's acceptable only because nothing reaches `main` except through a
reviewed PR (`product-builder/guidance/05`). Make that enforceable with
**branch protection** on `main`:

- Require the **`verify`** status check.
- Require a pull request + approving review.
- Disallow direct pushes.

**This is the one setup step that matters most.**

## One-time setup (Cloudflare dashboard)

Workers → the `masterplan` Worker → **Settings → Build**:

| Setting | Value |
| ------- | ----- |
| Repository | `alessbelli/masterplan` (via the Cloudflare GitHub app) |
| Production branch | `main` |
| Root directory | *(repo root — this is a single-package repo)* |
| **Build command** | **`pnpm install --frozen-lockfile && pnpm build:client`** |
| Deploy command | `npx wrangler deploy` |
| Non-production deploy command | `npx wrangler versions upload` |

> **Build-step gotcha:** the client bundle (`public/planner-core.js`) is produced
> by esbuild via `pnpm build:client`. If the build command omits it, the Worker
> deploys with a stale or missing client bundle and the UI breaks *without the
> deploy failing*. Keep it in the build command.

## Database (D1) — not automatic

Migrations are **not** run by Workers Builds. Apply them deliberately:

```bash
pnpm db:migrate:local      # local D1
pnpm db:migrate:remote     # production D1 — confirm with a human first
```

⚠️ Remote D1 migrations and seeds are **destructive/production operations** —
confirm with a human before running (`product-builder/guidance/09`). A token in
the environment is not permission.

## Manual deploy (escape hatch)

```bash
pnpm build:client && wrangler deploy --dry-run   # validate
pnpm deploy                                      # confirm with a human first
```

## Observability

`wrangler.jsonc` sets `observability.enabled`, so logs stay reachable:

```bash
wrangler tail
```

## Checklist status

- [x] `wrangler.jsonc` with `$schema` + `observability.enabled`
- [ ] Repo connected in the Cloudflare dashboard (Workers Builds)
- [ ] Build command includes `pnpm build:client`
- [ ] Non-production deploy command set for branch previews
- [ ] **Branch protection on `main`** requiring `verify` + review
- [x] CI contains no deploy step and no Cloudflare token
