import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import path from "path";
import fs from "fs";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";

const app = express();

// 1. Body Parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 2. The Universal Ear (Catch all TRPC calls regardless of prefix)
const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});

// Mount at multiple logical points to handle Vercel rewrites
app.use("/api/trpc", trpcMiddleware);
app.use("/api", trpcMiddleware); // Corrects the rewrite catch
app.use("/trpc", trpcMiddleware);

// 3. Health Check
app.get("/api/health", (req, res) => res.json({ status: "ok", mode: "universal-router" }));

// 4. Static Assets & SPA Fallback (Only if direct hit)
const distPath = path.resolve(process.cwd(), "dist", "public");

app.use(express.static(distPath, {
  maxAge: '1y',
  immutable: true,
  index: false
}));

app.get("*", (req, res, next) => {
  // IMPORTANT: Do not catch API/TRPC requests here!
  if (req.url.includes('trpc') || req.url.startsWith('/api')) {
    return res.status(404).json({ error: "TRPC_NOT_FOUND", path: req.url });
  }
  
  const indexPath = path.resolve(distPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Front-end not found.");
  }
});

export default app;
