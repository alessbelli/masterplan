import { applyD1Migrations, env } from "cloudflare:test";

// Apply D1 migrations to the isolated per-test database before the suite runs.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
