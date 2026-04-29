import { defineConfig, devices } from "@playwright/test";

/**
 * Set PLAYWRIGHT_BASE_URL to target prod smoke without a local server:
 *   $env:PLAYWRIGHT_BASE_URL="https://floguru.com"; pnpm test:e2e
 * Local dev (Vite default): http://127.0.0.1:5173 — run `pnpm dev` first.
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
