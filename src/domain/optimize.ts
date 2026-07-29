// Day optimizer. Ingredient grams (the "quantity") are the decision variables,
// each bounded by [min_g, max_g] — widen a food's max to allow a larger serving.
//
// Goals are solved LEXICOGRAPHICALLY (in priority order): the default is
//   1. calories within a RANGE          (a band, not a point)
//   2. MAXIMIZE protein within that range
//   3. MINIMIZE fat, without giving up any of that protein
// Each stage is a linear program solved to its true optimum by the simplex
// (LP is convex — no bad local minima); once solved, a stage's result is locked
// in as a constraint before the next stage runs. The pipeline is data — edit
// `defaultGoals` (or pass your own) to re-order or change it.

import { type Constraint, maximize } from "./simplex";
import type { Macros, Per100 } from "./macros";
import { dayMacros } from "./macros";

export interface OptimizeItem extends Per100 {
  min_g: number;
  max_g: number;
  servings: number;
}

export type MacroKey = "kcal" | "protein" | "fat" | "carb";
export type GoalKind = "range" | "target" | "maximize" | "minimize";

export type Goal =
  | { macro: MacroKey; kind: "range"; min: number; max: number }
  | { macro: MacroKey; kind: "target"; value: number; tolerance: number }
  | { macro: MacroKey; kind: "maximize" }
  | { macro: MacroKey; kind: "minimize" };

export interface GoalOutcome {
  macro: MacroKey;
  kind: GoalKind;
  achieved: number;
  band?: { min: number; max: number };
  satisfied: boolean;
}

export interface OptimizeResult {
  status: "optimal" | "infeasible";
  grams: number[];
  macros: Macros;
  goals: GoalOutcome[];
  /** For infeasible days: which target macros can't be met, and how. */
  unmet: { macro: MacroKey; direction: "too_low" | "too_high" }[];
}

const FIELD: Record<MacroKey, { per100: keyof Per100; macro: keyof Macros }> = {
  kcal: { per100: "kcal_100g", macro: "kcal" },
  protein: { per100: "protein_100g", macro: "protein_g" },
  fat: { per100: "fat_100g", macro: "fat_g" },
  carb: { per100: "carb_100g", macro: "carb_g" },
};

/** The default, tweakable priority pipeline: calorie band → max protein → min fat. */
export function defaultGoals(target: Macros, band = 0.05): Goal[] {
  return [
    { macro: "kcal", kind: "range", min: target.kcal * (1 - band), max: target.kcal * (1 + band) },
    { macro: "protein", kind: "maximize" },
    { macro: "fat", kind: "minimize" },
  ];
}

/** Backwards-compatible entry point: optimize a day toward its target. */
export function optimizeDay(items: OptimizeItem[], target: Macros, epsilon = 0.05): OptimizeResult {
  return optimizeGoals(items, defaultGoals(target, epsilon));
}

