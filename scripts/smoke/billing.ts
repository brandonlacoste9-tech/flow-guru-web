import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

type CheckResult = {
  name: string;
  passed: boolean;
  details?: string;
};

const targetUrl = process.env.SMOKE_TARGET_URL?.replace(/\/$/, "");
const apiKey = process.env.BROWSERBASE_API_KEY;
const projectId = process.env.BROWSERBASE_PROJECT_ID;
const authedCookie = process.env.SMOKE_AUTH_COOKIE;

if (!targetUrl) {
  throw new Error("SMOKE_TARGET_URL is required");
}

if (!apiKey) {
  throw new Error("BROWSERBASE_API_KEY is required");
}

function assertIncludes(text: string, needle: string, name: string): CheckResult {
  return {
    name,
    passed: text.toLowerCase().includes(needle.toLowerCase()),
    details: `Expected page text to include "${needle}"`,
  };
}

async function setCookieHeader(page: import("playwright-core").Page, cookieHeader: string) {
  const cookies = cookieHeader
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [name, ...valueParts] = part.split("=");
      return {
        name,
        value: valueParts.join("="),
        domain: new URL(targetUrl!).hostname,
        path: "/",
        httpOnly: true,
        secure: true,
      };
    })
    .filter(cookie => cookie.name && cookie.value);

  await page.context().addCookies(cookies);
}

async function run() {
  const bb = new Browserbase({ apiKey });
  const session = await bb.sessions.create({
    ...(projectId ? { projectId } : {}),
    browserSettings: {
      recordSession: true,
      logSession: true,
    },
  });

  const results: CheckResult[] = [];
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;

  try {
    browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = context.pages()[0] ?? await context.newPage();

    await page.goto(`${targetUrl}/settings?tab=billing`, { waitUntil: "networkidle" });
    const unauthText = await page.locator("body").innerText({ timeout: 10_000 });
    results.push(assertIncludes(unauthText, "Sign in to upgrade", "unauth sign-in upgrade banner"));
    results.push(assertIncludes(unauthText, "Flow Guru Monthly", "unauth monthly plan card"));
    results.push(assertIncludes(unauthText, "Free", "unauth free plan card"));

    if (authedCookie) {
      await setCookieHeader(page, authedCookie);
      await page.reload({ waitUntil: "networkidle" });
      const authedText = await page.locator("body").innerText({ timeout: 10_000 });
      results.push(assertIncludes(authedText, "Upgrade to Monthly", "authed-free upgrade CTA"));

      const themeClass = await page.locator("html").getAttribute("class");
      results.push({
        name: "authed-free dark theme",
        passed: Boolean(themeClass?.includes("dark")),
        details: `Expected html class to include "dark"; got "${themeClass ?? ""}"`,
      });
    } else {
      console.log("Skipping authenticated-free checks because SMOKE_AUTH_COOKIE is not set.");
    }
  } finally {
    await browser?.close();
  }

  const failed = results.filter(result => !result.passed);
  for (const result of results) {
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
    if (!result.passed && result.details) console.log(`  ${result.details}`);
  }

  console.log(`Browserbase replay: https://browserbase.com/sessions/${session.id}`);

  if (failed.length > 0) {
    throw new Error(`${failed.length} billing smoke check(s) failed`);
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
