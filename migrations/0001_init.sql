-- masterplan initial schema.
-- A tiny notes table: enough to prove the Worker <-> D1 wiring end to end.
CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