export function optimizeGoals(items: OptimizeItem[], goals: Goal[]): OptimizeResult {
  const n = items.length;
  if (n === 0) return { status: "optimal", grams: [], macros: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 }, goals: [], unmet: [] };

  // Substitute grams_k = min_k + y_k, y_k ∈ [0, span_k], so the simplex sees
  // only non-negative variables.
  const span = items.map((it) => Math.max(0, it.max_g - it.min_g));
  const coeffsFor = (m: MacroKey) => items.map((it) => it[FIELD[m].per100] / 100 / (it.servings || 1));
  const baseFor = (cs: number[]) => items.reduce((s, it, k) => s + cs[k] * it.min_g, 0);

  const constraints: Constraint[] = [];
  for (let k = 0; k < n; k++) {
    const row = new Array<number>(n).fill(0);
    row[k] = 1;
    constraints.push({ coeffs: row, type: "<=", rhs: span[k] });
  }

  const feasible = () => maximize(new Array<number>(n).fill(0), constraints).status === "optimal";
  let failed: Goal | null = null;

  for (const g of goals) {
    const cs = coeffsFor(g.macro);
    const base = baseFor(cs);
    if (g.kind === "range" || g.kind === "target") {
      const lo = g.kind === "range" ? g.min : g.value * (1 - g.tolerance);
      const hi = g.kind === "range" ? g.max : g.value * (1 + g.tolerance);
      constraints.push({ coeffs: cs, type: "<=", rhs: hi - base });
      constraints.push({ coeffs: cs, type: ">=", rhs: lo - base });
      if (!feasible()) { failed = g; break; }
    } else {
      const dir = g.kind === "maximize" ? 1 : -1;
      const res = maximize(cs.map((v) => dir * v), constraints);
      if (res.status !== "optimal") { failed = g; break; }
      const yval = res.objective * dir; // Σ cs·y at the optimum
      const delta = 1e-6 * (1 + Math.abs(yval));
      // Lock this objective so later, lower-priority goals can't undo it.
      constraints.push(
        g.kind === "maximize"
          ? { coeffs: cs, type: ">=", rhs: yval - delta }
          : { coeffs: cs, type: "<=", rhs: yval + delta },
      );
    }
  }

  if (failed) {
    const grams = items.map((it) => it.min_g);
    return { status: "infeasible", grams, macros: macrosFor(items, grams), goals: report(items, grams, goals), unmet: rangeUnmet(items, goals) };
  }

  const sol = maximize(new Array<number>(n).fill(0), constraints);
  const grams = items.map((it, k) => Math.min(it.max_g, Math.max(it.min_g, Math.round(it.min_g + (sol.x[k] ?? 0)))));
  return { status: "optimal", grams, macros: macrosFor(items, grams), goals: report(items, grams, goals), unmet: [] };
}

function macrosFor(items: OptimizeItem[], grams: number[]): Macros {
  return dayMacros(items.map((it, k) => ({ ...it, grams: grams[k] })));
}

// Per-goal outcome from the final grams (for an explainable result).
function report(items: OptimizeItem[], grams: number[], goals: Goal[]): GoalOutcome[] {
  const m = macrosFor(items, grams);
  return goals.map((g) => {
    const achieved = m[FIELD[g.macro].macro];
    if (g.kind === "range" || g.kind === "target") {
      const lo = g.kind === "range" ? g.min : g.value * (1 - g.tolerance);
      const hi = g.kind === "range" ? g.max : g.value * (1 + g.tolerance);
      const tol = Math.max(1, hi * 1e-3);
      return { macro: g.macro, kind: g.kind, achieved, band: { min: lo, max: hi }, satisfied: achieved >= lo - tol && achieved <= hi + tol };
    }
    return { macro: g.macro, kind: g.kind, achieved, satisfied: true };
  });
}

// For infeasible days: which ranged macro is out of reach given the gram bounds.
function rangeUnmet(items: OptimizeItem[], goals: Goal[]): { macro: MacroKey; direction: "too_low" | "too_high" }[] {
  const out: { macro: MacroKey; direction: "too_low" | "too_high" }[] = [];
  for (const g of goals) {
    if (g.kind !== "range" && g.kind !== "target") continue;
    const cs = items.map((it) => it[FIELD[g.macro].per100] / 100 / (it.servings || 1));
    const lo = items.reduce((s, it, k) => s + cs[k] * it.min_g, 0);
    const hi = items.reduce((s, it, k) => s + cs[k] * it.max_g, 0);
    const bandLo = g.kind === "range" ? g.min : g.value * (1 - g.tolerance);
    const bandHi = g.kind === "range" ? g.max : g.value * (1 + g.tolerance);
    if (bandLo > hi + 1e-6) out.push({ macro: g.macro, direction: "too_low" });
    else if (bandHi < lo - 1e-6) out.push({ macro: g.macro, direction: "too_high" });
  }
  return out;
}
