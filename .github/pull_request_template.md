## What & why

<!-- What does this change do, and why? Link the issue: Closes #NN -->

## How it was verified

<!-- Name the tests/commands run (locally first). For web behavior, the CI
     "playwright-traces" artifact holds the trace — open it via
     https://trace.playwright.dev (drag-drop). -->

- [ ] `pnpm typecheck`
- [ ] `pnpm test` (unit + handler, real local D1)
- [ ] `pnpm test:e2e` (if the web surface changed) — trace attached/linked

## Reviewer notes

<!-- Anything to scrutinize, trade-offs, follow-ups. Flag any stack deviation
     that needs an ADR. Note observability added for new failure modes. -->

## Checklist

- [ ] Branch off `main`; not committing to `main` directly.
- [ ] Ran the checks locally before pushing.
- [ ] CI is green.
- [ ] Docs/ADRs updated if this changes structure or decisions.
