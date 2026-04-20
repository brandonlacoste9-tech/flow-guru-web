import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const report: any = {
    status: "diagnostic_mode",
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    node_version: process.version
  };

  try {
    // Stage 1: Check Database Library
    report.stage = "loading_db_module";
    const db = await import("./lib/db");
    report.db_loaded = !!db;

    // Stage 2: Check Router Logic
    report.stage = "loading_router_module";
    const router = await import("./lib/routers");
    report.router_loaded = !!router;

    res.status(200).json({ success: true, report });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      report, 
      error_message: error.message,
      error_stack: error.stack,
      hint: "Check if all files were correctly moved to api/lib/"
    });
  }
}
