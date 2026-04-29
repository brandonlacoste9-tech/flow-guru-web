import { defineConfig, devices } from "@playwright/test";

/**
 * Set PLAYWRIGHT_BASE_URL to target prod smoke without pointing Playwright at a local server:
 *   $env:PLAYWRIGHT_BASE_URL="https://floguru.com"; pnpm test:e2e
 * Or use `pnpm test:e2e:prod` (defaults PLAYWRIGHT_BASE_URL to https://floguru.com).
 *
 * Local dev (Vite default): http://127.0.0.1:5173 — run `pnpm dev` first. Routes that need deployed API skip unless PLAYWRIGHT_BASE_URL is production-like — see e2e/smoke.spec.ts.
 */
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
