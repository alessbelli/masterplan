# 0001 — Record architecture decisions

- **Status:** accepted
- **Date:** 2026-07-26
- **Deciders:** project bootstrap

## Context

This project is built by agents and humans over time, with consequential
technical choices. We need a durable, low-ceremony record of *why* choices were
made so contributors don't re-litigate or silently drift.

## Decision

Use lightweight **Architecture Decision Records** in `docs/decisions/`, one file
per decision, numbered `NNNN-title.md`, following
`product-builder/templates/adr-template.md`. A decision that changes a
`product-builder` default is recorded here and, if broadly reusable, reflected in
`product-builder`.

## Consequences

- Every non-trivial/architectural choice gets a short ADR.
- ADRs are immutable once accepted; revisiting means a superseding ADR.
- Reviewers can require an ADR for stack deviations.
