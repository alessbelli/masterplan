# masterplan — build plan (Cloudflare Workers + D1)

How we rebuild the workbook (`spec.md`) as a tiny web app. Scope for now: a
**proof of concept** — minimal design, **no signup**, **every user starts from
scratch** — with **every feature covered by tests using fixtures lifted from the
spreadsheet**. Nothing here is implemented yet; this is the plan to review.

The four open decisions have been resolved (see §9) and are baked into the plan
below: a **community-plus-personal** food/recipe model, an **own-tiny-simplex**
optimizer, **i18n from day one** (English UI, translatable food captions), and
the **macro calculator deferred to post-PoC** (manual targets first).

## 1. PoC scope, "start from scratch", and the library model

- **No auth.** Each browser gets an anonymous **workspace** via a random id in a
  cookie (`ws=<uuid>`). All user-specific rows are scoped by `workspace_id`. A
  **Reset** button (or simply a new cookie) starts clean. No login, no email.
- **Community + personal libraries (hybrid).** There is a **shared global
  catalog** of foods (and recipes) that everyone sees and **can contribute to**,
  seeded from the workbook (368 foods, 356 recipes). On top of that, each
  workspace has **its own foods** — brand-new items *and* tailored **variants of a
  base food** (a "base food" like _milk_ often needs a per-user variant with the
  exact brand/macros they buy). Editing a global food from a workspace is
  **copy-on-write**: it creates a workspace-scoped variant rather than mutating
  shared data. A workspace's **effective food list** = global foods (minus any it
  has shadowed with a variant) + its own foods.
  - "Start from scratch" therefore means your *profile, week plan, days, shopping
    list, and progression* start empty, and your *personal* food/recipe overrides
    start empty — but the shared catalog is already there to plan with.
- **Recommendation:** keep it a single-page app served from `public/`, talking to
  a Hono JSON API — same stack as the bootstrap, no framework needed for a PoC.

## 2. Target architecture

```
Browser (SPA in public/) ──fetch──> Hono Worker (src/) ──> D1 (SQLite)
                                        │
                                        ├─ domain/ (pure TS: calculator, day
                                        │   macros, LP optimizer, shopping-list
                                        │   rollup)  ← unit-tested in microseconds
                                        └─ routes  ← handler-tested vs real D1
```

- Keep all math **pure and framework-free** in `src/domain/*` so it unit-tests in
  µs (the < 1 s inner loop), exactly like `src/notes.ts` does today.
- Handlers stay thin; D1 access via the existing `env.DB` binding.
- The **optimizer** is the one nontrivial dependency (see §5).

## 3. Data model & migrations

Split into **schema** (`migrations/`) and **data** (`fixtures/` → seed). Proposed
tables (D1/SQLite):

```sql
-- Foods: one table, scoped. Global (seeded/community) + per-workspace ---------
food(id, category_id ->food_category,
     kcal_100g, protein_100g, fat_100g, carb_100g,          -- per 100 g
     scope TEXT CHECK(scope IN ('global','workspace')),
     workspace_id ->workspace NULL,                         -- set iff scope='workspace'
     base_food_id ->food NULL,                              -- variant-of, for copy-on-write
     source_locale TEXT)                                    -- language the seed came in
food_caption(id, food_id ->food, locale TEXT, caption TEXT, -- translatable display name
     UNIQUE(food_id, locale))
food_category(id, key UNIQUE, sort_order)                   -- 'key' is an i18n key, not display text

-- Recipes: same global/workspace split; ingredients reference foods by id -----
recipe(id, cat1_key, cat2_key, cat3_key, servings, url, notes,
     scope, workspace_id NULL, base_recipe_id NULL)
recipe_caption(id, recipe_id ->recipe, locale, caption, UNIQUE(recipe_id, locale))
recipe_ingredient(id, recipe_id ->recipe, food_id ->food, min_g, max_g, position)

-- Per-workspace user data (starts empty) -------------------------------------
workspace(id, created_at, locale)                           -- the anon cookie id + UI locale
profile(workspace_id PK ->workspace, goal, units,           -- PoC: manual targets live here
     meals_per_day, ...body-stats columns for the post-PoC calculator...)
day_target(workspace_id, weekday 0..6, is_training,
     kcal, protein_g, fat_g, carb_g)                        -- PoC: entered manually
plan_slot(workspace_id, weekday 0..6, slot, recipe_id ->recipe)  -- Week Planning grid
day_item(id, workspace_id, weekday 0..6, meal_label, food_id,
     min_g, max_g, grams, position)                         -- expanded day rows
shopping_extra(id, workspace_id, name, quantity)            -- misc items
progression(id, workspace_id, date, weight_kg, muscle_kg, bodyfat)
```

