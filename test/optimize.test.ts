import { describe, expect, it } from "vitest";
import { optimizeDay } from "../src/domain/optimize";

const P = { kcal_100g: 400, protein_100g: 100, fat_100g: 0, carb_100g: 0, servings: 1 }; // protein source
const C = { kcal_100g: 400, protein_100g: 0, fat_100g: 0, carb_100g: 100, servings: 1 }; // carb source

describe("day optimizer", () => {
  it("finds grams that hit the macro targets within tolerance", () => {
    const res = optimizeDay(
      [
        { ...P, min_g: 0, max_g: 200 },
        { ...C, min_g: 0, max_g: 200 },
      ],
      { kcal: 400, protein_g: 50, fat_g: 0, carb_g: 0 },
      0.05,
    );
    expect(res.status).toBe("optimal");
    expect(res.macros.protein_g).toBeGreaterThanOrEqual(50 * 0.95 - 1);
    expect(res.macros.protein_g).toBeLessThanOrEqual(50 * 1.05 + 1);
    expect(res.macros.kcal).toBeGreaterThanOrEqual(400 * 0.95 - 4);
    expect(res.macros.kcal).toBeLessThanOrEqual(400 * 1.05 + 4);
    expect(res.unmet).toHaveLength(0);
  });

  it("respects per-ingredient gram bounds", () => {
    const res = optimizeDay(
      [{ ...C, min_g: 30, max_g: 60 }],
      { kcal: 400, protein_g: 0, fat_g: 0, carb_g: 0 },
      0.5,
    );
    expect(res.grams[0]).toBeGreaterThanOrEqual(30);
    expect(res.grams[0]).toBeLessThanOrEqual(60);
  });

  it("reports which macro is out of reach when infeasible", () => {
    const res = optimizeDay(
      [{ ...P, min_g: 0, max_g: 200 }], // max protein = 200g
      { kcal: 800, protein_g: 300, fat_g: 0, carb_g: 0 }, // need 300g protein
      0.05,
    );
    expect(res.status).toBe("infeasible");
    expect(res.unmet.some((u) => u.macro === "protein" && u.direction === "too_low")).toBe(true);
  });
});
