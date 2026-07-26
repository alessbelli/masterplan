// One structured JSON line per event. Cloudflare's Workers Logs / `wrangler tail`
// ingest these, and they're greppable by agents. Keep values primitive.
export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...fields }));
}
