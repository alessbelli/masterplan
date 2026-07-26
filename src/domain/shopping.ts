// Shopping-list rollup: sum the (full batch) grams of each food across every
// day of the week, group by food category, and append free-text extras — the
// workbook's generate_shopping_list, minus the spreadsheet plumbing.

export interface ShoppingSourceItem {
  food_id: number;
  caption: string;
  category_key: string;
  category_label: string;
  category_sort: number;
  grams: number;
}
export interface ShoppingExtra {
  name: string;
  quantity: string;
}
export interface ShoppingLine {
  caption: string;
  quantity: string;
}
export interface ShoppingGroup {
  category_key: string;
  category_label: string;
  lines: ShoppingLine[];
}

const MISC = { key: "miscellaneous", label: "Miscellaneous", sort: 1e9 };

export function shoppingRollup(items: ShoppingSourceItem[], extras: ShoppingExtra[] = []): ShoppingGroup[] {
  // Sum grams per food.
  const byFood = new Map<number, ShoppingSourceItem & { grams: number }>();
  for (const it of items) {
    const cur = byFood.get(it.food_id);
    if (cur) cur.grams += it.grams;
    else byFood.set(it.food_id, { ...it });
  }

  // Bucket foods by category.
  const groups = new Map<string, ShoppingGroup & { sort: number }>();
  const ensure = (key: string, label: string, sort: number) => {
    let g = groups.get(key);
    if (!g) {
      g = { category_key: key, category_label: label, sort, lines: [] };
      groups.set(key, g);
    }
    return g;
  };

  for (const f of byFood.values()) {
    ensure(f.category_key, f.category_label, f.category_sort).lines.push({
      caption: f.caption,
      quantity: `${Math.round(f.grams)}g`,
    });
  }
  for (const e of extras) {
    ensure(MISC.key, MISC.label, MISC.sort).lines.push({ caption: e.name, quantity: e.quantity });
  }

  const out = [...groups.values()].sort((a, b) => a.sort - b.sort || a.category_label.localeCompare(b.category_label));
  for (const g of out) g.lines.sort((a, b) => a.caption.localeCompare(b.caption));
  return out.map(({ sort: _sort, ...g }) => g);
}
