# 0004 — Prioritized (lexicographic) day optimizer

- **Status:** accepted
- **Date:** 2026-07-28
- **Deciders:** optimizer redesign

## Context

The first optimizer had a single objective (maximize carbs) with calorie /
protein / fat all pinned near a point target. We wanted a richer, more
realistic model: a **calorie range** you scale quantity into, then **maximize
protein** within that range, then **minimize fat** — and to be able to re-order
or change those priorities easily later. The open question was whether the LP /
simplex is enough.

## Decision

Keep the simplex; solve **lexicographically**. Goals are a data list solved in
priority order (`src/domain/optimize.ts`):

- `range` / `target` goals become hard constraints.
- `maximize` / `minimize` goals are each solved to their true optimum by the
  simplex, then **locked in as a constraint** before the next, lower-priority
  goal runs — so a later goal can never undo an earlier one.

The default pipeline is the one tweak point, `defaultGoals(target, band)`:

```
1. calories  → range  [target.kcal·(1−band), target.kcal·(1+band)]
2. protein   → maximize
3. fat       → minimize
```

Re-order that array, swap `maximize`/`minimize`, or add goals (e.g. a fat cap, or
`minimize` carbs) — nothing else changes. Callers can also pass a custom goal
list to `optimizeGoals(items, goals)`.

**Quantity** is the per-ingredient grams variable, bounded by an editable
`[min_g, max_g]`; widening `max_g` lets the optimizer make a larger serving to
reach the calorie range. The result includes a per-goal outcome
(`achieved`, `satisfied`) so the UI can explain what it did.

## Why the simplex is "good enough"

Each stage is a **linear program**, which is convex — the simplex finds the
**global** optimum, not a local one. Lexicographic solving over an LP is a
standard, exact technique; there are no bad local minima to get stuck in. If a
future goal needs a nonlinear relationship (e.g. per-recipe integer serving
counts), that stage would need an integer/nonlinear solver — noted for later.

## Consequences

- Protein/fat "targets" are no longer point goals by default — protein is
  maximized and fat minimized. The targets still show in the day-total
  comparison for reference; calorie target + band drives the range.
- Infeasibility is reported per ranged macro (which one is out of reach, and
  whether too low/high).
- The pipeline is trivial to tweak; tests cover the ordering (protein is not
  sacrificed to cut fat), the calorie-range/quantity behavior, a custom
  pipeline, and infeasibility.
