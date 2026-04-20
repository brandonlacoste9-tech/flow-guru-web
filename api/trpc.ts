import express from "express";

const app = express();
app.use(express.json());

// 1. SAFE-START (Explicit extensions for Vercel ESM stability)
app.use("/api/trpc", async (req, res, next) => {
  try {
    const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
    const { appRouter } = await import("./lib/routers.js");
    const { createContext } = await import("./lib/_core/context.js");

    const trpcHandler = createExpressMiddleware({
      router: appRouter,
      createContext,
    });
    
    return trpcHandler(req, res, next);
  } catch (error: any) {
    console.error("[CRITICAL BOOT ERROR]", error);
    return res.status(500).json({ 
        json: { 
            error: { 
                json: { 
                  message: `BACKEND_STARTUP_FAILURE: ${error.message}`, 
                  code: -32603, 
                  data: { stack: error.stack } 
                } 
            } 
        } 
    });
  }
});

app.use("/", (req, res) => {
  res.json({ status: "alive", mode: "esm-hardened", time: new Date().toISOString() });
});

export default app;
