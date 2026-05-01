import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      env: {
        node_version: process.version,
        platform: process.platform,
      },
      imports: {}
    };

    try {
      const db = await import('./lib/db.js');
      diagnostics.imports.db = "success";
    } catch (e: any) {
      diagnostics.imports.db = "failed: " + e.message;
    }

    try {
      const routers = await import('./lib/routers.js');
      diagnostics.imports.routers = "success";
    } catch (e: any) {
      diagnostics.imports.routers = "failed: " + e.message;
    }

    try {
      const orchestrator = await import('./lib/_core/sub-agents/orchestrator.js');
      diagnostics.imports.orchestrator = "success";
    } catch (e: any) {
      diagnostics.imports.orchestrator = "failed: " + e.message;
    }

    res.status(200).json(diagnostics);
  } catch (err: any) {
    res.status(200).json({ 
      error: "CRITICAL_DIAGNOSTIC_FAILURE",
      message: err.message,
      stack: err.stack 
    });
  }
}
