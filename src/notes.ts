// Pure domain logic — no D1, no Hono — so it unit-tests in microseconds.
export const MAX_NOTE_LENGTH = 500;

export type ValidationResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

export function validateNoteBody(input: unknown): ValidationResult {
  if (typeof input !== "string") {
    return { ok: false, error: "body must be a string" };
  }
  const body = input.trim();
  if (body.length === 0) {
    return { ok: false, error: "body must not be empty" };
  }
  if (body.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `body must be <= ${MAX_NOTE_LENGTH} chars` };
  }
  return { ok: true, body };
}
