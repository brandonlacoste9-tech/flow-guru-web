import express from "express";
import path from "path";
import fs from "fs";

const app = express();

// 1. Body Parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 2. DIAGNOSTIC HEALTH CHECK (PLAIN TEXT)
app.get("/api/health", async (req, res) => {
  const report: any = {
    status: "checking",
    time: new Date().toISOString(),
    env: process.env.NODE_ENV,
    db_connected: !!process.env.DATABASE_URL,
  };

  try {
    report.step = "importing_brain";
    const { appRouter } = await import("../server/routers");
    report.brain_loaded = !!appRouter;
    
    res.json({ success: true, report });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      report, 
      error_message: error.message,
      error_stack: error.stack 
    });
  }
});

// 3. Dynamic TRPC
app.use("/api", async (req, res, next) => {
  if (!req.url.includes('trpc') && !req.url.startsWith('/api')) {
    return next();
  }

  try {
    const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
    const { appRouter } = await import("../server/routers");
    const { createContext } = await import("../server/_core/context");

    const trpcHandler = createExpressMiddleware({
      router: appRouter,
      createContext,
    });
    
    return trpcHandler(req, res, next);
  } catch (error: any) {
    return res.status(500).json({ 
        json: { 
            error: { 
                json: { message: error.message, code: -32603, data: { status: 500 } } 
            } 
        } 
    });
  }
});

// 4. Static Assets & SPA Fallback
const distPath = path.resolve(process.cwd(), "dist", "public");

app.use(express.static(distPath, {
  maxAge: '1y',
  immutable: true,
  index: false
}));

app.get("*", (req, res) => {
  const indexPath = path.resolve(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Front-end not ready.");
  }
});

export default app;
