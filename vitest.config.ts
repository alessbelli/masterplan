import path from "node:path";
import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

// Runs tests inside workerd with a real local D1, so handler + DB code is
// exercised for real yet still finishes in milliseconds — the < 1s inner loop.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));

  return {
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: true,
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            // Handed to the setup file, which applies them before each test.
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
