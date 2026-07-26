// Day optimizer: choose grams for each ingredient so the day hits its macro
// targets, mirroring the workbook's Solver. It's a bounded linear program —
//   maximize total carbs   (≈ "eat as much as you're allowed")
//   s.t.  kcal / protein / fat within ±ε of target,  min_g ≤ grams ≤ max_g
// which we solve with the tiny simplex in simplex.ts.

import { type Constraint, maximize } from "./simplex";
import type { Macros, Per100 } from "./macros";
import { dayMacros } from "./macros";

export interface OptimizeItem extends Per100 {
  min_g: number;
  max_g: number;
  servings: number;
}

export interface OptimizeResult {
  status: "optimal" | "infeasible";
  grams: number[];
  macros: Macros;
  /** Which target macros can't be met within ±ε given the gram bounds. */
  unmet: { macro: "kcal" | "protein" | "fat"; direction: "too_low" | "too_high" }[];
}

const MACROS = [
  { key: "kcal", per100: "kcal_100g", target: "kcal" },
  { key: "protein", per100: "protein_100g", target: "protein_g" },
  { key: "fat", per100: "fat_100g", target: "fat_g" },
] as const;

/** Coefficient turning grams of item k into a unit of macro m (per serving). */
function coeff(item: OptimizeItem, per100Key: keyof Per100): number {
  return item[per100Key] / 100 / (item.servings || 1);
}

export function optimizeDay(
  items: OptimizeItem[],
  targets: Macros,
  epsilon = 0.05,
): OptimizeResult {
  const n = items.length;
  if (n === 0) {
    return { status: "optimal", grams: [], macros: { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 }, unmet: [] };
  }

  // Substitute grams_k = min_k + y_k, with y_k >= 0 and y_k <= (max_k - min_k),
  // so the simplex only deals with non-negative variables.
  const span = items.map((it) => Math.max(0, it.max_g - it.min_g));

  const constraints: Constraint[] = [];

  // Per-variable upper bound: y_k <= span_k.
  for (let k = 0; k < n; k++) {
    const row = new Array<number>(n).fill(0);
    row[k] = 1;
    constraints.push({ coeffs: row, type: "<=", rhs: span[k] });
  }

  // Report infeasible macros up front via a range check (necessary condition):
  // achievable ∈ [Σ coef·min, Σ coef·max]; compare to the target band.
  const unmet: OptimizeResult["unmet"] = [];
  for (const m of MACROS) {
    const coeffs = items.map((it) => coeff(it, m.per100));
    const lo = items.reduce((s, it, k) => s + coeffs[k] * it.min_g, 0);
    const hi = items.reduce((s, it, k) => s + coeffs[k] * it.max_g, 0);
    const target = targets[m.target];
    if (target * (1 - epsilon) > hi + 1e-6) unmet.push({ macro: m.key, direction: "too_low" });
    else if (target * (1 + epsilon) < lo - 1e-6) unmet.push({ macro: m.key, direction: "too_high" });

    // In y-space: lo_band <= base + Σ coef·y <= hi_band, base = Σ coef·min.
    const base = lo;
    constraints.push({ coeffs, type: "<=", rhs: target * (1 + epsilon) - base });
    constraints.push({ coeffs, type: ">=", rhs: target * (1 - epsilon) - base });
  }

  // Objective: maximize total carbs = Σ coefCarb·y (+ const dropped).
  const objective = items.map((it) => coeff(it, "carb_100g"));
  const res = maximize(objective, constraints);

  if (res.status !== "optimal") {
    return { status: "infeasible", grams: items.map((it) => it.min_g), macros: macrosFor(items, items.map((it) => it.min_g)), unmet };
  }

  // Reconstruct grams and round to whole grams within bounds (as the workbook does).
  const grams = items.map((it, k) => {
    const g = it.min_g + (res.x[k] ?? 0);
    return Math.min(it.max_g, Math.max(it.min_g, Math.round(g)));
  });
  return { status: "optimal", grams, macros: macrosFor(items, grams), unmet };
}

function macrosFor(items: OptimizeItem[], grams: number[]): Macros {
  return dayMacros(items.map((it, k) => ({ ...it, grams: grams[k] })));
}
