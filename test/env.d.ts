import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

// Type the bindings available in tests via `cloudflare:test`.
declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