Notes:
- **Scoping / copy-on-write.** A workspace's effective foods =
  `scope='global'` ∪ `scope='workspace' AND workspace_id=?`, with a workspace
  variant (`base_food_id` set) **shadowing** its base. Editing a global food from
  a workspace inserts a variant; it never mutates the shared row. "Everyone can
  contribute" = a workspace may also insert new `scope='global'` foods (open
  contribution for the PoC; moderation is later polish).
- **Translatable names.** Display names live in `food_caption`/`recipe_caption`
  keyed by `locale`; resolve as user-locale → any available (`source_locale`) so
  nothing is ever nameless. For the PoC we assume each seed caption is FR or EN
  and store it under that locale; missing translations are filled later.
- Use **ids** for joins (the sheet joins by name). `min_g/max_g/grams` are copied
  onto `day_item` at add-time (mirrors the 3.1 "write Qmin/Qmax as values"
  behavior, and lets a day diverge from the recipe).
- Macros are stored **only** on `food` (per 100 g); day subtotals, ratios, and
  shopping totals are **computed**, never denormalized.
- "Miscellaneous" is a `day_item` with `meal_label='Miscellaneous'`, no recipe.
- Categories are stored as **i18n keys**, not display strings, so the UI can
  translate them.
- Migrations are additive and numbered (`0002_reference_schema.sql`,
  `0003_workspace_schema.sql`, …), applied by `wrangler d1 migrations apply`
  (already wired locally + in CI-gated deploy).

## 4. Fixtures (tests **and** one-time prod seed)

One set of fixtures serves both purposes, per your ask.

- `fixtures/reference/foods.json`, `recipes.json` — the **full 368 foods / 356
  recipes** extracted from the workbook (verified extractable cleanly), each with
  a `caption` + `source_locale` (FR/EN as found). This is the shared **global**
  catalog and the one-time prod seed.
- `fixtures/scenario/` — a **golden end-to-end scenario** lifted verbatim from the
  sheet, so tests assert against numbers Excel itself produced:
  - `targets.json` → the manually-entered PoC targets `2700 kcal / 168 P / 66 F /
    358.5 C` (also the expected output of the post-PoC calculator, so the same
    fixture validates it when we add it).
  - `tuesday.json` → the populated TUESDAY day (ingredients, min/max, grams) with
    `expected-totals` `≈ 2718 kcal / 173 P / 66.7 F / 349 C` and ratios.
  - `food-variant.json` → a base global food + a workspace variant, to test
    copy-on-write shadowing and caption resolution.
  - `week.json` + `expected-shopping.json` → a week and its aggregated list.
  - `progression.csv` → a sample scale export + expected parsed rows/weekly stats.
- **Seed mechanism:** a `pnpm seed:local` (miniflare D1) and `pnpm seed:remote`
  (one-time, human-gated like deploy) that load `fixtures/reference/*`. Tests load
  the same reference fixtures + the scenario fixtures via the existing
  `@cloudflare/vitest-pool-workers` setup.

## 5. The optimizer (Solver replacement)

The day optimization is a **bounded linear program** (§4.2 of the spec):
maximize carbs-ratio s.t. calorie/protein/fat ratios within ±ε and per-ingredient
gram bounds. This is small and linear.

- **Recommendation:** implement in pure TS with a lightweight simplex — either the
  `javascript-lp-solver` package or a ~150-line bounded simplex we own (no native
  deps, runs in the Worker and in Vitest). **(Decision 2.)** I lean to owning a
  tiny solver: zero supply-chain risk, testable in µs, and the problem is easy.
- Preserve the **infeasibility UX**: when there's no solution, return which macros
  can't be met (the "red macros") and the same guidance the workbook shows.
