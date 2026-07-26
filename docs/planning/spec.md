# masterplan — product spec (reverse-engineered from `MasterPlan3.1.xlsm`)

Source: a macro-heavy Excel workbook (14 sheets, ~530 KB of VBA, Excel Solver,
18 UserForms). This document captures **what the product does** and **how it's
implemented today**, as the basis for the Cloudflare Workers rebuild
(`build-plan.md`).

## 1. What it is

**masterplan is a macro-based meal planner.** You maintain a personal **food
database** (per-100 g macros) and a **recipe database** (recipes = lists of foods
with min/max gram bounds). You set your **goal and body stats**; the app computes
your daily **calorie + macro targets**. You assign recipes to meal slots across a
**7-day week**; each day expands into an ingredient sheet where an **optimizer
(Excel Solver)** tunes the grams of each ingredient so the day hits your macro
targets while respecting each ingredient's min/max. Finally it rolls the whole
week up into a **shopping list** (grams per food, grouped by aisle/category), and
separately tracks **body-weight progression** (weight / muscle / body-fat over
time, with charts and progress photos).

Target user: someone doing structured bulking/cutting who wants their weekly meal
prep to hit exact macros with minimum fuss. (The seed data is in French.)

## 2. Sheets → responsibilities

| # | Sheet | Visible | Role |
|---|-------|---------|------|
| 1 | READ ME | yes | Instructions; a `Workbook_Open` bootstrap. |
| 2 | Progression | yes | Weight/muscle/body-fat log + charts + photos; CSV import. |
| 3 | Inputs | yes | Body stats + goal → **macro calculator**; per-day targets. |
| 4 | Food Database | yes | ~368 foods, per-100 g macros, category. |
| 5 | Recipe Database | yes | ~356 recipes; 3-level category tree; ingredients + g bounds. |
| 6 | Week Planning | hidden | Grid: meal-slot × weekday → recipe. Drives day tabs. |
| 7–13 | MONDAY…SUNDAY | Mon/Tue only | Per-day ingredient sheet + Solver optimization. |
| 14 | Shopping List | yes | Aggregated grams per food across the week, by category. |

## 3. Data model (as stored in the sheets)

### Food Database (`Food Database`, header row 3)
`A=Category · B=Name of Food · C=Calories · D=Protein · E=Fat · F=Carbs`
(C–F are **per 100 g**). Data from row 4. Column H holds the category list backing
dropdowns (named ranges `foodlist`, `FoodCategoryList`, `CatVSFoods`). Foods are
referenced **by name** everywhere else. ~368 rows.
Categories (seed): Autre, Baking, Breakfast, Condiments, Conserves, Dairy,
Desserts, Epices, Fruits, Légumes, Matières Grasses, No Category, Protéines,
Sauces, Sucres Lents, Surgelés.

### Recipe Database (`Recipe Database`, header row 3)
`A=Level 1 Category · B=Level 2 Category · C=Level 3 Category · D=Name of Recipe ·
E=Foods in Recipe · F=Min (g) · G=Max (g)`. A recipe is a **contiguous block of
rows** sharing the recipe name (col D), one row per ingredient (E=food name,
F/G=min/max grams). The **last row** of each block is a summary: `E="Makes N
serving(s)"`, and carries the recipe's serving count (parsed from that string),
optional cell **comment** and **hyperlink (URL)**. ~356 recipes.
(Constants in VBA: `colrec = 4` (name), `coling = 5` (ingredient), `coling+1/+2`
= min/max.)

### Inputs (macro calculator)
User inputs: goal (`MAINTAIN`/`BULK`/`CUT`), units (Metric/Imperial), gender,
age, weight, height, body-fat %, activity level, "group" (A–E, target-weight
band), whether they know their maintenance calories (+value), calc method,
protein g per unit bodyweight, fat fraction of calories, average weekly weight
change, and per-weekday **Training/Off Day** flags.
Outputs (one set per weekday, to allow calorie cycling): **calorie target,
protein g, fat g, carbs g**.

### Week Planning (hidden master)
`H1` = meals per day (e.g. 8). Row 2 = weekday headers; row 3 = each day's calorie
target. Rows 4…(3+H1) = meal slots; each cell is a **recipe name** (or blank /
"No Meal"). `validateweekplanning2` reads this grid and rebuilds each day tab.

### Day tab (`MONDAY`…`SUNDAY`)
- Row 2: **targets** `C2:F2` = cal/protein/fat/carbs (from Inputs, per weekday).
  `I2` = solver tolerance ε (≈0.035).
- Row 3: **actuals** `C3:F3` = Σ of per-recipe subtotal rows.
- Row 4: **ratios** `C4:F4 = actual/target`. `F4` (carbs ratio) is the Solver
  **objective**; `C4:E4` (cal/protein/fat) are constrained to `[1−ε, 1+ε]`.
