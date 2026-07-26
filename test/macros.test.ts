import { describe, expect, it } from "vitest";
import { dayMacros, itemMacros } from "../src/domain/macros";
import foods from "../fixtures/reference/foods.json";
import tuesday from "../fixtures/scenario/tuesday.json";

const byName = new Map(foods.map((f) => [f.name, f]));

describe("day macros", () => {
  it("computes a single item's contribution (per-100g × grams / servings)", () => {
    const m = itemMacros({ kcal_100g: 200, protein_100g: 20, fat_100g: 10, carb_100g: 5, grams: 250, servings: 2 });
    // 250g / 100 / 2 servings = 1.25 units
    expect(m.kcal).toBeCloseTo(250);
    expect(m.protein_g).toBeCloseTo(25);
    expect(m.fat_g).toBeCloseTo(12.5);
    expect(m.carb_g).toBeCloseTo(6.25);
  });

  it("reconstructs the golden TUESDAY totals from the food catalog + grams", () => {
    const items = tuesday.items.map((it) => {
      const f = byName.get(it.food);
      if (!f) throw new Error(`fixture food missing from catalog: ${it.food}`);
      return { ...f, grams: it.grams, servings: it.servings };
    });
    const total = dayMacros(items);
    const exp = tuesday.expected_totals;
    // Matches what Excel itself computed for this day.
    expect(total.kcal).toBeCloseTo(exp.kcal, 1);
    expect(total.protein_g).toBeCloseTo(exp.protein_g, 1);
    expect(total.fat_g).toBeCloseTo(exp.fat_g, 1);
    expect(total.carb_g).toBeCloseTo(exp.carb_g, 1);
  });
});
