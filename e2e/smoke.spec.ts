import { test, expect } from "@playwright/test";

test.describe("smoke", () => {
  test("loads home with expected title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Flow Guru/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("health API responds OK when hit directly", async ({ request, baseURL }) => {
    const origin = baseURL ?? "";
    const host = (() => {
      try {
        return new URL(origin).hostname;
      } catch {
        return "";
      }
    })();
    const isLocal = host === "localhost" || host === "127.0.0.1";
    test.skip(isLocal, "Needs deployed API; run with PLAYWRIGHT_BASE_URL=https://floguru.com");

    const healthUrl = new URL("/api/health", origin).toString();
    const res = await request.get(healthUrl);
    expect(res.ok(), `GET ${healthUrl} → ${res.status()}`).toBeTruthy();
  });
});
