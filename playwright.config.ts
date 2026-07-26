import { defineConfig } from "@playwright/test";

const PORT = 8787;

// One behavioral e2e against the real Worker (wrangler dev + local D1), with a
// trace recorded as our proof-of-progress. See product-builder guidance/04.
export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/traces/tmp",
  reporter: [["html", { outputFolder: "e2e/playwright-report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on",
    // Local sandboxes ship a pinned Chromium; CI downloads its own. Set
    // PLAYWRIGHT_CHROMIUM_PATH locally to reuse the pre-installed binary.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    // Migrate + seed the local D1, then boot the Worker.
    command: `pnpm db:setup:local && wrangler dev --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
