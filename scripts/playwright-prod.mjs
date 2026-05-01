/**
 * Runs Playwright E2E with PLAYWRIGHT_BASE_URL defaulting to production.
 * Override: PLAYWRIGHT_BASE_URL=https://staging.example.com node scripts/playwright-prod.mjs
 */
import { spawnSync } from "node:child_process";

process.env.PLAYWRIGHT_BASE_URL ||= "https://floguru.com";

const cmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const r = spawnSync(cmd, ["exec", "playwright", "test"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(r.status ?? 1);
