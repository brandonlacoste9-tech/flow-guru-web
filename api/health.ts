import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as db from "./lib/db.js";
import * as router from "./lib/routers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const report: any = {
    status: "live_diagnostic",
    timestamp: new Date().toISOString(),
    env_db: !!process.env.DATABASE_URL,
  };

  try {
    // Stage 1: Check Database module is loaded
    report.db_module = !!db;

    // Stage 2: Check Router module is loaded
    report.router_module = !!router;

    res.status(200).json({ success: true, report });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      report, 
      error_message: error.message,
      error_stack: error.stack
    });
  }
}
