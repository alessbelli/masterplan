// Caption/label resolution so nothing is ever nameless. Foods and recipes carry
// captions per locale; we resolve preferred → source → any available. (Seed
// captions are FR or EN for now; missing translations get filled in later.)

export interface Caption {
  locale: string;
  caption: string;
}

export function resolveCaption(
  captions: Caption[],
  preferred: string,
  sourceLocale?: string,
): string {
  if (captions.length === 0) return "";
  const byLocale = (loc: string) => captions.find((c) => c.locale === loc)?.caption;
  return (
    byLocale(preferred) ??
    (sourceLocale ? byLocale(sourceLocale) : undefined) ??
    captions[0].caption
  );
}

// UI strings never live inline in markup; components look them up by key so new
// locales are additive. This is the English base catalog; more locales later.
export const UI_STRINGS: Record<string, Record<string, string>> = {
  en: {
    "app.title": "masterplan",
    "nav.foods": "Foods",
    "nav.recipes": "Recipes",
    "nav.targets": "Targets",
    "nav.day": "Day",
    "nav.shopping": "Shopping",
    "day.optimize": "Optimize",
    "day.add_food": "Add food",
    "day.add_recipe": "Add recipe",
    "targets.kcal": "Calories",
    "targets.protein": "Protein (g)",
    "targets.fat": "Fat (g)",
    "targets.carb": "Carbs (g)",
    "optimize.ok": "Optimized — your macros are within tolerance.",
    "optimize.infeasible": "No combination fits your targets within tolerance. Adjust foods or bounds.",
  },
};

export function uiCatalog(locale: string): Record<string, string> {
  return UI_STRINGS[locale] ?? UI_STRINGS.en;
}
