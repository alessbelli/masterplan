import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { log } from "./log";
import { dayMacros, type Per100 } from "./domain/macros";
import { optimizeDay, type OptimizeItem } from "./domain/optimize";
import { shoppingRollup, type ShoppingSourceItem } from "./domain/shopping";
import { uiCatalog } from "./domain/i18n";

export interface Env {
  DB: D1Database;
}
type Vars = { ws: string; locale: string };

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// Caption resolution via indexed JOINs (preferred locale → source locale).
// Seeded/created rows always have a source-locale caption, so COALESCE lands.
// (Correlated subqueries scan too much and hit D1's rows-read limit at scale.)
const foodCapJoin = (a: string) =>
  `LEFT JOIN food_caption ${a}_cp ON ${a}_cp.food_id=${a}.id AND ${a}_cp.locale=?1 ` +
  `LEFT JOIN food_caption ${a}_cs ON ${a}_cs.food_id=${a}.id AND ${a}_cs.locale=${a}.source_locale`;
const foodCapSel = (a: string) => `COALESCE(${a}_cp.caption, ${a}_cs.caption, '')`;
const recipeCapJoin = (a: string) =>
  `LEFT JOIN recipe_caption ${a}_rp ON ${a}_rp.recipe_id=${a}.id AND ${a}_rp.locale=?1 ` +
  `LEFT JOIN recipe_caption ${a}_rs ON ${a}_rs.recipe_id=${a}.id AND ${a}_rs.locale=${a}.source_locale`;
const recipeCapSel = (a: string) => `COALESCE(${a}_rp.caption, ${a}_rs.caption, '')`;

// Single-row (by id) lookups: a small correlated subquery is fine here.
const foodCaptionOne = (a: string) =>
  `COALESCE((SELECT caption FROM food_caption WHERE food_id=${a}.id AND locale=?1),` +
  `(SELECT caption FROM food_caption WHERE food_id=${a}.id AND locale=${a}.source_locale),` +
  `(SELECT caption FROM food_caption WHERE food_id=${a}.id LIMIT 1))`;
const recipeCaptionOne = (a: string) =>
  `COALESCE((SELECT caption FROM recipe_caption WHERE recipe_id=${a}.id AND locale=?1),` +
  `(SELECT caption FROM recipe_caption WHERE recipe_id=${a}.id AND locale=${a}.source_locale),` +
  `(SELECT caption FROM recipe_caption WHERE recipe_id=${a}.id LIMIT 1))`;

// --- Observability + anonymous workspace ------------------------------------
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.header("x-request-id", requestId);
  const start = Date.now();
  await next();
  log("request", {
    requestId,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
    ms: Date.now() - start,
  });
});

// Every /api request gets a workspace (created on first visit); no signup.
app.use("/api/*", async (c, next) => {
  let ws = getCookie(c, "ws");
  if (ws) {
    const row = await c.env.DB.prepare("SELECT id, locale FROM workspace WHERE id=?").bind(ws).first<{ id: string; locale: string }>();
    if (row) {
      c.set("ws", row.id);
      c.set("locale", row.locale);
      return next();
    }
  }
  ws = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO workspace (id, locale) VALUES (?, 'en')").bind(ws).run();
  setCookie(c, "ws", ws, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  c.set("ws", ws);
  c.set("locale", "en");
  return next();
});

app.get("/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: "db_unreachable" }, 503);
  }
});

app.get("/api/i18n", (c) => c.json({ locale: c.get("locale"), strings: uiCatalog(c.get("locale")) }));

// --- Foods ------------------------------------------------------------------
app.get("/api/food-categories", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, key, label, sort_order FROM food_category ORDER BY sort_order").all();
  return c.json({ categories: results });
});

interface FoodRow extends Per100 {
  id: number;
  scope: string;
  base_food_id: number | null;
  category_key: string | null;
  category_label: string | null;
  category_sort: number | null;
  caption: string;
}

