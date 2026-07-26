import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

// Runs against the real Hono app and a real local D1 (migrations applied in
// test/apply-migrations.ts), all in-process in ms.
describe("masterplan API", () => {
  it("reports healthy when D1 is reachable", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("starts with no notes", async () => {
    const res = await app.request("/api/notes", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notes: [] });
  });

  it("creates a note and reads it back", async () => {
    const create = await app.request(
      "/api/notes",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "  ship it  " }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const { note } = (await create.json()) as { note: { id: number; body: string } };
    expect(note.body).toBe("ship it");

    const list = await app.request("/api/notes", {}, env);
    const { notes } = (await list.json()) as { notes: { body: string }[] };
    expect(notes.map((n) => n.body)).toContain("ship it");
  });

  it("rejects an empty note with 400", async () => {
    const res = await app.request(
      "/api/notes",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "   " }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});
