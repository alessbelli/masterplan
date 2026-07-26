import { describe, expect, it } from "vitest";
import { MAX_NOTE_LENGTH, validateNoteBody } from "../src/notes";

// Pure logic — microsecond loop, no runtime needed.
describe("validateNoteBody", () => {
  it("accepts and trims a normal note", () => {
    expect(validateNoteBody("  hello  ")).toEqual({ ok: true, body: "hello" });
  });

  it("rejects non-strings", () => {
    expect(validateNoteBody(42)).toEqual({ ok: false, error: "body must be a string" });
    expect(validateNoteBody(undefined)).toEqual({ ok: false, error: "body must be a string" });
  });

  it("rejects empty / whitespace-only", () => {
    expect(validateNoteBody("   ")).toEqual({ ok: false, error: "body must not be empty" });
  });

  it("rejects over-long bodies", () => {
    const result = validateNoteBody("x".repeat(MAX_NOTE_LENGTH + 1));
    expect(result.ok).toBe(false);
  });
});