- Round results to integer grams (optionally to the user's preferred increment).

## 6. Feature-by-feature port (each ships with fixture-backed tests)

Order below is the PoC build order. **Feature 0 (i18n scaffolding) comes first**
because "no hardcoded UI strings" is easiest to honor from the start. The **macro
calculator is deferred to post-PoC** (feature 9); the PoC uses manual targets.

| # | Feature | Endpoint(s) (sketch) | Test (fixture) |
|---|---------|----------------------|----------------|
| 0 | i18n scaffolding (string catalog, locale resolution, caption fallback) | `GET /api/i18n/:locale` | key→string lookup; caption resolves user-locale → source_locale |
| 1 | Food DB: global catalog + workspace foods/variants (copy-on-write), categories, captions | `GET/POST/PUT/DELETE /api/foods` | seed 368; add/edit/remove; **food-variant.json** shadowing; "food used in recipes" guard |
| 2 | Recipe DB CRUD (3-level cats, ingredients, servings, scaler, url/notes) | `/api/recipes` | seed 356; create/edit; scaler math |
| 3 | Manual macro targets (per weekday) | `GET/PUT /api/targets` | targets.json round-trips per weekday |
| 4 | Week planning grid | `GET/PUT /api/plan` | assign recipes to slots; meals-per-day resize |
| 5 | Day build from plan | `POST /api/days/build` | week.json → expanded day rows match |
| 6 | Day macro computation | (pure domain) | tuesday.json → totals ≈ 2718/173/66.7/349 |
| 7 | Day optimizer (own simplex) | `POST /api/days/:d/optimize` | tuesday bounds → hits macros within ε, respects min/max; infeasible case returns red macros |
| 8 | Shopping list rollup | `GET /api/shopping` | week.json → expected-shopping.json; misc add/remove; incomplete-day warning |
| 9 | **(post-PoC)** Macro calculator | `POST /api/profile` → targets | **golden**: profile → 2700/168/66/358.5 |
| 10 | Progression log + CSV import | `/api/progression`, `POST /api/progression/import` | progression.csv → rows + weekly stats |

Each row = one thin vertical slice with unit tests on the domain fn + a
handler test vs real D1. The **one Playwright e2e** should cover the headline
journey: set targets → plan a day → optimize → see macros hit → generate shopping
list.

## 7. What's missing / deliberately deferred (polish later)

Called out so we can prioritize:
- **Macro calculator** — planned but **post-PoC** (feature 9); PoC uses manual
  targets. Body-stat columns exist in `profile` from the start so adding it is
  additive.
- **Auth & durable multi-user** — deferred (PoC is anonymous/ephemeral).
- **Global-catalog moderation** — PoC allows open contribution to the shared
  catalog; review/dedupe/ownership come later.
- **Full localization** — the i18n *plumbing* ships in the PoC (no hardcoded
  strings, locale-keyed captions), but we only populate **English UI strings** and
  the **as-found FR/EN food captions**. Translating missing captions and adding
  more UI locales is later polish.
- **Progress photos** (R2 upload) — defer; log numbers only for now.
- **Smart-scale CSV connection** — replace the fixed-path Excel connection with a
  manual CSV upload; auto-sync is out of scope.
- **Imperial units** — PoC is Metric; `units` is stored on the profile and
  conversions are localized, so Imperial is an additive follow-up.
- **Charts** on Progression — start with a table; add a small chart later.
- **Recipe URL/comment carry-through, food-category management UI, precision (ε)
  control, preferred-gram rounding** — nice-to-haves after the core loop works.
- **Solver parity edge cases** (>200 ingredients, 20 s timeout) — our LP is fast;
  keep a sane cap and a clear message.

## 8. Recommendations (summary)

1. Shared **global** food/recipe catalog (open contribution) + **per-workspace**
   foods and copy-on-write variants; user data keyed by an anonymous cookie.
2. Own a tiny TS simplex for the optimizer (no native deps; µs tests).
3. Keep all math pure in `src/domain/*`; store macros only on `food`, compute the
   rest. Use ids for joins; display names via locale-keyed captions.
4. One fixture set for tests + prod seed; lift golden numbers straight from the
   sheet so tests validate against Excel's own output.
5. i18n plumbing from day one (English UI strings, FR/EN captions as found),
   Metric-first; calculator, Imperial, and full localization as additive polish.

## 9. Decisions (resolved)

1. **Library model:** hybrid — a shared global catalog everyone can contribute to,
   **plus** per-workspace foods and tailored variants (copy-on-write). §1, §3.
2. **Optimizer:** own tiny TS simplex. §5.
3. **Language/units:** English UI with **no hardcoded strings** (i18n from the
   start); foods carry translatable **captions** resolved from any available
   locale; assume seed captions are FR or EN for now. Metric-first. §3, §6(0), §7.
4. **Macro calculator:** in the plan but **after the PoC**; PoC uses manual
   targets. §6(3, 9), §7.

Next step (on your go-ahead): generate the fixtures + migrations, then build the
§6 slices in order (0 → 8), each behind fixture-backed tests, on this branch.
