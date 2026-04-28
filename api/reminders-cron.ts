import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAllReminders } from "./lib/_core/reminders.js";

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const validManualAuth = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;

  if (process.env.NODE_ENV === "production" && !isVercelCron && !validManualAuth) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    await checkAllReminders();
    return res.status(200).json({
      ok: true,
      trigger: isVercelCron ? "vercel-cron" : "manual",
      at: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ ok: false, error: message });
  }
}
