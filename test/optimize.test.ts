import { describe, expect, it } from "vitest";
import { defaultGoals, optimizeDay, optimizeGoals, type OptimizeItem } from "../src/domain/optimize";

const item = (o: Partial<OptimizeItem> & Pick<OptimizeItem, "kcal_100g" | "protein_100g" | "fat_100g" | "carb_100g">): OptimizeItem => ({
  min_g: 0, max_g: 300, servings: 1, ...o,
});

describe("lexicographic day optimizer", () => {
  it("hits the calorie range, maximizes protein, then minimizes fat", () => {
    // A: protein, no fat.  B: same protein, but fatty. Both 1 kcal/g.
    const A = item({ kcal_100g: 100, protein_100g: 10, fat_100g: 0, carb_100g: 15 });
    const B = item({ kcal_100g: 100, protein_100g: 10, fat_100g: 5, carb_100g: 5 });
    const res = optimizeDay([A, B], { kcal: 200, protein_g: 0, fat_g: 0, carb_g: 0 }, 0.05);

    expect(res.status).toBe("optimal");
    // calories land inside the ±5% band
    expect(res.macros.kcal).toBeGreaterThanOrEqual(190 - 1);
    expect(res.macros.kcal).toBeLessThanOrEqual(210 + 1);
    // protein maximized (push to the top of the calorie band → ~21g)
    expect(res.macros.protein_g).toBeGreaterThan(20);
    // fat minimized → the fatty food is avoided
    expect(res.macros.fat_g).toBeLessThan(0.5);
    const [gA, gB] = res.grams;
    expect(gA).toBeGreaterThan(gB);
  });

  it("prioritizes protein over fat: keeps a fatty protein source rather than losing protein", () => {
    // A: protein-dense but fatty.  B: lean filler with little protein.
    const A = item({ kcal_100g: 100, protein_100g: 25, fat_100g: 8, carb_100g: 0 });
    const B = item({ kcal_100g: 100, protein_100g: 2, fat_100g: 0, carb_100g: 23 });
    const res = optimizeDay([A, B], { kcal: 200, protein_g: 0, fat_g: 0, carb_g: 0 }, 0.05);

    expect(res.status).toBe("optimal");
    // Minimizing fat FIRST would dump A and leave ~4g protein; the correct
    // (protein-first) order keeps A and reaches ~50g+.
    expect(res.macros.protein_g).toBeGreaterThan(45);
    expect(res.grams[0]).toBeGreaterThan(res.grams[1]);
  });

  it("adjusts quantity (grams) to bring calories into range", () => {
    const C = item({ kcal_100g: 200, protein_100g: 10, fat_100g: 5, carb_100g: 20, max_g: 500 });
    const res = optimizeDay([C], { kcal: 400, protein_g: 0, fat_g: 0, carb_g: 0 }, 0.05);
    expect(res.status).toBe("optimal");
    // 2 kcal/g → ~200g to hit 400kcal; protein-max pushes to the band top (~210g/420kcal)
    expect(res.grams[0]).toBeGreaterThanOrEqual(190);
    expect(res.grams[0]).toBeLessThanOrEqual(210);
    expect(res.macros.kcal).toBeLessThanOrEqual(420 + 1);
  });

  it("respects per-ingredient gram bounds", () => {
    const C = item({ kcal_100g: 400, protein_100g: 0, fat_100g: 0, carb_100g: 100, min_g: 30, max_g: 60 });
    const res = optimizeDay([C], { kcal: 400, protein_g: 0, fat_g: 0, carb_g: 0 }, 0.5);
    expect(res.grams[0]).toBeGreaterThanOrEqual(30);
    expect(res.grams[0]).toBeLessThanOrEqual(60);
  });

  it("reports the ranged macro that's out of reach when infeasible", () => {
    const C = item({ kcal_100g: 100, protein_100g: 20, fat_100g: 0, carb_100g: 0, max_g: 50 }); // ≤50 kcal
    const res = optimizeDay([C], { kcal: 400, protein_g: 0, fat_g: 0, carb_g: 0 }, 0.05);
    expect(res.status).toBe("infeasible");
    expect(res.unmet).toEqual([{ macro: "kcal", direction: "too_low" }]);
  });

  it("is configurable: a custom pipeline (minimize carbs) is respected", () => {
    const A = item({ kcal_100g: 100, protein_100g: 10, fat_100g: 0, carb_100g: 20 }); // carby
    const B = item({ kcal_100g: 100, protein_100g: 10, fat_100g: 5, carb_100g: 2 }); // low-carb
    const res = optimizeGoals([A, B], [
      { macro: "kcal", kind: "range", min: 190, max: 210 },
      { macro: "carb", kind: "minimize" },
    ]);
    expect(res.status).toBe("optimal");
    expect(res.grams[1]).toBeGreaterThan(res.grams[0]); // prefers the low-carb food
  });

  it("defaultGoals encodes the calorie-range → max-protein → min-fat order", () => {
    expect(defaultGoals({ kcal: 2700, protein_g: 168, fat_g: 66, carb_g: 358 }, 0.05).map((g) => `${g.macro}:${g.kind}`)).toEqual([
      "kcal:range",
      "protein:maximize",
      "fat:minimize",
    ]);
  });
});
