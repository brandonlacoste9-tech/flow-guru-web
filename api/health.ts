import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const report: any = {
    status: "diagnostic_mode",
    time: new Date().toISOString(),
    db_env: !!process.env.DATABASE_URL,
  };

  try {
    report.checkpoint = "testing_db_import";
    // We try to load the database library specifically to see if it's the culprit
    const db = await import("../server/db");
    report.db_module_loaded = !!db;

    report.checkpoint = "testing_router_import";
    const router = await import("../server/routers");
    report.router_module_loaded = !!router;

    res.status(200).json({ success: true, report });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      report, 
      error: error.message, 
      stack: error.stack 
    });
  }
}
