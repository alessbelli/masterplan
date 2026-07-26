import { describe, expect, it } from "vitest";
import { maximize } from "../src/domain/simplex";

describe("simplex", () => {
  it("maximizes a single bounded variable", () => {
    const r = maximize([1], [{ coeffs: [1], type: "<=", rhs: 5 }]);
    expect(r.status).toBe("optimal");
    expect(r.x[0]).toBeCloseTo(5);
    expect(r.objective).toBeCloseTo(5);
  });

  it("handles two variables with a shared budget", () => {
    const r = maximize(
      [1, 1],
      [
        { coeffs: [1, 1], type: "<=", rhs: 4 },
        { coeffs: [1, 0], type: "<=", rhs: 3 },
      ],
    );
    expect(r.status).toBe("optimal");
    expect(r.objective).toBeCloseTo(4);
  });

  it("handles >= constraints (minimize via maximize of the negative)", () => {
    const r = maximize([-1], [{ coeffs: [1], type: ">=", rhs: 2 }]);
    expect(r.status).toBe("optimal");
    expect(r.x[0]).toBeCloseTo(2);
  });

  it("handles equality constraints", () => {
    const r = maximize(
      [0, 1],
      [
        { coeffs: [1, 1], type: "=", rhs: 5 },
        { coeffs: [1, 0], type: "<=", rhs: 2 },
      ],
    );
    expect(r.status).toBe("optimal");
    expect(r.x[1]).toBeCloseTo(5);
  });

  it("detects infeasibility", () => {
    const r = maximize(
      [1],
      [
        { coeffs: [1], type: "<=", rhs: 1 },
        { coeffs: [1], type: ">=", rhs: 2 },
      ],
    );
    expect(r.status).toBe("infeasible");
  });

  it("detects unboundedness", () => {
    const r = maximize([1], [{ coeffs: [-1], type: "<=", rhs: 0 }]);
    expect(r.status).toBe("unbounded");
  });
});
