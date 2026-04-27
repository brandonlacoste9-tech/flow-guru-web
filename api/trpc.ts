import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./lib/routers.js";
import { createContext } from "./lib/_core/context.js";
import { captureServerException, initServerSentry } from "./lib/sentry.js";

initServerSentry();

const app = express();
app.use(express.json());

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Request, Response, NextFunction } from "express";

// 1. HARD-WIRED (Static imports ensure Vercel bundles perfectly)
app.use((req: Request, res: Response, next: NextFunction) => {
  try {
    const trpcHandler = createExpressMiddleware({
      router: appRouter,
      createContext,
    });
    return (trpcHandler as any)(req, res, next);
  } catch (error: any) {
    captureServerException(error, {
      tags: { route: "api/trpc", phase: "bootstrap" },
      extra: { method: req.method, url: req.url },
    });
    console.error("[CRITICAL BOOT ERROR]", error);
    const vRes = res as unknown as VercelResponse;
    return vRes.status(500).json({ 
        error: { 
            message: `BACKEND_STARTUP_FAILURE: ${error.message}`, 
            code: -32603, 
            data: { stack: error.stack } 
        } 
    });
  }
});

export default app;
