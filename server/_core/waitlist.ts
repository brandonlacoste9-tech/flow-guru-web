import { Express } from "express";
import { getDb } from "../../api/lib/db";
import { waitlist } from "../../api/lib/drizzle/schema";
import { eq } from "drizzle-orm";

export function registerWaitlistRoutes(app: Express) {
  app.post("/api/waitlist", async (req, res) => {
    try {
      const { email, source } = req.body;

      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: "Database unavailable" });
      }

      // Check if already exists
      const existing = await db.select().from(waitlist).where(eq(waitlist.email, email)).limit(1);
      
      if (existing.length > 0) {
        return res.json({ success: true, message: "Already on waitlist" });
      }

      await db.insert(waitlist).values({
        email,
        source: source || "landing_page",
      });

      res.json({ success: true, message: "Successfully joined waitlist" });
    } catch (error: any) {
      console.error("[Waitlist API Error]", error);
      res.status(500).json({ error: "Failed to join waitlist" });
    }
  });
}