app.get("/api/foods", async (c) => {
  const locale = c.get("locale");
  const ws = c.get("ws");
  const { results } = await c.env.DB.prepare(
    `SELECT f.id, f.scope, f.base_food_id, f.kcal_100g, f.protein_100g, f.fat_100g, f.carb_100g,
            fc.key AS category_key, fc.label AS category_label, fc.sort_order AS category_sort,
            ${foodCapSel("f")} AS caption
     FROM food f LEFT JOIN food_category fc ON fc.id=f.category_id ${foodCapJoin("f")}
     WHERE f.scope='global' OR f.workspace_id=?2`,
  )
    .bind(locale, ws)
    .all<FoodRow>();

  // Workspace variants shadow their base global food.
  const shadowed = new Set(results.filter((r) => r.base_food_id).map((r) => r.base_food_id));
  let foods = results.filter((r) => !shadowed.has(r.id));

  const query = (c.req.query("query") ?? "").trim().toLowerCase();
  const category = c.req.query("category");
  if (query) foods = foods.filter((f) => f.caption.toLowerCase().includes(query));
  if (category) foods = foods.filter((f) => f.category_key === category);
  foods.sort((a, b) => a.caption.localeCompare(b.caption));
  const limit = Math.min(200, Number(c.req.query("limit") ?? 50));
  return c.json({ foods: foods.slice(0, limit), total: foods.length });
});

app.post("/api/foods", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b?.name || typeof b.name !== "string") return c.json({ error: "name required" }, 400);
  const cat = b.category_key ? await c.env.DB.prepare("SELECT id FROM food_category WHERE key=?").bind(b.category_key).first<{ id: number }>() : null;
  const row = await c.env.DB.prepare(
    `INSERT INTO food (category_id,kcal_100g,protein_100g,fat_100g,carb_100g,scope,workspace_id,source_locale)
     VALUES (?,?,?,?,?,'workspace',?,?) RETURNING id`,
  )
    .bind(cat?.id ?? null, num(b.kcal_100g), num(b.protein_100g), num(b.fat_100g), num(b.carb_100g), c.get("ws"), c.get("locale"))
    .first<{ id: number }>();
  await c.env.DB.prepare("INSERT INTO food_caption (food_id,locale,caption) VALUES (?,?,?)").bind(row!.id, c.get("locale"), b.name).run();
  return c.json({ id: row!.id }, 201);
});

// Edit: workspace-owned → update in place; global → copy-on-write variant.
app.put("/api/foods/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const ws = c.get("ws");
  const locale = c.get("locale");
  const b = await c.req.json().catch(() => ({}));
  const food = await c.env.DB.prepare("SELECT * FROM food WHERE id=?").bind(id).first<FoodRow & { workspace_id: string | null; source_locale: string }>();
  if (!food) return c.json({ error: "not found" }, 404);

  const vals = {
    category_id: food.category_key ? await catId(c.env.DB, b.category_key) : null,
    kcal: b.kcal_100g ?? food.kcal_100g,
    protein: b.protein_100g ?? food.protein_100g,
    fat: b.fat_100g ?? food.fat_100g,
    carb: b.carb_100g ?? food.carb_100g,
  };

  if (food.scope === "workspace" && food.workspace_id === ws) {
    await c.env.DB.prepare("UPDATE food SET kcal_100g=?,protein_100g=?,fat_100g=?,carb_100g=? WHERE id=?")
      .bind(vals.kcal, vals.protein, vals.fat, vals.carb, id)
      .run();
    if (b.name) await c.env.DB.prepare("INSERT INTO food_caption (food_id,locale,caption) VALUES (?,?,?) ON CONFLICT(food_id,locale) DO UPDATE SET caption=excluded.caption").bind(id, locale, b.name).run();
    return c.json({ id, variant: false });
  }

  // copy-on-write from a global food
  const variant = await c.env.DB.prepare(
    `INSERT INTO food (category_id,kcal_100g,protein_100g,fat_100g,carb_100g,scope,workspace_id,base_food_id,source_locale)
     VALUES (?,?,?,?,?,'workspace',?,?,?) RETURNING id`,
  )
    .bind(await catId(c.env.DB, b.category_key), vals.kcal, vals.protein, vals.fat, vals.carb, ws, id, locale)
    .first<{ id: number }>();
  const name = b.name ?? (await c.env.DB.prepare(`SELECT ${foodCaptionOne("f")} AS caption FROM food f WHERE f.id=?2`).bind(locale, id).first<{ caption: string }>())?.caption;
  await c.env.DB.prepare("INSERT INTO food_caption (food_id,locale,caption) VALUES (?,?,?)").bind(variant!.id, locale, name ?? "food").run();
  return c.json({ id: variant!.id, variant: true, base_food_id: id }, 201);
});

