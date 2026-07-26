// Pure macro math. A "day item" is one ingredient at a chosen gram amount.
// Recipes are batch-cooked: the day counts ONE serving's macros, so each
// item's contribution is divided by its recipe's serving count. (The full
// batch grams still drive the shopping list — see shopping.ts.)

export interface Per100 {
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carb_100g: number;
}

export interface Macros {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

export interface DayItemLike extends Per100 {
  grams: number;
  servings: number;
}

export const ZERO: Macros = { kcal: 0, protein_g: 0, fat_g: 0, carb_g: 0 };

/** Macros an item contributes to the day: per-100g × grams / 100 / servings. */
export function itemMacros(item: DayItemLike): Macros {
  const f = item.grams / 100 / (item.servings || 1);
  return {
    kcal: item.kcal_100g * f,
    protein_g: item.protein_100g * f,
    fat_g: item.fat_100g * f,
    carb_g: item.carb_100g * f,
  };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    fat_g: a.fat_g + b.fat_g,
    carb_g: a.carb_g + b.carb_g,
  };
}

/** Total macros for a day = sum of every item's contribution. */
export function dayMacros(items: DayItemLike[]): Macros {
  return items.reduce((acc, it) => addMacros(acc, itemMacros(it)), { ...ZERO });
}

export function roundMacros(m: Macros, digits = 1): Macros {
  const r = (x: number) => Number(x.toFixed(digits));
  return { kcal: r(m.kcal), protein_g: r(m.protein_g), fat_g: r(m.fat_g), carb_g: r(m.carb_g) };
}
