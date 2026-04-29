import { test, expect } from "@playwright/test";

function isLocalBaseURL(baseURL: string | undefined): boolean {
  try {
    const host = new URL(baseURL ?? "http://127.0.0.1").hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return true;
  }
}

test.describe("smoke", () => {
  test("loads home with expected title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Flow Guru/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("health API responds OK when hit directly", async ({ request, baseURL }) => {
    const origin = baseURL ?? "";
    test.skip(isLocalBaseURL(baseURL), "Needs deployed API; run with PLAYWRIGHT_BASE_URL=https://floguru.com");

    const healthUrl = new URL("/api/health", origin).toString();
    const res = await request.get(healthUrl);
    expect(res.ok(), `GET ${healthUrl} → ${res.status()}`).toBeTruthy();
  });

  test("lists route shows main heading", async ({ page, baseURL }) => {
    test.skip(isLocalBaseURL(baseURL), "SPA+tRPC against deployed origin — run test:e2e:prod or set PLAYWRIGHT_BASE_URL");

    await page.goto("/lists", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /Your Lists/i })).toBeVisible({
      timeout: 25_000,
    });
  });

  test("settings route shows AI settings heading", async ({ page, baseURL }) => {
    test.skip(isLocalBaseURL(baseURL), "SPA+tRPC against deployed origin — run test:e2e:prod or set PLAYWRIGHT_BASE_URL");

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /AI Settings/i })).toBeVisible({
      timeout: 25_000,
    });
  });
});
