import express from "express";
import path from "path";
import fs from "fs";

const app = express();

// 1. Body Parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 2. Health Check
app.get("/api/health", (req, res) => res.json({ status: "alive", mode: "trpc-compliant" }));

// 3. Dynamic TRPC (The Brain in a Safe Room)
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
    console.error("[SafeStart Error]", error);
    
    // Send a TRPC-compatible "SuperJSON" error envelope
    return res.status(500).json({ 
      json: {
        error: {
          json: {
            message: `BOOTSTRAP_ERROR: ${error.message}`,
            code: -32603,
            data: { 
              code: "INTERNAL_SERVER_ERROR", 
              httpStatus: 500,
              stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }
          }
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
