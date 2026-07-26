import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { seedReference } from "../src/seed";

const SEED = {
  categories: ["Protéines", "Grains", "Fruits"],
  foods: [
    { name: "Chicken", category: "Protéines", kcal_100g: 165, protein_100g: 31, fat_100g: 3.6, carb_100g: 0, source_locale: "en" },
    { name: "Rice", category: "Grains", kcal_100g: 130, protein_100g: 2.7, fat_100g: 0.3, carb_100g: 28, source_locale: "en" },
    { name: "Banana", category: "Fruits", kcal_100g: 89, protein_100g: 1.1, fat_100g: 0.3, carb_100g: 23, source_locale: "en" },
  ],
  recipes: [
    {
      name: "Chicken & Rice",
      cat1: "Lunch", cat2: "", cat3: "", servings: 1, source_locale: "en",
      ingredients: [
        { food: "Chicken", min_g: 100, max_g: 300 },
        { food: "Rice", min_g: 100, max_g: 400 },
      ],
    },
  ],
};

// Maintain the workspace cookie across requests, like a browser.
let cookie = "";
async function req(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers as HeadersInit);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body) headers.set("content-type", "application/json");
  const res = await app.request(path, { ...init, headers }, env);
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return res;
}

// Seed the shared catalog once as the baseline; isolatedStorage rolls back each
// test's own writes. Every test starts with a fresh workspace (cleared cookie).
// Clear first so the baseline is idempotent even if on-disk storage persists.
beforeAll(async () => {
  for (const t of ["recipe_ingredient", "recipe_caption", "recipe", "food_caption", "food", "food_category", "day_item", "plan_slot", "day_target", "shopping_extra", "progression", "workspace"]) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
  await seedReference(env.DB, SEED);
});
beforeEach(() => {
  cookie = "";
});

describe("catalog", () => {
  it("lists seeded foods and categories", async () => {
    const foods = await (await req("/api/foods")).json<{ foods: { caption: string }[] }>();
    expect(foods.foods.map((f) => f.caption).sort()).toEqual(["Banana", "Chicken", "Rice"]);
    const cats = await (await req("/api/food-categories")).json<{ categories: unknown[] }>();
    expect(cats.categories).toHaveLength(3);
  });

  it("edits a global food as a copy-on-write workspace variant that shadows the base", async () => {
    const { foods } = await (await req("/api/foods")).json<{ foods: { id: number; caption: string }[] }>();
    const rice = foods.find((f) => f.caption === "Rice")!;
    const edit = await req(`/api/foods/${rice.id}`, { method: "PUT", body: JSON.stringify({ carb_100g: 80, name: "Rice (my brand)" }) });
    expect(edit.status).toBe(201);
    expect((await edit.json<{ variant: boolean }>()).variant).toBe(true);

    const after = await (await req("/api/foods")).json<{ foods: { caption: string; carb_100g: number }[] }>();
    const rices = after.foods.filter((f) => f.caption.startsWith("Rice"));
    expect(rices).toHaveLength(1); // base is shadowed
    expect(rices[0].carb_100g).toBe(80);
  });
});

describe("planning loop", () => {
  async function recipeId() {
    const { recipes } = await (await req("/api/recipes")).json<{ recipes: { id: number }[] }>();
    return recipes[0].id;
  }

  it("plans → builds → optimizes → hits macros → shopping list", async () => {
    // targets for every weekday
    await req("/api/targets", { method: "PUT", body: JSON.stringify({ kcal: 525, protein_g: 66, fat_g: 8, carb_g: 42 }) });
    // plan the recipe into Monday slot 0
    const rid = await recipeId();
    await req("/api/plan", { method: "PUT", body: JSON.stringify({ weekday: 0, slot: 0, recipe_id: rid }) });
    // build Monday
    const build = await (await req("/api/days/0/build", { method: "POST" })).json<{ items: number }>();
    expect(build.items).toBe(2);

    // optimize (generous tolerance)
    const opt = await (await req("/api/days/0/optimize?epsilon=0.15", { method: "POST" })).json<{ status: string; macros: { kcal: number; protein_g: number } }>();
    expect(opt.status).toBe("optimal");
    expect(opt.macros.protein_g).toBeGreaterThan(66 * 0.85);
    expect(opt.macros.protein_g).toBeLessThan(66 * 1.15 + 1);

    // day reflects persisted grams
    const day = await (await req("/api/days/0")).json<{ items: { grams: number }[]; totals: { kcal: number } }>();
    expect(day.items.every((i) => i.grams >= 100)).toBe(true);
    expect(day.totals.kcal).toBeGreaterThan(0);

    // shopping list rolls up the day's foods, grouped by category
    const shop = await (await req("/api/shopping")).json<{ groups: { category_label: string; lines: { caption: string }[] }[] }>();
    const captions = shop.groups.flatMap((g) => g.lines.map((l) => l.caption));
    expect(captions).toContain("Chicken");
    expect(captions).toContain("Rice");
  });

  it("adds a single food as Miscellaneous and includes it in shopping", async () => {
    const { foods } = await (await req("/api/foods")).json<{ foods: { id: number; caption: string }[] }>();
    const banana = foods.find((f) => f.caption === "Banana")!;
    await req("/api/days/1/add-food", { method: "POST", body: JSON.stringify({ food_id: banana.id, grams: 120 }) });
    const shop = await (await req("/api/shopping")).json<{ groups: { lines: { caption: string; quantity: string }[] }[] }>();
    const line = shop.groups.flatMap((g) => g.lines).find((l) => l.caption === "Banana");
    expect(line?.quantity).toBe("120g");
  });

  it("reset clears workspace data but keeps the global catalog", async () => {
    await req("/api/days/1/add-food", { method: "POST", body: JSON.stringify({ food_id: 1, grams: 50 }) });
    await req("/api/reset", { method: "POST" });
    const day = await (await req("/api/days/1")).json<{ items: unknown[] }>();
    expect(day.items).toHaveLength(0);
    const foods = await (await req("/api/foods")).json<{ foods: unknown[] }>();
    expect(foods.foods.length).toBe(3); // catalog intact
  });
});