// --- Recipes ----------------------------------------------------------------
app.get("/api/recipes", async (c) => {
  const locale = c.get("locale");
  const ws = c.get("ws");
  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.cat1, r.cat2, r.cat3, r.servings, ${recipeCapSel("r")} AS caption,
            COALESCE(ic.c, 0) AS ingredient_count
     FROM recipe r ${recipeCapJoin("r")}
     LEFT JOIN (SELECT recipe_id, COUNT(*) AS c FROM recipe_ingredient GROUP BY recipe_id) ic ON ic.recipe_id=r.id
     WHERE r.scope='global' OR r.workspace_id=?2`,
  )
    .bind(locale, ws)
    .all<{ id: number; caption: string; cat1: string; cat2: string; cat3: string; servings: number; ingredient_count: number }>();
  let recipes = rows.results;
  const query = (c.req.query("query") ?? "").trim().toLowerCase();
  if (query) recipes = recipes.filter((r) => r.caption.toLowerCase().includes(query));
  recipes.sort((a, b) => a.caption.localeCompare(b.caption));
  const limit = Math.min(200, Number(c.req.query("limit") ?? 50));
  return c.json({ recipes: recipes.slice(0, limit), total: recipes.length });
});

app.get("/api/recipes/:id", async (c) => {
  const locale = c.get("locale");
  const id = Number(c.req.param("id"));
  const recipe = await c.env.DB.prepare(`SELECT r.id, r.cat1, r.cat2, r.cat3, r.servings, ${recipeCaptionOne("r")} AS caption FROM recipe r WHERE r.id=?2`).bind(locale, id).first();
  if (!recipe) return c.json({ error: "not found" }, 404);
  const ingredients = await c.env.DB.prepare(
    `SELECT ri.id, ri.food_id, ri.min_g, ri.max_g, ri.position, ${foodCaptionOne("f")} AS caption
     FROM recipe_ingredient ri JOIN food f ON f.id=ri.food_id WHERE ri.recipe_id=?2 ORDER BY ri.position`,
  )
    .bind(locale, id)
    .all();
  return c.json({ recipe, ingredients: ingredients.results });
});

// --- Targets (manual for the PoC; calculator is post-PoC) -------------------
app.get("/api/targets", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT weekday, kcal, protein_g, fat_g, carb_g FROM day_target WHERE workspace_id=?").bind(c.get("ws")).all();
  return c.json({ targets: results });
});

app.put("/api/targets", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const t = { kcal: num(b.kcal), protein_g: num(b.protein_g), fat_g: num(b.fat_g), carb_g: num(b.carb_g) };
  const days = b.weekday === undefined ? [0, 1, 2, 3, 4, 5, 6] : [Number(b.weekday)];
  for (const d of days) {
    await c.env.DB.prepare(
      `INSERT INTO day_target (workspace_id,weekday,kcal,protein_g,fat_g,carb_g) VALUES (?,?,?,?,?,?)
       ON CONFLICT(workspace_id,weekday) DO UPDATE SET kcal=excluded.kcal,protein_g=excluded.protein_g,fat_g=excluded.fat_g,carb_g=excluded.carb_g`,
    )
      .bind(c.get("ws"), d, t.kcal, t.protein_g, t.fat_g, t.carb_g)
      .run();
  }
  return c.json({ ok: true, weekdays: days });
});

// --- Week plan --------------------------------------------------------------
app.get("/api/plan", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.weekday, p.slot, p.recipe_id, ${recipeCapSel("r")} AS recipe_caption
     FROM plan_slot p LEFT JOIN recipe r ON r.id=p.recipe_id ${recipeCapJoin("r")}
     WHERE p.workspace_id=?2 ORDER BY p.weekday, p.slot`,
  )
    .bind(c.get("locale"), c.get("ws"))
    .all();
  return c.json({ plan: results });
});

