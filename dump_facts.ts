import "dotenv/config";
import { getDb } from "./api/lib/db.js";
import { userMemoryFacts } from "./api/lib/drizzle/schema.js";

async function dump() {
  try {
    const db = await getDb();
    if (!db) process.exit(1);
    const rows = await db.select().from(userMemoryFacts);
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error("DB Error:", err);
  }
  process.exit(0);
}

dump();
