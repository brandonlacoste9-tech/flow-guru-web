import "dotenv/config";
import { getDb } from "./api/lib/db.js";
import { providerConnections } from "./api/lib/drizzle/schema.js";

async function dump() {
  try {
    const db = await getDb();
    if (!db) {
      console.error("Failed to initialize database (missing URL)");
      process.exit(1);
    }
    const rows = await db.select().from(providerConnections);
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error("DB Error:", err);
  }
  process.exit(0);
}

dump();
