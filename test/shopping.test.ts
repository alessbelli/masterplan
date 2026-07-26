import { describe, expect, it } from "vitest";
import { shoppingRollup } from "../src/domain/shopping";

const mk = (food_id: number, caption: string, cat: string, sort: number, grams: number) => ({
  food_id,
  caption,
  category_key: cat,
  category_label: cat,
  category_sort: sort,
  grams,
});

describe("shopping rollup", () => {
  it("sums grams per food across days and groups by category", () => {
    const groups = shoppingRollup([
      mk(1, "Banane", "fruits", 1, 100),
      mk(1, "Banane", "fruits", 1, 120), // same food, another day
      mk(2, "Riz", "grains", 2, 200),
    ]);
    const fruits = groups.find((g) => g.category_key === "fruits")!;
    expect(fruits.lines).toEqual([{ caption: "Banane", quantity: "220g" }]);
    expect(groups.map((g) => g.category_key)).toEqual(["fruits", "grains"]);
  });

  it("appends free-text extras under Miscellaneous, last", () => {
    const groups = shoppingRollup([mk(1, "Riz", "grains", 2, 100)], [{ name: "Foil", quantity: "1 roll" }]);
    expect(groups[groups.length - 1]).toEqual({
      category_key: "miscellaneous",
      category_label: "Miscellaneous",
      lines: [{ caption: "Foil", quantity: "1 roll" }],
    });
  });
});
