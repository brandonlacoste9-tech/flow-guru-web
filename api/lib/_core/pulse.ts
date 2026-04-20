import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is missing!");
    return;
  }

  const client = postgres(dbUrl, { ssl: 'require' });
  const db = drizzle(client);

  try {
    console.log(">>> Checking tables...");
    const tables = await client`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log("Current tables:", JSON.stringify(tables, null, 2));
    
    if (tables.length === 0) {
      console.log("!!! NO TABLES FOUND. You need to push migrations.");
    }
  } catch (err: any) {
    console.error("!!! SCAN FAILED:", err.message);
  } finally {
    await client.end();
  }
}

main();
