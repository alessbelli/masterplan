// A tiny two-phase simplex LP solver — no dependencies, so it runs in the
// Worker and unit-tests in microseconds. Replaces the Excel Solver used by the
// workbook's day optimizer. Solves:  maximize c·x  s.t. constraints, x >= 0.
//
// Bland's rule is used for both entering and leaving choices to guarantee
// termination (no cycling). Problems here are small (tens of variables).

export type ConstraintType = "<=" | ">=" | "=";
export interface Constraint {
  coeffs: number[]; // length = number of structural variables
  type: ConstraintType;
  rhs: number;
}
export interface LPResult {
  status: "optimal" | "infeasible" | "unbounded";
  x: number[];
  objective: number;
}

const EPS = 1e-9;

export function maximize(c: number[], constraintsIn: Constraint[]): LPResult {
  const n = c.length;

  // Normalize every constraint to rhs >= 0 (flip the row + relation if needed).
  const cons = constraintsIn.map((con) => {
    let { coeffs, type, rhs } = con;
    coeffs = coeffs.slice();
    if (rhs < 0) {
      coeffs = coeffs.map((v) => -v);
      rhs = -rhs;
      type = type === "<=" ? ">=" : type === ">=" ? "<=" : "=";
    }
    return { coeffs, type, rhs };
  });
  const m = cons.length;

  // Column layout: [structural | slack/surplus (one per <= or >=) | artificial].
  let col = n;
  const auxCol: number[] = []; // slack (+1) for <=, surplus (-1) for >=, else -1
  for (let i = 0; i < m; i++) auxCol[i] = cons[i].type === "=" ? -1 : col++;
  const artCol: number[] = [];
  for (let i = 0; i < m; i++) artCol[i] = cons[i].type === "<=" ? -1 : col++;
  const total = col;

  const T: number[][] = [];
  const rhs: number[] = [];
  const basis: number[] = [];
  const isArt = new Array<boolean>(total).fill(false);

  for (let i = 0; i < m; i++) {
    const row = new Array<number>(total).fill(0);
    for (let j = 0; j < n; j++) row[j] = cons[i].coeffs[j];
    if (cons[i].type === "<=") {
      row[auxCol[i]] = 1;
      basis[i] = auxCol[i];
    } else if (cons[i].type === ">=") {
      row[auxCol[i]] = -1;
      row[artCol[i]] = 1;
      basis[i] = artCol[i];
      isArt[artCol[i]] = true;
    } else {
      row[artCol[i]] = 1;
      basis[i] = artCol[i];
      isArt[artCol[i]] = true;
    }
    T.push(row);
    rhs.push(cons[i].rhs);
  }

  const run = (cost: number[], allowed: boolean[]): "optimal" | "unbounded" => {
    for (;;) {
      // Entering column: first with reduced cost (z_j - c_j) < -EPS (Bland).
      let enter = -1;
      for (let j = 0; j < total; j++) {
        if (!allowed[j]) continue;
        let zj = 0;
        for (let i = 0; i < m; i++) zj += cost[basis[i]] * T[i][j];
        if (zj - cost[j] < -EPS) {
          enter = j;
          break;
        }
      }
      if (enter === -1) return "optimal";

      // Leaving row: min ratio; tie-break by smallest basis index (Bland).
      let leave = -1;
      let best = Infinity;
      for (let i = 0; i < m; i++) {
        if (T[i][enter] > EPS) {
          const ratio = rhs[i] / T[i][enter];
          if (ratio < best - EPS || (Math.abs(ratio - best) < EPS && (leave === -1 || basis[i] < basis[leave]))) {
            best = ratio;
            leave = i;
          }
        }
      }
      if (leave === -1) return "unbounded";

      // Pivot on (leave, enter).
      const piv = T[leave][enter];
      for (let j = 0; j < total; j++) T[leave][j] /= piv;
      rhs[leave] /= piv;
      for (let i = 0; i < m; i++) {
        if (i === leave) continue;
        const f = T[i][enter];
        if (Math.abs(f) > EPS) {
          for (let j = 0; j < total; j++) T[i][j] -= f * T[leave][j];
          rhs[i] -= f * rhs[leave];
        }
      }
      basis[leave] = enter;
    }
  };

  // Phase 1: maximize -Σ artificials; if the optimum isn't 0, it's infeasible.
  const cost1 = new Array<number>(total).fill(0);
  for (let j = 0; j < total; j++) if (isArt[j]) cost1[j] = -1;
  run(cost1, new Array<boolean>(total).fill(true));
  let w = 0;
  for (let i = 0; i < m; i++) w += cost1[basis[i]] * rhs[i];
  if (w < -1e-6) return { status: "infeasible", x: [], objective: 0 };

  // Phase 2: real objective; forbid artificials from re-entering the basis.
  const cost2 = new Array<number>(total).fill(0);
  for (let j = 0; j < n; j++) cost2[j] = c[j];
  const allowed2 = new Array<boolean>(total).fill(true);
  for (let j = 0; j < total; j++) if (isArt[j]) allowed2[j] = false;
  if (run(cost2, allowed2) === "unbounded") return { status: "unbounded", x: [], objective: 0 };

  const x = new Array<number>(n).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = rhs[i];
  let objective = 0;
  for (let j = 0; j < n; j++) objective += c[j] * x[j];
  return { status: "optimal", x, objective };
}
