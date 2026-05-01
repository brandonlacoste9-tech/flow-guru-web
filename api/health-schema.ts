import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "./lib/db.js";

const EXPECTED_TABLES = [
  "fg_users",
  "fg_threads",
  "fg_messages",
  "fg_profiles",
  "fg_facts",
  "fg_connections",
  "fg_local_events",
  "fg_lists",
  "fg_list_items",
  "fg_push_subscriptions",
  "fg_subscriptions",
  "fg_stripe_events",
] as const;

function getDatabaseUrlInfo() {
  const sources = [
    "FG_DATABASE_URL",
    "POSTGRES_URL_NO_SSL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
  ] as const;
  const source = sources.find(name => Boolean(process.env[name]));
  const rawUrl = source ? process.env[source] : null;

  if (!source || !rawUrl) {
    return { source: null, host: null, database: null };
  }

  try {
    const url = new URL(rawUrl);
    return {
      source,
      host: url.hostname,
      database: url.pathname.replace(/^\//, "") || null,
    };
  } catch {
    return { source, host: "unparseable", database: null };
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const db = await getDb();
    if (!db) {
      return res.status(503).json({ ok: false, error: "DB unavailable" });
    }

    const identityRows = await (db as any).execute(
      `SELECT current_database() AS current_database, current_user AS current_user`,
    );
    const identity = (identityRows.rows || identityRows)[0] ?? {};
    const rows = await (db as any).execute(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'fg_%'`,
    );
    const actual = (rows.rows || rows)
      .map((row: any) => row.table_name)
      .sort();
    const missing = EXPECTED_TABLES.filter(table => !actual.includes(table));

    return res.status(missing.length ? 500 : 200).json({
      ok: missing.length === 0,
      expected: EXPECTED_TABLES,
      actual,
      missing,
      database: {
        ...getDatabaseUrlInfo(),
        currentDatabase: identity.current_database,
        currentUser: identity.current_user,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
}
