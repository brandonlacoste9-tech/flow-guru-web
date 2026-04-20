import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./lib/routers.js";
import { createContext } from "./lib/_core/context.js";

const app = express();
app.use(express.json());

// 1. HARD-WIRED (Static imports ensure Vercel bundles everything perfectly)
app.use((req, res, next) => {
  try {
    const trpcHandler = createExpressMiddleware({
      router: appRouter,
      createContext,
    });
    return trpcHandler(req, res, next);
  } catch (error: any) {
    console.error("[CRITICAL BOOT ERROR]", error);
    return res.status(500).json({ 
        error: { 
            message: `BACKEND_STARTUP_FAILURE: ${error.message}`, 
            code: -32603, 
            data: { stack: error.stack } 
        } 
    });
  }
});

export default app;
