import "dotenv/config";
import { getDb } from "./api/lib/db.js";
import { conversationMessages } from "./api/lib/drizzle/schema.js";
import { desc } from "drizzle-orm";

async function dump() {
  try {
    const db = await getDb();
    if (!db) process.exit(1);
    const rows = await db.select().from(conversationMessages).orderBy(desc(conversationMessages.createdAt)).limit(10);
    for (const r of rows) {
      console.log(`[${r.role}] ${r.content}`);
    }
  } catch (err) {
    console.error("DB Error:", err);
  }
  process.exit(0);
}

dump();
