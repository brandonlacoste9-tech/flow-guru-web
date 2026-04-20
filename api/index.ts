import express from "express";
import path from "path";
import fs from "fs";

const app = express();

// 1. Initial Body Parsers (Low risk)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 2. Health & Debug (ZERO IMPORTS)
app.get("/api/health", (req, res) => res.json({ status: "alive", mode: "safe-start" }));

// 3. Dynamic TRPC (The Brain in a Safe Room)
app.use("/api", async (req, res, next) => {
  // Only handle TRPC or API requests
  if (!req.url.includes('trpc') && !req.url.startsWith('/api')) {
    return next();
  }

  try {
    // We import these INSIDE the handler so that a crash here 
    // is caught by the try/catch instead of breaking Vercel.
    const { createExpressMiddleware } = await import("@trpc/server/adapters/express");
    const { appRouter } = await import("../server/routers");
    const { createContext } = await import("../server/_core/context");

    const trpcHandler = createExpressMiddleware({
      router: appRouter,
      createContext,
    });
    
    return trpcHandler(req, res, next);
  } catch (error: any) {
    console.error("[SafeStart Error]", error);
    return res.status(500).json({ 
      error: "AI_BOOT_STRAP_FAILED", 
      message: error.message,
      stack: error.stack 
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