app.put("/api/plan", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const weekday = Number(b.weekday);
  const slot = Number(b.slot);
  if (Number.isNaN(weekday) || Number.isNaN(slot)) return c.json({ error: "weekday and slot required" }, 400);
  if (b.recipe_id == null) {
    await c.env.DB.prepare("DELETE FROM plan_slot WHERE workspace_id=? AND weekday=? AND slot=?").bind(c.get("ws"), weekday, slot).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO plan_slot (workspace_id,weekday,slot,recipe_id) VALUES (?,?,?,?)
       ON CONFLICT(workspace_id,weekday,slot) DO UPDATE SET recipe_id=excluded.recipe_id`,
    )
      .bind(c.get("ws"), weekday, slot, Number(b.recipe_id))
      .run();
  }
  return c.json({ ok: true });
});

// --- Days -------------------------------------------------------------------
// Build a day's ingredient rows from its planned recipes (clears existing).
app.post("/api/days/:weekday/build", async (c) => {
  const ws = c.get("ws");
  const locale = c.get("locale");
  const weekday = Number(c.req.param("weekday"));
  await c.env.DB.prepare("DELETE FROM day_item WHERE workspace_id=? AND weekday=?").bind(ws, weekday).run();
  const slots = await c.env.DB.prepare("SELECT recipe_id FROM plan_slot WHERE workspace_id=? AND weekday=? AND recipe_id IS NOT NULL ORDER BY slot").bind(ws, weekday).all<{ recipe_id: number }>();
  let pos = 0;
  for (const s of slots.results) {
    const recipe = await c.env.DB.prepare(`SELECT r.id, r.servings, ${recipeCaptionOne("r")} AS caption FROM recipe r WHERE r.id=?2`).bind(locale, s.recipe_id).first<{ id: number; servings: number; caption: string }>();
    if (!recipe) continue;
    const ings = await c.env.DB.prepare("SELECT food_id, min_g, max_g FROM recipe_ingredient WHERE recipe_id=? ORDER BY position").bind(s.recipe_id).all<{ food_id: number; min_g: number; max_g: number }>();
    for (const ing of ings.results) {
      await c.env.DB.prepare(
        "INSERT INTO day_item (workspace_id,weekday,meal_label,food_id,servings,min_g,max_g,grams,position) VALUES (?,?,?,?,?,?,?,?,?)",
      )
        .bind(ws, weekday, recipe.caption, ing.food_id, recipe.servings, ing.min_g, ing.max_g, ing.min_g, pos++)
        .run();
    }
  }
  return c.json({ ok: true, items: pos });
});

interface DayItemRow extends Per100 {
  id: number;
  meal_label: string;
  food_id: number;
  servings: number;
  min_g: number;
  max_g: number;
  grams: number;
  caption: string;
  category_key: string | null;
  category_label: string | null;
  category_sort: number | null;
}

async function loadDayItems(db: D1Database, ws: string, locale: string, weekday: number) {
  const { results } = await db.prepare(
    `SELECT d.id, d.meal_label, d.food_id, d.servings, d.min_g, d.max_g, d.grams,
            f.kcal_100g, f.protein_100g, f.fat_100g, f.carb_100g,
            fc.key AS category_key, fc.label AS category_label, fc.sort_order AS category_sort,
            ${foodCapSel("f")} AS caption
     FROM day_item d JOIN food f ON f.id=d.food_id LEFT JOIN food_category fc ON fc.id=f.category_id ${foodCapJoin("f")}
     WHERE d.workspace_id=?2 AND d.weekday=?3 ORDER BY d.position`,
  )
    .bind(locale, ws, weekday)
    .all<DayItemRow>();
  return results;
}

app.get("/api/days/:weekday", async (c) => {
  const weekday = Number(c.req.param("weekday"));
  const items = await loadDayItems(c.env.DB, c.get("ws"), c.get("locale"), weekday);
  const totals = dayMacros(items);
  const target = await c.env.DB.prepare("SELECT kcal, protein_g, fat_g, carb_g FROM day_target WHERE workspace_id=? AND weekday=?").bind(c.get("ws"), weekday).first();
  return c.json({ weekday, items, totals, target });
});

app.post("/api/days/:weekday/add-food", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const foodId = Number(b.food_id);
  if (Number.isNaN(foodId)) return c.json({ error: "food_id required" }, 400);
  const grams = num(b.grams, 100);
  const posRow = await c.env.DB.prepare("SELECT COALESCE(MAX(position),-1)+1 AS pos FROM day_item WHERE workspace_id=? AND weekday=?").bind(c.get("ws"), Number(c.req.param("weekday"))).first<{ pos: number }>();
  await c.env.DB.prepare(
    "INSERT INTO day_item (workspace_id,weekday,meal_label,food_id,servings,min_g,max_g,grams,position) VALUES (?,?,?,?,1,?,?,?,?)",
  )
    .bind(c.get("ws"), Number(c.req.param("weekday")), "Miscellaneous", foodId, num(b.min_g, 0), num(b.max_g, grams), grams, posRow!.pos)
    .run();
  return c.json({ ok: true }, 201);
});

app.patch("/api/day-items/:id", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare("UPDATE day_item SET grams=?, min_g=COALESCE(?,min_g), max_g=COALESCE(?,max_g) WHERE id=? AND workspace_id=?")
    .bind(num(b.grams), b.min_g ?? null, b.max_g ?? null, Number(c.req.param("id")), c.get("ws"))
    .run();
  return c.json({ ok: true });
});

app.post("/api/days/:weekday/optimize", async (c) => {
  const ws = c.get("ws");
  const weekday = Number(c.req.param("weekday"));
  const items = await loadDayItems(c.env.DB, ws, c.get("locale"), weekday);
  if (items.length === 0) return c.json({ error: "day is empty — build or add foods first" }, 400);
  const target = await c.env.DB.prepare("SELECT kcal, protein_g, fat_g, carb_g FROM day_target WHERE workspace_id=? AND weekday=?").bind(ws, weekday).first<{ kcal: number; protein_g: number; fat_g: number; carb_g: number }>();
  if (!target) return c.json({ error: "set macro targets for this day first" }, 400);

  const optItems: OptimizeItem[] = items.map((it) => ({
    kcal_100g: it.kcal_100g,
    protein_100g: it.protein_100g,
    fat_100g: it.fat_100g,
    carb_100g: it.carb_100g,
    min_g: it.min_g,
    max_g: it.max_g,
    servings: it.servings,
  }));
  const eps = num(c.req.query("epsilon"), 0.05);
  const result = optimizeDay(optItems, target, eps);

  // Persist the chosen grams.
  for (let i = 0; i < items.length; i++) {
    await c.env.DB.prepare("UPDATE day_item SET grams=? WHERE id=?").bind(result.grams[i], items[i].id).run();
  }
  log("day.optimize", { ws, weekday, status: result.status, unmet: result.unmet.length });
  return c.json({ status: result.status, macros: result.macros, target, unmet: result.unmet });
});

// --- Shopping list ----------------------------------------------------------
app.get("/api/shopping", async (c) => {
  const ws = c.get("ws");
  const { results } = await c.env.DB.prepare(
    `SELECT d.food_id, d.grams, fc.key AS category_key, fc.label AS category_label, fc.sort_order AS category_sort,
            ${foodCapSel("f")} AS caption
     FROM day_item d JOIN food f ON f.id=d.food_id LEFT JOIN food_category fc ON fc.id=f.category_id ${foodCapJoin("f")}
     WHERE d.workspace_id=?2`,
  )
    .bind(c.get("locale"), ws)
    .all<ShoppingSourceItem & { category_key: string | null }>();
  const src: ShoppingSourceItem[] = results.map((r) => ({
    food_id: r.food_id,
    caption: r.caption,
    category_key: r.category_key ?? "uncategorized",
    category_label: r.category_label ?? "Uncategorized",
    category_sort: r.category_sort ?? 500,
    grams: r.grams,
  }));
  const extras = await c.env.DB.prepare("SELECT name, quantity FROM shopping_extra WHERE workspace_id=?").bind(ws).all<{ name: string; quantity: string }>();
  return c.json({ groups: shoppingRollup(src, extras.results) });
});

app.post("/api/shopping/extra", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b?.name) return c.json({ error: "name required" }, 400);
  await c.env.DB.prepare("INSERT INTO shopping_extra (workspace_id,name,quantity) VALUES (?,?,?)").bind(c.get("ws"), String(b.name), String(b.quantity ?? "")).run();
  return c.json({ ok: true }, 201);
});

// Start over (the "everyone starts from scratch" reset).
app.post("/api/reset", async (c) => {
  const ws = c.get("ws");
  for (const t of ["day_item", "plan_slot", "day_target", "shopping_extra", "progression"]) {
    await c.env.DB.prepare(`DELETE FROM ${t} WHERE workspace_id=?`).bind(ws).run();
  }
  await c.env.DB.prepare("DELETE FROM food WHERE scope='workspace' AND workspace_id=?").bind(ws).run();
  return c.json({ ok: true });
});

function num(v: unknown, dflt = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
async function catId(db: D1Database, key: unknown): Promise<number | null> {
  if (!key) return null;
  const row = await db.prepare("SELECT id FROM food_category WHERE key=?").bind(String(key)).first<{ id: number }>();
  return row?.id ?? null;
}

export default app;
