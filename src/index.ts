import { Hono } from "hono";
import { log } from "./log";
import { validateNoteBody } from "./notes";

export interface Env {
  DB: D1Database;
}

interface Note {
  id: number;
  body: string;
  created_at: string;
}

const app = new Hono<{ Bindings: Env; Variables: { requestId: string } }>();

// Observability-first: attach a correlation id to every request and emit one
// structured JSON log line per request with its latency. See guidance/10.
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
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

// Liveness/readiness probe. Pings D1 so a broken binding surfaces here.
app.get("/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1").first();
    return c.json({ ok: true });
  } catch (err) {
    log("health.db_error", { requestId: c.get("requestId"), error: String(err) });
    return c.json({ ok: false, error: "db_unreachable" }, 503);
  }
});

app.get("/api/notes", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, body, created_at FROM notes ORDER BY id DESC LIMIT 100",
  ).all<Note>();
  return c.json({ notes: results ?? [] });
});

app.post("/api/notes", async (c) => {
  const payload = await c.req.json().catch(() => null);
  const result = validateNoteBody(payload?.body);
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }
  const row = await c.env.DB.prepare(
    "INSERT INTO notes (body) VALUES (?) RETURNING id, body, created_at",
  )
    .bind(result.body)
    .first<Note>();
  log("note.created", { requestId: c.get("requestId"), id: row?.id });
  return c.json({ note: row }, 201);
});

// Lean client-error beacon: the browser POSTs unhandled errors here so failures
// on the client are visible in server logs too. See guidance/10.
app.post("/client-error", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  log("client.error", { requestId: c.get("requestId"), ...body });
  return c.body(null, 204);
});

export default app;
