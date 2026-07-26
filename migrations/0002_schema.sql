-- masterplan meal-planner schema.
-- Reference data (food/recipe catalog) is shared + seeded; user data is scoped
-- to an anonymous workspace. See docs/planning/build-plan.md §3.

-- ---- Reference: food catalog -------------------------------------------------
CREATE TABLE food_category (
  id         INTEGER PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,          -- stable slug / i18n key
  label      TEXT NOT NULL,                 -- source display, fallback
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE food (
  id            INTEGER PRIMARY KEY,
  category_id   INTEGER REFERENCES food_category(id),
  kcal_100g     REAL NOT NULL,
  protein_100g  REAL NOT NULL,
  fat_100g      REAL NOT NULL,
  carb_100g     REAL NOT NULL,
  scope         TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','workspace')),
  workspace_id  TEXT,                        -- set iff scope='workspace'
  base_food_id  INTEGER REFERENCES food(id), -- variant-of (copy-on-write)
  source_locale TEXT NOT NULL DEFAULT 'fr',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_food_scope ON food(scope, workspace_id);
CREATE INDEX idx_food_base  ON food(base_food_id);

CREATE TABLE food_caption (
  id       INTEGER PRIMARY KEY,
  food_id  INTEGER NOT NULL REFERENCES food(id) ON DELETE CASCADE,
  locale   TEXT NOT NULL,
  caption  TEXT NOT NULL,
  UNIQUE (food_id, locale)
);

-- ---- Reference: recipe catalog ----------------------------------------------
CREATE TABLE recipe (
  id             INTEGER PRIMARY KEY,
  cat1           TEXT,
  cat2           TEXT,
  cat3           TEXT,
  servings       REAL NOT NULL DEFAULT 1,
  url            TEXT,
  notes          TEXT,
  scope          TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','workspace')),
  workspace_id   TEXT,
  base_recipe_id INTEGER REFERENCES recipe(id),
  source_locale  TEXT NOT NULL DEFAULT 'fr',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_recipe_scope ON recipe(scope, workspace_id);

CREATE TABLE recipe_caption (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  locale    TEXT NOT NULL,
  caption   TEXT NOT NULL,
  UNIQUE (recipe_id, locale)
);

CREATE TABLE recipe_ingredient (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  food_id   INTEGER NOT NULL REFERENCES food(id),
  min_g     REAL NOT NULL,
  max_g     REAL NOT NULL,
  position  INTEGER NOT NULL
);
CREATE INDEX idx_ri_recipe ON recipe_ingredient(recipe_id);

-- ---- Per-workspace user data (starts empty) ---------------------------------
CREATE TABLE workspace (
  id         TEXT PRIMARY KEY,              -- anonymous cookie id
  locale     TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Manual macro targets per weekday (0=Mon .. 6=Sun). Calculator is post-PoC.
CREATE TABLE day_target (
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  weekday      INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  kcal         REAL NOT NULL,
  protein_g    REAL NOT NULL,
  fat_g        REAL NOT NULL,
  carb_g       REAL NOT NULL,
  PRIMARY KEY (workspace_id, weekday)
);

-- Week Planning grid: a recipe assigned to (weekday, slot).
CREATE TABLE plan_slot (
  id           INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  weekday      INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  slot         INTEGER NOT NULL,
  recipe_id    INTEGER REFERENCES recipe(id),
  UNIQUE (workspace_id, weekday, slot)
);

-- A day's expanded ingredient rows (the optimizer's variables live in `grams`).
CREATE TABLE day_item (
  id           INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  weekday      INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  meal_label   TEXT NOT NULL,
  food_id      INTEGER NOT NULL REFERENCES food(id),
  servings     REAL NOT NULL DEFAULT 1,
  min_g        REAL NOT NULL,
  max_g        REAL NOT NULL,
  grams        REAL NOT NULL,
  position     INTEGER NOT NULL
);
CREATE INDEX idx_day_item ON day_item(workspace_id, weekday);

CREATE TABLE shopping_extra (
  id           INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  quantity     TEXT NOT NULL
);

CREATE TABLE progression (
  id           INTEGER PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  weight_kg    REAL,
  muscle_kg    REAL,
  bodyfat      REAL
);
CREATE INDEX idx_progression ON progression(workspace_id, date);
