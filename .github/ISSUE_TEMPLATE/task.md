---
name: Task
about: A self-contained, independently-mergeable unit of work for one agent/PR.
title: "[area] short imperative title"
labels: ["status:ready"]
---

## Goal

One or two sentences: what this task delivers and why.

## Scope (self-contained)

- [ ] Concrete change 1
- [ ] Concrete change 2

Out of scope: <what this deliberately does NOT touch, to avoid collisions>

## Definition of done

- [ ] Code + tests on a branch; draft PR open and linked (`Closes #NN`).
- [ ] Inner-loop tests pass (< 1s where possible), run locally.
- [ ] For web behavior: one Playwright trace published / attached.
- [ ] Observability in place for anything that can fail (logs/beacon).
- [ ] CI green.
- [ ] Human review requested.

## Notes / dependencies

Blocked by / blocks: #NN. Relevant files, research, or ADRs.