- Row 5: headers `A=Meal · B=Food · C=Calories · D=Protein · E=Fat · F=Carbs ·
  G=Min(g) · H=Max(g) · I=Grams · J=Comments`.
- Rows 6+: one row per ingredient. Macros are computed live:
  `macro = FoodDB(food, macro)/100 · grams(I) / servings`
  (via `INDEX/MATCH` into Food Database). `G/H` = min/max grams copied from the
  recipe; `I` = **grams = the Solver variable**. Each recipe ends with a subtotal
  row where `I="-"`. Single foods added directly appear under a **"Miscellaneous"**
  meal.

### Shopping List (header row 3)
`A=Category · B=Food · C=Quantity`. Built by summing `grams` (day col I) per food
across all 7 days, grouping by the food's category (`INDEX(CatVSFoods,
MATCH(food, foodlist))`), rounding and suffixing "g". Supports **miscellaneous
items** (free-text name + qty) and single-item removal.

### Progression (header row 7)
`A=Week # · B=Day # · C=Date · D=Weight · E=Muscle · F=Body Fat % · G..J=weekly
aggregates (weight, body-fat, muscle, weight delta)`. Fed by **CSV import**
(`CSV_Import` reads a smart-scale export, originally `weight.csv` via an external
data connection). Includes charts (`WeightSeries`, `MuscleSeries`,
`BodyfatSeries`, `DaySeries`) and **progress-photo upload** (`uploadpic`).

## 4. Core algorithms

### 4.1 Macro calculator (Inputs)
1. **BMR** from the chosen method (Harris-Benedict / **Mifflin-St Jeor** /
   Katch-McArdle / Average), by gender.
2. **Maintenance** = if "I know my maintenance" → user value; else `BMR ×
   activity multiplier` (Sedentary 1.0, Very Light 1.2, Light 1.4, Moderate 1.55,
   High 1.8, Extreme 2.0).
3. **Target calories** = maintenance ± surplus/deficit, per the calorie-cycling
   method and Training/Off flag for that weekday (methods: Straight Surplus +200,
   Smaller Surplus +150, etc.; deficits for CUT).
4. **Protein g** = (protein g per unit bodyweight) × bodyweight.
5. **Fat g** = (fat fraction, e.g. 0.22 training / 0.16 off) × target cal / 9.
6. **Carbs g** = (target cal − 4·protein − 9·fat) / 4.

**Golden example (reconciles exactly):** male, 30 y, 76 kg, 179 cm, 16 % BF,
Moderate, BULK, knows maintenance = 2500, Straight Surplus +200, 1 g protein/lb,
22 % fat → **2700 kcal, 168 g P, 66 g F, 358.5 g C**. (Mifflin BMR = 1735.)

### 4.2 Day optimization (Solver → linear program)
For a day, variables are the grams `Iₖ` of each ingredient. Objective: **maximize
`F4` (carbs ratio)** = "let me eat as much as possible while hitting my macros".
Subject to:
- calorie/protein/fat ratios `C4:E4 ∈ [1−ε, 1+ε]` (ε ≈ 0.03–0.10 per day);
- per-ingredient bounds `Gₖ ≤ Iₖ ≤ Hₖ`.
All relationships are linear in the grams → a **bounded LP solved by Simplex**
(`SolverOptions AssumeLinear:=True`). Solver return codes are surfaced as UX:
0/14 = solution found; 5 = infeasible ("your foods aren't varied enough / bounds
too tight — look at which macros are red"); 8 = >200 vars; 10 = timeout (20 s).
Results are rounded to integer grams.

### 4.3 Week validation → day build (`validateweekplanning2` → `validateday`)
For each weekday: clear the day tab, read its meal slots from Week Planning, and
for each selected recipe, expand its ingredients into rows (copying min/max,
serving size, comment, URL), wire up the macro formulas, then compute totals and
ratios.

### 4.4 Shopping list (`generate_shopping_list`)
Verify every day is complete (all grams filled), then Σ grams per food across the
week, group by category, sort, round, format. If any day is incomplete, warn and
abort (`UserFormMissingSomething`).

## 5. UI surface (18 UserForms today)
Food: add/edit/remove food, manage food categories, "food used in recipes".
Recipe: create/edit recipe (ingredients, min/max, serving size, **scaler**,
3-level categories, URL/comment), select/remove recipe, manage recipe categories.
Day: add food to a day, remove a day food, set precision (ε). Shopping: remove
item, "you're missing something". Progression: upload picture.

## 6. Notable implementation details / constraints
- Foods and recipes are **joined by name string**, not id — renames cascade via
  VBA. The rebuild should use ids and keep a unique name for display/lookup.
- Sheets are password-protected (`mdp`) and toggled unprotected around edits.
- Solver requires the Excel Solver add-in installed + referenced (fragile setup
  code in `ModulePublicDeclarations`).
- The workbook is single-user, local-file, French-language, Windows/Excel-only.
- The external `weight.csv` connection points at a specific local path (a
  smart-scale export) — not portable.
