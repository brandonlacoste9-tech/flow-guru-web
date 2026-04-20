import express from "express";

const app = express();
app.use(express.json());

// 1. MOUNT AT ROOT (Vercel already handles the /api/trpc prefix)
app.use(async (req, res, next) => {
  try {
    // Only log hits for debugging
    console.log(`[TRPC-BRIDGE] Handling: ${req.method} ${req.url}`);

    const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
    const { appRouter } = await import("./lib/routers.js");
    const { createContext } = await import("./lib/_core/context.js");

    const trpcHandler = createExpressMiddleware({
      router: appRouter,
      createContext,
    });
    
    // We treat this app as the trpc handler directly
    return trpcHandler(req, res, next);
  } catch (error: any) {
    console.error("[CRITICAL BOOT ERROR]", error);
    
    // Proper TRPC Error Format so the client doesn't say "Unable to transform"
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
